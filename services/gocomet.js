const axios = require('axios');

// ── TOKEN CACHE ──────────────────────────────────────────────
// We store the token in memory so we don't call GoComet 
// every single time. It lasts 1 month so we reuse it.
let cachedToken = null;
let tokenExpiry = null;

async function getGocometToken() {
  // If we already have a valid token, reuse it
  if (cachedToken && tokenExpiry && new Date() < tokenExpiry) {
    return cachedToken;
  }
  // Otherwise get a fresh one
  const response = await axios.post(
    'https://login.gocomet.com/api/v1/integrations/generate-token-number',
    {
      email: process.env.GOCOMET_EMAIL,
      password: process.env.GOCOMET_PASSWORD
    }
  );
  cachedToken = response.data.token;
  // Set expiry to 25 days from now (token lasts 30, we refresh early)
  tokenExpiry = new Date(Date.now() + 25 * 24 * 60 * 60 * 1000);
  return cachedToken;
}

// ── CARRIER DETECTION ────────────────────────────────────────
// Every container number starts with 4 letters = carrier prefix
// This table maps those prefixes to GoComet's carrier codes
const CARRIER_MAP = {
  'MAEU': 'MAEU', // Maersk
  'MSKU': 'MAEU', // Maersk
  'MCPU': 'MAEU', // Maersk
  'MSCU': 'MSCU', // MSC
  'MEDU': 'MSCU', // MSC
  'TCKU': 'MSCU', // MSC leased
  'CMAU': 'CMDU', // CMA CGM
  'CMDU': 'CMDU', // CMA CGM
  'HLCU': 'HLCU', // Hapag-Lloyd
  'HMMU': 'HDMU', // HMM
  'HDMU': 'HDMU', // HMM
  'ONEU': 'ONEY', // ONE (Ocean Network Express)
  'OOLU': 'OOLU', // OOCL
  'OOCU': 'OOLU', // OOCL
  'WHLC': 'WHLC', // Wan Hai
  'WHLU': 'WHLC', // Wan Hai
  'YMLU': 'YMLU', // Yang Ming
  'EGLV': 'EGLV', // Evergreen
  'TEMU': 'TEMU', // Textainer (leasing - varies)
  'TGBU': 'TGBU', // Textainer
};

function getCarrierCode(containerNumber) {
  // Take first 4 letters of container number
  const prefix = containerNumber.substring(0, 4).toUpperCase();
  return CARRIER_MAP[prefix] || null;
}

// ── ADD TRACKING ─────────────────────────────────────────────
// Registers a container on GoComet for tracking
// Returns the GoComet tracking ID we need to fetch data later
async function addTracking(containerNumber, dispatchDate, token) {
  const carrierCode = getCarrierCode(containerNumber);
  
  const trackingPayload = {
    token: token,
    tracking: {
      tracking_number: containerNumber,
      mode: 'ocean',
      dispatch_date: formatDateForGocomet(dispatchDate)
    }
  };

  // Only add carrier_code if we found one
  if (carrierCode) {
    trackingPayload.tracking.carrier_code = carrierCode;
  }

  try {
    const response = await axios.post(
      'https://tracking.gocomet.com/api/v1/integrations/add_tracking_number',
      trackingPayload
    );
    return response.data.tracking_id;
  } catch (err) {
    // If tracking already exists, extract the ID from the error
    // GoComet returns: "Tracking number already exists with id XXXX"
    if (err.response && err.response.status === 422) {
      const errorMsg = err.response.data.error || '';
      const match = errorMsg.match(/id\s+([a-f0-9-]{36})/i);
      if (match) {
        console.log('Tracking already exists, using existing ID:', match[1]);
        return match[1];
      }
    }
    throw err;
  }
}

// ── FETCH LIVE TRACKING ──────────────────────────────────────
// Gets the latest tracking data from GoComet for a shipment
async function fetchLiveTracking(trackingId, containerNumber, token) {
  const response = await axios.get(
    'https://tracking.gocomet.com/api/v1/integrations/live-tracking',
    {
      params: {
        token: token,
        'tracking_ids[]': trackingId,
        'tracking_numbers[]': containerNumber,
        start_date: '01/01/2024'
      }
    }
  );

  const trackings = response.data.updated_trackings;
  if (!trackings || trackings.length === 0) return null;

  return parseTracking(trackings[0]);
}

// ── PARSE TRACKING RESPONSE ──────────────────────────────────
// GoComet returns a big object - we pull out just what we need
function parseTracking(tracking) {
  const events = tracking.events || [];
  let gateIn = null;
  let departure = null;
  let predictedArrival = tracking.carrier_eta || null;
  let carrier = tracking.carrier || 'Unknown';
  let delayDays = 0;
  let status = 'in_transit';

  // Loop through all events to find key milestones
  events.forEach(event => {
    const type = (event.event_type || '').toLowerCase();
    const actual = event.actual_date || null;
    if (type.includes('gate in') || type.includes('gate_in')) {
      gateIn = actual;
    }
    if (type.includes('origin') && type.includes('departure')) {
      departure = actual;
    }
    if (type.includes('arrival') && !type.includes('transshipment')) {
      if (actual) status = 'arrived';
    }
  });

  // Parse GoComet's prediction text into a number
  // e.g. "2 Days Late" → delayDays = 2
  // e.g. "1 Day Early" → delayDays = -1
  const predText = (tracking.prediction || '').toString().toLowerCase();
  if (predText.includes('late')) {
    const match = predText.match(/(\d+)/);
    if (match) delayDays = parseInt(match[1]);
  } else if (predText.includes('early')) {
    const match = predText.match(/(\d+)/);
    if (match) delayDays = -parseInt(match[1]);
  }

  return {
    carrier,
    actual_gate_in: gateIn,
    actual_departure: departure,
    predicted_arrival: predictedArrival,
    delay_days: delayDays,
    status,
    raw_prediction: tracking.prediction || 'Processing'
  };
}

// ── DATE FORMAT ───────────────────────────────────────────────
// GoComet needs dates in DD/MM/YYYY format
function formatDateForGocomet(dateStr) {
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

module.exports = { getGocometToken, addTracking, fetchLiveTracking };
const axios = require('axios');

let cachedToken = null;
let tokenExpiry = null;

async function getGocometToken() {
  if (cachedToken && tokenExpiry && new Date() < tokenExpiry) {
    return cachedToken;
  }
  const response = await axios.post(
    'https://login.gocomet.com/api/v1/integrations/generate-token-number',
    {
      email: process.env.GOCOMET_EMAIL,
      password: process.env.GOCOMET_PASSWORD
    }
  );
  cachedToken = response.data.token;
  tokenExpiry = new Date(Date.now() + 25 * 24 * 60 * 60 * 1000);
  return cachedToken;
}

const CARRIER_MAP = {
  'MAEU': 'MAEU', 'MSKU': 'MAEU', 'MCPU': 'MAEU',
  'MSCU': 'MSCU', 'MEDU': 'MSCU', 'TCKU': 'MSCU',
  'CMAU': 'CMDU', 'CMDU': 'CMDU',
  'HLCU': 'HLCU',
  'HMMU': 'HDMU', 'HDMU': 'HDMU',
  'ONEU': 'ONEY',
  'OOLU': 'OOLU', 'OOCU': 'OOLU',
  'WHLC': 'WHLC', 'WHLU': 'WHLC',
  'YMLU': 'YMLU',
  'EGLV': 'EGLV',
  'TEMU': 'TEMU', 'TGBU': 'TGBU',
};

function getCarrierCode(containerNumber) {
  const prefix = containerNumber.substring(0, 4).toUpperCase();
  return CARRIER_MAP[prefix] || null;
}

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
    if (err.response && err.response.status === 422) {
      const errorMsg = err.response.data.error || '';
      const match = errorMsg.match(/id\s+([a-f0-9-]{36})/i);
      if (match) return match[1];
    }
    throw err;
  }
}

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

// GoComet sends dates as DD/MM/YYYY — convert to YYYY-MM-DD
function parseDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function parseTracking(tracking) {
  const events = tracking.events || [];
  let gateIn = null;
  let departure = null;
 let predictedArrival = parseDate(tracking.predicted_eta) 
  || parseDate(tracking.best_case_eta) 
  || null;
  let carrier = tracking.carrier_name || 'Unknown';
  let delayDays = 0;
  let status = 'in_transit';

  events.forEach(event => {
    const type = (event.event || '').toLowerCase();
    const actualDate = event.actual_date || null;

    if (type === 'gate_in' && actualDate) {
      gateIn = parseDate(actualDate);
    }
    if (type === 'origin_departure' && actualDate) {
      departure = parseDate(actualDate);
    }
    if (type === 'arrival' && actualDate) {
      status = 'arrived';
    }

    // Find max delay across all delayed events
    if (event.delayed && event.original_planned_date && event.planned_date) {
      const orig    = new Date(parseDate(event.original_planned_date));
      const current = new Date(parseDate(event.planned_date));
      const diff    = Math.round((current - orig) / (1000 * 60 * 60 * 24));
      if (diff > delayDays) delayDays = diff;
    }
  });

  // Map GoComet status to our internal status
  const rawStatus = (tracking.status || '').toLowerCase();
  if (status !== 'arrived') {
    if (rawStatus === 'delayed') status = 'delayed';
    else if (rawStatus === 'on time') status = 'on_time';
    else if (rawStatus === 'early') status = 'early';
  }

  return {
    carrier,
    actual_gate_in: gateIn,
    actual_departure: departure,
    predicted_arrival: predictedArrival,
    delay_days: delayDays,
    status,
    raw_prediction: tracking.status || 'Processing'
  };
}

function formatDateForGocomet(dateStr) {
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

module.exports = { getGocometToken, addTracking, fetchLiveTracking };
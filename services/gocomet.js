const axios = require('axios');

let cachedToken = null;
let tokenExpiry = null;

async function getGocometToken() {
  if (cachedToken && tokenExpiry && new Date() < new Date(tokenExpiry)) {
    return cachedToken;
  }
  try {
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
  } catch (err) {
    cachedToken = null;
    tokenExpiry = null;
    throw err;
  }
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
  'KMTU': 'KMTU',
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
    if (err.response && err.response.data) {
      const errorMsg = err.response.data.error || JSON.stringify(err.response.data);

      // "already exists, id <uuid>" — extract tracking ID directly
      const match = errorMsg.match(/id\s+([a-f0-9-]{36})/i);
      if (match) return match[1];

      // Carrier code missing or any other error — container is probably already
      // on GoComet (manually added). Look it up by container number.
      try {
        const liveRes = await axios.get(
          'https://tracking.gocomet.com/api/v1/integrations/live-tracking',
          { params: { token, 'tracking_numbers[]': containerNumber, start_date: '01/01/2024' } }
        );
        const trackings = liveRes.data.updated_trackings;
        if (trackings && trackings.length > 0) {
          const t = trackings[0];
          const existingId = t.id || t.tracking_id || t.uuid || null;
          if (existingId) return existingId;
        }
      } catch (_) {}

      throw new Error(`GoComet: ${errorMsg}`);
    }
    throw err;
  }
}

async function fetchLiveTracking(trackingId, containerNumber, token) {
  console.log('fetchLiveTracking called:', trackingId, containerNumber);
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
  console.log('GoComet raw keys:', Object.keys(response.data));
  const trackings = response.data.updated_trackings;
  console.log('trackings length:', trackings ? trackings.length : 'null');
  if (!trackings || trackings.length === 0) return null;
  return parseTracking(trackings[0]);
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

const STOP_EVENTS = ['gate_out', 'empty_return'];

const ALLOWED_EVENTS = [
  'gate_in',
  'origin_departure',
  'trans_shipment_arrival',
  'trans_shipment_departure',
  'arrival',
  'discharge_at_pod',
  'loaded_at_pod',
  'departure_at_pod',
  'inland_destination_arrival',
];

function parseTracking(tracking) {
  const events = tracking.events || [];
  let gateIn = null;
  let departure = null;
  let predictedArrival = null;

  events.forEach(event => {
    if ((event.event || '').toLowerCase() === 'arrival') {
      if (event.actual_date) {
        predictedArrival = parseDate(event.actual_date);
      } else if (event.planned_date) {
        predictedArrival = parseDate(event.planned_date);
      }
    }
  });

  if (!predictedArrival) {
    predictedArrival = parseDate(tracking.stats?.predicted_eta)
      || parseDate(tracking.stats?.best_case_eta)
      || null;
  }

  let carrier = tracking.carrier_name || 'Unknown';
  let delayDays = 0;
  let status = 'in_transit';

  events.forEach(event => {
    const type = (event.event || '').toLowerCase();
    const actualDate = event.actual_date || null;

    if (type === 'gate_in' && actualDate) gateIn = parseDate(actualDate);
    if (type === 'origin_departure' && actualDate) departure = parseDate(actualDate);
    if (type === 'arrival' && actualDate) status = 'arrived';

    if (event.delayed && event.original_planned_date && event.planned_date) {
      const orig    = new Date(parseDate(event.original_planned_date));
      const current = new Date(parseDate(event.planned_date));
      const diff    = Math.round((current - orig) / (1000 * 60 * 60 * 24));
      if (diff > delayDays) delayDays = diff;
    }
  });

  const rawStatus = (tracking.status || '').toLowerCase();
  if (status !== 'arrived') {
    if (rawStatus === 'delayed') status = 'delayed';
    else if (rawStatus === 'on time') status = 'on_time';
    else if (rawStatus === 'early') status = 'early';
  }

console.log('RAW EVENTS:', events.map(e => e.event));
  const filteredEvents = events
    .filter(e => ALLOWED_EVENTS.includes((e.event || '').toLowerCase()))
    .reduce((acc, e) => {
      const type = (e.event || '').toLowerCase();
      if (STOP_EVENTS.includes(type)) return acc;
      acc.push({
        event:         e.event,
        display_event: e.display_event || e.event,
        location:      e.location || '',
        actual_date:   parseDate(e.actual_date) || null,
        planned_date:  parseDate(e.planned_date) || null,
        delayed:       e.delayed || false
      });
      return acc;
    }, []);

  return {
    carrier,
    actual_gate_in:    gateIn,
    actual_departure:  departure,
    predicted_arrival: predictedArrival,
    delay_days:        delayDays,
    status,
    raw_prediction:    tracking.status || 'Processing',
    events:            filteredEvents
  };
}

function formatDateForGocomet(dateStr) {
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

module.exports = { getGocometToken, addTracking, fetchLiveTracking };
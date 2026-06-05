const axios = require('axios');

async function getGocometToken() {
  const response = await axios.post(
    'https://login.gocomet.com/api/v1/integrations/generate-token-number',
    {
      email: process.env.GOCOMET_EMAIL,
      password: process.env.GOCOMET_PASSWORD
    }
  );
  return response.data.token;
}

async function addTracking(containerNumber, dispatchDate, token) {
  const response = await axios.post(
    'https://tracking.gocomet.com/api/v1/integrations/add_tracking_number',
    {
      token: token,
      tracking: {
        tracking_number: containerNumber,
        mode: 'ocean',
        auto_detect_carrier: true,
        dispatch_date: formatDateForGocomet(dispatchDate)
      }
    }
  );
  return response.data.tracking_id;
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

function parseTracking(tracking) {
  const events = tracking.events || [];
  let gateIn = null;
  let departure = null;
  let predictedArrival = tracking.carrier_eta || null;
  let carrier = tracking.carrier || 'Unknown';
  let delayDays = 0;
  let status = 'in_transit';

  events.forEach(event => {
    const type = (event.event_type || '').toLowerCase();
    const date = event.actual_date || null;
    if (type.includes('gate in') || type.includes('gate_in')) gateIn = date;
    if (type.includes('origin') && type.includes('departure')) departure = date;
    if (type.includes('arrival') && !type.includes('transshipment')) status = 'arrived';
  });

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
    actual_gate_in:    gateIn,
    actual_departure:  departure,
    predicted_arrival: predictedArrival,
    delay_days:        delayDays,
    status,
    raw_prediction:    tracking.prediction || 'Processing'
  };
}

function formatDateForGocomet(dateStr) {
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

module.exports = { getGocometToken, addTracking, fetchLiveTracking };
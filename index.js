const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const projectRoutes = require('./routes/projects');
const shipmentRoutes = require('./routes/shipments');
const exportRoutes = require('./routes/export');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/projects', projectRoutes);
app.use('/api/shipments', shipmentRoutes);
app.use('/api/export', exportRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'Studio19 Tracker is running' });
});

app.get('/api/test-gocomet', async (req, res) => {
  try {
    const email = process.env.GOCOMET_EMAIL;
    const password = process.env.GOCOMET_PASSWORD;
    const response = await axios.post('https://login.gocomet.com/api/v1/integrations/generate-token-number', { email, password });
    res.json({ success: true, data: response.data });
  } catch (err) {
    res.json({ success: false, error: err.message, details: err.response ? err.response.data : null });
  }
});

app.get('/api/test-gocomet-track', async (req, res) => {
  try {
    const token = 'eyJhbGciOiJFUzI1NiJ9.eyJ1c2VyX2lkIjoiMDFkMmQxYzMtN2ZmYi00ZjVhLTgyYjgtYjExN2M5N2ZkZDVlIiwidW5pcV90b2tlbiI6ImI3MjBmOTM4LWJlMDQtNGI5ZC04MWUyLTQ3MTM3N2MwNjNmOSIsInRva2VuX3R5cGUiOiJpbnRlZ3JhdGlvbiIsImNsaWVudF9pZCI6IjJmNjY1MzQ3LWViOWMtNDk2Zi1iNWFjLTc1ZGZkZjQxNWU5OSIsImV4cCI6MTc4MzI1MzIyOH0.5-HZ9hhtUsKSwL_5Ylm23quHYBNTVa_NPP0qzBDgpIu7IDgDvtzs0UdrSq-QhEEv8Yd5a09SXaQt-9N8RUpbsQ';
    const container = req.query.container || 'ONEU0613652';
    const addRes = await axios.post('https://tracking.gocomet.com/api/v1/integrations/add_tracking_number', { token, tracking: { tracking_number: container, mode: 'ocean', carrier_code: 'ONEY' } });
    res.json({ success: true, data: addRes.data });
  } catch (err) {
    res.json({ success: false, error: err.message, details: err.response ? err.response.data : null });
  }
});

app.get('/api/test-gocomet-fetch', async (req, res) => {
  try {
    const token = 'eyJhbGciOiJFUzI1NiJ9.eyJ1c2VyX2lkIjoiMDFkMmQxYzMtN2ZmYi00ZjVhLTgyYjgtYjExN2M5N2ZkZDVlIiwidW5pcV90b2tlbiI6ImI3MjBmOTM4LWJlMDQtNGI5ZC04MWUyLTQ3MTM3N2MwNjNmOSIsInRva2VuX3R5cGUiOiJpbnRlZ3JhdGlvbiIsImNsaWVudF9pZCI6IjJmNjY1MzQ3LWViOWMtNDk2Zi1iNWFjLTc1ZGZkZjQxNWU5OSIsImV4cCI6MTc4MzI1MzIyOH0.5-HZ9hhtUsKSwL_5Ylm23quHYBNTVa_NPP0qzBDgpIu7IDgDvtzs0UdrSq-QhEEv8Yd5a09SXaQt-9N8RUpbsQ';
    const fetchRes = await axios.get('https://tracking.gocomet.com/api/v1/integrations/live-tracking', { params: { token, 'tracking_ids[]': '2e169188-bd57-4323-9844-c628b84246a6', start_date: '01/01/2024' } });
    res.json({ success: true, data: fetchRes.data });
  } catch (err) {
    res.json({ success: false, error: err.message, details: err.response ? err.response.data : null });
  }
});

app.get('/api/test-track', async (req, res) => {
  const container = req.query.container || 'ONEU0613652';
  try {
    const { getGocometToken, addTracking, fetchLiveTracking } = require('./services/gocomet');
    const token = await getGocometToken();
    const trackingId = await addTracking(container, new Date().toISOString(), token);
    const liveData = await fetchLiveTracking(trackingId, container, token);
    res.json({ success: true, trackingId, liveData });
  } catch (err) {
    res.json({
      success: false,
      error: err.message,
      status: err.response?.status || null,
      details: err.response?.data || null
    });
  }
});

app.get('/api/test-raw', async (req, res) => {
  try {
    const { getGocometToken } = require('./services/gocomet');
    const token = await getGocometToken();
    const fetchRes = await axios.get(
      'https://tracking.gocomet.com/api/v1/integrations/live-tracking',
      {
        params: {
          token: token,
          'tracking_ids[]': '2e169188-bd57-4323-9844-c628b84246a6',
          'tracking_numbers[]': 'ONEU0613652',
          start_date: '01/01/2024'
        }
      }
    );
    res.json(fetchRes.data);
  } catch (err) {
    res.json({ error: err.message, details: err.response?.data });
  }
});

app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});
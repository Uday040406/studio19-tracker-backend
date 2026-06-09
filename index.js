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

app.get('/api/test-track', async (req, res) => {
  const container = req.query.container || 'HMMU2204997';
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

app.get('/api/test-refresh', async (req, res) => {
  try {
    const { getGocometToken } = require('./services/gocomet');
    const token = await getGocometToken();
    const response = await axios.get(
      'https://tracking.gocomet.com/api/v1/integrations/live-tracking',
      {
        params: {
          token: token,
          'tracking_ids[]': '2418eae7-2290-4ed0-8c40-efb3ae4b11ee',
          'tracking_numbers[]': 'HMMU2204997',
          start_date: '01/01/2024'
        }
      }
    );
    res.json(response.data);
  } catch (err) {
    res.json({ error: err.message, details: err.response?.data });
  }
});

app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});
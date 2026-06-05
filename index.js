const express = require('express');
const cors = require('cors');
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
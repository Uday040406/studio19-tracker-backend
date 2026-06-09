const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const { calculateIdealTimeline } = require('../services/calculator');
const { getGocometToken, addTracking, fetchLiveTracking } = require('../services/gocomet');

// Get all shipments for a project
router.get('/project/:projectId', async (req, res) => {
  const { data, error } = await supabase
    .from('shipments')
    .select('*')
    .eq('project_id', req.params.projectId)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Create new shipment — generates ideal timeline automatically
router.post('/', async (req, res) => {
  const { project_id, origin_port, destination_port, departure_date } = req.body;
  if (!project_id || !origin_port || !destination_port || !departure_date) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const timeline = await calculateIdealTimeline(departure_date, origin_port, destination_port);
    const { data, error } = await supabase
      .from('shipments')
      .insert([{ project_id, origin_port, destination_port, departure_date, ...timeline, status: 'pending' }])
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add container number and start GoComet tracking
router.post('/:id/track', async (req, res) => {
  const { container_number } = req.body;
  if (!container_number) return res.status(400).json({ error: 'Container number required' });
  try {
    const { data: shipment } = await supabase
      .from('shipments').select('*').eq('id', req.params.id).single();
    const token = await getGocometToken();
    const trackingId = await addTracking(container_number, shipment.departure_date, token);
    const { data, error } = await supabase
      .from('shipments')
      .update({ container_number, gocomet_tracking_id: trackingId, status: 'tracking' })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Refresh live data from GoComet
router.post('/:id/refresh', async (req, res) => {
  try {
    const { data: shipment } = await supabase
      .from('shipments').select('*').eq('id', req.params.id).single();
    if (!shipment.gocomet_tracking_id) {
      return res.status(400).json({ error: 'No tracking started yet. Add a container number first.' });
    }
    const token = await getGocometToken();
    const liveData = await fetchLiveTracking(shipment.gocomet_tracking_id, shipment.container_number, token);
    if (!liveData) return res.json({ message: 'No live data yet', shipment });
    const { data, error } = await supabase
      .from('shipments')
      .update({
        carrier: liveData.carrier,
        actual_gate_in: liveData.actual_gate_in,
        actual_departure: liveData.actual_departure,
        predicted_arrival: liveData.predicted_arrival,
        delay_days: liveData.delay_days,
        status: liveData.status,
        last_updated: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete shipment
router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('shipments')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const { getGocometToken, addTracking, fetchLiveTracking } = require('../services/gocomet');

router.get('/project/:projectId', async (req, res) => {
  const { data, error } = await supabase
    .from('shipments')
    .select('*')
    .eq('project_id', req.params.projectId)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Create shipment + start tracking immediately
router.post('/', async (req, res) => {
  const { project_id, container_number, expected_arrival_date, shipment_name } = req.body;
  if (!project_id || !container_number || !expected_arrival_date) {
    return res.status(400).json({ error: 'project_id, container_number and expected_arrival_date required' });
  }
  try {
    const token = await getGocometToken();
    const trackingId = await addTracking(container_number, expected_arrival_date, token);
    const { data, error } = await supabase
      .from('shipments')
      .insert([{
        project_id,
        container_number,
        expected_arrival_date,
        shipment_name: shipment_name || container_number,
        gocomet_tracking_id: trackingId,
        status: 'tracking'
      }])
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/refresh', async (req, res) => {
  try {
    const { data: shipment } = await supabase
      .from('shipments').select('*').eq('id', req.params.id).single();
    if (!shipment.gocomet_tracking_id) {
      return res.status(400).json({ error: 'No tracking ID found' });
    }
    const token = await getGocometToken();
    const liveData = await fetchLiveTracking(shipment.gocomet_tracking_id, shipment.container_number, token);
    if (!liveData) return res.json({ message: 'No live data yet', shipment });

    // Delay = predicted arrival vs OUR expected date
    let delayDays = 0;
    if (liveData.predicted_arrival && shipment.expected_arrival_date) {
      const predicted = new Date(liveData.predicted_arrival);
      const expected  = new Date(shipment.expected_arrival_date);
      delayDays = Math.round((predicted - expected) / (1000 * 60 * 60 * 24));
    } else {
      delayDays = liveData.delay_days;
    }

    const status = delayDays > 0 ? 'delayed' : delayDays < 0 ? 'early' : 'on_time';

    const { data, error } = await supabase
      .from('shipments')
      .update({
        carrier:           liveData.carrier,
        actual_gate_in:    liveData.actual_gate_in,
        actual_departure:  liveData.actual_departure,
        predicted_arrival: liveData.predicted_arrival,
        delay_days:        delayDays,
        status:            status,
        gocomet_events:    liveData.events,
        last_updated:      new Date().toISOString()
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

router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('shipments')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');

// Get all projects
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Create a new project
router.post('/', async (req, res) => {
  const { name, client_name } = req.body;
  if (!name) return res.status(400).json({ error: 'Project name is required' });
  const { data, error } = await supabase
    .from('projects')
    .insert([{ name, client_name }])
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Update a project
router.put('/:id', async (req, res) => {
  const { name, client_name } = req.body;
  if (!name) return res.status(400).json({ error: 'Project name is required' });
  const { data, error } = await supabase
    .from('projects')
    .update({ name, client_name })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Delete a project
router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
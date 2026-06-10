const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const supabase = require('../services/supabase');

router.get('/project/:projectId', async (req, res) => {
  const { data: project } = await supabase
    .from('projects').select('*')
    .eq('id', req.params.projectId).single();

  const { data: shipments } = await supabase
    .from('shipments').select('*')
    .eq('project_id', req.params.projectId)
    .order('created_at', { ascending: true });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Shipments');

  sheet.columns = [
    { header: 'Project',            key: 'project',        width: 20 },
    { header: 'Client',             key: 'client',         width: 20 },
    { header: 'Shipment Name',      key: 'shipment_name',  width: 20 },
    { header: 'Container Number',   key: 'container',      width: 18 },
    { header: 'Carrier',            key: 'carrier',        width: 25 },
    { header: 'Expected Arrival',   key: 'expected',       width: 18 },
    { header: 'Predicted Arrival',  key: 'predicted',      width: 18 },
    { header: 'Actual Gate In',     key: 'actual_gate',    width: 18 },
    { header: 'Actual Departure',   key: 'actual_dep',     width: 18 },
    { header: 'Delay (Days)',       key: 'delay',          width: 14 },
    { header: 'Status',             key: 'status',         width: 14 },
    { header: 'Last Updated',       key: 'last_updated',   width: 22 },
  ];

  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1C3A63' } };

  shipments.forEach(s => {
    const row = sheet.addRow({
      project:       project.name,
      client:        project.client_name || '-',
      shipment_name: s.shipment_name || '-',
      container:     s.container_number || '-',
      carrier:       s.carrier || '-',
      expected:      s.expected_arrival_date || '-',
      predicted:     s.predicted_arrival || '-',
      actual_gate:   s.actual_gate_in || '-',
      actual_dep:    s.actual_departure || '-',
      delay:         s.delay_days || 0,
      status:        s.status,
      last_updated:  s.last_updated ? new Date(s.last_updated).toLocaleString() : '-',
    });

    const delayCell = row.getCell('delay');
    if (s.delay_days > 0) delayCell.font = { color: { argb: 'FFCC0000' }, bold: true };
    else if (s.delay_days < 0) delayCell.font = { color: { argb: 'FF006600' }, bold: true };
  });

  res.setHeader('Content-Disposition', `attachment; filename="${project.name}-shipments.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  await workbook.xlsx.write(res);
  res.end();
});

module.exports = router;
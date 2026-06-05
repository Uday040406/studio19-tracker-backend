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
    { header: 'Project',               key: 'project',         width: 20 },
    { header: 'Client',                key: 'client',          width: 20 },
    { header: 'Container Number',      key: 'container',       width: 18 },
    { header: 'Carrier',               key: 'carrier',         width: 18 },
    { header: 'Origin Port',           key: 'origin',          width: 28 },
    { header: 'Destination Port',      key: 'destination',     width: 18 },
    { header: 'Goods Ready Date',      key: 'goods_ready',     width: 18 },
    { header: 'Planned Gate In',       key: 'gate_in',         width: 18 },
    { header: 'Planned Departure',     key: 'departure',       width: 18 },
    { header: 'Planned Arrival',       key: 'arrival',         width: 18 },
    { header: 'Planned Customs Done',  key: 'customs',         width: 20 },
    { header: 'Planned Site Delivery', key: 'site',            width: 20 },
    { header: 'Actual Gate In',        key: 'actual_gate',     width: 18 },
    { header: 'Actual Departure',      key: 'actual_dep',      width: 18 },
    { header: 'Predicted Arrival',     key: 'pred_arrival',    width: 18 },
    { header: 'Delay (Days)',          key: 'delay',           width: 14 },
    { header: 'Status',               key: 'status',          width: 14 },
    { header: 'Last Updated',          key: 'last_updated',    width: 22 },
  ];

  // Style the header row
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1C3A63' } };

  shipments.forEach(s => {
    const row = sheet.addRow({
      project:      project.name,
      client:       project.client_name || '-',
      container:    s.container_number || '-',
      carrier:      s.carrier || '-',
      origin:       s.origin_port,
      destination:  s.destination_port,
      goods_ready:  s.goods_ready_date,
      gate_in:      s.planned_gate_in,
      departure:    s.planned_departure,
      arrival:      s.planned_arrival,
      customs:      s.planned_customs_done,
      site:         s.planned_site_delivery,
      actual_gate:  s.actual_gate_in || '-',
      actual_dep:   s.actual_departure || '-',
      pred_arrival: s.predicted_arrival || '-',
      delay:        s.delay_days || 0,
      status:       s.status,
      last_updated: s.last_updated ? new Date(s.last_updated).toLocaleString() : '-',
    });

    // Colour the delay cell red or green
    const delayCell = row.getCell('delay');
    if (s.delay_days > 0) {
      delayCell.font = { color: { argb: 'FFCC0000' }, bold: true };
    } else if (s.delay_days < 0) {
      delayCell.font = { color: { argb: 'FF006600' }, bold: true };
    }
  });

  res.setHeader('Content-Disposition', `attachment; filename="${project.name}-shipments.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  await workbook.xlsx.write(res);
  res.end();
});

module.exports = router;
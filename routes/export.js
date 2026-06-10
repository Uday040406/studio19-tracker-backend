const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const supabase = require('../services/supabase');

function toIST(date) {
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  }).format(new Date(date)) + ' IST';
}

function formatDateOnly(date) {
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: 'short', day: 'numeric'
  }).format(new Date(date));
}

router.get('/project/:projectId', async (req, res) => {
  const { data: project } = await supabase
    .from('projects').select('*')
    .eq('id', req.params.projectId).single();

  const { data: shipments } = await supabase
    .from('shipments').select('*')
    .eq('project_id', req.params.projectId)
    .order('created_at', { ascending: true });

  // Save current snapshot to status_logs
  const snapshotTime = new Date().toISOString();
  if (shipments && shipments.length > 0) {
    const logEntries = shipments.map(s => ({
      project_id:            req.params.projectId,
      shipment_id:           s.id,
      shipment_name:         s.shipment_name || s.container_number,
      container_number:      s.container_number,
      carrier:               s.carrier || null,
      expected_arrival_date: s.expected_arrival_date || null,
      predicted_arrival:     s.predicted_arrival || null,
      actual_gate_in:        s.actual_gate_in || null,
      actual_departure:      s.actual_departure || null,
      delay_days:            s.delay_days || 0,
      status:                s.status || 'pending',
      snapshot_at:           snapshotTime
    }));
    await supabase.from('status_logs').insert(logEntries);
  }

  // Fetch all historical logs for this project
  const { data: logs } = await supabase
    .from('status_logs')
    .select('*')
    .eq('project_id', req.params.projectId)
    .order('snapshot_at', { ascending: true });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Shipment History');

  sheet.columns = [
    { header: 'Snapshot Time (IST)',  key: 'snapshot_at',    width: 26 },
    { header: 'Shipment Name',        key: 'shipment_name',  width: 22 },
    { header: 'Container Number',     key: 'container',      width: 18 },
    { header: 'Carrier',              key: 'carrier',        width: 26 },
    { header: 'Expected Arrival',     key: 'expected',       width: 18 },
    { header: 'Predicted Arrival',    key: 'predicted',      width: 18 },
    { header: 'Actual Gate In',       key: 'actual_gate',    width: 18 },
    { header: 'Actual Departure',     key: 'actual_dep',     width: 18 },
    { header: 'Delay (Days)',         key: 'delay',          width: 14 },
    { header: 'Status',               key: 'status',         width: 14 },
  ];

  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2D1B69' } };
  headerRow.height = 22;

  // Group logs by snapshot time for visual separation
  let lastSnapshot = null;
  let rowNum = 2;

  (logs || []).forEach(log => {
    const row = sheet.addRow({
      snapshot_at:  toIST(log.snapshot_at),
      shipment_name: log.shipment_name || '—',
      container:    log.container_number || '—',
      carrier:      log.carrier || '—',
      expected:     formatDateOnly(log.expected_arrival_date),
      predicted:    formatDateOnly(log.predicted_arrival),
      actual_gate:  formatDateOnly(log.actual_gate_in),
      actual_dep:   formatDateOnly(log.actual_departure),
      delay:        log.delay_days || 0,
      status:       log.status || '—',
    });

    // Alternate background for each snapshot group
    const isNewSnapshot = log.snapshot_at !== lastSnapshot;
    if (isNewSnapshot) {
      lastSnapshot = log.snapshot_at;
    }
    const bgColor = isNewSnapshot ? 'FFFAF9FF' : 'FFEDEBFA';
    row.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      cell.font = { size: 10 };
    });

    // Colour delay cell
    const delayCell = row.getCell('delay');
    if (log.delay_days > 0) {
      delayCell.font = { color: { argb: 'FFC0392B' }, bold: true, size: 10 };
    } else if (log.delay_days < 0) {
      delayCell.font = { color: { argb: 'FF1E6B45' }, bold: true, size: 10 };
    }

    // Colour status cell
    const statusCell = row.getCell('status');
    if (log.status === 'delayed') statusCell.font = { color: { argb: 'FFC0392B' }, bold: true, size: 10 };
    else if (log.status === 'on_time') statusCell.font = { color: { argb: 'FF1E6B45' }, bold: true, size: 10 };

    rowNum++;
  });

  // Add thin border to all data rows
  sheet.eachRow((row, num) => {
    if (num === 1) return;
    row.eachCell(cell => {
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE8E4F0' } }
      };
    });
  });

  const filename = `${project.name}-shipment-history.xlsx`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  await workbook.xlsx.write(res);
  res.end();
});

module.exports = router;
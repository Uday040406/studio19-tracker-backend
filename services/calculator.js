const supabase = require('./supabase');

async function calculateIdealTimeline(goodsReadyDate, originPort, destinationPort) {
  const { data: route, error } = await supabase
    .from('routes')
    .select('*')
    .ilike('origin_port', originPort)
    .ilike('destination_port', destinationPort)
    .single();

  if (error || !route) {
    throw new Error(`Route not found: ${originPort} to ${destinationPort}`);
  }

  const { data: phases } = await supabase
    .from('fixed_phases')
    .select('*');

  const phaseMap = {};
  phases.forEach(p => phaseMap[p.phase_name] = p);

  const start = new Date(goodsReadyDate);

  const factoryMin = phaseMap.factory_to_port.min_days;
  const factoryMax = phaseMap.factory_to_port.max_days;
  const transitMin = route.min_days;
  const transitMax = route.max_days;
  const customsMin = phaseMap.customs_clearance.min_days;
  const customsMax = phaseMap.customs_clearance.max_days;
  const siteMin    = phaseMap.port_to_site.min_days;
  const siteMax    = phaseMap.port_to_site.max_days;

  return {
    planned_gate_in_earliest:       addDays(start, factoryMin),
    planned_gate_in_latest:         addDays(start, factoryMax),
    planned_departure_earliest:     addDays(start, factoryMin + 3),
    planned_departure_latest:       addDays(start, factoryMax + 3),
    planned_arrival_earliest:       addDays(start, factoryMin + 3 + transitMin),
    planned_arrival_latest:         addDays(start, factoryMax + 3 + transitMax),
    planned_customs_done_earliest:  addDays(start, factoryMin + 3 + transitMin + customsMin),
    planned_customs_done_latest:    addDays(start, factoryMax + 3 + transitMax + customsMax),
    planned_site_delivery_earliest: addDays(start, factoryMin + 3 + transitMin + customsMin + siteMin),
    planned_site_delivery_latest:   addDays(start, factoryMax + 3 + transitMax + customsMax + siteMax),
  };
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result.toISOString().split('T')[0];
}

module.exports = { calculateIdealTimeline };
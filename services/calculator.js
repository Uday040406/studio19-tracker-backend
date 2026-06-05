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

  const factoryToPort = average(phaseMap.factory_to_port.min_days, phaseMap.factory_to_port.max_days);
  const transitDays  = average(route.min_days, route.max_days);
  const customsDays  = average(phaseMap.customs_clearance.min_days, phaseMap.customs_clearance.max_days);
  const portToSite   = average(phaseMap.port_to_site.min_days, phaseMap.port_to_site.max_days);

  const start            = new Date(goodsReadyDate);
  const plannedGateIn    = addDays(start, factoryToPort);
  const plannedDeparture = addDays(plannedGateIn, 3);
  const plannedArrival   = addDays(plannedDeparture, transitDays);
  const plannedCustoms   = addDays(plannedArrival, customsDays);
  const plannedSite      = addDays(plannedCustoms, portToSite);

  return {
    planned_gate_in:       plannedGateIn,
    planned_departure:     plannedDeparture,
    planned_arrival:       plannedArrival,
    planned_customs_done:  plannedCustoms,
    planned_site_delivery: plannedSite,
    route_min_days:        route.min_days,
    route_max_days:        route.max_days
  };
}

function average(min, max) {
  return Math.round((min + max) / 2);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result.toISOString().split('T')[0];
}

module.exports = { calculateIdealTimeline };
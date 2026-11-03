// Market logic: technology catalogue and market clearing.
// Pure functions only (no DOM, no storage) so it is easy to read in class.

// Colours are listed in merit-order sequence and were checked for
// colour-blind separation between neighbours.
export const TECH = {
  solar:   { label: 'Solar PV',          short: 'Solar',   icon: '☀️', color: '#E3A008' },
  wind:    { label: 'Wind',              short: 'Wind',    icon: '🌬️', color: '#2F86D6' },
  nuclear: { label: 'Nuclear',           short: 'Nuclear', icon: '⚛️', color: '#C455A8' },
  lignite: { label: 'Lignite',           short: 'Lignite', icon: '🟫', color: '#A85C1A' },
  coal:    { label: 'Hard coal',         short: 'Coal',    icon: '🏭', color: '#0E9080' },
  ccgt:    { label: 'Gas (CCGT)',        short: 'CCGT',    icon: '🔥', color: '#F28E2B' },
  ocgt:    { label: 'Gas peaker (OCGT)', short: 'OCGT',    icon: '⚡', color: '#C93A3A' },
  oil:     { label: 'Oil',               short: 'Oil',     icon: '🛢️', color: '#6A5ACD' },
};
export const TECH_ORDER = ['solar', 'wind', 'nuclear', 'lignite', 'coal', 'ccgt', 'ocgt', 'oil'];

/**
 * What companies can buy. Per unit:
 *   unit  : size (MW)
 *   cost  : investment cost (€), stylised so a plant pays back in roughly 2–4 rounds of 1,000 hours
 *   avail : share of capacity that can produce in a round (wind and solar depend on the weather, drawn each round)
 *   fuel  : fuel price (€ per MWh of fuel, i.e. thermal)
 *   eff   : electrical efficiency (MWh electricity per MWh fuel)
 *   ef    : emission factor of the fuel (t CO2 per MWh of fuel)
 *   vom   : variable operation & maintenance cost (€/MWh electricity)
 * The marginal cost follows from these and the game's CO2 price (see marginalCost).
 */
export const DEFAULT_CATALOGUE = {
  solar:   { unit: 100, cost: 8e6,   avail: [0.15, 0.7], fuel: 0,   eff: 1,    ef: 0,    vom: 0 },
  wind:    { unit: 150, cost: 15e6,  avail: [0.2, 0.9],  fuel: 0,   eff: 1,    ef: 0,    vom: 0 },
  nuclear: { unit: 500, cost: 85e6,  avail: [1, 1],      fuel: 3.3, eff: 0.33, ef: 0,    vom: 0 },
  lignite: { unit: 400, cost: 36e6,  avail: [1, 1],      fuel: 4,   eff: 0.40, ef: 0.36, vom: 1 },
  coal:    { unit: 300, cost: 18e6,  avail: [1, 1],      fuel: 9,   eff: 0.42, ef: 0.34, vom: 2 },
  ccgt:    { unit: 250, cost: 7e6,   avail: [1, 1],      fuel: 33,  eff: 0.58, ef: 0.20, vom: 0 },
  ocgt:    { unit: 100, cost: 2e6,   avail: [1, 1],      fuel: 33,  eff: 0.38, ef: 0.20, vom: 3 },
  oil:     { unit: 50,  cost: 0.6e6, avail: [1, 1],      fuel: 45,  eff: 0.35, ef: 0.27, vom: 5 },
};
export const DEFAULT_CO2_PRICE = 30; // €/t

/** Marginal cost breakdown in €/MWh of electricity. */
export function mcBreakdown(k, co2Price) {
  const fuel = k.eff > 0 ? (k.fuel || 0) / k.eff : 0;
  const co2 = k.eff > 0 ? ((k.ef || 0) * co2Price) / k.eff : 0;
  const vom = k.vom || 0;
  return { fuel, co2, vom, total: Math.round((fuel + co2 + vom) * 10) / 10 };
}
export const marginalCost = (k, co2Price) => mcBreakdown(k, co2Price).total;

/**
 * Levelised cost of electricity within the game: marginal cost plus the investment
 * (minus what the plant is still worth at the end) spread over the energy the
 * plant could produce in the remaining rounds if it ran all the time.
 */
export function gameLcoe(k, { mc, rounds, hours, salvage }) {
  const avail = ((k.avail?.[0] ?? 1) + (k.avail?.[1] ?? 1)) / 2;
  const energy = k.unit * avail * hours * Math.max(1, rounds);
  const capital = (k.cost * (1 - salvage / 100)) / energy;
  return { capital, energy, avail, total: mc + capital };
}

/** Draw this round's availability for every technology with a variable output. */
export function drawAvailability(catalogue, rand = Math.random) {
  const out = {};
  for (const [tech, c] of Object.entries(catalogue)) {
    const [lo, hi] = c.avail || [1, 1];
    out[tech] = lo === hi ? lo : Math.round((lo + rand() * (hi - lo)) * 100) / 100;
  }
  return out;
}

/**
 * Clear the market for one representative hour, then scale money by `hours`.
 *
 * plants  : [{id, owner, tech, capacity, mc}]
 * bids    : {ownerId: {plantId: price}}
 * demand  : inelastic demand in MW
 * avail   : {tech: share of capacity available this round}
 * pricing : 'uniform' (pay-as-clear) or 'pab' (pay-as-bid)
 * missing : what to do with plants without a bid: 'withhold' | 'mc' | 'cap'
 *
 * Offers are sorted by price (the merit order) and accepted until demand is
 * met. The last accepted offer sets the clearing price. Offers at exactly the
 * marginal price share the remaining demand pro rata. If supply is short,
 * the price goes to the price cap.
 */
export function clearMarket({ plants, bids, demand, avail = {}, hours = 1, priceCap, pricing = 'uniform', missing = 'withhold' }) {
  const offers = [];
  const notOffered = [];
  for (const p of plants) {
    const available = p.capacity * (avail[p.tech] ?? 1);
    let bid = bids?.[p.owner]?.[p.id];
    let auto = false;
    if (bid === undefined || bid === null || Number.isNaN(Number(bid))) {
      if (missing === 'mc') { bid = p.mc; auto = true; }
      else if (missing === 'cap') { bid = priceCap; auto = true; }
      else { notOffered.push({ ...p, available }); continue; }
    }
    if (available <= 0) { notOffered.push({ ...p, available, bid: Number(bid) }); continue; }
    offers.push({ ...p, available, bid: Number(bid), auto });
  }
  // Merit order; on equal prices the cheaper plant is drawn first in the chart.
  offers.sort((a, b) => a.bid - b.bid || a.mc - b.mc);

  let remaining = demand;
  let price = null;
  let i = 0;
  while (i < offers.length && remaining > 1e-9) {
    let j = i, groupCap = 0;
    while (j < offers.length && offers[j].bid === offers[i].bid) groupCap += offers[j++].available;
    const share = Math.min(1, remaining / groupCap);
    for (let k = i; k < j; k++) offers[k].dispatched = offers[k].available * share;
    remaining -= groupCap * share;
    price = offers[i].bid;
    i = j;
  }
  for (; i < offers.length; i++) offers[i].dispatched = 0;
  const unserved = Math.max(0, remaining);
  if (unserved > 1e-9) price = priceCap; // scarcity pricing
  if (price === null) price = 0;

  const perOwner = {};
  const all = [...offers, ...notOffered.map((p) => ({ ...p, bid: p.bid ?? null, dispatched: 0 }))];
  for (const o of all) {
    const paid = pricing === 'pab' ? o.bid : price;
    o.revenue = o.dispatched > 0 ? o.dispatched * paid * hours : 0;
    o.cost = o.dispatched * o.mc * hours;
    o.profit = o.revenue - o.cost;
    const r = (perOwner[o.owner] ||= { revenue: 0, cost: 0, profit: 0, dispatched: 0 });
    r.revenue += o.revenue; r.cost += o.cost; r.profit += o.profit; r.dispatched += o.dispatched;
  }
  const round2 = (x) => Math.round(x * 100) / 100;
  const clean = (o) => ({
    id: o.id, owner: o.owner, name: o.name, tech: o.tech, capacity: o.capacity, available: round2(o.available), mc: o.mc,
    bid: o.bid ?? null, auto: !!o.auto, dispatched: round2(o.dispatched),
    revenue: Math.round(o.revenue), cost: Math.round(o.cost), profit: Math.round(o.profit),
  });
  return {
    price,
    demand: round2(demand),
    unserved: round2(unserved),
    pricing,
    hours,
    offers: offers.map(clean),
    notOffered: all.slice(offers.length).map(clean),
    perOwner: Object.fromEntries(Object.entries(perOwner).map(([k, v]) =>
      [k, { revenue: Math.round(v.revenue), cost: Math.round(v.cost), profit: Math.round(v.profit), dispatched: round2(v.dispatched) }])),
  };
}

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
 * What players can buy. Per unit: size (MW), marginal cost (€/MWh),
 * investment cost (€) and availability range: the share of capacity that can
 * produce in a round (wind and solar depend on the weather, drawn each round).
 * Costs are stylised so a plant pays back in roughly 2–4 rounds of 1,000 hours.
 */
export const DEFAULT_CATALOGUE = {
  solar:   { unit: 100, mc: 0,   cost: 8e6,  avail: [0.15, 0.7] },
  wind:    { unit: 150, mc: 0,   cost: 15e6, avail: [0.2, 0.9] },
  nuclear: { unit: 500, mc: 10,  cost: 85e6, avail: [1, 1] },
  lignite: { unit: 400, mc: 30,  cost: 42e6, avail: [1, 1] },
  coal:    { unit: 300, mc: 45,  cost: 18e6, avail: [1, 1] },
  ccgt:    { unit: 250, mc: 65,  cost: 7e6,  avail: [1, 1] },
  ocgt:    { unit: 100, mc: 110, cost: 2e6,  avail: [1, 1] },
  oil:     { unit: 50,  mc: 160, cost: 0.6e6, avail: [1, 1] },
};

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

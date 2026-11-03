// Market logic: power-plant catalogue, fleet generation and market clearing.
// Pure functions only (no DOM, no storage) so it is easy to read in class.

// Colours are listed in merit-order sequence and were checked for
// colour-blind separation between neighbours.
export const TECH = {
  solar:   { label: 'Solar PV',    short: 'Solar',   icon: '☀️', color: '#E3A008', mc: [0, 2],     cap: [100, 250] },
  wind:    { label: 'Wind',        short: 'Wind',    icon: '🌬️', color: '#2F86D6', mc: [0, 3],     cap: [150, 300] },
  nuclear: { label: 'Nuclear',     short: 'Nuclear', icon: '⚛️', color: '#C455A8', mc: [8, 14],    cap: [400, 700] },
  lignite: { label: 'Lignite',     short: 'Lignite', icon: '🟫', color: '#A85C1A', mc: [25, 35],   cap: [300, 550] },
  coal:    { label: 'Hard coal',   short: 'Coal',    icon: '🏭', color: '#0E9080', mc: [38, 55],   cap: [250, 500] },
  ccgt:    { label: 'Gas (CCGT)',  short: 'CCGT',    icon: '🔥', color: '#F28E2B', mc: [60, 80],   cap: [200, 450] },
  ocgt:    { label: 'Gas peaker (OCGT)', short: 'OCGT', icon: '⚡', color: '#C93A3A', mc: [100, 140], cap: [80, 200] },
  oil:     { label: 'Oil',         short: 'Oil',     icon: '🛢️', color: '#6A5ACD', mc: [150, 200], cap: [50, 150] },
};
export const TECH_ORDER = ['solar', 'wind', 'nuclear', 'lignite', 'coal', 'ccgt', 'ocgt', 'oil'];

// Plants are drawn from this deck in order, so any number of plants gives a
// reasonable mix of base-, mid- and peak-load capacity.
const DECK = ['wind', 'nuclear', 'coal', 'ccgt', 'solar', 'lignite', 'ccgt', 'coal', 'ocgt', 'wind', 'ccgt', 'oil'];
const PLACES = ['Ashford', 'Bergheim', 'Cedar Bay', 'Dunmore', 'Elmfield', 'Fjordvik', 'Glenrock', 'Harbourview',
  'Ironbridge', 'Juniper', 'Kestrel', 'Lakeside', 'Millbrook', 'Northgate', 'Oakridge', 'Pinecrest', 'Quarry Hill',
  'Redcliff', 'Stonehaven', 'Thornbury', 'Upton', 'Valemont', 'Westbrook', 'Yarrow', 'Zellwood'];

// Small seeded RNG (mulberry32) so a game can be reproduced from its seed.
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const between = (rng, [lo, hi]) => lo + rng() * (hi - lo);

/** Create plants number `start` .. `start + n - 1` of the deck. */
export function generatePlants(n, rng, start = 0) {
  const plants = [];
  for (let i = start; i < start + n; i++) {
    const tech = DECK[i % DECK.length];
    const t = TECH[tech];
    const place = PLACES[i % PLACES.length] + (i >= PLACES.length ? ` ${Math.floor(i / PLACES.length) + 1}` : '');
    plants.push({
      id: `p${i + 1}`,
      name: `${place} ${t.short}`,
      tech,
      capacity: Math.round(between(rng, t.cap) / 10) * 10,
      mc: Math.round(between(rng, t.mc)),
    });
  }
  return plants;
}

/**
 * Give each owner `perOwner` plants. With one plant each the deal is random;
 * with several (team mode) plants are sorted by marginal cost and dealt
 * snake-style so every team gets a mix of cheap and expensive plants.
 */
export function assignPlants(ownerIds, perOwner, rng, start = 0) {
  const plants = generatePlants(ownerIds.length * perOwner, rng, start);
  if (perOwner === 1) {
    for (let i = plants.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [plants[i], plants[j]] = [plants[j], plants[i]];
    }
    plants.forEach((p, i) => { p.owner = ownerIds[i]; });
  } else {
    plants.sort((a, b) => a.mc - b.mc);
    const n = ownerIds.length;
    plants.forEach((p, i) => {
      const lap = Math.floor(i / n), k = i % n;
      p.owner = ownerIds[lap % 2 === 0 ? k : n - 1 - k];
    });
  }
  return plants;
}

/**
 * Clear the day-ahead market for one hour.
 *
 * plants  : [{id, owner, tech, capacity, mc}]
 * bids    : {ownerId: {plantId: price}}
 * demand  : inelastic demand in MW
 * pricing : 'uniform' (pay-as-clear) or 'pab' (pay-as-bid)
 * missing : what to do with plants without a bid: 'withhold' | 'mc' | 'cap'
 *
 * Offers are sorted by price (the merit order) and accepted until demand is
 * met. The last accepted offer sets the clearing price. Offers at exactly the
 * marginal price share the remaining demand pro rata. If supply is short,
 * the price goes to the price cap.
 */
export function clearMarket({ plants, bids, demand, priceCap, pricing = 'uniform', missing = 'withhold' }) {
  const offers = [];
  const notOffered = [];
  for (const p of plants) {
    let bid = bids?.[p.owner]?.[p.id];
    let auto = false;
    if (bid === undefined || bid === null || Number.isNaN(Number(bid))) {
      if (missing === 'mc') { bid = p.mc; auto = true; }
      else if (missing === 'cap') { bid = priceCap; auto = true; }
      else { notOffered.push(p); continue; }
    }
    offers.push({ ...p, bid: Number(bid), auto });
  }
  // Merit order; on equal prices the cheaper plant is drawn first in the chart.
  offers.sort((a, b) => a.bid - b.bid || a.mc - b.mc);

  let remaining = demand;
  let price = null;
  let i = 0;
  while (i < offers.length && remaining > 1e-9) {
    let j = i, groupCap = 0;
    while (j < offers.length && offers[j].bid === offers[i].bid) groupCap += offers[j++].capacity;
    const share = Math.min(1, remaining / groupCap);
    for (let k = i; k < j; k++) offers[k].dispatched = offers[k].capacity * share;
    remaining -= groupCap * share;
    price = offers[i].bid;
    i = j;
  }
  for (; i < offers.length; i++) offers[i].dispatched = 0;
  const unserved = Math.max(0, remaining);
  if (unserved > 1e-9) price = priceCap; // scarcity pricing
  if (price === null) price = 0;

  const perOwner = {};
  for (const o of [...offers, ...notOffered.map((p) => ({ ...p, bid: null, dispatched: 0 }))]) {
    const paid = pricing === 'pab' ? o.bid : price;
    o.revenue = o.dispatched > 0 ? o.dispatched * paid : 0;
    o.cost = o.dispatched * o.mc;
    o.profit = o.revenue - o.cost;
    const r = (perOwner[o.owner] ||= { revenue: 0, cost: 0, profit: 0, dispatched: 0 });
    r.revenue += o.revenue; r.cost += o.cost; r.profit += o.profit; r.dispatched += o.dispatched;
  }
  const round2 = (x) => Math.round(x * 100) / 100;
  const clean = (o) => ({
    id: o.id, owner: o.owner, name: o.name, tech: o.tech, capacity: o.capacity, mc: o.mc,
    bid: o.bid, auto: !!o.auto, dispatched: round2(o.dispatched),
    revenue: round2(o.revenue), cost: round2(o.cost), profit: round2(o.profit),
  });
  return {
    price,
    demand: round2(demand),
    unserved: round2(unserved),
    pricing,
    offers: offers.map(clean),
    notOffered: notOffered.map((p) => clean({ ...p, bid: null, dispatched: 0, revenue: 0, cost: 0, profit: 0 })),
    perOwner: Object.fromEntries(Object.entries(perOwner).map(([k, v]) =>
      [k, { revenue: round2(v.revenue), cost: round2(v.cost), profit: round2(v.profit), dispatched: round2(v.dispatched) }])),
  };
}

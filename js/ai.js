// Computer-controlled companies. They run in the host's browser: when the shop
// opens they buy plants, when bidding opens they submit bids.
import { TECH, TECH_ORDER } from './market.js';
import { randomId } from './store.js';
import { roundKey, values, plantsOf, finances, owners, cleared, maxPlants } from './ui.js';

export const AI_NAMES = ['Volta Power', 'Ampère Energie', 'Watt & Co', 'Faraday Werke', 'Ohm Utilities', 'Joule Energy',
  'Kirchhoff Strom', 'Siemens Light', 'Hertz Generation', 'Coulomb Power'];

export const AI_STRATEGIES = {
  competitive: 'bids its marginal cost',
  markup: 'bids 20–60% above cost',
  random: 'bids 80–200% of cost',
};

/** New AI participant entry. */
export function makeAi(index, strategy) {
  return { name: `🤖 ${AI_NAMES[index % AI_NAMES.length]}${index >= AI_NAMES.length ? ` ${Math.floor(index / AI_NAMES.length) + 1}` : ''}`, ai: true, strategy };
}

const aiIds = (game) => owners(game).filter((id) => game.participants[id]?.ai);
const avgAvail = (k) => (k.avail[0] + k.avail[1]) / 2;

/**
 * Investment: each AI buys until its share of the demand forecast (plus a 10% margin)
 * is covered, within its cash and the plant limit. It prefers the technology with the
 * best expected operating profit per euro invested at a reference price (the last
 * clearing price, or 70 €/MWh in the first round). That's a simple screening-curve rule.
 */
export function aiInvestments(game) {
  const c = game.config;
  const r = game.meta.round;
  const rd = game.rounds?.[roundKey(r)] || {};
  const done = cleared(game);
  const lastPrice = done.length ? game.rounds[roundKey(done[done.length - 1])].result.price : 70;
  const ref = Math.min(c.priceCap, Math.max(50, lastPrice));
  const share = ((rd.forecast || 0) * 1.1) / Math.max(1, owners(game).length);
  const fin = Object.fromEntries(finances(game).map((f) => [f.id, f]));
  const upd = {};
  let t = Date.now();
  for (const id of aiIds(game)) {
    let cash = fin[id]?.cash ?? c.budget;
    const mine = plantsOf(game, id);
    let count = mine.length;
    let cap = mine.reduce((s, p) => s + p.capacity * avgAvail(c.catalogue[p.tech] || { avail: [1, 1] }), 0);
    const perTech = {};
    mine.forEach((p) => { perTech[p.tech] = (perTech[p.tech] || 0) + 1; });
    while (count < maxPlants(game) && cap < share) {
      let best = null;
      for (const tech of TECH_ORDER) {
        const k = c.catalogue[tech];
        if (!k?.enabled || k.cost > cash) continue;
        const margin = ref - k.mc;
        const yieldPerEur = margin > 0 ? (margin * k.unit * avgAvail(k) * c.hours) / Math.max(1, k.cost) : 0.02;
        const score = yieldPerEur * (0.75 + Math.random() * 0.5);
        if (!best || score > best.score) best = { tech, k, score };
      }
      if (!best) break;
      const pid = `p${randomId(8)}`;
      perTech[best.tech] = (perTech[best.tech] || 0) + 1;
      upd[`plants/${pid}`] = {
        id: pid, owner: id, tech: best.tech, capacity: best.k.unit, mc: best.k.mc, cost: best.k.cost, round: r,
        name: `${TECH[best.tech].short} ${perTech[best.tech]}`, boughtBy: 'AI', boughtAt: t++,
      };
      cash -= best.k.cost;
      count++;
      cap += best.k.unit * avgAvail(best.k);
    }
  }
  return upd;
}

/** Bids according to each AI's strategy. */
export function aiBids(game) {
  const c = game.config;
  const rk = roundKey(game.meta.round);
  const upd = {};
  const clamp = (v) => Math.round(Math.min(c.priceCap, Math.max(c.minBid, v)) * 10) / 10;
  for (const id of aiIds(game)) {
    const strategy = game.participants[id].strategy || 'competitive';
    const bids = {};
    for (const p of values(game.plants).filter((x) => x.owner === id)) {
      let b = p.mc;
      if (strategy === 'markup') b = p.mc * (1.2 + Math.random() * 0.4) + Math.random() * 10;
      if (strategy === 'random') b = p.mc * (0.8 + Math.random() * 1.2) + (Math.random() * 25 - 5);
      bids[p.id] = clamp(b);
    }
    if (!Object.keys(bids).length) continue;
    upd[`rounds/${rk}/bids/${id}`] = bids;
    upd[`rounds/${rk}/submittedBy/${id}`] = { name: 'AI', at: Date.now() };
  }
  return upd;
}

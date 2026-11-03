// "What if" versions of a cleared round, for teaching:
// everyone bids marginal cost, without/with more renewables, higher demand.
import { clearMarket } from './market.js';
import { roundKey, values } from './ui.js';

export const RENEWABLES = ['solar', 'wind'];

export const PRESETS = {
  actual:      { label: 'As played',                      bids: 'played', renew: 1, demand: 1 },
  competitive: { label: 'Everyone bids marginal cost',    bids: 'mc',     renew: 1, demand: 1 },
  norenew:     { label: 'No renewables',                  bids: 'played', renew: 0, demand: 1 },
  boom:        { label: 'Renewable boom (×3)',            bids: 'played', renew: 3, demand: 1 },
  scarcity:    { label: 'Scarcity (+30% demand)',         bids: 'played', renew: 1, demand: 1.3 },
};

/** Plants that existed in round r. */
export const plantsInRound = (game, r) => values(game.plants).filter((p) => (p.round ?? 0) <= r);

/**
 * Re-clear round r with:
 *   bids   : 'played' (the submitted bids) or 'mc' (every plant bids its marginal cost)
 *   renew  : multiplier on wind and solar capacity (0 = none, 3 = three times as much)
 *   demand : multiplier on the actual demand of that round
 */
export function runScenario(game, r, { bids = 'played', renew = 1, demand = 1 } = {}) {
  const rd = game.rounds[roundKey(r)];
  const plants = plantsInRound(game, r).map((p) => (RENEWABLES.includes(p.tech) ? { ...p, capacity: p.capacity * renew } : p));
  let b = rd.bids || {};
  if (bids === 'mc') {
    b = {};
    for (const p of plants) (b[p.owner] ||= {})[p.id] = p.mc;
  }
  return clearMarket({
    plants, bids: b, demand: rd.result.demand * demand, avail: rd.avail, hours: game.config.hours,
    priceCap: game.config.priceCap, pricing: game.config.pricing, missing: game.config.missing,
  });
}

/**
 * What would this company have earned in round r if it had bid the marginal cost
 * for all its plants, with everybody else's bids unchanged?
 */
export function ownMcCounterfactual(game, r, owner) {
  const rd = game.rounds[roundKey(r)];
  const plants = plantsInRound(game, r);
  const b = { ...(rd.bids || {}) };
  b[owner] = Object.fromEntries(plants.filter((p) => p.owner === owner).map((p) => [p.id, p.mc]));
  const res = clearMarket({
    plants, bids: b, demand: rd.result.demand, avail: rd.avail, hours: game.config.hours,
    priceCap: game.config.priceCap, pricing: game.config.pricing, missing: game.config.missing,
  });
  return { result: res, profit: res.perOwner?.[owner]?.profit ?? 0 };
}

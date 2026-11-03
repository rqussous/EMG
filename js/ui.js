// Shared UI helpers.
import { TECH, TECH_ORDER } from './market.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const num = (x, d = 0) => (x == null || Number.isNaN(x) ? '–' : (Number(x) + 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const price = (x) => (x == null ? '–' : `${num(x, Number.isInteger(x) ? 0 : 1)} €/MWh`);
/** Money in €, abbreviated: €850k, €12.4M. */
export const eur = (x) => {
  if (x == null || Number.isNaN(x)) return '–';
  const a = Math.abs(x), s = x < 0 ? '−' : '';
  if (a >= 1e6) return `${s}€${num(a / 1e6, a >= 1e8 ? 0 : 1)}M`;
  if (a >= 1e3) return `${s}€${num(a / 1e3)}k`;
  return `${s}€${num(a)}`;
};

/**
 * Games created before the investment version have no shop catalogue and can't be played with this code.
 * Returns an HTML message for such games, or '' if the game is fine.
 */
export function outdatedGameMessage(game) {
  if (game?.config?.catalogue && game.config.budget != null) return '';
  return `<div class="card"><h2>This game was created with an older version</h2>
    <p>Game <b>${esc(game?.code ?? '')}</b> has no power plant shop, so it can't be played with the current version.
    Please ask your instructor for the code of a new game.</p>
    <p class="small muted">Instructor: create a new game on <a href="host.html" onclick="localStorage.removeItem('mog_host_last')">host.html</a>.
    If you just updated the site, reload with Ctrl+F5 first so your browser doesn't use old cached files.</p></div>`;
}

export const roundKey = (r) => `r${r}`;
export const values = (o) => (o ? Object.values(o) : []);

export function plantsOf(game, owner) {
  return values(game.plants).filter((p) => p.owner === owner).sort((a, b) => a.mc - b.mc || (a.round ?? 0) - (b.round ?? 0) || a.name.localeCompare(b.name));
}
export function totalCapacity(game) {
  return values(game.plants).reduce((s, p) => s + p.capacity, 0);
}
export function capacityByTech(plants) {
  const out = {};
  for (const p of plants) out[p.tech] = (out[p.tech] || 0) + p.capacity;
  return out;
}
export function ownerName(game, id) {
  return game.participants?.[id]?.name ?? id;
}
export function cleared(game) {
  const out = [];
  for (let r = 1; r <= (game.meta?.round || 0); r++) if (game.rounds?.[roundKey(r)]?.result) out.push(r);
  return out;
}

/** Players (individual mode) or teams with at least one member or plant. */
export function owners(game) {
  const ids = Object.keys(game.participants || {});
  if (game.config.mode !== 'team') return ids;
  const active = new Set([...values(game.members).map((m) => m.team), ...values(game.plants).map((p) => p.owner)]);
  return ids.filter((id) => active.has(id));
}

/** Demand forecast (MW) for round r given the current number of players/teams. */
export function defaultDemand(game, r) {
  const per = game.config.demandPerOwner;
  return Math.round((per[r - 1] ?? per[per.length - 1]) * Math.max(1, owners(game).length));
}

/**
 * Money per player/team, sorted by net worth.
 * cash      = starting budget − investments + operating profits
 * net worth = cash + plants valued at `salvage` % of their purchase price
 */
export function finances(game) {
  const c = game.config;
  const rows = {};
  for (const id of owners(game)) {
    rows[id] = { id, name: ownerName(game, id), invested: 0, investedNow: 0, opProfit: 0, rounds: {}, fleetMW: 0, nPlants: 0 };
  }
  for (const p of values(game.plants)) {
    const r = rows[p.owner];
    if (!r) continue;
    r.invested += p.cost; r.fleetMW += p.capacity; r.nPlants++;
    if (p.round === game.meta.round) r.investedNow += p.cost;
  }
  for (const rnd of cleared(game)) {
    for (const [id, v] of Object.entries(game.rounds[roundKey(rnd)].result.perOwner || {})) {
      if (!rows[id]) continue;
      rows[id].opProfit += v.profit;
      rows[id].rounds[rnd] = v.profit;
    }
  }
  const list = Object.values(rows);
  for (const r of list) {
    r.cash = c.budget - r.invested + r.opProfit;
    r.netWorth = r.cash + (r.invested * c.salvage) / 100;
  }
  list.sort((a, b) => b.netWorth - a.netWorth);
  list.forEach((row, i) => { row.rank = i > 0 && row.netWorth === list[i - 1].netWorth ? list[i - 1].rank : i + 1; });
  return list;
}

export function techBadge(tech) {
  const t = TECH[tech];
  return `<span class="tech"><i style="background:${t.color}"></i>${esc(t.label)}</span>`;
}

/** Compact fleet summary, e.g. "2× CCGT · 1× Coal". */
export function fleetChips(plants) {
  const n = {};
  for (const p of plants) n[p.tech] = (n[p.tech] || 0) + 1;
  const chips = TECH_ORDER.filter((t) => n[t]).map((t) => `<span class="chip"><i style="background:${TECH[t].color}"></i>${n[t]}× ${esc(TECH[t].short)}</span>`);
  return chips.join('') || '<span class="muted">no plants</span>';
}

export function leaderboardTable(game, highlight) {
  const list = finances(game);
  const team = game.config.mode === 'team';
  return `<table class="tbl"><thead><tr><th>#</th><th>${team ? 'Team' : 'Player'}</th><th class="n">Capacity</th>
    <th class="n">Invested</th><th class="n">Operating profit</th><th class="n">Cash</th><th class="n">Net worth</th></tr></thead><tbody>
    ${list.map((r) => `<tr class="${r.id === highlight ? 'me' : ''}"><td>${r.rank}</td><td>${esc(r.name)}</td>
      <td class="n">${num(r.fleetMW)} MW</td><td class="n">${eur(r.invested)}</td>
      <td class="n ${r.opProfit < 0 ? 'neg' : ''}">${eur(r.opProfit)}</td><td class="n ${r.cash < 0 ? 'neg' : ''}">${eur(r.cash)}</td>
      <td class="n strong">${eur(r.netWorth)}</td></tr>`).join('')}
    </tbody></table>
    <p class="small muted">Net worth = cash + plants valued at ${game.config.salvage}% of their purchase price.</p>`;
}

/** Hover tooltips for any element with a data-tip attribute inside root. */
export function attachTooltips(root) {
  let tip = $('#tooltip');
  if (!tip) { tip = document.createElement('div'); tip.id = 'tooltip'; document.body.appendChild(tip); }
  const show = (e) => {
    const t = e.target.closest('[data-tip]');
    if (!t || !root.contains(t)) { tip.style.display = 'none'; return; }
    tip.innerHTML = t.dataset.tip;
    tip.style.display = 'block';
    const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
    let x = e.clientX + pad, y = e.clientY + pad;
    if (x + w > innerWidth - 8) x = e.clientX - w - pad;
    if (y + h > innerHeight - 8) y = e.clientY - h - pad;
    tip.style.left = `${x}px`; tip.style.top = `${y}px`;
  };
  root.addEventListener('mousemove', show);
  root.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
}

/** Countdown text for the current phase deadline ('' if none). */
export function countdown(game) {
  if (!game?.meta?.deadline || !['invest', 'bidding'].includes(game.meta.phase)) return null;
  const left = Math.max(0, Math.ceil((game.meta.deadline - Date.now()) / 1000));
  return { left, text: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` };
}

export function download(filename, text, type = 'text/csv') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** One row per plant per round: ready for pandas.read_csv(). */
export function resultsCsv(game) {
  const head = ['game', 'round', 'participant', 'plant_id', 'plant_name', 'technology', 'round_built', 'investment_cost_eur',
    'capacity_mw', 'available_mw', 'marginal_cost_eur_mwh', 'bid_eur_mwh', 'auto_bid', 'dispatched_mw', 'clearing_price_eur_mwh',
    'demand_mw', 'demand_forecast_mw', 'hours', 'revenue_eur', 'cost_eur', 'profit_eur'];
  const lines = [head.join(',')];
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  for (const r of cleared(game)) {
    const rd = game.rounds[roundKey(r)];
    const res = rd.result;
    for (const o of [...(res.offers || []), ...(res.notOffered || [])]) {
      const p = game.plants?.[o.id] || {};
      lines.push([game.code, r, q(ownerName(game, o.owner)), o.id, q(o.name), o.tech, p.round ?? '', p.cost ?? '',
        o.capacity, o.available ?? o.capacity, o.mc, o.bid ?? '', o.auto ? 1 : 0, o.dispatched, res.price, res.demand,
        rd.forecast, res.hours ?? 1, o.revenue, o.cost, o.profit].join(','));
    }
  }
  return lines.join('\n');
}

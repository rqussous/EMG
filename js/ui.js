// Shared UI helpers.
import { TECH } from './market.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const num = (x, d = 0) => (x == null || Number.isNaN(x) ? '–' : (Number(x) + 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const eur = (x) => (x == null ? '–' : `${x < 0 ? '−' : ''}€${num(Math.abs(x))}`);
export const price = (x) => (x == null ? '–' : `${num(x, Number.isInteger(x) ? 0 : 1)} €/MWh`);

export const roundKey = (r) => `r${r}`;
export const values = (o) => (o ? Object.values(o) : []);

export function plantsOf(game, owner) {
  return values(game.plants).filter((p) => p.owner === owner).sort((a, b) => a.mc - b.mc);
}
export function totalCapacity(game) {
  return values(game.plants).reduce((s, p) => s + p.capacity, 0);
}
export function ownerName(game, id) {
  return game.participants?.[id]?.name ?? id;
}

export function techBadge(tech) {
  const t = TECH[tech];
  return `<span class="tech"><i style="background:${t.color}"></i>${esc(t.label)}</span>`;
}

/** Cumulative standings after all cleared rounds. */
export function standings(game) {
  const rows = {};
  const owners = game.plants ? new Set(values(game.plants).map((p) => p.owner)) : null;
  for (const id of Object.keys(game.participants || {})) {
    if (!owners || owners.has(id)) rows[id] = { id, name: ownerName(game, id), profit: 0, rounds: [] };
  }
  const n = game.meta?.round || 0;
  for (let r = 1; r <= n; r++) {
    const res = game.rounds?.[roundKey(r)]?.result;
    if (!res) continue;
    for (const [id, v] of Object.entries(res.perOwner || {})) {
      if (!rows[id]) rows[id] = { id, name: ownerName(game, id), profit: 0, rounds: [] };
      rows[id].profit += v.profit;
      rows[id].rounds[r] = v.profit;
    }
  }
  const list = Object.values(rows).sort((a, b) => b.profit - a.profit);
  list.forEach((row, i) => { row.rank = i > 0 && row.profit === list[i - 1].profit ? list[i - 1].rank : i + 1; });
  return list;
}

export function leaderboardTable(game, highlight) {
  const list = standings(game);
  const n = game.meta?.round || 0;
  const cleared = [];
  for (let r = 1; r <= n; r++) if (game.rounds?.[roundKey(r)]?.result) cleared.push(r);
  return `<table class="tbl"><thead><tr><th>#</th><th>${game.config.mode === 'team' ? 'Team' : 'Player'}</th>
    ${cleared.map((r) => `<th class="n">R${r}</th>`).join('')}<th class="n">Total profit</th></tr></thead><tbody>
    ${list.map((row) => `<tr class="${row.id === highlight ? 'me' : ''}"><td>${row.rank}</td><td>${esc(row.name)}</td>
      ${cleared.map((r) => `<td class="n ${(row.rounds[r] ?? 0) < 0 ? 'neg' : ''}">${eur(row.rounds[r] ?? 0)}</td>`).join('')}
      <td class="n strong ${row.profit < 0 ? 'neg' : ''}">${eur(row.profit)}</td></tr>`).join('')}
    </tbody></table>`;
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

export function download(filename, text, type = 'text/csv') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** One row per plant per round: ready for pandas.read_csv(). */
export function resultsCsv(game) {
  const head = ['game', 'round', 'participant', 'plant_id', 'plant_name', 'technology', 'capacity_mw', 'marginal_cost_eur_mwh',
    'bid_eur_mwh', 'auto_bid', 'dispatched_mw', 'clearing_price_eur_mwh', 'demand_mw', 'demand_forecast_mw', 'revenue_eur', 'cost_eur', 'profit_eur'];
  const lines = [head.join(',')];
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  for (let r = 1; r <= (game.meta?.round || 0); r++) {
    const rd = game.rounds?.[roundKey(r)];
    const res = rd?.result;
    if (!res) continue;
    for (const o of [...(res.offers || []), ...(res.notOffered || [])]) {
      lines.push([game.code, r, q(ownerName(game, o.owner)), o.id, q(o.name), o.tech, o.capacity, o.mc, o.bid ?? '', o.auto ? 1 : 0,
        o.dispatched, res.price, res.demand, rd.forecast, o.revenue, o.cost, o.profit].join(','));
    }
  }
  return lines.join('\n');
}

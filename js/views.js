// HTML building blocks shared by the host, projector and player pages.
import { TECH, TECH_ORDER } from './market.js';
import { meritOrderChart, markupProfitChart, markupByRoundChart, capacityMixChart } from './charts.js';
import {
  esc, num, eur, price, roundKey, values, ownerName, techBadge, cleared, defaultDemand, capacityByTech, finances,
} from './ui.js';

export const PHASE_LABEL = {
  lobby: 'Lobby: players joining',
  invest: 'Investment',
  bidding: 'Bidding',
  results: 'Results',
  finished: 'Game over',
};

export const joinUrl = (code) => new URL(`play.html?game=${code}`, location.href).href;

export function qrSvg(url) {
  if (!window.qrcode) return '';
  const q = window.qrcode(0, 'M');
  q.addData(url);
  q.make();
  return q.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
}

export function joinCard(game, big = true) {
  const url = joinUrl(game.code);
  const n = Object.keys(game.config.mode === 'team' ? game.members || {} : game.participants || {}).length;
  if (!big) return `<p class="muted small">Join: <a href="${esc(url)}" target="_blank">${esc(url)}</a> · code <b>${esc(game.code)}</b> · ${n} joined</p>`;
  return `<div class="card row" style="justify-content:space-between">
    <div><h3>Join on your phone or laptop</h3><div class="code">${esc(game.code)}</div>
      <p><a href="${esc(url)}" target="_blank">${esc(url)}</a></p><p class="muted">${n} joined</p></div>
    <div class="qr">${qrSvg(url)}</div></div>`;
}

export function lobbyList(game) {
  if (game.config.mode === 'team') {
    const byTeam = {};
    values(game.members).forEach((m) => (byTeam[m.team] ||= []).push(m.name));
    return `<div class="card"><h2>Teams</h2><table class="tbl"><tbody>${Object.entries(game.participants || {}).map(([id, t]) =>
      `<tr><td class="strong">${esc(t.name)}</td><td><div class="members">${(byTeam[id] || []).map((n) => `<span>${esc(n)}</span>`).join('') || '<span class="muted">no members yet</span>'}</div></td></tr>`).join('')}
      </tbody></table></div>`;
  }
  const names = values(game.participants).map((p) => p.name);
  return `<div class="card"><h2>Players (${names.length})</h2><div class="members">${names.map((n) => `<span>${esc(n)}</span>`).join('') || '<span class="muted">Waiting for players…</span>'}</div></div>`;
}

/** The shop catalogue as a read-only table. */
export function catalogueTable(game) {
  const c = game.config;
  return `<div class="scroll"><table class="tbl"><thead><tr><th>Technology</th><th class="n">Unit size</th><th class="n">Marginal cost</th>
    <th class="n">Price per unit</th><th class="n">Price per MW</th><th class="n">Availability</th></tr></thead><tbody>
    ${TECH_ORDER.filter((t) => c.catalogue[t]?.enabled).map((t) => {
      const k = c.catalogue[t];
      const [lo, hi] = k.avail;
      return `<tr><td>${techBadge(t)}</td><td class="n">${num(k.unit)} MW</td><td class="n">${price(k.mc)}</td><td class="n">${eur(k.cost)}</td>
        <td class="n">${eur(k.cost / k.unit)}</td><td class="n">${lo === hi ? `${Math.round(lo * 100)}%` : `${Math.round(lo * 100)}–${Math.round(hi * 100)}% (weather)`}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}

/** Demand forecast for all rounds, based on the current number of players/teams. */
export function demandOutlook(game) {
  const c = game.config;
  const cells = [];
  for (let r = 1; r <= c.rounds; r++) {
    const fixed = game.rounds?.[roundKey(r)]?.forecast;
    const cur = r === game.meta.round;
    cells.push(`<td class="n ${cur ? 'strong' : ''}">${num(fixed ?? defaultDemand(game, r))} MW${fixed || r < game.meta.round ? '' : '*'}</td>`);
  }
  return `<div class="scroll"><table class="tbl"><thead><tr>${Array.from({ length: c.rounds }, (_, i) => `<th class="n">Round ${i + 1}</th>`).join('')}</tr></thead>
    <tbody><tr>${cells.join('')}</tr></tbody></table></div><p class="small muted">* outlook; actual demand varies ±${c.uncertainty}% around the forecast.</p>`;
}

/** Market-wide installed capacity by technology (public information). */
export function marketMix(game) {
  const byTech = capacityByTech(values(game.plants));
  const total = Object.values(byTech).reduce((s, v) => s + v, 0);
  return `<div class="kpis">${TECH_ORDER.filter((t) => byTech[t]).map((t) =>
    `<div class="kpi small-kpi"><div class="v">${num(byTech[t])} MW</div><div class="k">${techBadge(t)}</div></div>`).join('')}
    <div class="kpi small-kpi"><div class="v">${num(total)} MW</div><div class="k">total installed</div></div></div>`;
}

export function availabilityKpis(rd, game) {
  if (!rd?.avail) return '';
  return TECH_ORDER.filter((t) => game.config.catalogue[t]?.enabled && rd.avail[t] != null && rd.avail[t] < 1).map((t) =>
    `<div class="kpi"><div class="v">${Math.round(rd.avail[t] * 100)}%</div><div class="k">${esc(TECH[t].label)} availability this round</div></div>`).join('');
}

/** Merit order, KPIs and (optionally) the full offer table for a cleared round. */
export function resultsCard(game, r, { showNames = true, table = false, highlight = null, width, select = '' } = {}) {
  const rd = game.rounds[roundKey(r)];
  const res = rd.result;
  const offers = res.offers || [];
  const marginal = [...offers].reverse().find((o) => o.dispatched > 0);
  const names = Object.fromEntries(Object.keys(game.participants || {}).map((id) => [id, ownerName(game, id)]));
  const rows = [...offers, ...(res.notOffered || [])];
  return `<div class="card">
    <div class="row" style="justify-content:space-between"><h2>Round ${r}: market result</h2>${select}</div>
    <div class="kpis">
      <div class="kpi"><div class="v">${price(res.price)}</div><div class="k">clearing price</div></div>
      <div class="kpi"><div class="v">${num(res.demand)} MW</div><div class="k">actual demand (forecast ${num(rd.forecast)} MW)</div></div>
      <div class="kpi"><div class="v">${marginal ? esc(TECH[marginal.tech].label) : '–'}</div><div class="k">price-setting technology</div></div>
      ${availabilityKpis(rd, game)}
      ${res.unserved > 0 ? `<div class="kpi"><div class="v neg">${num(res.unserved)} MW</div><div class="k">unserved demand → price cap!</div></div>` : ''}
    </div>
    <div style="margin-top:1rem">${meritOrderChart(res, { names, forecast: rd.forecast, showNames, highlight, width })}</div>
    ${table ? `<details style="margin-top:.75rem"><summary>Table of all offers</summary><div class="scroll"><table class="tbl"><thead><tr>
      <th>Owner</th><th>Plant</th><th>Technology</th><th class="n">Available</th><th class="n">Marginal cost</th><th class="n">Bid</th><th class="n">Mark-up</th><th class="n">Dispatched</th><th class="n">Profit</th></tr></thead><tbody>
      ${rows.map((o) => `<tr><td>${esc(names[o.owner] ?? o.owner)}</td><td>${esc(o.name)}</td><td>${techBadge(o.tech)}</td><td class="n">${num(o.available ?? o.capacity)} MW</td>
        <td class="n">${price(o.mc)}</td><td class="n">${o.bid == null ? 'no bid' : price(o.bid) + (o.auto ? ' (auto)' : '')}</td>
        <td class="n">${o.bid == null ? '' : num(o.bid - o.mc)}</td><td class="n">${num(o.dispatched)} MW</td><td class="n ${o.profit < 0 ? 'neg' : ''}">${eur(o.profit)}</td></tr>`).join('')}
    </tbody></table></div></details>` : ''}</div>`;
}

export function capacityMixCard(game) {
  const rows = finances(game).map((f) => ({ name: f.name, byTech: capacityByTech(values(game.plants).filter((p) => p.owner === f.id)) }));
  return `<div class="card"><h2>Who owns what</h2>${capacityMixChart(rows)}</div>`;
}

export function debriefView(game) {
  const per = {};
  const rounds = [];
  for (const r of cleared(game)) {
    const res = game.rounds[roundKey(r)].result;
    const mk = [];
    for (const o of res.offers || []) {
      if (o.auto) continue;
      const w = o.available ?? o.capacity;
      const p = (per[o.owner] ||= { w: 0, s: 0 });
      p.w += w; p.s += w * (o.bid - o.mc);
      mk.push(o.bid - o.mc);
    }
    mk.sort((a, b) => a - b);
    if (mk.length) rounds.push({ round: r, price: res.price, median: mk.length % 2 ? mk[(mk.length - 1) / 2] : (mk[mk.length / 2 - 1] + mk[mk.length / 2]) / 2 });
  }
  const fin = Object.fromEntries(finances(game).map((f) => [f.id, f]));
  const points = Object.entries(per).filter(([id]) => fin[id]).map(([id, p]) => ({ id, name: fin[id].name, markup: p.s / p.w, profit: fin[id].opProfit }));
  return `<div class="grid2">
    <div class="card"><h2>Did bidding above cost pay off?</h2><p class="muted small">One dot per ${game.config.mode === 'team' ? 'team' : 'player'}: capacity-weighted mark-up over all rounds vs. total operating profit.</p>${markupProfitChart(points)}</div>
    <div class="card"><h2>Mark-up over the rounds</h2><p class="muted small">Median of (bid − marginal cost) across all submitted offers.</p>${markupByRoundChart(rounds)}</div>
  </div>`;
}

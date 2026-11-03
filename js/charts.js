// Hand-rolled SVG charts (no dependencies).
import { TECH, TECH_ORDER } from './market.js';
import { esc, num, eur, price } from './ui.js';

function niceStep(range, ticks = 5) {
  const raw = range / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const f = raw / mag;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
}
function ticks(lo, hi, n = 5) {
  const s = niceStep(hi - lo, n);
  const out = [];
  for (let v = Math.ceil(lo / s) * s; v <= hi + 1e-9; v += s) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

/**
 * Merit-order (supply stack) chart for one cleared round.
 * opts: { names: {ownerId: name}, highlight: ownerId, forecast: MW, showNames: bool }
 */
export function meritOrderChart(result, opts = {}) {
  const W = opts.width || 920, H = opts.width ? Math.round(opts.width * 0.62) : 430, m = { l: 64, r: 24, t: 28, b: 48 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const offers = result.offers || [];
  const totalCap = offers.reduce((s, o) => s + o.capacity, 0);
  const xMax = Math.max(totalCap, result.demand, opts.forecast || 0) * 1.03 || 1;

  // Keep the interesting part of the curve readable: very high bids are clipped
  // at the top of the plot and labelled with their value.
  const maxMc = Math.max(0, ...offers.map((o) => o.mc));
  const maxBid = Math.max(0, ...offers.map((o) => o.bid));
  let yMax = Math.max(result.price * 1.35, maxMc * 1.15, 20);
  if (maxBid < yMax) yMax = Math.max(maxBid, maxMc, result.price, 18) * 1.12;
  const yMin = Math.min(0, ...offers.map((o) => o.bid));
  const yTicks = ticks(yMin, yMax);
  const X = (v) => m.l + (v / xMax) * iw;
  const Y = (v) => m.t + ih - ((Math.min(v, yMax) - yMin) / (yMax - yMin)) * ih;

  const parts = [];
  // grid + axes
  for (const t of yTicks) {
    parts.push(`<line class="grid" x1="${m.l}" x2="${m.l + iw}" y1="${Y(t)}" y2="${Y(t)}"/>`);
    parts.push(`<text class="ax" x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end">${num(t)}</text>`);
  }
  for (const t of ticks(0, xMax, 6)) {
    parts.push(`<text class="ax" x="${X(t)}" y="${m.t + ih + 18}" text-anchor="middle">${num(t)}</text>`);
  }
  parts.push(`<line class="axis" x1="${m.l}" x2="${m.l + iw}" y1="${Y(0)}" y2="${Y(0)}"/>`);
  parts.push(`<text class="ax lbl" x="${m.l + iw / 2}" y="${H - 8}" text-anchor="middle">Cumulative capacity (MW)</text>`);
  parts.push(`<text class="ax lbl" transform="translate(16 ${m.t + ih / 2}) rotate(-90)" text-anchor="middle">Bid price (€/MWh)</text>`);

  // bars
  let cum = 0;
  for (const o of offers) {
    const x0 = X(cum), x1 = X(cum + o.capacity), xd = X(cum + o.dispatched);
    cum += o.capacity;
    const y0 = Y(0), yb = Y(o.bid);
    const top = Math.min(y0, yb), h = Math.max(1.5, Math.abs(y0 - yb));
    const color = TECH[o.tech].color;
    const owner = opts.names?.[o.owner] ?? o.owner;
    const mine = opts.highlight && o.owner === opts.highlight;
    const tip = `<b>${esc(o.name)}</b> · ${esc(TECH[o.tech].label)}<br>${opts.showNames !== false || mine ? `Owner: ${esc(owner)}<br>` : ''}`
      + `Capacity ${num(o.capacity)} MW · dispatched ${num(o.dispatched)} MW<br>`
      + `Bid ${price(o.bid)}${o.auto ? ' (auto)' : ''} · marginal cost ${price(o.mc)}<br>Profit ${eur(o.profit)}`;
    parts.push(`<g data-tip="${esc(tip)}">`);
    parts.push(`<rect class="bar" x="${x0}" y="${top}" width="${Math.max(0, x1 - x0)}" height="${h}" fill="${color}" fill-opacity="0.28"/>`);
    if (o.dispatched > 0) parts.push(`<rect class="bar" x="${x0}" y="${top}" width="${Math.max(0, xd - x0)}" height="${h}" fill="${color}"/>`);
    if (mine) parts.push(`<rect class="mine" x="${x0 + 1}" y="${top + 1}" width="${Math.max(0, x1 - x0 - 2)}" height="${Math.max(0, h - 2)}"/>`
      + `<text class="mine-lbl" x="${(x0 + x1) / 2}" y="${top - 6}" text-anchor="middle">You</text>`);
    if (o.mc <= yMax) parts.push(`<line class="mc" x1="${x0 + 2}" x2="${Math.max(x0 + 2, x1 - 2)}" y1="${Y(o.mc)}" y2="${Y(o.mc)}"/>`);
    if (o.bid > yMax) parts.push(`<text class="clip" x="${(x0 + x1) / 2}" y="${m.t - 6}" text-anchor="middle">▲${num(o.bid)}</text>`);
    // invisible, larger hit target
    parts.push(`<rect x="${x0}" y="${m.t}" width="${Math.max(4, x1 - x0)}" height="${ih}" fill="transparent"/></g>`);
  }

  // demand + price
  if (opts.forecast && Math.abs(opts.forecast - result.demand) > 0.5) {
    parts.push(`<line class="forecast" x1="${X(opts.forecast)}" x2="${X(opts.forecast)}" y1="${m.t}" y2="${m.t + ih}"/>`);
  }
  const dx = X(result.demand);
  parts.push(`<line class="demand" x1="${dx}" x2="${dx}" y1="${m.t}" y2="${m.t + ih}"/>`);
  const anchorRight = dx > m.l + iw * 0.8;
  parts.push(`<text class="note" x="${dx + (anchorRight ? -6 : 6)}" y="${m.t + 12}" text-anchor="${anchorRight ? 'end' : 'start'}">Demand ${num(result.demand)} MW</text>`);
  const py = Y(result.price);
  parts.push(`<line class="price" x1="${m.l}" x2="${m.l + iw}" y1="${py}" y2="${py}"/>`);
  parts.push(`<text class="note strong" x="${m.l + 6}" y="${py - 6}">Clearing price ${price(result.price)}</text>`);

  const techs = TECH_ORDER.filter((t) => offers.some((o) => o.tech === t));
  const legend = `<div class="legend">${techs.map((t) => `<span><i style="background:${TECH[t].color}"></i>${esc(TECH[t].label)}</span>`).join('')}
    <span><b class="lg-mc"></b>Marginal cost</span><span><b class="lg-demand"></b>Demand</span>
    ${opts.forecast && Math.abs(opts.forecast - result.demand) > 0.5 ? '<span><b class="lg-forecast"></b>Forecast</span>' : ''}
    <span><b class="lg-price"></b>Clearing price</span><span class="muted">Faded = not dispatched</span></div>`;
  return `${legend}<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Merit order curve, clearing price ${esc(price(result.price))}">${parts.join('')}</svg>`;
}

/** Scatter: average mark-up over marginal cost (x) vs total profit (y), one dot per participant. */
export function markupProfitChart(points) {
  const W = 620, H = 380, m = { l: 80, r: 24, t: 20, b: 48 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  if (!points.length) return '<p class="muted">No data yet.</p>';
  const xs = points.map((p) => p.markup), ys = points.map((p) => p.profit);
  const pad = (lo, hi) => { const d = (hi - lo) || Math.abs(hi) || 10; return [lo - d * 0.1, hi + d * 0.1]; };
  const [x0, x1] = pad(Math.min(0, ...xs), Math.max(0, ...xs));
  const [y0, y1] = pad(Math.min(0, ...ys), Math.max(0, ...ys));
  const X = (v) => m.l + ((v - x0) / (x1 - x0)) * iw;
  const Y = (v) => m.t + ih - ((v - y0) / (y1 - y0)) * ih;
  const parts = [];
  for (const t of ticks(y0, y1)) parts.push(`<line class="grid" x1="${m.l}" x2="${m.l + iw}" y1="${Y(t)}" y2="${Y(t)}"/><text class="ax" x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end">${eur(t)}</text>`);
  for (const t of ticks(x0, x1, 6)) parts.push(`<text class="ax" x="${X(t)}" y="${m.t + ih + 18}" text-anchor="middle">${num(t)}</text>`);
  parts.push(`<line class="axis" x1="${m.l}" x2="${m.l + iw}" y1="${Y(0)}" y2="${Y(0)}"/><line class="axis" x1="${X(0)}" x2="${X(0)}" y1="${m.t}" y2="${m.t + ih}"/>`);
  parts.push(`<text class="ax lbl" x="${m.l + iw / 2}" y="${H - 8}" text-anchor="middle">Average mark-up: bid − marginal cost (€/MWh)</text>`);
  const top = [...points].sort((a, b) => b.profit - a.profit).slice(0, 3).map((p) => p.id);
  for (const p of points) {
    const tip = `<b>${esc(p.name)}</b><br>Average mark-up ${price(p.markup)}<br>Total profit ${eur(p.profit)}`;
    parts.push(`<g data-tip="${esc(tip)}"><circle cx="${X(p.markup)}" cy="${Y(p.profit)}" r="12" fill="transparent"/><circle class="dot" cx="${X(p.markup)}" cy="${Y(p.profit)}" r="5"/></g>`);
    if (top.includes(p.id)) parts.push(`<text class="note" x="${X(p.markup) + 9}" y="${Y(p.profit) + 4}">${esc(p.name)}</text>`);
  }
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Mark-up versus profit">${parts.join('')}</svg>`;
}

/** Line: median mark-up per round. Shows whether the class converges towards bidding marginal cost. */
export function markupByRoundChart(rows) {
  const W = 620, H = 380, m = { l: 64, r: 24, t: 20, b: 48 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  if (!rows.length) return '<p class="muted">No data yet.</p>';
  const ys = rows.map((r) => r.median);
  const lo = Math.min(0, ...ys), hi = Math.max(10, ...ys) * 1.15;
  const yt = ticks(lo, hi);
  const y0 = Math.min(lo, yt[0]), y1 = Math.max(hi, yt[yt.length - 1]);
  const X = (i) => m.l + (rows.length === 1 ? iw / 2 : (i / (rows.length - 1)) * iw);
  const Y = (v) => m.t + ih - ((v - y0) / (y1 - y0)) * ih;
  const parts = [];
  for (const t of yt) parts.push(`<line class="grid" x1="${m.l}" x2="${m.l + iw}" y1="${Y(t)}" y2="${Y(t)}"/><text class="ax" x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end">${num(t)}</text>`);
  parts.push(`<line class="axis" x1="${m.l}" x2="${m.l + iw}" y1="${Y(0)}" y2="${Y(0)}"/>`);
  parts.push(`<path class="line" d="${rows.map((r, i) => `${i ? 'L' : 'M'}${X(i)},${Y(r.median)}`).join('')}"/>`);
  rows.forEach((r, i) => {
    const tip = `<b>Round ${r.round}</b><br>Median mark-up ${price(r.median)}<br>Clearing price ${price(r.price)}`;
    parts.push(`<g data-tip="${esc(tip)}"><circle cx="${X(i)}" cy="${Y(r.median)}" r="14" fill="transparent"/><circle class="dot" cx="${X(i)}" cy="${Y(r.median)}" r="5"/></g>`);
    parts.push(`<text class="ax" x="${X(i)}" y="${m.t + ih + 18}" text-anchor="middle">R${r.round}</text>`);
  });
  const last = rows[rows.length - 1];
  parts.push(`<text class="note" x="${X(rows.length - 1)}" y="${Y(last.median) - 10}" text-anchor="end">${price(last.median)}</text>`);
  parts.push(`<text class="ax lbl" x="${m.l + iw / 2}" y="${H - 8}" text-anchor="middle">Round</text>`);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Median mark-up per round">${parts.join('')}</svg>`;
}

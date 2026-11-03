// Company app (one laptop per company): one fixed screen. Status bar (money, phase,
// timer) on top, the current task in the middle, tabs for more information at the bottom.
import { getStore, mode, randomId } from './store.js';
import { TECH, TECH_ORDER, mcBreakdown, gameLcoe } from './market.js';
import { meritOrderChart } from './charts.js';
import {
  $, esc, num, eur, price, roundKey, values, plantsOf, ownerName, attachTooltips, finances, cleared, countdown,
  outdatedGameMessage, totalCapacity, maxPlants,
} from './ui.js';
import { catalogueTable, demandOutlook, marketMix, PHASE_LABEL } from './views.js';
import { ownMcCounterfactual } from './scenarios.js';

const store = await getStore();
const app = $('#app');
attachTooltips(app);

const code = new URLSearchParams(location.search).get('game')?.trim().toUpperCase();
if (!code) location.replace('index.html');
const meKey = `mog_me_${code}`;
// sessionStorage: one identity per browser tab (survives reloads; lets you test with several tabs).
let me = JSON.parse(sessionStorage.getItem(meKey) || 'null');
let game = null;
let viewKey = '';
let tab = 'play';
let lastPhaseKey = '';
const gamePath = `games/${code}`;

const TABS = [
  ['play', '🎮', 'Play'],
  ['market', '📊', 'Market'],
  ['history', '🕘', 'History'],
  ['ranking', '🏆', 'Ranking'],
  ['rules', '📖', 'Rules'],
];

$('#hdr-game').textContent = code;
store.subscribe(gamePath, (g) => {
  game = g;
  if (!g) { showMessage(`<div class="card"><h2>Game “${esc(code)}” not found</h2><p>Check the code with your instructor.</p><p><a href="index.html">Back</a></p></div>`); return; }
  if (outdatedGameMessage(g)) { showMessage(outdatedGameMessage(g)); return; }
  if (!(me && g.participants?.[me.id])) { if (viewKey !== 'join') renderJoin(); return; }
  render();
});
setInterval(tick, 500);

// Buttons inside the view (event delegation, so re-rendering doesn't lose handlers).
app.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-buy],[data-sell],[data-tab],[data-calc]');
  if (!b || b.disabled) return;
  if (b.dataset.tab) { e.preventDefault(); setTab(b.dataset.tab); return; }
  if (b.dataset.calc) { e.preventDefault(); openCalc(b.dataset.calc); return; }
  b.disabled = true;
  try {
    if (b.dataset.buy) await buy(b.dataset.buy);
    else await sell(b.dataset.sell);
  } finally { b.disabled = false; }
});
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (b) setTab(b.dataset.tab);
});

function setTab(t) {
  tab = t;
  viewKey = '';
  app.scrollTop = 0;
  render();
}

function showMessage(html) {
  $('#status').innerHTML = '';
  $('#tabs').innerHTML = '';
  app.innerHTML = `<div class="inner">${html}</div>`;
  viewKey = '';
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.style.display = 'none'; }, 2500);
}

// ---------------------------------------------------------------------------
function renderJoin() {
  viewKey = 'join';
  $('#status').innerHTML = '';
  $('#tabs').innerHTML = '';
  app.innerHTML = `<div class="inner" style="max-width:520px">
    ${mode === 'local' ? '<div class="banner">Local demo mode: this only works in tabs of the same browser as the host.</div>' : ''}
    <form class="card" id="join">
      <h1>Found your company</h1>
      <p class="muted">Game ${esc(code)}. One laptop per company: you'll buy power plants and sell their electricity together.</p>
      <label for="name">Company name</label>
      <input id="name" required maxlength="28" autocomplete="off" placeholder="e.g. Black Forest Power">
      <label for="members">Who's in the company? <span class="hint">(optional)</span></label>
      <input id="members" maxlength="80" autocomplete="off" placeholder="e.g. Anna, Ben, Chen">
      <p><button class="big" type="submit">Start company</button></p>
    </form></div>`;
  $('#name').focus();
  $('#join').onsubmit = async (e) => {
    e.preventDefault();
    const name = $('#name').value.trim().slice(0, 28);
    if (!name) return;
    const id = randomId();
    const taken = values(game.participants).some((p) => p.name.toLowerCase() === name.toLowerCase());
    const display = taken ? `${name} (${id.slice(0, 3)})` : name;
    await store.set(`${gamePath}/participants/${id}`, { name: display, members: $('#members').value.trim().slice(0, 80), joinedAt: Date.now() });
    me = { id, name: display, owner: id };
    sessionStorage.setItem(meKey, JSON.stringify(me));
    viewKey = '';
    // Firebase may already have delivered the snapshot containing us.
    if (game.participants?.[id]) render();
  };
}

// ---------------------------------------------------------------------------
const myFin = () => finances(game).find((f) => f.id === me.owner)
  || { cash: game.config.budget, netWorth: game.config.budget, invested: 0, opProfit: 0, fleetMW: 0, rank: '–', rounds: {}, investedNow: 0 };

async function buy(tech) {
  const { phase, round } = game.meta;
  const k = game.config.catalogue[tech];
  if (phase !== 'invest' || !k?.enabled) return;
  if (myFin().cash < k.cost) { toast('Not enough cash for this plant.'); return; }
  if (plantsOf(game, me.owner).length >= maxPlants(game)) { toast(`You can own at most ${game.config.maxPlants} plants.`); return; }
  const id = `p${randomId(8)}`;
  const n = plantsOf(game, me.owner).filter((p) => p.tech === tech).length + 1;
  await store.update(gamePath, {
    [`plants/${id}`]: {
      id, owner: me.owner, tech, capacity: k.unit, mc: k.mc, cost: k.cost, round,
      name: `${TECH[tech].short} ${n}`, boughtAt: Date.now(),
    },
  });
  toast(`Bought ${TECH[tech].label} (${num(k.unit)} MW)`);
}

async function sell(id) {
  const p = game.plants?.[id];
  if (!p || p.owner !== me.owner || p.round !== game.meta.round || game.meta.phase !== 'invest') return;
  await store.update(gamePath, { [`plants/${id}`]: null });
  toast(`Returned ${p.name} (+${eur(p.cost)})`);
}

// ---------------------------------------------------------------------------
function render() {
  const { phase, round } = game.meta;
  $('#hdr-me').textContent = ownerName(game, me.owner);
  // Jump back to the main task whenever a new phase starts.
  const phaseKey = `${phase}|${round}`;
  if (phaseKey !== lastPhaseKey) { if (lastPhaseKey) tab = 'play'; lastPhaseKey = phaseKey; }
  renderStatus();
  renderTabs();

  const plants = plantsOf(game, me.owner);
  if (tab === 'play' && phase === 'bidding') {
    // The bid form is only rebuilt when the round or the fleet changes, so typed bids survive updates.
    const key = `bid|${round}|${plants.map((p) => p.id).join(',')}`;
    if (key !== viewKey) { viewKey = key; renderBidForm(plants); }
    syncBidForm();
  } else {
    viewKey = `${tab}|${phaseKey}`;
    const top = app.scrollTop;
    app.innerHTML = `<div class="inner">${viewHtml(plants)}</div>`;
    app.scrollTop = top;
  }
  tick();
}

function renderStatus() {
  const { phase, round } = game.meta;
  const c = game.config;
  const f = myFin();
  const rd = game.rounds?.[roundKey(round)] || {};
  const nOwners = finances(game).length;
  const step = { lobby: 'Waiting for the start', invest: '💰 Buy power plants', bidding: '📈 Submit your bids', results: '📊 Market result', finished: '🏁 Game over' }[phase];
  let fourth = `<div class="stat"><div class="v">${num(rd.forecast)} MW</div><div class="k">demand forecast</div></div>`;
  if (phase === 'results' && rd.result) fourth = `<div class="stat"><div class="v">${price(rd.result.price)}</div><div class="k">clearing price</div></div>`;
  if (phase === 'lobby') fourth = `<div class="stat"><div class="v">${c.rounds}</div><div class="k">rounds</div></div>`;
  if (phase === 'finished') fourth = `<div class="stat"><div class="v">#${f.rank}</div><div class="k">final rank</div></div>`;
  $('#status').innerHTML = `
    <div class="phase">${round ? `<span>Round ${round}/${c.rounds}</span>` : ''}<span>${step || PHASE_LABEL[phase]}</span><span class="timer" id="timer"></span></div>
    <div class="stats">
      <div class="stat"><div class="v ${f.cash < 0 ? 'neg' : ''}">${eur(f.cash)}</div><div class="k">cash</div></div>
      <div class="stat"><div class="v">${num(f.fleetMW)} MW</div><div class="k">your capacity</div></div>
      <div class="stat"><div class="v">${eur(f.netWorth)}</div><div class="k">net worth${cleared(game).length ? ` · #${f.rank}/${nOwners}` : ''}</div></div>
      ${fourth}
    </div>`;
}

function renderTabs() {
  $('#tabs').innerHTML = TABS.map(([id, icon, label]) =>
    `<button data-tab="${id}" class="${tab === id ? 'on' : ''}"><span>${icon}</span>${label}</button>`).join('');
}

function viewHtml(plants) {
  if (tab === 'market') return marketView();
  if (tab === 'history') return historyView();
  if (tab === 'ranking') return rankingView();
  if (tab === 'rules') return rulesView();
  const { phase } = game.meta;
  if (phase === 'lobby') {
    return `<div class="panel"><h2>Welcome, ${esc(ownerName(game, me.owner))}! 🎉</h2>
      <p>Your company starts with <b>${eur(game.config.budget)}</b>.
      When the instructor opens the shop, buy power plants, then bid their electricity into the market.</p>
      <p class="muted small">Meanwhile, compare the plants in the <a href="#" data-tab="market">Market</a> tab
        (use 🧮 to see what their electricity costs) and read the <a href="#" data-tab="rules">Rules</a>.</p></div>`;
  }
  if (phase === 'invest') return investView(plants);
  if (phase === 'results' || phase === 'finished') return resultView();
  return '';
}

function investView(plants) {
  const { round } = game.meta;
  const c = game.config;
  const cash = myFin().cash;
  const full = plants.length >= maxPlants(game);
  const shop = TECH_ORDER.filter((t) => c.catalogue[t]?.enabled).map((t) => {
    const k = c.catalogue[t], T = TECH[t];
    const [lo, hi] = k.avail;
    return `<div class="shop-item"><div class="icon" style="background:${T.color}26">${T.icon}</div>
      <div class="t">${esc(T.label)}</div>
      <div class="d">${num(k.unit)} MW · MC ${num(k.mc, 1)} €/MWh<br>${lo < 1 ? `${Math.round(lo * 100)}–${Math.round(hi * 100)}% available` : 'always available'}</div>
      <div class="row" style="gap:.3rem"><button data-buy="${t}" ${cash < k.cost || full ? 'disabled' : ''}>Buy ${eur(k.cost)}</button>
        <button class="secondary calc-btn" data-calc="tech:${t}" title="Cost calculator">🧮</button></div></div>`;
  }).join('');
  const count = {};
  plants.forEach((p) => { count[p.tech] = (count[p.tech] || 0) + 1; });
  const owned = TECH_ORDER.filter((t) => count[t]).map((t) =>
    `<span class="chip"><i style="background:${TECH[t].color}"></i>${count[t]}× ${esc(TECH[t].short)}</span>`).join('');
  const fresh = plants.filter((p) => p.round === round).map((p) =>
    `<button class="chip" data-sell="${p.id}" title="Return for ${esc(eur(p.cost))}">↩ ${esc(p.name)} +${eur(p.cost)}</button>`).join('');
  return `<div class="cols">
    <div class="panel"><h2>Shop</h2><div class="shop">${shop}</div></div>
    <div class="${full ? 'first-on-phone' : ''}">
      <div class="panel"><h2>Your fleet · ${num(myFin().fleetMW)} MW${c.maxPlants ? ` · ${plants.length}/${c.maxPlants} plants` : ''}</h2>
        ${full ? '<p class="small" style="margin:0 0 .4rem"><b>Plant limit reached.</b> Return a plant bought this round to choose a different one.</p>' : ''}<div class="fleet-chips">${owned || '<span class="muted small">No plants yet.</span>'}</div>
        ${fresh ? `<p class="small muted" style="margin:.6rem 0 .3rem">Bought this round (tap to return for a full refund):</p><div class="fleet-chips">${fresh}</div>` : ''}
        <p class="small muted" style="margin:.6rem 0 0">All companies: ${num(totalCapacity(game))} MW installed for
          ${num(game.rounds?.[roundKey(round)]?.forecast)} MW demand · <a href="#" data-tab="market">details</a></p></div>
    </div></div>`;
}

function renderBidForm(plants) {
  const { round } = game.meta;
  const c = game.config;
  const rd = game.rounds?.[roundKey(round)] || {};
  const prev = rd.bids?.[me.owner] || {};
  if (!plants.length) {
    app.innerHTML = `<div class="inner"><div class="panel"><h2>No plants to bid</h2><p class="muted">You don't own any power plants yet, so you sit this round out. You can buy plants in the next round.</p></div></div>`;
    return;
  }
  const avail = values(game.plants).reduce((s, p) => s + p.capacity * (rd.avail?.[p.tech] ?? 1), 0);
  const weather = TECH_ORDER.filter((t) => rd.avail?.[t] != null && rd.avail[t] < 1 && c.catalogue[t]?.enabled)
    .map((t) => `${TECH[t].icon} ${esc(TECH[t].short)} ${Math.round(rd.avail[t] * 100)}%`).join(' · ');
  app.innerHTML = `<div class="inner"><form class="panel" id="bidform">
    <div class="row" style="justify-content:space-between;align-items:flex-start"><h2>Offer price for each plant (€/MWh)</h2>
      <button type="button" class="secondary" data-calc="plant:${plants[0].id}">🧮 Calculator</button></div>
    <p class="small muted" style="margin:0 0 .3rem">Market: ${num(avail)} MW available for ${num(rd.forecast)} MW demand (±${c.uncertainty}%)${weather ? ` · ${weather}` : ''}</p>
    ${plants.map((p) => {
      const a = rd.avail?.[p.tech] ?? 1;
      return `<div class="bidrow"><div class="icon">${TECH[p.tech].icon}</div>
        <div><div class="nm">${esc(p.name)} <button type="button" class="linkbtn" data-calc="plant:${p.id}" title="Cost calculator">🧮</button></div>
          <div class="fx">${a < 1 ? `${num(p.capacity * a)} of ${num(p.capacity)}` : num(p.capacity)} MW · marginal cost <b>${price(p.mc)}</b></div></div>
        <input data-plant="${p.id}" type="number" inputmode="decimal" step="0.1" min="${c.minBid}" max="${c.priceCap}" value="${prev[p.id] ?? ''}" placeholder="€/MWh" aria-label="Bid for ${esc(p.name)}"></div>`;
    }).join('')}
    <div class="bidbar"><button class="big" type="submit">Submit bids</button><span id="bidmsg" class="small"></span></div></form></div>`;
  $('#bidform').onsubmit = async (e) => {
    e.preventDefault();
    if (game.meta.phase !== 'bidding' || game.meta.round !== round) return;
    const bids = {};
    for (const inp of app.querySelectorAll('input[data-plant]')) {
      if (inp.value.trim() === '') continue;
      const v = Number(inp.value);
      if (!Number.isFinite(v) || v < c.minBid || v > c.priceCap) {
        $('#bidmsg').innerHTML = `<span class="neg">Bids must be between ${c.minBid} and ${num(c.priceCap)} €/MWh.</span>`;
        inp.focus(); return;
      }
      bids[inp.dataset.plant] = Math.round(v * 10) / 10;
    }
    if (!Object.keys(bids).length) { $('#bidmsg').innerHTML = '<span class="neg">Enter a price for at least one plant.</span>'; return; }
    const rk = roundKey(round);
    await store.update(gamePath, {
      [`rounds/${rk}/bids/${me.owner}`]: bids,
      [`rounds/${rk}/submittedBy/${me.owner}`]: { name: ownerName(game, me.owner), at: Date.now() },
    });
    toast('Bids submitted ✓');
  };
}

/** Submission status, and the submitted bids in fields that are still empty (e.g. after a reload). */
function syncBidForm() {
  const rd = game.rounds?.[roundKey(game.meta.round)] || {};
  const sub = rd.submittedBy?.[me.owner];
  const msg = $('#bidmsg');
  if (msg && sub) msg.innerHTML = '<span class="pill ok">✓ Submitted</span> <span class="muted">You can change it until bidding closes.</span>';
  if (msg && !sub && !msg.querySelector('.neg')) msg.innerHTML = '<span class="muted">Not submitted yet.</span>';
  const current = rd.bids?.[me.owner] || {};
  app.querySelectorAll('input[data-plant]').forEach((inp) => {
    if (inp.value === '' && current[inp.dataset.plant] != null) inp.value = current[inp.dataset.plant];
  });
}

// ---------------------------------------------------------------------------
// Results with feedback: what happened to each plant, and what bidding marginal cost would have earned.
// ---------------------------------------------------------------------------
function plantLesson(o, res) {
  const P = res.price;
  const hours = res.hours ?? 1;
  const avail = o.available ?? o.capacity;
  const margin = (P - o.mc) * avail * hours;
  if (o.bid == null) return P > o.mc ? `🚫 No bid, so not offered. At ${price(P)} it would have earned ${eur(margin)}.` : '🚫 No bid, so not offered.';
  if (o.dispatched <= 0) {
    if (o.bid > P && o.mc < P) return `❌ Bid ${price(o.bid)} was above the clearing price, so not dispatched, although it only costs ${price(o.mc)}. Missed ${eur(margin)}.`;
    return `✓ Not dispatched: the price (${price(P)}) was below its cost (${price(o.mc)}), so staying off was right.`;
  }
  const paid = res.pricing === 'pab' ? o.bid : P;
  if (paid < o.mc) return `⚠️ Produced at a loss: paid ${price(paid)} but costs ${price(o.mc)}. Never bid below your marginal cost.`;
  if (o.bid === P && o.bid > o.mc) return `🎯 This plant set the price with a mark-up of ${price(o.bid - o.mc)}. Risky: a little higher and it would have been left out.`;
  if (o.dispatched < avail - 0.5) return `◐ Partly dispatched (${num(o.dispatched)} of ${num(avail)} MW): it was the marginal plant.`;
  return `✓ Dispatched: earned ${price(paid - o.mc)} on every MWh.`;
}

function resultView() {
  const done = cleared(game);
  const r = game.meta.phase === 'results' ? game.meta.round : done[done.length - 1];
  const rd = game.rounds?.[roundKey(r)];
  const res = rd?.result;
  if (!res) return '<div class="panel"><p class="muted">Clearing the market…</p></div>';
  const f = myFin();
  const mine = [...(res.offers || []), ...(res.notOffered || [])].filter((o) => o.owner === me.owner);
  const tot = res.perOwner?.[me.owner] || { profit: 0 };
  const names = Object.fromEntries(Object.keys(game.participants || {}).map((id) => [id, ownerName(game, id)]));
  const head = game.meta.phase === 'finished'
    ? `<h2>${f.rank === 1 ? '🏆 You won!' : `You finished #${f.rank}`} · net worth ${eur(f.netWorth)}</h2>`
    : `<h2>Round ${r}: your operating profit <span class="${tot.profit < 0 ? 'neg' : 'pos'}">${eur(tot.profit)}</span></h2>`;
  let mcBox = '';
  if (mine.length) {
    const cf = ownMcCounterfactual(game, r, me.owner).profit;
    const d = cf - tot.profit;
    const verdict = Math.abs(d) < 1000
      ? 'Same result: your bids worked like marginal-cost bids.'
      : d > 0 ? `Bidding your marginal costs would have earned <b class="pos">${eur(d)} more</b>.`
        : `Your mark-up paid off this time (<b>+${eur(-d)}</b>). It can backfire, though: bid too high and your plant is left out.`;
    mcBox = `<div class="lesson"><b>If you had bid your marginal costs:</b> ${eur(cf)} (you earned ${eur(tot.profit)}). ${verdict}</div>`;
  }
  return `<div class="cols">
    <div class="panel">${head}
      <p class="small muted" style="margin:0 0 .3rem">Price ${price(res.price)} · demand ${num(res.demand)} MW (forecast ${num(rd.forecast)})${res.unserved > 0 ? ` · <b class="neg">${num(res.unserved)} MW not covered → price cap</b>` : ''}</p>
      ${meritOrderChart(res, { names, highlight: me.owner, forecast: rd.forecast, showNames: game.config.showNames, width: 640 })}</div>
    <div class="panel"><h2>Your plants</h2>
      ${mine.length ? `${mcBox}<ul class="lessons">${mine.map((o) => `<li><b>${TECH[o.tech].icon} ${esc(o.name)}</b>: bid ${o.bid == null ? '–' : price(o.bid)}${o.auto ? ' (auto)' : ''},
          ${num(o.dispatched)}/${num(o.available ?? o.capacity)} MW, profit <b class="${o.profit < 0 ? 'neg' : ''}">${eur(o.profit)}</b><br><span>${plantLesson(o, res)}</span></li>`).join('')}</ul>
        <p class="small muted" style="margin:.4rem 0 0">Profit = (price − marginal cost) × MW × ${num(res.hours ?? 1)} h.</p>` : '<p class="muted small">You had no plants in this round.</p>'}
    </div></div>`;
}

// ---------------------------------------------------------------------------
// Cost calculator: marginal cost breakdown, LCOE and a bid simulator.
// ---------------------------------------------------------------------------
function openCalc(ref) {
  const [kind, id] = ref.split(':');
  const plant = kind === 'plant' ? game.plants?.[id] : null;
  const tech = plant ? plant.tech : id;
  const c = game.config;
  const k = c.catalogue[tech];
  if (!k) return;
  const T = TECH[tech];
  const mcb = mcBreakdown(k, c.co2Price ?? 0);
  const mc = plant ? plant.mc : k.mc;
  const { round, phase } = game.meta;
  const rd = game.rounds?.[roundKey(round)] || {};
  const availNow = rd.avail?.[tech];
  const avgAvail = (k.avail[0] + k.avail[1]) / 2;
  const roundsLeft = Math.max(1, c.rounds - Math.max(1, round) + 1);
  const done = cleared(game);
  const lastPrice = done.length ? game.rounds[roundKey(done[done.length - 1])].result.price : 70;
  const bidInput = plant ? app.querySelector(`input[data-plant="${plant.id}"]`) : null;
  const startBid = bidInput && bidInput.value !== '' ? +bidInput.value : mc;

  let modal = $('#modal');
  if (!modal) { modal = document.createElement('div'); modal.id = 'modal'; document.body.appendChild(modal); }
  modal.innerHTML = `<div class="modal-box" role="dialog" aria-label="Cost calculator">
    <div class="row" style="justify-content:space-between"><h2 style="margin:0">🧮 ${T.icon} ${esc(plant ? plant.name : T.label)}</h2><button class="secondary" id="calc-close">Close</button></div>
    <p class="small muted" style="margin:.2rem 0 .6rem">${esc(T.label)} · ${num(k.unit)} MW · investment ${eur(plant ? plant.cost : k.cost)}</p>

    <h3>1 · Marginal cost: the cost of one more MWh</h3>
    <table class="mini"><tbody>
      <tr><td>Fuel: fuel price ÷ efficiency</td><td class="n">${num(k.fuel, 1)} ÷ ${num(k.eff * 100)}%</td><td class="n">${price(Math.round(mcb.fuel * 10) / 10)}</td></tr>
      <tr><td>CO₂: CO₂ price × emission factor ÷ efficiency</td><td class="n">${num(c.co2Price ?? 0)} €/t × ${num(k.ef, 2)} ÷ ${num(k.eff * 100)}%</td><td class="n">${price(Math.round(mcb.co2 * 10) / 10)}</td></tr>
      <tr><td>Variable operation &amp; maintenance</td><td></td><td class="n">${price(mcb.vom)}</td></tr>
      <tr><td><b>Marginal cost</b></td><td></td><td class="n"><b>${price(mc)}</b></td></tr>
    </tbody></table>

    <h3 style="margin-top:.9rem">2 · LCOE: the full cost per MWh, including the investment</h3>
    <div class="row small" style="gap:.4rem .8rem">
      <label class="inl">Rounds of operation <input id="lc-rounds" type="number" min="1" max="${c.rounds}" value="${roundsLeft}"></label>
      <label class="inl">Running hours (% of the time) <input id="lc-share" type="number" min="1" max="100" value="${Math.round(avgAvail * 100)}"></label>
    </div>
    <div id="lc-out" class="small"></div>

    <h3 style="margin-top:.9rem">3 · Bid simulator: what do you earn at a given price?</h3>
    <div class="row small" style="gap:.4rem .8rem">
      <label class="inl">Your bid (€/MWh) <input id="sim-bid" type="number" step="0.1" value="${startBid}"></label>
      <label class="inl">Clearing price (€/MWh) <input id="sim-price" type="number" step="1" value="${lastPrice}"></label>
    </div>
    <div id="sim-out" class="small"></div>
    ${bidInput && phase === 'bidding' ? '<p><button id="sim-use">Use this bid for the plant</button></p>' : ''}
    <div class="lesson small">💡 Once a plant is built, its investment is a <b>sunk cost</b>: it is paid whether the plant runs or not.
      So for <i>bidding</i> only the marginal cost matters. Every euro the price is above it is profit. The LCOE matters when you decide <i>what to buy</i>.</div>
  </div>`;
  modal.style.display = 'flex';
  const calc = () => {
    const rounds = Math.max(1, +$('#lc-rounds').value || 1);
    const share = Math.min(100, Math.max(1, +$('#lc-share').value || 100)) / 100;
    const kk = { ...k, cost: plant ? plant.cost : k.cost, avail: [share, share] };
    const l = gameLcoe(kk, { mc, rounds, hours: c.hours, salvage: c.salvage });
    $('#lc-out').innerHTML = `Investment × (1 − ${c.salvage}% end value) ÷ energy
      = ${eur(kk.cost * (1 - c.salvage / 100))} ÷ (${num(k.unit)} MW × ${Math.round(share * 100)}% × ${num(c.hours)} h × ${rounds} rounds)
      = <b>${price(Math.round(l.capital * 10) / 10)}</b> capital cost<br>
      LCOE = marginal cost + capital cost = ${price(mc)} + ${price(Math.round(l.capital * 10) / 10)} = <b>${price(Math.round(l.total * 10) / 10)}</b>`;
    const bid = +$('#sim-bid').value;
    const P = +$('#sim-price').value;
    const a = availNow ?? avgAvail;
    const mw = k.unit * a;
    const paid = c.pricing === 'pab' ? bid : P;
    let out;
    if (bid > P) {
      out = `❌ Your bid is above the price: <b>not dispatched</b>, profit €0.${P > mc ? ` Bidding ${price(mc)} would have earned ${eur((P - mc) * mw * c.hours)}.` : ''}`;
    } else {
      const profit = (paid - mc) * mw * c.hours;
      out = `✓ Dispatched: ${num(mw)} MW × ${num(c.hours)} h, paid ${price(paid)}${c.pricing === 'pab' ? ' (your bid)' : ' (the clearing price, whatever you bid)'}.
        Profit = (${num(paid, 1)} − ${num(mc, 1)}) × ${num(mw * c.hours)} MWh = <b class="${profit < 0 ? 'neg' : 'pos'}">${eur(profit)}</b>.
        ${profit < 0 ? 'A loss: the price is below your marginal cost.' : ''}`;
    }
    $('#sim-out').innerHTML = out;
  };
  modal.oninput = calc;
  calc();
  const close = () => { modal.style.display = 'none'; };
  $('#calc-close').onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };
  const use = $('#sim-use');
  if (use) use.onclick = () => { bidInput.value = $('#sim-bid').value; close(); toast('Bid filled in. Don\'t forget to submit.'); };
}

// ---------------------------------------------------------------------------
function marketView() {
  return `<div class="panel"><h2>Installed capacity (all companies)</h2>${marketMix(game)}</div>
    <div class="panel"><h2>Demand outlook</h2>${demandOutlook(game)}</div>
    <div class="panel"><h2>Power plant shop</h2>${catalogueTable(game)}
      <div class="row" style="gap:.3rem;margin-top:.5rem">${TECH_ORDER.filter((t) => game.config.catalogue[t]?.enabled).map((t) =>
        `<button class="secondary" data-calc="tech:${t}">🧮 ${esc(TECH[t].short)}</button>`).join('')}</div></div>`;
}

function historyView() {
  const f = myFin();
  const rows = cleared(game).map((r) => {
    const res = game.rounds[roundKey(r)].result;
    const bought = plantsOf(game, me.owner).filter((p) => p.round === r);
    return `<tr><td>R${r}</td><td class="n">${price(res.price)}</td>
      <td>${bought.map((p) => esc(p.name)).join(', ') || '–'}</td><td class="n">${eur(bought.reduce((s, p) => s + p.cost, 0))}</td>
      <td class="n ${(f.rounds[r] ?? 0) < 0 ? 'neg' : ''}">${eur(f.rounds[r] ?? 0)}</td></tr>`;
  });
  const fleet = plantsOf(game, me.owner);
  return `<div class="panel"><h2>Your rounds</h2>${rows.length ? `<table class="mini"><thead><tr><th>Round</th><th class="n">Price</th><th>Bought</th><th class="n">Invested</th><th class="n">Op. profit</th></tr></thead><tbody>${rows.join('')}</tbody></table>` : '<p class="muted small">No rounds played yet.</p>'}</div>
    <div class="panel"><h2>Your fleet</h2>${fleet.length ? `<table class="mini"><thead><tr><th>Plant</th><th class="n">MW</th><th class="n">MC</th><th class="n">Bought</th><th></th></tr></thead><tbody>
      ${fleet.map((p) => `<tr><td>${TECH[p.tech].icon} ${esc(p.name)}</td><td class="n">${num(p.capacity)}</td><td class="n">${num(p.mc, 1)}</td><td class="n">R${p.round} · ${eur(p.cost)}</td>
        <td><button class="linkbtn" data-calc="plant:${p.id}">🧮</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted small">No plants yet.</p>'}</div>`;
}

function rankingView() {
  const list = finances(game);
  return `<div class="panel"><h2>Ranking by net worth</h2><table class="mini"><thead><tr><th>#</th><th>Company</th>
    <th class="n">Capacity</th><th class="n">Cash</th><th class="n">Net worth</th></tr></thead><tbody>
    ${list.map((r) => `<tr class="${r.id === me.owner ? 'me' : ''}"><td>${r.rank}</td><td>${esc(r.name)}</td><td class="n">${num(r.fleetMW)} MW</td>
      <td class="n ${r.cash < 0 ? 'neg' : ''}">${eur(r.cash)}</td><td class="n">${eur(r.netWorth)}</td></tr>`).join('')}
    </tbody></table><p class="small muted" style="margin:.4rem 0 0">Net worth = cash + plants at ${game.config.salvage}% of their purchase price.</p></div>`;
}

function rulesView() {
  const c = game.config;
  return `<div class="panel"><h2>How the game works</h2>
    <ul style="padding-left:1.1rem;margin:.3rem 0">
      <li>Your company starts with <b>${eur(c.budget)}</b>. Each round has two steps:
        first <b>buy power plants</b> in the shop, then <b>bid</b> their electricity into the market.</li>
      ${c.maxPlants ? `<li>You can own at most <b>${c.maxPlants} power plants</b>.</li>` : ''}
      <li>Plants stay in your fleet. One round represents <b>${num(c.hours)} hours</b> with the same conditions.</li>
      <li>Demand is fixed: consumers buy the forecast amount (±${c.uncertainty}%) whatever the price.</li>
      <li>For each plant you offer a <b>price (€/MWh)</b> for its available capacity (${c.minBid} to ${num(c.priceCap)} €/MWh).
        Wind and solar can only produce part of their capacity, depending on the weather.</li>
      <li>All offers are sorted from cheapest to most expensive and accepted until demand is covered.</li>
      ${c.pricing === 'pab'
        ? '<li><b>Pay-as-bid:</b> every accepted plant is paid <i>its own bid</i>.</li>'
        : '<li><b>Pay-as-clear:</b> the most expensive accepted offer sets the <i>clearing price</i>, and every accepted plant is paid that price.</li>'}
      <li>If offers cannot cover demand, the price goes to the price cap of ${num(c.priceCap)} €/MWh.</li>
      <li>Operating profit = (price received − marginal cost) × MWh produced. Plants that are not accepted earn nothing.</li>
      ${c.missing === 'withhold' ? '<li>Plants without a bid are not offered.</li>' : ''}
      <li>Ranking: <b>net worth</b> = cash + your plants valued at ${c.salvage}% of what you paid.</li>
    </ul></div>
    <div class="panel"><h2>Key concepts</h2><dl class="glossary">
      <dt>Merit order</dt><dd>All offers sorted from the cheapest to the most expensive. The cheapest plants run first.</dd>
      <dt>Marginal cost (MC)</dt><dd>The cost of producing one more MWh: fuel ÷ efficiency + CO₂ price × emission factor ÷ efficiency + variable O&amp;M. Wind and solar: almost zero.</dd>
      <dt>Clearing price</dt><dd>The price where supply meets demand: the bid of the last (most expensive) plant needed. ${c.pricing === 'pab' ? 'In pay-as-bid, each plant gets its own bid instead.' : 'Every dispatched plant receives it.'}</dd>
      <dt>Inframarginal rent</dt><dd>What a cheap plant earns: (clearing price − its marginal cost) per MWh. This is what pays back the investment.</dd>
      <dt>Merit-order effect</dt><dd>Renewables with zero marginal cost push expensive plants out of the merit order, so the price drops for everyone.</dd>
      <dt>Scarcity</dt><dd>If all available plants can't cover demand, the price jumps to the price cap.</dd>
      <dt>LCOE</dt><dd>Levelised cost of electricity: marginal cost plus the investment spread over all the MWh the plant produces. Use it to decide what to build.</dd>
      <dt>Sunk cost</dt><dd>Money already spent and gone, like a plant's investment. It shouldn't change your bid.</dd>
    </dl></div>`;
}

function tick() {
  const el = $('#timer');
  if (!el) return;
  const cd = countdown(game);
  el.textContent = cd ? `⏱ ${cd.text}` : '';
  el.classList.toggle('low', !!cd && cd.left <= 10);
}

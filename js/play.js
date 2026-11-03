// Player app: one fixed screen. Status bar (money, phase, timer) on top, the
// current task in the middle, and tabs for secondary information at the bottom.
import { getStore, mode, randomId } from './store.js';
import { TECH, TECH_ORDER } from './market.js';
import { meritOrderChart } from './charts.js';
import {
  $, esc, num, eur, price, roundKey, values, plantsOf, ownerName, attachTooltips, finances, cleared, countdown,
  outdatedGameMessage, totalCapacity,
} from './ui.js';
import { catalogueTable, demandOutlook, marketMix, PHASE_LABEL } from './views.js';

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
  ['rules', '❓', 'Rules'],
];

$('#hdr-game').textContent = code;
store.subscribe(gamePath, (g) => {
  game = g;
  if (!g) { showMessage(`<div class="card"><h2>Game “${esc(code)}” not found</h2><p>Check the code with your instructor.</p><p><a href="index.html">Back</a></p></div>`); return; }
  if (outdatedGameMessage(g)) { showMessage(outdatedGameMessage(g)); return; }
  const known = me && (g.config.mode === 'team' ? g.members?.[me.id] : g.participants?.[me.id]);
  if (!known) { if (viewKey !== 'join') renderJoin(); return; }
  render();
});
setInterval(tick, 500);

// Buttons inside the view (event delegation, so re-rendering doesn't lose handlers).
app.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-buy],[data-sell],[data-tab]');
  if (!b || b.disabled) return;
  if (b.dataset.tab) { e.preventDefault(); setTab(b.dataset.tab); return; }
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
  const team = game.config.mode === 'team';
  app.innerHTML = `<div class="inner" style="max-width:520px">
    ${mode === 'local' ? '<div class="banner">Local demo mode: this only works in tabs of the same browser as the host.</div>' : ''}
    <form class="card" id="join">
      <h1>Join game ${esc(code)}</h1>
      <label for="name">Your name</label>
      <input id="name" required maxlength="24" autocomplete="nickname" placeholder="First name or nickname">
      ${team ? `<label for="team">Your team</label><select id="team">${Object.entries(game.participants).map(([id, t]) => `<option value="${esc(id)}">${esc(t.name)}</option>`).join('')}</select>` : ''}
      <p><button class="big" type="submit">Join</button></p>
    </form></div>`;
  $('#name').focus();
  $('#join').onsubmit = async (e) => {
    e.preventDefault();
    const name = $('#name').value.trim().slice(0, 24);
    if (!name) return;
    const id = randomId();
    if (team) {
      const t = $('#team').value;
      await store.set(`${gamePath}/members/${id}`, { name, team: t, joinedAt: Date.now() });
      me = { id, name, owner: t };
    } else {
      const taken = values(game.participants).some((p) => p.name.toLowerCase() === name.toLowerCase());
      const display = taken ? `${name} (${id.slice(0, 3)})` : name;
      await store.set(`${gamePath}/participants/${id}`, { name: display, joinedAt: Date.now() });
      me = { id, name: display, owner: id };
    }
    sessionStorage.setItem(meKey, JSON.stringify(me));
    viewKey = '';
    // Firebase may already have delivered the snapshot containing us.
    if (team ? game.members?.[id] : game.participants?.[id]) render();
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
  const id = `p${randomId(8)}`;
  const n = plantsOf(game, me.owner).filter((p) => p.tech === tech).length + 1;
  await store.update(gamePath, {
    [`plants/${id}`]: {
      id, owner: me.owner, tech, capacity: k.unit, mc: k.mc, cost: k.cost, round,
      name: `${TECH[tech].short} ${n}`, boughtBy: me.name, boughtAt: Date.now(),
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
  const team = game.config.mode === 'team';
  $('#hdr-me').textContent = team ? `${me.name} · ${ownerName(game, me.owner)}` : me.name;
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
    return `<div class="panel"><h2>You're in, ${esc(me.name)}! 🎉</h2>
      <p>Your ${game.config.mode === 'team' ? 'team starts' : 'start'} with <b>${eur(game.config.budget)}</b>.
      When the instructor opens the shop, buy power plants, then bid their electricity into the market.</p>
      <p class="muted small">Meanwhile, look at the plant prices in the <a href="#" data-tab="market">Market</a> tab and read the <a href="#" data-tab="rules">Rules</a>.</p></div>`;
  }
  if (phase === 'invest') return investView(plants);
  if (phase === 'results' || phase === 'finished') return resultView();
  return '';
}

function investView(plants) {
  const { round } = game.meta;
  const c = game.config;
  const cash = myFin().cash;
  const shop = TECH_ORDER.filter((t) => c.catalogue[t]?.enabled).map((t) => {
    const k = c.catalogue[t], T = TECH[t];
    const [lo, hi] = k.avail;
    return `<div class="shop-item"><div class="icon" style="background:${T.color}26">${T.icon}</div>
      <div class="t">${esc(T.label)}</div>
      <div class="d">${num(k.unit)} MW · MC ${num(k.mc)} €/MWh<br>${lo < 1 ? `${Math.round(lo * 100)}–${Math.round(hi * 100)}% available` : 'always available'}</div>
      <div><button data-buy="${t}" ${cash < k.cost ? 'disabled' : ''}>Buy ${eur(k.cost)}</button></div></div>`;
  }).join('');
  const count = {};
  plants.forEach((p) => { count[p.tech] = (count[p.tech] || 0) + 1; });
  const owned = TECH_ORDER.filter((t) => count[t]).map((t) =>
    `<span class="chip"><i style="background:${TECH[t].color}"></i>${count[t]}× ${esc(TECH[t].short)}</span>`).join('');
  const fresh = plants.filter((p) => p.round === round).map((p) =>
    `<button class="chip" data-sell="${p.id}" title="Return for ${esc(eur(p.cost))}">↩ ${esc(p.name)} +${eur(p.cost)}</button>`).join('');
  return `<div class="cols">
    <div class="panel"><h2>Shop</h2><div class="shop">${shop}</div></div>
    <div>
      <div class="panel"><h2>Your fleet · ${num(myFin().fleetMW)} MW</h2><div class="fleet-chips">${owned || '<span class="muted small">No plants yet.</span>'}</div>
        ${fresh ? `<p class="small muted" style="margin:.6rem 0 .3rem">Bought this round (tap to return for a full refund):</p><div class="fleet-chips">${fresh}</div>` : ''}
        <p class="small muted" style="margin:.6rem 0 0">All ${c.mode === 'team' ? 'teams' : 'players'}: ${num(totalCapacity(game))} MW installed for
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
    <h2>Offer price for each plant (€/MWh)</h2>
    <p class="small muted" style="margin:0 0 .3rem">Market: ${num(avail)} MW available for ${num(rd.forecast)} MW demand (±${c.uncertainty}%)${weather ? ` · ${weather}` : ''}</p>
    ${plants.map((p) => {
      const a = rd.avail?.[p.tech] ?? 1;
      return `<div class="bidrow"><div class="icon">${TECH[p.tech].icon}</div>
        <div><div class="nm">${esc(p.name)}</div><div class="fx">${a < 1 ? `${num(p.capacity * a)} of ${num(p.capacity)}` : num(p.capacity)} MW · marginal cost <b>${price(p.mc)}</b></div></div>
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
      [`rounds/${rk}/submittedBy/${me.owner}`]: { name: me.name, at: Date.now() },
    });
    app.querySelectorAll('input[data-plant]').forEach((inp) => delete inp.dataset.dirty);
    toast('Bids submitted ✓');
  };
}

/** Submission status, and a teammate's submitted bids in every field this player hasn't edited. */
function syncBidForm() {
  const rd = game.rounds?.[roundKey(game.meta.round)] || {};
  const sub = rd.submittedBy?.[me.owner];
  const msg = $('#bidmsg');
  if (msg && sub) msg.innerHTML = `<span class="pill ok">✓ Submitted${game.config.mode === 'team' ? ` by ${esc(sub.name)}` : ''}</span> <span class="muted">You can change it until bidding closes.</span>`;
  if (msg && !sub && !msg.querySelector('.neg')) msg.innerHTML = '<span class="muted">Not submitted yet.</span>';
  const current = rd.bids?.[me.owner] || {};
  app.querySelectorAll('input[data-plant]').forEach((inp) => {
    inp.oninput = () => { inp.dataset.dirty = '1'; };
    if (!inp.dataset.dirty && current[inp.dataset.plant] != null) inp.value = current[inp.dataset.plant];
  });
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
  return `<div class="cols">
    <div class="panel">${head}
      <p class="small muted" style="margin:0 0 .3rem">Price ${price(res.price)} · demand ${num(res.demand)} MW (forecast ${num(rd.forecast)})</p>
      ${meritOrderChart(res, { names, highlight: me.owner, forecast: rd.forecast, showNames: game.config.showNames, width: 640 })}</div>
    <div class="panel"><h2>Your plants</h2>
      ${mine.length ? `<table class="mini"><thead><tr><th>Plant</th><th class="n">Bid</th><th class="n">MWh/h</th><th class="n">Profit</th></tr></thead><tbody>
        ${mine.map((o) => `<tr><td>${TECH[o.tech].icon} ${esc(o.name)}</td><td class="n">${o.bid == null ? '–' : num(o.bid, 1)}${o.auto ? '*' : ''}</td>
          <td class="n">${num(o.dispatched)}/${num(o.available ?? o.capacity)}</td><td class="n ${o.profit < 0 ? 'neg' : ''}">${eur(o.profit)}</td></tr>`).join('')}
      </tbody></table><p class="small muted" style="margin:.4rem 0 0">Profit = (price − marginal cost) × MW × ${num(res.hours ?? 1)} h.</p>` : '<p class="muted small">You had no plants in this round.</p>'}
    </div></div>`;
}

function marketView() {
  return `<div class="panel"><h2>Installed capacity (all ${game.config.mode === 'team' ? 'teams' : 'players'})</h2>${marketMix(game)}</div>
    <div class="panel"><h2>Demand outlook</h2>${demandOutlook(game)}</div>
    <div class="panel"><h2>Power plant shop</h2>${catalogueTable(game)}</div>`;
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
    <div class="panel"><h2>Your fleet</h2>${fleet.length ? `<table class="mini"><thead><tr><th>Plant</th><th class="n">MW</th><th class="n">MC</th><th class="n">Bought</th></tr></thead><tbody>
      ${fleet.map((p) => `<tr><td>${TECH[p.tech].icon} ${esc(p.name)}</td><td class="n">${num(p.capacity)}</td><td class="n">${num(p.mc)}</td><td class="n">R${p.round} · ${eur(p.cost)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted small">No plants yet.</p>'}</div>`;
}

function rankingView() {
  const list = finances(game);
  return `<div class="panel"><h2>Ranking by net worth</h2><table class="mini"><thead><tr><th>#</th><th>${game.config.mode === 'team' ? 'Team' : 'Player'}</th>
    <th class="n">Capacity</th><th class="n">Cash</th><th class="n">Net worth</th></tr></thead><tbody>
    ${list.map((r) => `<tr class="${r.id === me.owner ? 'me' : ''}"><td>${r.rank}</td><td>${esc(r.name)}</td><td class="n">${num(r.fleetMW)} MW</td>
      <td class="n ${r.cash < 0 ? 'neg' : ''}">${eur(r.cash)}</td><td class="n">${eur(r.netWorth)}</td></tr>`).join('')}
    </tbody></table><p class="small muted" style="margin:.4rem 0 0">Net worth = cash + plants at ${game.config.salvage}% of their purchase price.</p></div>`;
}

function rulesView() {
  const c = game.config;
  return `<div class="panel"><h2>How the game works</h2>
    <ul style="padding-left:1.1rem;margin:.3rem 0">
      <li>Your ${c.mode === 'team' ? 'team starts' : 'start'} with <b>${eur(c.budget)}</b>. Each round has two steps:
        first <b>buy power plants</b> in the shop, then <b>bid</b> their electricity into the market.</li>
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
    </ul></div>`;
}

function tick() {
  const el = $('#timer');
  if (!el) return;
  const cd = countdown(game);
  el.textContent = cd ? `⏱ ${cd.text}` : '';
  el.classList.toggle('low', !!cd && cd.left <= 10);
}

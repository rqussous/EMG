import { getStore, mode, randomId } from './store.js';
import { TECH } from './market.js';
import { meritOrderChart } from './charts.js';
import {
  $, esc, num, eur, price, roundKey, values, plantsOf, totalCapacity, ownerName,
  leaderboardTable, standings, attachTooltips,
} from './ui.js';

const store = await getStore();
const app = $('#app');
attachTooltips(app);

const code = new URLSearchParams(location.search).get('game')?.trim().toUpperCase();
if (!code) location.replace('index.html');
const meKey = `mog_me_${code}`;
// sessionStorage: one identity per browser tab (survives reloads; lets you test with several tabs).
let me = JSON.parse(sessionStorage.getItem(meKey) || 'null');
let game = null;
let formKey = '';
const gamePath = `games/${code}`;

$('#hdr-game').textContent = `Game ${code}`;
store.subscribe(gamePath, (g) => {
  game = g;
  if (!g) { app.innerHTML = `<div class="card"><h2>Game “${esc(code)}” not found</h2><p>Check the code with your instructor.</p><p><a href="index.html">Back</a></p></div>`; formKey = ''; return; }
  const known = me && (g.config.mode === 'team' ? g.members?.[me.id] : g.participants?.[me.id]);
  if (!known) { if (formKey !== 'join') renderJoin(); return; }
  render();
});
setInterval(tick, 500);

// ---------------------------------------------------------------------------
function renderJoin() {
  formKey = 'join';
  const team = game.config.mode === 'team';
  app.innerHTML = `
    ${mode === 'local' ? '<div class="banner">Local demo mode: this only works in tabs of the same browser as the host.</div>' : ''}
    <form class="card" id="join">
      <h1>Join game ${esc(code)}</h1>
      <label for="name">Your name</label>
      <input id="name" required maxlength="24" autocomplete="nickname" placeholder="First name or nickname">
      ${team ? `<label for="team">Your team</label><select id="team">${Object.entries(game.participants).map(([id, t]) => `<option value="${esc(id)}">${esc(t.name)}</option>`).join('')}</select>` : ''}
      <p><button class="big" type="submit">Join</button></p>
    </form>`;
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
    formKey = '';
    // Firebase may already have delivered the snapshot containing us.
    if (team ? game.members?.[id] : game.participants?.[id]) render();
  };
}

// ---------------------------------------------------------------------------
function render() {
  const { phase, round } = game.meta;
  const team = game.config.mode === 'team';
  $('#hdr-me').textContent = team ? `${me.name} · ${ownerName(game, me.owner)}` : me.name;
  const plants = plantsOf(game, me.owner);
  const key = `${phase}|${round}|${plants.map((p) => p.id).join(',')}`;
  if (key !== formKey) {
    formKey = key;
    app.innerHTML = `<div id="top"></div><div id="form"></div><div id="bottom"></div>`;
    renderForm(plants);
  }
  renderTop(plants);
  renderBottom(plants);
}

function rulesBox() {
  const c = game.config;
  return `<details class="card"><summary><b>How the market works</b></summary>
    <ul>
      <li>Every round is one hour of the day-ahead electricity market. Demand is fixed: consumers buy the forecast amount (±${c.uncertainty}%) whatever the price.</li>
      <li>For each plant you submit a <b>price (€/MWh)</b> at which you are willing to sell its full capacity. Bids range from ${c.minBid} to ${num(c.priceCap)} €/MWh.</li>
      <li>The market operator sorts all offers from cheapest to most expensive and accepts them until demand is covered.</li>
      ${c.pricing === 'pab'
        ? '<li><b>Pay-as-bid:</b> every accepted plant is paid <i>its own bid</i>.</li>'
        : '<li><b>Pay-as-clear:</b> the most expensive accepted offer sets the <i>clearing price</i>, and every accepted plant is paid that same price.</li>'}
      <li>If offers cannot cover demand, the price goes to the price cap of ${num(c.priceCap)} €/MWh.</li>
      <li>Your profit = (price received − marginal cost) × MWh produced. Plants that are not accepted produce nothing and earn nothing.</li>
      ${c.missing === 'withhold' ? '<li>If you don\'t submit a bid in time, your plant is not offered.</li>' : ''}
      <li>The player or team with the highest total profit after ${c.rounds} rounds wins.</li>
    </ul></details>`;
}

function plantCard(p, bidInput = '') {
  const t = TECH[p.tech];
  return `<div class="plant">
    <div class="icon" style="background:${t.color}22">${t.icon}</div>
    <div class="pname">${esc(p.name)}</div>
    <div class="muted"><span class="tech"><i style="background:${t.color};width:10px;height:10px;border-radius:3px;display:inline-block"></i>${esc(t.label)}</span></div>
    <div class="facts"><span>Capacity <b>${num(p.capacity)} MW</b></span><span>Marginal cost <b>${price(p.mc)}</b></span></div>
    ${bidInput}</div>`;
}

function renderForm(plants) {
  const { phase, round } = game.meta;
  const el = $('#form');
  if (phase === 'lobby') { el.innerHTML = `<div class="card"><h2>You're in, ${esc(me.name)}! 🎉</h2><p class="muted">Waiting for the instructor to start the game and hand out power plants…</p></div>${rulesBox()}`; return; }
  if (!plants.length) { el.innerHTML = '<div class="card"><p class="muted">Your power plant is being assigned…</p></div>'; return; }
  if (phase !== 'bidding') {
    el.innerHTML = phase === 'ready'
      ? `<div class="card"><h2>Your ${plants.length > 1 ? 'power plants' : 'power plant'}</h2>${plants.map((p) => plantCard(p)).join('')}
         <p class="muted">The marginal cost is what it costs you to produce one MWh (mainly fuel and CO₂). Bidding opens soon.</p></div>${rulesBox()}`
      : '';
    return;
  }
  const c = game.config;
  const prev = game.rounds?.[roundKey(round)]?.bids?.[me.owner] || {};
  el.innerHTML = `<form class="card" id="bidform"><h2>Your bid for round ${round}</h2>
    ${plants.map((p) => plantCard(p, `<div class="bid"><label for="b_${p.id}" style="margin:0">Offer price</label>
      <input id="b_${p.id}" data-plant="${p.id}" type="number" inputmode="decimal" step="0.1" min="${c.minBid}" max="${c.priceCap}" value="${prev[p.id] ?? ''}" placeholder="€/MWh"><span class="muted">€/MWh</span></div>`)).join('')}
    <div class="row"><button class="big" type="submit">Submit bid</button><span id="bidmsg" class="small"></span></div></form>${rulesBox()}`;
  $('#bidform').onsubmit = async (e) => {
    e.preventDefault();
    if (game.meta.phase !== 'bidding' || game.meta.round !== round) return;
    const bids = {};
    for (const inp of el.querySelectorAll('input[data-plant]')) {
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
    el.querySelectorAll('input[data-plant]').forEach((inp) => delete inp.dataset.dirty);
  };
}

function myHeader() {
  const list = standings(game);
  const row = list.find((r) => r.id === me.owner);
  if (!row || !lastCleared()) return '';
  return `<div class="kpis" style="margin-top:1rem">
    <div class="kpi"><div class="v ${row.profit < 0 ? 'neg' : ''}">${eur(row.profit)}</div><div class="k">total profit</div></div>
    <div class="kpi"><div class="v">${row.rank} / ${list.length}</div><div class="k">rank</div></div></div>`;
}

function renderTop(plants) {
  const { phase, round } = game.meta;
  const el = $('#top');
  if (phase === 'bidding') {
    const rd = game.rounds?.[roundKey(round)] || {};
    el.innerHTML = `${myHeader()}<div class="card"><div class="row" style="justify-content:space-between">
        <h2 style="margin:0">Round ${round} of ${game.config.rounds}: bidding is open</h2><span class="timer" id="timer"></span></div>
      <div class="kpis" style="margin-top:.75rem">
        <div class="kpi"><div class="v">${num(rd.forecast)} MW</div><div class="k">demand forecast (±${game.config.uncertainty}%)</div></div>
        <div class="kpi"><div class="v">${num(totalCapacity(game))} MW</div><div class="k">total capacity in the market</div></div>
        <div class="kpi"><div class="v">${Object.keys(game.rounds?.[roundKey(round)]?.bids || {}).length} / ${new Set(values(game.plants).map((p) => p.owner)).size}</div><div class="k">bids submitted</div></div>
      </div></div>`;
  } else {
    el.innerHTML = myHeader();
  }
  tick();
}

function renderBottom(plants) {
  const { phase, round } = game.meta;
  const el = $('#bottom');
  const parts = [];
  if (phase === 'bidding') {
    const sub = game.rounds?.[roundKey(round)]?.submittedBy?.[me.owner];
    const msg = $('#bidmsg');
    if (msg && sub) msg.innerHTML = `<span class="pill ok">✓ Submitted${game.config.mode === 'team' ? ` by ${esc(sub.name)}` : ''}</span> <span class="muted">You can still change it until bidding closes.</span>`;
    if (msg && !sub && !msg.querySelector('.neg')) msg.innerHTML = '<span class="muted">Not submitted yet.</span>';
    // Show a teammate's submitted bid in every field this player hasn't edited.
    const current = game.rounds?.[roundKey(round)]?.bids?.[me.owner] || {};
    document.querySelectorAll('#bidform input[data-plant]').forEach((inp) => {
      inp.oninput = () => { inp.dataset.dirty = '1'; };
      if (!inp.dataset.dirty && current[inp.dataset.plant] != null) inp.value = current[inp.dataset.plant];
    });
  }
  const showRound = phase === 'results' ? round : phase === 'finished' ? lastCleared() : 0;
  if (phase === 'finished') {
    const row = standings(game).find((r) => r.id === me.owner);
    parts.push(`<div class="card"><h2>Game over! ${row?.rank === 1 ? '🏆 You won!' : ''}</h2><p>You finished <b>#${row?.rank ?? '–'}</b> with a total profit of <b>${eur(row?.profit ?? 0)}</b>. Look at the projector for the debrief.</p></div>`);
  }
  if (showRound) parts.push(roundResult(showRound, plants));
  if (phase === 'results' || phase === 'finished' || (phase === 'bidding' && round > 1)) {
    parts.push(historyCard());
    parts.push(`<div class="card"><h2>Leaderboard</h2><div class="scroll">${leaderboardTable(game, me.owner)}</div></div>`);
  }
  el.innerHTML = parts.join('');
}

function lastCleared() {
  for (let r = game.meta.round; r >= 1; r--) if (game.rounds?.[roundKey(r)]?.result) return r;
  return 0;
}

function roundResult(r, plants) {
  const rd = game.rounds?.[roundKey(r)];
  const res = rd?.result;
  if (!res) return '<div class="card"><p class="muted">Clearing the market…</p></div>';
  const mine = [...(res.offers || []), ...(res.notOffered || [])].filter((o) => o.owner === me.owner);
  const tot = res.perOwner?.[me.owner] || { profit: 0, revenue: 0, cost: 0 };
  const names = Object.fromEntries(Object.keys(game.participants || {}).map((id) => [id, ownerName(game, id)]));
  return `<div class="card"><h2>Round ${r} result</h2>
    <div class="kpis">
      <div class="kpi"><div class="v ${tot.profit < 0 ? 'neg' : tot.profit > 0 ? 'pos' : ''}">${eur(tot.profit)}</div><div class="k">your profit this round</div></div>
      <div class="kpi"><div class="v">${price(res.price)}</div><div class="k">clearing price</div></div>
      <div class="kpi"><div class="v">${num(res.demand)} MW</div><div class="k">actual demand (forecast ${num(rd.forecast)})</div></div>
    </div>
    <div class="scroll" style="margin-top:.75rem"><table class="tbl"><thead><tr><th>Plant</th><th class="n">Your bid</th><th class="n">Marginal cost</th><th class="n">Dispatched</th><th class="n">Revenue</th><th class="n">Cost</th><th class="n">Profit</th></tr></thead><tbody>
      ${mine.map((o) => `<tr><td>${esc(o.name)}</td><td class="n">${o.bid == null ? 'no bid' : price(o.bid)}${o.auto ? ' (auto)' : ''}</td><td class="n">${price(o.mc)}</td>
        <td class="n">${num(o.dispatched)} / ${num(o.capacity)} MW</td><td class="n">${eur(o.revenue)}</td><td class="n">${eur(o.cost)}</td><td class="n strong ${o.profit < 0 ? 'neg' : ''}">${eur(o.profit)}</td></tr>`).join('')}
    </tbody></table></div>
    <h3 style="margin-top:1rem">The merit order</h3>
    ${meritOrderChart(res, { names, highlight: me.owner, forecast: rd.forecast, showNames: game.config.showNames, width: 600 })}</div>`;
}

function historyCard() {
  const rows = [];
  for (let r = 1; r <= game.meta.round; r++) {
    const rd = game.rounds?.[roundKey(r)];
    if (!rd?.result) continue;
    const mine = [...(rd.result.offers || []), ...(rd.result.notOffered || [])].filter((o) => o.owner === me.owner);
    rows.push(`<tr><td>R${r}</td><td class="n">${num(rd.result.demand)} MW</td><td class="n">${price(rd.result.price)}</td>
      <td>${mine.map((o) => `${esc(o.name)}: ${o.bid == null ? 'no bid' : num(o.bid, 1)}`).join('<br>')}</td>
      <td class="n">${num(mine.reduce((s, o) => s + o.dispatched, 0))} MW</td>
      <td class="n strong ${(rd.result.perOwner?.[me.owner]?.profit ?? 0) < 0 ? 'neg' : ''}">${eur(rd.result.perOwner?.[me.owner]?.profit ?? 0)}</td></tr>`);
  }
  if (!rows.length) return '';
  return `<div class="card"><h2>Your history</h2><div class="scroll"><table class="tbl"><thead><tr><th>Round</th><th class="n">Demand</th><th class="n">Price</th><th>Your bids (€/MWh)</th><th class="n">Dispatched</th><th class="n">Profit</th></tr></thead><tbody>${rows.join('')}</tbody></table></div></div>`;
}

function tick() {
  const el = $('#timer');
  if (!el) return;
  if (!game || game.meta.phase !== 'bidding' || !game.meta.deadline) { el.textContent = ''; return; }
  const left = Math.max(0, Math.ceil((game.meta.deadline - Date.now()) / 1000));
  el.textContent = `⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  el.classList.toggle('low', left <= 10);
}

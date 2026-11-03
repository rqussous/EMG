import { getStore, mode } from './store.js';
import { TECH, makeRng, assignPlants, clearMarket } from './market.js';
import { meritOrderChart, markupProfitChart, markupByRoundChart } from './charts.js';
import {
  $, esc, num, eur, price, roundKey, values, plantsOf, totalCapacity, ownerName,
  techBadge, leaderboardTable, attachTooltips, download, resultsCsv,
} from './ui.js';

const store = await getStore();
const app = $('#app');
attachTooltips(app);

let code = new URLSearchParams(location.search).get('game')?.toUpperCase() || null;
let game = null;
let controlsKey = '';
let closing = false;
let showDebrief = false;
const pendingAssign = new Set();

const PHASE_LABEL = { lobby: 'Lobby: players joining', ready: 'Plants assigned', bidding: 'Bidding open', results: 'Results', finished: 'Game over' };
const gamePath = () => `games/${code}`;

if (code) start(); else renderCreate();

// ---------------------------------------------------------------------------
// Create game
// ---------------------------------------------------------------------------
function renderCreate() {
  const last = localStorage.getItem('mog_host_last');
  app.innerHTML = `
    ${mode === 'local' ? localBanner() : ''}
    ${last ? `<div class="card row"><span>Continue your last game <b>${esc(last)}</b>?</span><a class="btn secondary" href="host.html?game=${esc(last)}">Resume</a></div>` : ''}
    <form class="card" id="create">
      <h1>New game</h1>
      <div class="form-grid">
        <div>
          <label for="mode">Who bids?</label>
          <select id="mode">
            <option value="individual">Each student individually</option>
            <option value="team">Teams (shared plant fleet)</option>
          </select>
        </div>
        <div>
          <label for="per">Plants per ${'player / team'}</label>
          <input id="per" type="number" min="1" max="6" value="1">
        </div>
        <div id="teams-box" class="hidden" style="grid-column:1/-1">
          <label for="teams">Team names <span class="hint">(one per line)</span></label>
          <textarea id="teams" rows="4" style="width:100%;font:inherit;padding:.5rem;border:1px solid var(--line);border-radius:8px">Team A\nTeam B\nTeam C\nTeam D\nTeam E\nTeam F</textarea>
        </div>
        <div>
          <label for="rounds">Number of rounds</label>
          <input id="rounds" type="number" min="1" max="20" value="5">
        </div>
        <div>
          <label for="demand">Demand per round <span class="hint">(% of installed capacity)</span></label>
          <input id="demand" value="55, 70, 80, 65, 88">
        </div>
        <div>
          <label for="unc">Demand forecast error <span class="hint">(± %)</span></label>
          <input id="unc" type="number" min="0" max="30" step="0.5" value="4">
        </div>
        <div>
          <label for="cap">Price cap <span class="hint">(€/MWh)</span></label>
          <input id="cap" type="number" min="50" max="10000" value="500">
        </div>
        <div>
          <label for="pricing">Pricing rule</label>
          <select id="pricing">
            <option value="uniform">Pay-as-clear (uniform price)</option>
            <option value="pab">Pay-as-bid</option>
          </select>
        </div>
        <div>
          <label for="missing">Plants without a bid</label>
          <select id="missing">
            <option value="withhold">Are not offered (earn nothing)</option>
            <option value="mc">Bid their marginal cost automatically</option>
            <option value="cap">Bid the price cap automatically</option>
          </select>
        </div>
        <div>
          <label for="timer">Bidding timer <span class="hint">(seconds, 0 = close manually)</span></label>
          <input id="timer" type="number" min="0" max="900" value="90">
        </div>
        <div>
          <label for="names">Show owners in students' merit-order chart</label>
          <select id="names"><option value="1">Yes</option><option value="0">No (anonymous)</option></select>
        </div>
      </div>
      <p style="margin-top:1.2rem"><button class="big" type="submit">Create game</button></p>
    </form>`;
  const modeSel = $('#mode'), per = $('#per');
  modeSel.onchange = () => {
    $('#teams-box').classList.toggle('hidden', modeSel.value !== 'team');
    per.value = modeSel.value === 'team' ? 3 : 1;
  };
  $('#rounds').oninput = () => {
    const n = Math.max(1, +$('#rounds').value || 1);
    const cur = $('#demand').value.split(',').map((s) => s.trim()).filter(Boolean);
    const dflt = [55, 70, 80, 65, 88, 75, 92, 60, 85, 70];
    while (cur.length < n) cur.push(String(dflt[cur.length % dflt.length]));
    $('#demand').value = cur.slice(0, n).join(', ');
  };
  $('#create').onsubmit = async (e) => {
    e.preventDefault();
    const rounds = Math.max(1, Math.min(20, +$('#rounds').value || 5));
    const demand = $('#demand').value.split(',').map((s) => +s.trim()).filter((x) => x > 0);
    while (demand.length < rounds) demand.push(demand[demand.length - 1] || 70);
    const config = {
      mode: modeSel.value,
      plantsPer: Math.max(1, Math.min(6, +per.value || 1)),
      rounds,
      demand: demand.slice(0, rounds),
      uncertainty: Math.max(0, +$('#unc').value || 0),
      priceCap: Math.max(50, +$('#cap').value || 500),
      minBid: -100,
      pricing: $('#pricing').value,
      missing: $('#missing').value,
      timer: Math.max(0, +$('#timer').value || 0),
      showNames: $('#names').value === '1',
      seed: Math.floor(Math.random() * 2 ** 31),
    };
    code = await freeCode();
    const participants = {};
    if (config.mode === 'team') {
      $('#teams').value.split('\n').map((s) => s.trim()).filter(Boolean).forEach((name, i) => { participants[`t${i + 1}`] = { name }; });
      if (!Object.keys(participants).length) { alert('Please enter at least one team name.'); return; }
    }
    await store.set(gamePath(), { code, config, participants, meta: { phase: 'lobby', round: 0, createdAt: Date.now() } });
    history.replaceState(null, '', `host.html?game=${code}`);
    start();
  };
}

async function freeCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += letters[Math.floor(Math.random() * letters.length)];
    if (!(await store.get(`games/${c}/meta`))) return c;
  }
}

function localBanner() {
  return `<div class="banner"><b>Local demo mode.</b> No Firebase configured in <code>js/config.js</code>, so the game only
    syncs between tabs of <i>this</i> browser. Open the join link in a few more tabs to test. See README.md to set up classroom play.</div>`;
}

// ---------------------------------------------------------------------------
// Running a game
// ---------------------------------------------------------------------------
function start() {
  localStorage.setItem('mog_host_last', code);
  $('#hdr-game').textContent = `Game ${code}`;
  store.subscribe(gamePath(), (g) => {
    if (!g) { app.innerHTML = `<div class="card"><h2>Game ${esc(code)} not found</h2><p><a href="host.html">Create a new game</a></p></div>`; return; }
    game = g;
    autoAssign();
    render();
  });
  setInterval(tick, 500);
}

const joinUrl = () => new URL(`play.html?game=${code}`, location.href).href;

/** Owners who should receive plants: individual players, or teams with at least one member. */
function activeOwners() {
  const ids = Object.keys(game.participants || {});
  if (game.config.mode !== 'team') return ids;
  const withMembers = new Set(values(game.members).map((m) => m.team));
  return ids.filter((id) => withMembers.has(id));
}

/** Players who join after the start still get a plant. */
function autoAssign() {
  const phase = game.meta.phase;
  if (phase === 'lobby' || phase === 'finished') return;
  const owned = new Set(values(game.plants).map((p) => p.owner));
  const missing = activeOwners().filter((id) => !owned.has(id) && !pendingAssign.has(id));
  if (!missing.length) return;
  const startIdx = Object.keys(game.plants || {}).length + pendingAssign.size * game.config.plantsPer;
  missing.forEach((id) => pendingAssign.add(id));
  const plants = assignPlants(missing, game.config.plantsPer, makeRng(game.config.seed + startIdx), startIdx);
  const upd = {};
  plants.forEach((p) => { upd[`plants/${p.id}`] = p; });
  store.update(gamePath(), upd).then(() => missing.forEach((id) => pendingAssign.delete(id)));
}

async function startGame() {
  const owners = activeOwners();
  if (!owners.length) { alert('Nobody has joined yet.'); return; }
  const plants = assignPlants(owners, game.config.plantsPer, makeRng(game.config.seed), 0);
  const upd = { 'meta/phase': 'ready', 'meta/round': 0 };
  plants.forEach((p) => { upd[`plants/${p.id}`] = p; });
  await store.update(gamePath(), upd);
}

async function openRound(r, pct) {
  const forecast = Math.round((totalCapacity(game) * pct) / 100);
  const upd = {
    [`rounds/${roundKey(r)}`]: { forecast, pct, openedAt: Date.now() },
    'meta/phase': 'bidding',
    'meta/round': r,
    'meta/deadline': game.config.timer > 0 ? Date.now() + game.config.timer * 1000 : null,
  };
  closing = false;
  await store.update(gamePath(), upd);
}

async function closeRound() {
  if (closing) return;
  closing = true;
  const r = game.meta.round;
  const rd = game.rounds[roundKey(r)];
  const u = game.config.uncertainty / 100;
  const demand = Math.round(rd.forecast * (1 + (Math.random() * 2 - 1) * u));
  const result = clearMarket({
    plants: values(game.plants), bids: rd.bids, demand,
    priceCap: game.config.priceCap, pricing: game.config.pricing, missing: game.config.missing,
  });
  await store.update(gamePath(), {
    [`rounds/${roundKey(r)}/result`]: result,
    [`rounds/${roundKey(r)}/closedAt`]: Date.now(),
    'meta/phase': 'results',
    'meta/deadline': null,
  });
}

function tick() {
  const el = $('#timer');
  if (!game || game.meta.phase !== 'bidding' || !game.meta.deadline) { if (el) el.textContent = ''; return; }
  const left = Math.max(0, Math.ceil((game.meta.deadline - Date.now()) / 1000));
  if (el) { el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; el.classList.toggle('low', left <= 10); }
  if (left === 0) closeRound();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function render() {
  const { phase, round } = game.meta;
  $('#hdr-phase').textContent = phase === 'bidding' || phase === 'results' ? `Round ${round} / ${game.config.rounds} · ${PHASE_LABEL[phase]}` : PHASE_LABEL[phase];
  $('#hdr-phase').className = `pill ${phase === 'bidding' ? 'live' : ''}`;

  // Controls are only re-rendered when the phase changes, so inputs keep focus.
  const key = `${phase}|${round}`;
  if (key !== controlsKey || !$('#controls')) {
    controlsKey = key;
    app.innerHTML = `${mode === 'local' ? localBanner() : ''}<div id="join"></div><div class="card" id="controls"></div><div id="live"></div>`;
    renderControls();
  }
  renderJoin();
  renderLive();
}

function renderJoin() {
  const big = game.meta.phase === 'lobby' || game.meta.phase === 'ready';
  const url = joinUrl();
  let qr = '';
  if (big && window.qrcode) { const q = window.qrcode(0, 'M'); q.addData(url); q.make(); qr = q.createSvgTag({ cellSize: 5, margin: 2, scalable: true }); }
  const n = Object.keys(game.config.mode === 'team' ? game.members || {} : game.participants || {}).length;
  $('#join').innerHTML = big
    ? `<div class="card row" style="justify-content:space-between">
        <div><h3>Join on your phone or laptop</h3><div class="code">${esc(code)}</div>
          <p><a href="${esc(url)}" target="_blank">${esc(url)}</a></p><p class="muted">${n} joined</p></div>
        <div class="qr">${qr}</div></div>`
    : `<p class="muted small">Join: <a href="${esc(url)}" target="_blank">${esc(url)}</a> · code <b>${esc(code)}</b> · ${n} joined</p>`;
}

function renderControls() {
  const { phase, round } = game.meta;
  const c = game.config;
  const el = $('#controls');
  const nextPct = c.demand[round] ?? c.demand[c.demand.length - 1];
  const openForm = (label) => `
    <div class="row">
      <label for="pct" style="margin:0">Round ${round + 1} demand (% of installed capacity)</label>
      <input id="pct" type="number" min="5" max="150" value="${nextPct}" style="width:110px">
      <button id="open" class="big">${label}</button>
    </div>`;
  if (phase === 'lobby') {
    el.innerHTML = `<div class="row"><button id="startbtn" class="big">Start game: assign plants</button>
      <span class="muted">${c.mode === 'team' ? `${c.plantsPer} plants per team.` : `${c.plantsPer} plant(s) per player.`} Late joiners still get a plant.</span></div>`;
    $('#startbtn').onclick = startGame;
  } else if (phase === 'ready') {
    el.innerHTML = `<p>Plants are assigned. Students can now look at their plant(s).</p>${openForm('Open bidding for round 1')}`;
  } else if (phase === 'bidding') {
    el.innerHTML = `<div class="row"><span class="timer" id="timer"></span>
      <button id="close" class="big">Close bidding &amp; clear market</button></div>`;
    $('#close').onclick = closeRound;
  } else if (phase === 'results') {
    el.innerHTML = round < c.rounds
      ? `${openForm(`Open round ${round + 1}`)}<p class="small muted" style="margin-bottom:0">Or <a href="#" id="finish">end the game now</a>.</p>`
      : `<div class="row"><button id="finishbtn" class="big">Finish game &amp; show debrief</button></div>`;
    const f = $('#finish') || $('#finishbtn');
    if (f) f.onclick = (e) => { e.preventDefault(); store.update(gamePath(), { 'meta/phase': 'finished' }); };
  } else {
    el.innerHTML = `<div class="row"><h2 style="margin:0">Game over</h2><span class="spacer"></span>
      <button id="csv" class="secondary">Download results (CSV)</button><button id="json" class="secondary">Download raw game (JSON)</button>
      <a class="btn secondary" href="host.html" onclick="localStorage.removeItem('mog_host_last')">New game</a></div>`;
  }
  const open = $('#open');
  if (open) open.onclick = () => openRound(round + 1, Math.max(5, +$('#pct').value || nextPct));
  const csv = $('#csv');
  if (csv) {
    csv.onclick = () => download(`merit_order_game_${code}.csv`, resultsCsv(game));
    $('#json').onclick = () => download(`merit_order_game_${code}.json`, JSON.stringify(game, null, 2), 'application/json');
  }
}

function renderLive() {
  const { phase, round } = game.meta;
  const el = $('#live');
  const parts = [];
  if (phase === 'lobby') parts.push(lobbyView());
  if (phase === 'ready') parts.push(fleetView());
  if (phase === 'bidding') parts.push(biddingView());
  if (phase === 'results' || phase === 'finished') {
    const r = phase === 'finished' ? lastCleared() : round;
    if (r) parts.push(resultsView(r));
  }
  if (phase === 'results' || phase === 'finished') {
    parts.push(`<div class="card"><div class="row" style="justify-content:space-between"><h2>Leaderboard</h2>
      ${phase === 'results' ? `<button class="secondary" id="dbg">${showDebrief ? 'Hide' : 'Show'} debrief charts</button>` : ''}</div>
      <div class="scroll">${leaderboardTable(game)}</div></div>`);
    if (phase === 'finished' || showDebrief) parts.push(debriefView());
  }
  el.innerHTML = parts.join('');
  const dbg = $('#dbg');
  if (dbg) dbg.onclick = () => { showDebrief = !showDebrief; renderLive(); };
  const sel = $('#roundsel');
  if (sel) sel.onchange = () => { viewRound = +sel.value; renderLive(); };
}

function lobbyView() {
  if (game.config.mode === 'team') {
    const byTeam = {};
    values(game.members).forEach((m) => (byTeam[m.team] ||= []).push(m.name));
    return `<div class="card"><h2>Teams</h2><table class="tbl"><tbody>${Object.entries(game.participants).map(([id, t]) =>
      `<tr><td class="strong">${esc(t.name)}</td><td><div class="members">${(byTeam[id] || []).map((n) => `<span>${esc(n)}</span>`).join('') || '<span class="muted">no members yet</span>'}</div></td></tr>`).join('')}
      </tbody></table></div>`;
  }
  const names = values(game.participants).map((p) => p.name);
  return `<div class="card"><h2>Players (${names.length})</h2><div class="members">${names.map((n) => `<span>${esc(n)}</span>`).join('') || '<span class="muted">Waiting for players…</span>'}</div></div>`;
}

function fleetView() {
  const plants = values(game.plants).sort((a, b) => a.mc - b.mc);
  const byTech = {};
  plants.forEach((p) => { byTech[p.tech] = (byTech[p.tech] || 0) + p.capacity; });
  return `<div class="card"><h2>The market</h2>
    <div class="kpis"><div class="kpi"><div class="v">${plants.length}</div><div class="k">power plants</div></div>
      <div class="kpi"><div class="v">${num(totalCapacity(game))} MW</div><div class="k">installed capacity</div></div>
      <div class="kpi"><div class="v">${game.config.pricing === 'pab' ? 'Pay-as-bid' : 'Pay-as-clear'}</div><div class="k">pricing rule</div></div>
      <div class="kpi"><div class="v">${num(game.config.priceCap)} €</div><div class="k">price cap per MWh</div></div></div>
    <p class="muted small">Marginal costs are visible only to you and each plant's owner. Don't reveal the merit order yet!</p>
    <details><summary>Show all plants (instructor only)</summary><div class="scroll"><table class="tbl"><thead><tr><th>Owner</th><th>Plant</th><th>Technology</th><th class="n">Capacity (MW)</th><th class="n">Marginal cost</th></tr></thead><tbody>
    ${plants.map((p) => `<tr><td>${esc(ownerName(game, p.owner))}</td><td>${esc(p.name)}</td><td>${techBadge(p.tech)}</td><td class="n">${num(p.capacity)}</td><td class="n">${price(p.mc)}</td></tr>`).join('')}
    </tbody></table></div></details></div>`;
}

function biddingView() {
  const r = game.meta.round;
  const rd = game.rounds?.[roundKey(r)] || {};
  const owners = [...new Set(values(game.plants).map((p) => p.owner))];
  const done = owners.filter((id) => rd.bids?.[id]);
  return `<div class="card"><h2>Round ${r}: bidding</h2>
    <div class="kpis"><div class="kpi"><div class="v">${num(rd.forecast)} MW</div><div class="k">demand forecast (${rd.pct}% of capacity, ±${game.config.uncertainty}%)</div></div>
      <div class="kpi"><div class="v">${done.length} / ${owners.length}</div><div class="k">bids submitted</div></div></div>
    <div class="members" style="margin-top:1rem">${owners.map((id) => `<span class="${rd.bids?.[id] ? 'done' : ''}">${rd.bids?.[id] ? '✓ ' : ''}${esc(ownerName(game, id))}</span>`).join('')}</div></div>`;
}

let viewRound = null;
function lastCleared() {
  for (let r = game.meta.round; r >= 1; r--) if (game.rounds?.[roundKey(r)]?.result) return r;
  return 0;
}

function resultsView(defaultRound) {
  const cleared = [];
  for (let r = 1; r <= game.meta.round; r++) if (game.rounds?.[roundKey(r)]?.result) cleared.push(r);
  const r = cleared.includes(viewRound) && game.meta.phase === 'finished' ? viewRound : defaultRound;
  const rd = game.rounds[roundKey(r)];
  const res = rd.result;
  const offers = res.offers || [];
  const marginal = [...offers].reverse().find((o) => o.dispatched > 0);
  const names = Object.fromEntries(Object.keys(game.participants || {}).map((id) => [id, ownerName(game, id)]));
  const rows = [...offers, ...(res.notOffered || [])];
  return `<div class="card">
    <div class="row" style="justify-content:space-between"><h2>Round ${r}: market result</h2>
      ${game.meta.phase === 'finished' && cleared.length > 1 ? `<select id="roundsel" style="width:auto">${cleared.map((x) => `<option value="${x}" ${x === r ? 'selected' : ''}>Round ${x}</option>`).join('')}</select>` : ''}</div>
    <div class="kpis">
      <div class="kpi"><div class="v">${price(res.price)}</div><div class="k">clearing price</div></div>
      <div class="kpi"><div class="v">${num(res.demand)} MW</div><div class="k">actual demand (forecast ${num(rd.forecast)} MW)</div></div>
      <div class="kpi"><div class="v">${marginal ? esc(TECH[marginal.tech].label) : '–'}</div><div class="k">price-setting technology${marginal ? `: ${esc(marginal.name)}` : ''}</div></div>
      ${res.unserved > 0 ? `<div class="kpi"><div class="v neg">${num(res.unserved)} MW</div><div class="k">unserved demand → price cap!</div></div>` : ''}
    </div>
    <div style="margin-top:1rem">${meritOrderChart(res, { names, forecast: rd.forecast, showNames: true })}</div>
    <details style="margin-top:.75rem"><summary>Table of all offers</summary><div class="scroll"><table class="tbl"><thead><tr>
      <th>Owner</th><th>Plant</th><th>Technology</th><th class="n">Capacity</th><th class="n">Marginal cost</th><th class="n">Bid</th><th class="n">Mark-up</th><th class="n">Dispatched</th><th class="n">Profit</th></tr></thead><tbody>
      ${rows.map((o) => `<tr><td>${esc(names[o.owner] ?? o.owner)}</td><td>${esc(o.name)}</td><td>${techBadge(o.tech)}</td><td class="n">${num(o.capacity)} MW</td>
        <td class="n">${price(o.mc)}</td><td class="n">${o.bid == null ? 'no bid' : price(o.bid) + (o.auto ? ' (auto)' : '')}</td>
        <td class="n">${o.bid == null ? '' : num(o.bid - o.mc)}</td><td class="n">${num(o.dispatched)} MW</td><td class="n ${o.profit < 0 ? 'neg' : ''}">${eur(o.profit)}</td></tr>`).join('')}
    </tbody></table></div></details></div>`;
}

function debriefView() {
  const per = {};
  const rounds = [];
  for (let r = 1; r <= game.meta.round; r++) {
    const res = game.rounds?.[roundKey(r)]?.result;
    if (!res) continue;
    const mk = [];
    for (const o of res.offers || []) {
      if (o.auto) continue;
      const p = (per[o.owner] ||= { w: 0, s: 0 });
      p.w += o.capacity; p.s += o.capacity * (o.bid - o.mc);
      mk.push(o.bid - o.mc);
    }
    mk.sort((a, b) => a - b);
    if (mk.length) rounds.push({ round: r, price: res.price, median: mk.length % 2 ? mk[(mk.length - 1) / 2] : (mk[mk.length / 2 - 1] + mk[mk.length / 2]) / 2 });
  }
  const profit = {};
  for (let r = 1; r <= game.meta.round; r++) {
    const res = game.rounds?.[roundKey(r)]?.result;
    for (const [id, v] of Object.entries(res?.perOwner || {})) profit[id] = (profit[id] || 0) + v.profit;
  }
  const points = Object.entries(per).map(([id, p]) => ({ id, name: ownerName(game, id), markup: p.s / p.w, profit: profit[id] || 0 }));
  return `<div class="grid2">
    <div class="card"><h2>Did bidding above cost pay off?</h2><p class="muted small">One dot per ${game.config.mode === 'team' ? 'team' : 'player'}: capacity-weighted mark-up over all rounds vs. total profit.</p>${markupProfitChart(points)}</div>
    <div class="card"><h2>Mark-up over the rounds</h2><p class="muted small">Median of (bid − marginal cost) across all submitted offers.</p>${markupByRoundChart(rounds)}</div>
  </div>`;
}

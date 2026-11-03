import { getStore, mode } from './store.js';
import { TECH, TECH_ORDER, DEFAULT_CATALOGUE, clearMarket, drawAvailability } from './market.js';
import {
  $, esc, num, eur, price, roundKey, values, plantsOf, ownerName, techBadge, fleetChips, attachTooltips, download,
  resultsCsv, finances, owners, cleared, defaultDemand, countdown, outdatedGameMessage,
} from './ui.js';
import { PHASE_LABEL, joinCard, lobbyList, resultsCard, capacityMixCard, debriefView, demandOutlook, marketMix } from './views.js';

const store = await getStore();
const app = $('#app');
attachTooltips(app);

let code = new URLSearchParams(location.search).get('game')?.toUpperCase() || null;
let game = null;
let controlsKey = '';
let advancing = '';
let showDebrief = false;
let viewRound = null;
const gamePath = () => `games/${code}`;

if (code) start(); else renderCreate();

// ---------------------------------------------------------------------------
// Create game
// ---------------------------------------------------------------------------
function renderCreate() {
  const last = localStorage.getItem('mog_host_last');
  const cat = DEFAULT_CATALOGUE;
  app.innerHTML = `
    ${mode === 'local' ? localBanner() : ''}
    ${last ? `<div class="card row"><span>Continue your last game <b>${esc(last)}</b>?</span><a class="btn secondary" href="host.html?game=${esc(last)}">Resume</a></div>` : ''}
    <form class="card" id="create">
      <h1>New game</h1>
      <h3 style="margin-top:1rem">Players</h3>
      <div class="form-grid">
        <div><label for="mode">Who plays?</label>
          <select id="mode"><option value="team">Teams (shared money and fleet)</option><option value="individual">Each student individually</option></select></div>
        <div><label for="budget">Starting money per ${'team / player'} <span class="hint">(M€)</span></label>
          <input id="budget" type="number" min="1" step="1" value="50"></div>
        <div id="teams-box" style="grid-column:1/-1"><label for="teams">Team names <span class="hint">(one per line)</span></label>
          <textarea id="teams" rows="4">Team A\nTeam B\nTeam C\nTeam D\nTeam E\nTeam F</textarea></div>
      </div>
      <h3 style="margin-top:1rem">Rounds and demand</h3>
      <div class="form-grid">
        <div><label for="rounds">Number of rounds</label><input id="rounds" type="number" min="1" max="20" value="5"></div>
        <div><label for="demand">Demand per ${'team / player'} each round <span class="hint">(MW)</span></label>
          <input id="demand" value="400, 500, 600, 650, 700"></div>
        <div><label for="hours">Hours represented by one round</label><input id="hours" type="number" min="1" max="8760" value="1000"></div>
        <div><label for="unc">Demand forecast error <span class="hint">(± %)</span></label><input id="unc" type="number" min="0" max="30" step="0.5" value="4"></div>
      </div>
      <h3 style="margin-top:1rem">Market rules</h3>
      <div class="form-grid">
        <div><label for="cap">Price cap <span class="hint">(€/MWh)</span></label><input id="cap" type="number" min="50" max="10000" value="500"></div>
        <div><label for="pricing">Pricing rule</label><select id="pricing"><option value="uniform">Pay-as-clear (uniform price)</option><option value="pab">Pay-as-bid</option></select></div>
        <div><label for="missing">Plants without a bid</label><select id="missing">
          <option value="withhold">Are not offered (earn nothing)</option><option value="mc">Bid their marginal cost automatically</option><option value="cap">Bid the price cap automatically</option></select></div>
        <div><label for="salvage">Plant value at the end <span class="hint">(% of purchase price, counts towards net worth)</span></label><input id="salvage" type="number" min="0" max="100" value="50"></div>
        <div><label for="itimer">Investment timer <span class="hint">(s, 0 = manual)</span></label><input id="itimer" type="number" min="0" max="900" value="120"></div>
        <div><label for="btimer">Bidding timer <span class="hint">(s, 0 = manual)</span></label><input id="btimer" type="number" min="0" max="900" value="90"></div>
        <div><label for="names">Show owners in the public merit-order chart</label><select id="names"><option value="1">Yes</option><option value="0">No (anonymous)</option></select></div>
      </div>
      <h3 style="margin-top:1rem">Power plant shop</h3>
      <div class="scroll"><table class="tbl" id="cat"><thead><tr><th>Sell?</th><th>Technology</th><th>Unit size (MW)</th><th>Marginal cost (€/MWh)</th>
        <th>Price per unit (M€)</th><th>Availability min–max (%)</th></tr></thead><tbody>
        ${TECH_ORDER.map((t) => `<tr data-tech="${t}"><td><input type="checkbox" class="en" checked style="width:auto"></td><td>${techBadge(t)}</td>
          <td><input class="unit" type="number" min="1" value="${cat[t].unit}"></td><td><input class="mc" type="number" step="0.5" value="${cat[t].mc}"></td>
          <td><input class="cost" type="number" min="0" step="0.1" value="${cat[t].cost / 1e6}"></td>
          <td class="row" style="flex-wrap:nowrap"><input class="alo" type="number" min="0" max="100" value="${cat[t].avail[0] * 100}"><input class="ahi" type="number" min="0" max="100" value="${cat[t].avail[1] * 100}"></td></tr>`).join('')}
      </tbody></table></div>
      <p class="small muted">Availability below 100% means only part of the capacity can produce in a round (wind and solar depend on the weather, drawn when bidding opens).</p>
      <p style="margin-top:1.2rem"><button class="big" type="submit">Create game</button></p>
    </form>`;
  const modeSel = $('#mode');
  modeSel.onchange = () => $('#teams-box').classList.toggle('hidden', modeSel.value !== 'team');
  $('#rounds').oninput = () => {
    const n = Math.max(1, +$('#rounds').value || 1);
    const cur = $('#demand').value.split(',').map((s) => s.trim()).filter(Boolean);
    while (cur.length < n) cur.push(String(Math.round((+cur[cur.length - 1] || 500) * 1.08 / 10) * 10));
    $('#demand').value = cur.slice(0, n).join(', ');
  };
  $('#create').onsubmit = async (e) => {
    e.preventDefault();
    const rounds = Math.max(1, Math.min(20, +$('#rounds').value || 5));
    const demand = $('#demand').value.split(',').map((s) => +s.trim()).filter((x) => x > 0);
    while (demand.length < rounds) demand.push(demand[demand.length - 1] || 500);
    const catalogue = {};
    for (const tr of document.querySelectorAll('#cat tbody tr')) {
      const lo = Math.min(100, Math.max(0, +$('.alo', tr).value)) / 100, hi = Math.min(100, Math.max(0, +$('.ahi', tr).value)) / 100;
      catalogue[tr.dataset.tech] = {
        enabled: $('.en', tr).checked,
        unit: Math.max(1, +$('.unit', tr).value || 1),
        mc: +$('.mc', tr).value || 0,
        cost: Math.round((+$('.cost', tr).value || 0) * 1e6),
        avail: [Math.min(lo, hi), Math.max(lo, hi)],
      };
    }
    if (!Object.values(catalogue).some((c) => c.enabled)) { alert('Enable at least one technology in the shop.'); return; }
    const config = {
      mode: modeSel.value,
      budget: Math.max(1, +$('#budget').value || 50) * 1e6,
      rounds,
      demandPerOwner: demand.slice(0, rounds),
      hours: Math.max(1, +$('#hours').value || 1000),
      uncertainty: Math.max(0, +$('#unc').value || 0),
      priceCap: Math.max(50, +$('#cap').value || 500),
      minBid: -100,
      pricing: $('#pricing').value,
      missing: $('#missing').value,
      salvage: Math.min(100, Math.max(0, +$('#salvage').value || 0)),
      investTimer: Math.max(0, +$('#itimer').value || 0),
      bidTimer: Math.max(0, +$('#btimer').value || 0),
      showNames: $('#names').value === '1',
      catalogue,
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
// Game flow: lobby → [invest → bidding → results] × rounds → finished
// ---------------------------------------------------------------------------
function start() {
  localStorage.setItem('mog_host_last', code);
  $('#hdr-game').textContent = `Game ${code}`;
  store.subscribe(gamePath(), (g) => {
    if (!g) { app.innerHTML = `<div class="card"><h2>Game ${esc(code)} not found</h2><p><a href="host.html">Create a new game</a></p></div>`; return; }
    if (outdatedGameMessage(g)) {
      localStorage.removeItem('mog_host_last');
      app.innerHTML = `${outdatedGameMessage(g)}<p><a class="btn" href="host.html">Create a new game</a></p>`;
      return;
    }
    game = g;
    render();
  });
  setInterval(tick, 500);
}

async function openInvest(r, forecast) {
  advancing = '';
  await store.update(gamePath(), {
    [`rounds/${roundKey(r)}`]: { forecast, openedAt: Date.now() },
    'meta/phase': 'invest',
    'meta/round': r,
    'meta/deadline': game.config.investTimer > 0 ? Date.now() + game.config.investTimer * 1000 : null,
  });
}

/** Close the shop: undo the latest purchases of anyone who overspent (e.g. two teammates buying at once), then open bidding. */
async function closeInvest() {
  const r = game.meta.round;
  const upd = {};
  for (const f of finances(game)) {
    let cash = f.cash;
    const recent = plantsOf(game, f.id).filter((p) => p.round === r).sort((a, b) => (b.boughtAt || 0) - (a.boughtAt || 0));
    for (const p of recent) {
      if (cash >= 0) break;
      upd[`plants/${p.id}`] = null;
      cash += p.cost;
    }
  }
  upd[`rounds/${roundKey(r)}/avail`] = drawAvailability(game.config.catalogue);
  upd['meta/phase'] = 'bidding';
  upd['meta/deadline'] = game.config.bidTimer > 0 ? Date.now() + game.config.bidTimer * 1000 : null;
  await store.update(gamePath(), upd);
}

async function closeBidding() {
  const r = game.meta.round;
  const rd = game.rounds[roundKey(r)];
  const u = game.config.uncertainty / 100;
  const demand = Math.round(rd.forecast * (1 + (Math.random() * 2 - 1) * u));
  const result = clearMarket({
    plants: values(game.plants), bids: rd.bids, demand, avail: rd.avail, hours: game.config.hours,
    priceCap: game.config.priceCap, pricing: game.config.pricing, missing: game.config.missing,
  });
  await store.update(gamePath(), {
    [`rounds/${roundKey(r)}/result`]: result,
    [`rounds/${roundKey(r)}/closedAt`]: Date.now(),
    'meta/phase': 'results',
    'meta/deadline': null,
  });
}

/** Run each transition at most once, even if the timer fires several times. */
function advance(fn) {
  const key = `${game.meta.phase}|${game.meta.round}`;
  if (advancing === key) return;
  advancing = key;
  fn().catch((e) => { advancing = ''; alert(e.message); });
}

function tick() {
  const el = $('#timer');
  const cd = countdown(game);
  if (el) { el.textContent = cd ? `⏱ ${cd.text}` : ''; el.classList.toggle('low', !!cd && cd.left <= 10); }
  if (cd && cd.left === 0) advance(game.meta.phase === 'invest' ? closeInvest : closeBidding);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function render() {
  const { phase, round } = game.meta;
  $('#hdr-phase').textContent = round ? `Round ${round} / ${game.config.rounds} · ${PHASE_LABEL[phase]}` : PHASE_LABEL[phase];
  $('#hdr-phase').className = `pill ${phase === 'invest' || phase === 'bidding' ? 'live' : ''}`;
  // Controls are only re-rendered when the phase changes, so inputs keep focus.
  const key = `${phase}|${round}`;
  if (key !== controlsKey || !$('#controls')) {
    controlsKey = key;
    app.innerHTML = `${mode === 'local' ? localBanner() : ''}
      <div class="row toolbar"><a class="btn secondary" href="screen.html?game=${esc(code)}" target="_blank">📽️ Open projector screen</a>
        <span class="muted small">Share that window with the class. This page shows private data (bids, fleets): keep it on your own screen.</span></div>
      <div id="join"></div><div class="card" id="controls"></div><div id="live"></div>`;
    renderControls();
  }
  $('#join').innerHTML = joinCard(game, phase === 'lobby');
  // Keep the suggested demand in step with the number of players, unless the host typed a value.
  const dem = $('#dem');
  if (dem) {
    dem.oninput = () => { dem.dataset.dirty = '1'; };
    if (!dem.dataset.dirty) dem.value = defaultDemand(game, phase === 'lobby' ? 1 : round + 1);
  }
  renderLive();
  tick();
}

function renderControls() {
  const { phase, round } = game.meta;
  const c = game.config;
  const el = $('#controls');
  const openForm = (r, label) => `
    <div class="row">
      <label for="dem" style="margin:0">Round ${r} demand forecast (MW)</label>
      <input id="dem" type="number" min="1" value="${defaultDemand(game, r)}" style="width:130px">
      <button id="open" class="big">${label}</button>
    </div>
    <p class="small muted" style="margin-bottom:0">Suggested: ${num(c.demandPerOwner[r - 1] ?? c.demandPerOwner[c.demandPerOwner.length - 1])} MW × number of ${c.mode === 'team' ? 'teams with members' : 'players'}.</p>`;
  if (phase === 'lobby') {
    el.innerHTML = openForm(1, 'Start game: open the shop for round 1');
  } else if (phase === 'invest') {
    el.innerHTML = `<div class="row"><span class="timer" id="timer"></span><button id="next" class="big">Close shop &amp; open bidding</button>
      <span class="muted">Players are buying power plants.</span></div>`;
    $('#next').onclick = () => advance(closeInvest);
  } else if (phase === 'bidding') {
    el.innerHTML = `<div class="row"><span class="timer" id="timer"></span><button id="next" class="big">Close bidding &amp; clear market</button></div>`;
    $('#next').onclick = () => advance(closeBidding);
  } else if (phase === 'results') {
    el.innerHTML = round < c.rounds
      ? `${openForm(round + 1, `Open the shop for round ${round + 1}`)}<p class="small muted" style="margin-bottom:0">Or <a href="#" id="finish">end the game now</a>.</p>`
      : `<div class="row"><button id="finish" class="big">Finish game &amp; show debrief</button></div>`;
    $('#finish').onclick = (e) => { e.preventDefault(); store.update(gamePath(), { 'meta/phase': 'finished' }); };
  } else {
    el.innerHTML = `<div class="row"><h2 style="margin:0">Game over</h2><span class="spacer"></span>
      <button id="csv" class="secondary">Download results (CSV)</button><button id="json" class="secondary">Download raw game (JSON)</button>
      <a class="btn secondary" href="host.html" onclick="localStorage.removeItem('mog_host_last')">New game</a></div>`;
    $('#csv').onclick = () => download(`merit_order_game_${code}.csv`, resultsCsv(game));
    $('#json').onclick = () => download(`merit_order_game_${code}.json`, JSON.stringify(game, null, 2), 'application/json');
  }
  const open = $('#open');
  if (open) {
    open.onclick = () => {
      if (!owners(game).length) { alert('Nobody has joined yet.'); return; }
      const r = phase === 'lobby' ? 1 : round + 1;
      advance(() => openInvest(r, Math.max(1, Math.round(+$('#dem').value) || defaultDemand(game, r))));
    };
  }
}

function renderLive() {
  const { phase, round } = game.meta;
  const parts = [];
  if (phase === 'lobby') {
    parts.push(lobbyList(game));
  } else {
    const rd = game.rounds?.[roundKey(round)] || {};
    if (phase === 'invest' || phase === 'bidding') {
      parts.push(`<div class="card"><h2>Round ${round}: ${PHASE_LABEL[phase].toLowerCase()}</h2><div class="kpis">
        <div class="kpi"><div class="v">${num(rd.forecast)} MW</div><div class="k">demand forecast</div></div>
        ${phase === 'bidding' ? Object.entries(rd.avail || {}).filter(([, a]) => a < 1 && a > 0).map(([t, a]) => `<div class="kpi"><div class="v">${Math.round(a * 100)}%</div><div class="k">${esc(TECH[t].label)} availability</div></div>`).join('') : ''}
        </div><h3 style="margin-top:1rem">Installed capacity in the market</h3>${marketMix(game)}</div>`);
    }
    parts.push(teamsTable());
    if (phase === 'bidding' || phase === 'results' || phase === 'finished') parts.push(bidsTable());
    if (values(game.plants).length) parts.push(capacityMixCard(game));
    const done = cleared(game);
    if (done.length && (phase === 'results' || phase === 'finished')) {
      const r = done.includes(viewRound) ? viewRound : done[done.length - 1];
      const select = done.length > 1 ? `<select id="roundsel" style="width:auto">${done.map((x) => `<option value="${x}" ${x === r ? 'selected' : ''}>Round ${x}</option>`).join('')}</select>` : '';
      parts.push(resultsCard(game, r, { table: true, select }));
      parts.push(`<div class="row"><button class="secondary" id="dbg">${showDebrief || phase === 'finished' ? 'Hide' : 'Show'} debrief charts</button></div>`);
      if (showDebrief || phase === 'finished') parts.push(debriefView(game));
    }
    parts.push(`<div class="card"><h3>Demand outlook</h3>${demandOutlook(game)}</div>`);
  }
  $('#live').innerHTML = parts.join('');
  const dbg = $('#dbg');
  if (dbg) dbg.onclick = () => { showDebrief = !showDebrief; renderLive(); };
  const sel = $('#roundsel');
  if (sel) sel.onchange = () => { viewRound = +sel.value; renderLive(); };
}

/** Private overview: one row per team/player. */
function teamsTable() {
  const { phase, round } = game.meta;
  const rd = game.rounds?.[roundKey(round)] || {};
  const members = {};
  values(game.members).forEach((m) => (members[m.team] ||= []).push(m.name));
  const last = cleared(game).slice(-1)[0];
  const team = game.config.mode === 'team';
  const rows = finances(game).map((f) => {
    const plants = plantsOf(game, f.id);
    const status = phase === 'invest' ? (f.investedNow ? `<span class="pill ok">bought ${eur(f.investedNow)}</span>` : '<span class="muted">–</span>')
      : phase === 'bidding' ? (rd.bids?.[f.id] ? `<span class="pill ok">✓ bid${rd.submittedBy?.[f.id] ? ` (${esc(rd.submittedBy[f.id].name)})` : ''}</span>` : '<span class="pill">waiting</span>')
        : '';
    return `<tr><td>${f.rank}</td><td class="strong">${esc(f.name)}${team ? `<div class="small muted">${esc((members[f.id] || []).join(', '))}</div>` : ''}</td>
      <td><div class="chips">${fleetChips(plants)}</div></td><td class="n">${num(f.fleetMW)} MW</td>
      <td class="n">${eur(f.invested)}</td><td class="n ${f.cash < 0 ? 'neg' : ''}">${eur(f.cash)}</td>
      <td class="n ${(f.rounds[last] ?? 0) < 0 ? 'neg' : ''}">${last ? eur(f.rounds[last] ?? 0) : '–'}</td>
      <td class="n">${eur(f.opProfit)}</td><td class="n strong">${eur(f.netWorth)}</td><td>${status}</td></tr>`;
  });
  return `<div class="card"><h2>${team ? 'Teams' : 'Players'} <span class="muted small">(private)</span></h2><div class="scroll"><table class="tbl"><thead><tr>
    <th>#</th><th>${team ? 'Team' : 'Player'}</th><th>Fleet</th><th class="n">Capacity</th><th class="n">Invested</th><th class="n">Cash</th>
    <th class="n">${last ? `Profit R${last}` : 'Last profit'}</th><th class="n">Total op. profit</th><th class="n">Net worth</th><th>This round</th></tr></thead>
    <tbody>${rows.join('')}</tbody></table></div></div>`;
}

/** Private: every plant's bid in the current round (live during bidding). */
function bidsTable() {
  const { phase, round } = game.meta;
  const rd = game.rounds?.[roundKey(round)] || {};
  const res = rd.result;
  const resById = Object.fromEntries([...(res?.offers || []), ...(res?.notOffered || [])].map((o) => [o.id, o]));
  const rows = [];
  for (const f of finances(game)) {
    const plants = plantsOf(game, f.id);
    plants.forEach((p, i) => {
      const bid = rd.bids?.[f.id]?.[p.id];
      const o = resById[p.id];
      const avail = (rd.avail?.[p.tech] ?? 1) * p.capacity;
      rows.push(`<tr class="${i === 0 ? 'group' : ''}"><td>${i === 0 ? `<b>${esc(f.name)}</b>` : ''}</td><td>${esc(p.name)}</td><td>${techBadge(p.tech)}</td>
        <td class="n">${num(avail)} / ${num(p.capacity)} MW</td><td class="n">${price(p.mc)}</td>
        <td class="n">${bid == null ? '<span class="muted">–</span>' : price(bid)}</td>
        <td class="n ${bid != null && bid - p.mc < 0 ? 'neg' : ''}">${bid == null ? '' : num(bid - p.mc, 1)}</td>
        ${res ? `<td class="n">${o ? num(o.dispatched) : 0} MW</td><td class="n ${o?.profit < 0 ? 'neg' : ''}">${eur(o?.profit ?? 0)}</td>` : ''}</tr>`);
    });
  }
  return `<div class="card"><h2>Bids in round ${round} <span class="muted small">(private${phase === 'bidding' ? ', live' : ''})</span></h2>
    <div class="scroll"><table class="tbl"><thead><tr><th>${game.config.mode === 'team' ? 'Team' : 'Player'}</th><th>Plant</th><th>Technology</th><th class="n">Available</th>
    <th class="n">Marginal cost</th><th class="n">Bid</th><th class="n">Mark-up</th>${res ? '<th class="n">Dispatched</th><th class="n">Profit</th>' : ''}</tr></thead>
    <tbody>${rows.join('') || '<tr><td colspan="9" class="muted">No plants yet.</td></tr>'}</tbody></table></div></div>`;
}

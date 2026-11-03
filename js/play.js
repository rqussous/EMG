import { getStore, mode, randomId } from './store.js';
import { TECH, TECH_ORDER } from './market.js';
import { meritOrderChart } from './charts.js';
import {
  $, esc, num, eur, price, roundKey, values, plantsOf, ownerName, leaderboardTable, attachTooltips, finances, cleared, countdown,
} from './ui.js';
import { catalogueTable, demandOutlook, marketMix, availabilityKpis } from './views.js';

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

// Buy / sell buttons (event delegation, so re-rendering doesn't lose handlers).
app.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-buy],[data-sell]');
  if (!b || b.disabled) return;
  b.disabled = true;
  try {
    if (b.dataset.buy) await buy(b.dataset.buy);
    else await sell(b.dataset.sell);
  } finally { b.disabled = false; }
});

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
const myFin = () => finances(game).find((f) => f.id === me.owner)
  || { cash: game.config.budget, netWorth: game.config.budget, invested: 0, opProfit: 0, fleetMW: 0, rank: '–', rounds: {} };

async function buy(tech) {
  const { phase, round } = game.meta;
  const k = game.config.catalogue[tech];
  if (phase !== 'invest' || !k?.enabled) return;
  if (myFin().cash < k.cost) { flash('Not enough cash for this plant.'); return; }
  const id = `p${randomId(8)}`;
  const n = plantsOf(game, me.owner).filter((p) => p.tech === tech).length + 1;
  await store.update(gamePath, {
    [`plants/${id}`]: {
      id, owner: me.owner, tech, capacity: k.unit, mc: k.mc, cost: k.cost, round,
      name: `${TECH[tech].short} ${n}`, boughtBy: me.name, boughtAt: Date.now(),
    },
  });
}

async function sell(id) {
  const p = game.plants?.[id];
  if (!p || p.owner !== me.owner || p.round !== game.meta.round || game.meta.phase !== 'invest') return;
  await store.update(gamePath, { [`plants/${id}`]: null });
}

function flash(msg) {
  const el = $('#flash');
  if (el) { el.textContent = msg; setTimeout(() => { el.textContent = ''; }, 3000); }
}

// ---------------------------------------------------------------------------
function render() {
  const { phase, round } = game.meta;
  const team = game.config.mode === 'team';
  $('#hdr-me').textContent = team ? `${me.name} · ${ownerName(game, me.owner)}` : me.name;
  const plants = plantsOf(game, me.owner);
  // The bid form is only rebuilt when the phase or the fleet changes, so typed bids survive updates.
  const key = `${phase}|${round}|${plants.map((p) => p.id).join(',')}`;
  if (key !== formKey) {
    formKey = key;
    app.innerHTML = '<div id="top"></div><div id="main"></div><div id="bottom"></div>';
    if (phase === 'bidding') renderBidForm(plants);
  }
  renderTop();
  if (phase !== 'bidding') renderMain(plants);
  renderBottom(plants);
  tick();
}

function rulesBox() {
  const c = game.config;
  return `<details class="card"><summary><b>How the game works</b></summary>
    <ul>
      <li>Your ${c.mode === 'team' ? 'team starts' : 'start'} with <b>${eur(c.budget)}</b>. Each round has two steps:
        first you can <b>buy power plants</b> from the shop, then you <b>bid</b> their electricity into the market.</li>
      <li>Plants stay in your fleet for the rest of the game. One round represents <b>${num(c.hours)} hours</b> with the same conditions.</li>
      <li>Demand is fixed: consumers buy the forecast amount (±${c.uncertainty}%) whatever the price.</li>
      <li>For each plant you submit a <b>price (€/MWh)</b> at which you are willing to sell its available capacity (${c.minBid} to ${num(c.priceCap)} €/MWh).
        Wind and solar can only produce part of their capacity, depending on the weather that round.</li>
      <li>All offers are sorted from cheapest to most expensive and accepted until demand is covered.</li>
      ${c.pricing === 'pab'
        ? '<li><b>Pay-as-bid:</b> every accepted plant is paid <i>its own bid</i>.</li>'
        : '<li><b>Pay-as-clear:</b> the most expensive accepted offer sets the <i>clearing price</i>, and every accepted plant is paid that same price.</li>'}
      <li>If offers cannot cover demand, the price goes to the price cap of ${num(c.priceCap)} €/MWh.</li>
      <li>Operating profit = (price received − marginal cost) × MWh produced. Plants that are not accepted earn nothing.</li>
      ${c.missing === 'withhold' ? '<li>Plants without a bid are not offered.</li>' : ''}
      <li>Ranking: <b>net worth</b> = cash + your plants valued at ${c.salvage}% of what you paid for them.</li>
    </ul></details>`;
}

function renderTop() {
  const { phase, round } = game.meta;
  const f = myFin();
  const c = game.config;
  const rd = game.rounds?.[roundKey(round)] || {};
  const kpis = phase === 'lobby' ? '' : `<div class="kpis" style="margin-top:1rem">
    <div class="kpi"><div class="v ${f.cash < 0 ? 'neg' : ''}">${eur(f.cash)}</div><div class="k">cash</div></div>
    <div class="kpi"><div class="v">${num(f.fleetMW)} MW</div><div class="k">your capacity</div></div>
    <div class="kpi"><div class="v">${eur(f.netWorth)}</div><div class="k">net worth${cleared(game).length ? ` · rank ${f.rank} / ${finances(game).length}` : ''}</div></div></div>`;
  let banner = '';
  if (phase === 'invest') {
    banner = `<div class="card"><div class="row" style="justify-content:space-between"><h2 style="margin:0">Round ${round} of ${c.rounds}: buy power plants</h2><span class="timer" id="timer"></span></div>
      <div class="kpis" style="margin-top:.75rem"><div class="kpi"><div class="v">${num(rd.forecast)} MW</div><div class="k">demand forecast this round</div></div></div></div>`;
  } else if (phase === 'bidding') {
    banner = `<div class="card"><div class="row" style="justify-content:space-between"><h2 style="margin:0">Round ${round} of ${c.rounds}: bidding is open</h2><span class="timer" id="timer"></span></div>
      <div class="kpis" style="margin-top:.75rem">
        <div class="kpi"><div class="v">${num(rd.forecast)} MW</div><div class="k">demand forecast (±${c.uncertainty}%)</div></div>
        <div class="kpi"><div class="v">${num(values(game.plants).reduce((s, p) => s + p.capacity * (rd.avail?.[p.tech] ?? 1), 0))} MW</div><div class="k">available capacity in the market</div></div>
        ${availabilityKpis(rd, game)}</div></div>`;
  }
  $('#top').innerHTML = kpis + banner;
}

function plantRow(p, extra = '') {
  const t = TECH[p.tech];
  return `<div class="plant">
    <div class="icon" style="background:${t.color}22">${t.icon}</div>
    <div class="pname">${esc(p.name)} <span class="muted small">${esc(t.label)}</span></div>
    <div class="facts"><span>Capacity <b>${num(p.capacity)} MW</b></span><span>Marginal cost <b>${price(p.mc)}</b></span>${p.round ? `<span class="small">bought in round ${p.round} for ${eur(p.cost)}${game.config.mode === 'team' && p.boughtBy ? ` by ${esc(p.boughtBy)}` : ''}</span>` : ''}</div>
    ${extra}</div>`;
}

function renderMain(plants) {
  const { phase, round } = game.meta;
  const c = game.config;
  const el = $('#main');
  if (phase === 'lobby') {
    el.innerHTML = `<div class="card"><h2>You're in, ${esc(me.name)}! 🎉</h2><p class="muted">Waiting for the instructor to open the shop…</p></div>
      <div class="card"><h3>The power plant shop</h3>${catalogueTable(game)}</div>${rulesBox()}`;
    return;
  }
  if (phase === 'invest') {
    const cash = myFin().cash;
    el.innerHTML = `<div class="card"><h2>Shop</h2><p class="small muted">Buy as many plants as you like (and can afford). Plants bought this round can be returned for a full refund until the shop closes.</p>
      <div class="shop">${TECH_ORDER.filter((t) => c.catalogue[t]?.enabled).map((t) => {
        const k = c.catalogue[t], T = TECH[t];
        const [lo, hi] = k.avail;
        return `<div class="shop-item"><div class="icon" style="background:${T.color}22">${T.icon}</div>
          <div><div class="strong">${esc(T.label)}</div><div class="small muted">${num(k.unit)} MW · MC ${price(k.mc)}${lo < 1 ? ` · ${Math.round(lo * 100)}–${Math.round(hi * 100)}% available` : ''}</div></div>
          <button data-buy="${t}" ${cash < k.cost ? 'disabled' : ''}>Buy ${eur(k.cost)}</button></div>`;
      }).join('')}</div><p id="flash" class="neg small"></p></div>
      <div class="card"><h2>Your fleet</h2>${plants.map((p) => plantRow(p, p.round === round ? `<div class="bid"><button class="secondary" data-sell="${p.id}">Return (+${eur(p.cost)})</button></div>` : '')).join('') || '<p class="muted">No plants yet. Buy some in the shop above!</p>'}</div>
      <div class="card"><h3>Installed capacity in the market (all players)</h3>${marketMix(game)}<h3 style="margin-top:1rem">Demand outlook</h3>${demandOutlook(game)}</div>${rulesBox()}`;
    return;
  }
  el.innerHTML = '';
}

function renderBidForm(plants) {
  const { round } = game.meta;
  const c = game.config;
  const rd = game.rounds?.[roundKey(round)] || {};
  const prev = rd.bids?.[me.owner] || {};
  const el = $('#main');
  if (!plants.length) { el.innerHTML = `<div class="card"><h2>No plants to bid</h2><p class="muted">You didn't buy any power plants, so you sit this round out. You can buy plants in the next round.</p></div>${rulesBox()}`; return; }
  el.innerHTML = `<form class="card" id="bidform"><h2>Your bids for round ${round}</h2>
    ${plants.map((p) => {
      const a = rd.avail?.[p.tech] ?? 1;
      return plantRow(p, `<div class="bid"><label for="b_${p.id}" style="margin:0">Offer price</label>
        <input id="b_${p.id}" data-plant="${p.id}" type="number" inputmode="decimal" step="0.1" min="${c.minBid}" max="${c.priceCap}" value="${prev[p.id] ?? ''}" placeholder="€/MWh"><span class="muted">€/MWh</span>
        ${a < 1 ? `<span class="small muted">available this round: ${num(p.capacity * a)} MW (${Math.round(a * 100)}%)</span>` : ''}</div>`);
    }).join('')}
    <div class="row"><button class="big" type="submit">Submit bids</button><span id="bidmsg" class="small"></span></div></form>${rulesBox()}`;
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

function renderBottom() {
  const { phase, round } = game.meta;
  const parts = [];
  if (phase === 'bidding') {
    const rd = game.rounds?.[roundKey(round)] || {};
    const sub = rd.submittedBy?.[me.owner];
    const msg = $('#bidmsg');
    if (msg && sub) msg.innerHTML = `<span class="pill ok">✓ Submitted${game.config.mode === 'team' ? ` by ${esc(sub.name)}` : ''}</span> <span class="muted">You can still change it until bidding closes.</span>`;
    if (msg && !sub && !msg.querySelector('.neg')) msg.innerHTML = '<span class="muted">Not submitted yet.</span>';
    // Show a teammate's submitted bid in every field this player hasn't edited.
    const current = rd.bids?.[me.owner] || {};
    document.querySelectorAll('#bidform input[data-plant]').forEach((inp) => {
      inp.oninput = () => { inp.dataset.dirty = '1'; };
      if (!inp.dataset.dirty && current[inp.dataset.plant] != null) inp.value = current[inp.dataset.plant];
    });
  }
  const done = cleared(game);
  const showRound = phase === 'results' ? round : phase === 'finished' ? done[done.length - 1] : 0;
  if (phase === 'finished') {
    const f = myFin();
    parts.push(`<div class="card"><h2>Game over! ${f.rank === 1 ? '🏆 You won!' : ''}</h2><p>You finished <b>#${f.rank}</b> with a net worth of <b>${eur(f.netWorth)}</b>. Look at the projector for the debrief.</p></div>`);
  }
  if (showRound) parts.push(roundResult(showRound));
  if (done.length && phase !== 'lobby') {
    parts.push(historyCard());
    parts.push(`<div class="card"><h2>Leaderboard</h2><div class="scroll">${leaderboardTable(game, me.owner)}</div></div>`);
  }
  $('#bottom').innerHTML = parts.join('');
}

function roundResult(r) {
  const rd = game.rounds?.[roundKey(r)];
  const res = rd?.result;
  if (!res) return '<div class="card"><p class="muted">Clearing the market…</p></div>';
  const mine = [...(res.offers || []), ...(res.notOffered || [])].filter((o) => o.owner === me.owner);
  const tot = res.perOwner?.[me.owner] || { profit: 0 };
  const names = Object.fromEntries(Object.keys(game.participants || {}).map((id) => [id, ownerName(game, id)]));
  return `<div class="card"><h2>Round ${r} result</h2>
    <div class="kpis">
      <div class="kpi"><div class="v ${tot.profit < 0 ? 'neg' : tot.profit > 0 ? 'pos' : ''}">${eur(tot.profit)}</div><div class="k">your operating profit this round</div></div>
      <div class="kpi"><div class="v">${price(res.price)}</div><div class="k">clearing price</div></div>
      <div class="kpi"><div class="v">${num(res.demand)} MW</div><div class="k">actual demand (forecast ${num(rd.forecast)})</div></div>
    </div>
    ${mine.length ? `<div class="scroll" style="margin-top:.75rem"><table class="tbl"><thead><tr><th>Plant</th><th class="n">Your bid</th><th class="n">Marginal cost</th><th class="n">Dispatched</th><th class="n">Revenue</th><th class="n">Cost</th><th class="n">Profit</th></tr></thead><tbody>
      ${mine.map((o) => `<tr><td>${esc(o.name)}</td><td class="n">${o.bid == null ? 'no bid' : price(o.bid)}${o.auto ? ' (auto)' : ''}</td><td class="n">${price(o.mc)}</td>
        <td class="n">${num(o.dispatched)} / ${num(o.available ?? o.capacity)} MW</td><td class="n">${eur(o.revenue)}</td><td class="n">${eur(o.cost)}</td><td class="n strong ${o.profit < 0 ? 'neg' : ''}">${eur(o.profit)}</td></tr>`).join('')}
    </tbody></table></div><p class="small muted">Money = MW × €/MWh × ${num(res.hours ?? 1)} hours.</p>` : ''}
    <h3 style="margin-top:1rem">The merit order</h3>
    ${meritOrderChart(res, { names, highlight: me.owner, forecast: rd.forecast, showNames: game.config.showNames, width: 600 })}</div>`;
}

function historyCard() {
  const f = myFin();
  const rows = cleared(game).map((r) => {
    const res = game.rounds[roundKey(r)].result;
    const bought = plantsOf(game, me.owner).filter((p) => p.round === r);
    return `<tr><td>R${r}</td><td class="n">${num(res.demand)} MW</td><td class="n">${price(res.price)}</td>
      <td>${bought.map((p) => esc(p.name)).join(', ') || '<span class="muted">–</span>'}</td><td class="n">${eur(bought.reduce((s, p) => s + p.cost, 0))}</td>
      <td class="n strong ${(f.rounds[r] ?? 0) < 0 ? 'neg' : ''}">${eur(f.rounds[r] ?? 0)}</td></tr>`;
  });
  return `<div class="card"><h2>Your history</h2><div class="scroll"><table class="tbl"><thead><tr><th>Round</th><th class="n">Demand</th><th class="n">Price</th>
    <th>Bought</th><th class="n">Invested</th><th class="n">Operating profit</th></tr></thead><tbody>${rows.join('')}</tbody></table></div></div>`;
}

function tick() {
  const el = $('#timer');
  if (!el) return;
  const cd = countdown(game);
  el.textContent = cd ? `⏱ ${cd.text}` : '';
  el.classList.toggle('low', !!cd && cd.left <= 10);
}

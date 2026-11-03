// Projector view: read-only, shows only information every company may see.
import { getStore } from './store.js';
import { $, esc, num, eur, roundKey, leaderboardTable, attachTooltips, finances, cleared, countdown, outdatedGameMessage } from './ui.js';
import {
  PHASE_LABEL, joinCard, lobbyList, catalogueTable, demandOutlook, marketMix, availabilityKpis, resultsCard, capacityMixCard, debriefView, whatIfView,
} from './views.js';

const store = await getStore();
const app = $('#app');
attachTooltips(app);
const code = new URLSearchParams(location.search).get('game')?.toUpperCase();
let game = null;

$('#hdr-game').textContent = `Game ${code}`;
store.subscribe(`games/${code}`, (g) => {
  game = g;
  if (!g) { app.innerHTML = `<div class="card"><h2>Game ${esc(code)} not found</h2></div>`; return; }
  if (outdatedGameMessage(g)) { app.innerHTML = outdatedGameMessage(g); return; }
  render();
});
setInterval(tick, 500);

function tick() {
  const cd = countdown(game);
  const el = $('#timer');
  el.textContent = cd ? `⏱ ${cd.text}` : '';
  el.classList.toggle('low', !!cd && cd.left <= 10);
}

function statusChips(ids, done) {
  return `<div class="members">${ids.map((f) => `<span class="${done(f.id) ? 'done' : ''}">${done(f.id) ? '✓ ' : ''}${esc(f.name)}</span>`).join('')}</div>`;
}

function render() {
  const { phase, round } = game.meta;
  const c = game.config;
  $('#hdr-phase').textContent = round ? `Round ${round} / ${c.rounds} · ${PHASE_LABEL[phase]}` : PHASE_LABEL[phase];
  $('#hdr-phase').className = `pill ${phase === 'invest' || phase === 'bidding' ? 'live' : ''}`;
  const rd = game.rounds?.[roundKey(round)] || {};
  const fin = finances(game);
  const parts = [joinCard(game, phase === 'lobby')];

  if (phase === 'lobby') {
    parts.push(lobbyList(game));
    parts.push(`<div class="card"><h2>The power plant shop</h2><p>Every company starts with
      <b>${esc(eur(c.budget))}</b>. Each round you can buy plants, then bid their electricity into the market. One round = ${num(c.hours)} hours.</p>
      ${catalogueTable(game)}</div>`);
    parts.push(`<div class="card"><h3>Demand outlook</h3>${demandOutlook(game)}</div>`);
  }
  if (phase === 'invest') {
    parts.push(`<div class="card"><h1>Round ${round}: buy power plants 🏗️</h1><div class="kpis">
      <div class="kpi"><div class="v">${num(rd.forecast)} MW</div><div class="k">demand forecast this round (±${c.uncertainty}%)</div></div></div>
      <h3 style="margin-top:1rem">Installed capacity in the market</h3>${marketMix(game)}
      <h3 style="margin-top:1rem">Bought something this round</h3>${statusChips(fin, (id) => fin.find((f) => f.id === id).investedNow > 0)}</div>`);
    parts.push(`<div class="card"><h3>Shop</h3>${catalogueTable(game)}</div>`);
    parts.push(`<div class="card"><h3>Demand outlook</h3>${demandOutlook(game)}</div>`);
  }
  if (phase === 'bidding') {
    const withPlants = fin.filter((f) => f.nPlants > 0);
    parts.push(`<div class="card"><h1>Round ${round}: submit your bids 📈</h1><div class="kpis">
      <div class="kpi"><div class="v">${num(rd.forecast)} MW</div><div class="k">demand forecast (±${c.uncertainty}%)</div></div>
      ${availabilityKpis(rd, game)}
      <div class="kpi"><div class="v">${Object.keys(rd.bids || {}).length} / ${withPlants.length}</div><div class="k">bids submitted</div></div></div>
      <h3 style="margin-top:1rem">Installed capacity in the market</h3>${marketMix(game)}
      <h3 style="margin-top:1rem">Submitted</h3>${statusChips(withPlants, (id) => rd.bids?.[id])}</div>`);
  }
  if (phase === 'results' || phase === 'finished') {
    const r = phase === 'results' ? round : cleared(game).slice(-1)[0];
    if (phase === 'finished') parts.push(`<div class="card"><h1>🏆 Final ranking</h1>${podium(fin)}</div>`);
    const wi = game.meta.whatif;
    if (wi && game.rounds?.[roundKey(wi.round)]?.result) parts.push(whatIfView(game, wi.round, wi, { showNames: c.showNames }));
    if (r) parts.push(resultsCard(game, r, { showNames: c.showNames }));
    parts.push(`<div class="card"><h2>Leaderboard</h2><div class="scroll">${leaderboardTable(game)}</div></div>`);
    if (phase === 'finished') {
      parts.push(capacityMixCard(game));
      parts.push(debriefView(game));
    }
  }
  app.innerHTML = parts.join('');
  tick();
}

function podium(fin) {
  return `<div class="kpis">${fin.slice(0, 3).map((f, i) => `<div class="kpi"><div class="v">${['🥇', '🥈', '🥉'][i]} ${esc(f.name)}</div>
    <div class="k">net worth ${esc(eur(f.netWorth))}</div></div>`).join('')}</div>`;
}


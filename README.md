# ⚡ Merit Order Game

A browser-based classroom game for teaching how the electricity market and the merit order work.
Students play in **companies**, one laptop per company. Each company starts with money, **buys power plants**, and bids their electricity into a
day-ahead market, round after round. Plants stay in the fleet, and more can be bought every round.
After each round the projector shows the merit-order curve, the clearing price and a leaderboard.
At the end, a debrief shows whether bidding above marginal cost paid off.

It is a static website (HTML + JavaScript, no build step), so it runs on **GitHub Pages**.
Real-time sync between the students' phones and the instructor's screens goes through a free **Firebase Realtime Database**.

## Quick start: try it locally (no setup)

With `firebaseConfig = null` in `js/config.js`, the game runs in **local demo mode**:
data lives in your browser's localStorage and syncs between tabs of the same browser.

```bash
cd Electrcity_markets_game
python -m http.server 8000
```

Open <http://localhost:8000/host.html>, create a game, then open the join link in 3–4 more tabs
(each tab is a separate company). ES modules don't load from `file://`, so you need the local server.

## Classroom setup (one-off, about 10 minutes)

### 1. Firebase (real-time sync)

1. Go to <https://console.firebase.google.com> → **Add project** (Google Analytics not needed).
2. **Build → Realtime Database → Create database**. Pick a location (e.g. `europe-west1`) and start in **locked mode**.
3. In the database's **Rules** tab, paste the contents of [database.rules.json](database.rules.json) and **Publish**.
4. **Project settings (gear icon) → General → Your apps → Web (`</>`)**. Register an app (no hosting needed)
   and copy the `firebaseConfig` object.
5. Paste it into [js/config.js](js/config.js) in place of `null`. Make sure it contains `databaseURL`.
   Copy **only the `firebaseConfig = { … }` object**. Don't copy the `import … from "firebase/app"`,
   `initializeApp` or `getAnalytics` lines from the console snippet: they need a bundler and stop the page from loading.

The free Spark plan (100 simultaneous connections, 1 GB stored) is plenty for a lecture.
The Firebase web config is not a secret, so it's fine to commit it.

### 2. GitHub Pages (hosting)

1. Create a GitHub repository and push this folder to it.
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, folder `/ (root)`.
3. After about a minute the game is live at `https://<user>.github.io/<repo>/`.

Any other static host (your university web space, Netlify, …) works the same way: just upload the files.

## Running the game in class

The game uses three screens:

| Page | Who sees it | What it shows |
|---|---|---|
| `host.html` | **you only** (laptop) | Controls, plus a private monitor: every company's fleet, cash, net worth, live bids with mark-ups, and who owns what |
| `screen.html` | **the class** (projector) | Join code and QR, shop, demand outlook, phase and timer, who has bought or bid, results and leaderboard. No private data. Open it with the **📽️ Open projector screen** button. |
| `play.html` | each company (one laptop) | Shop, fleet, bid form with cost calculator, results with feedback, history |

Each round has three steps:

1. **💰 Investment.** The shop is open. Students buy plants with their cash. Plants bought this round can be
   returned for a full refund until the shop closes.
2. **📈 Bidding.** Wind and solar availability for the round is revealed. Students submit an offer price (€/MWh) per plant.
3. **📊 Results.** The market clears. Everyone sees the merit order, the clearing price and their profit.

Flow: create the game in `host.html` → students join → **Start game: open the shop for round 1** →
**Close shop & open bidding** → **Close bidding & clear market** → **Open the shop for round 2** → … → **Finish game**.
With timers set, the phases advance automatically (keep `host.html` open). Before each round you can override the demand forecast.

If the host tab is closed or reloaded, open `host.html` again and click **Resume**: all state is in the database.
Students who reload keep their identity (it is stored per browser tab).

### Settings

| Setting | Default | Notes |
|---|---|---|
| Starting money | €50M | Per company. |
| Max plants | 3 | Per company, keeps the screens tidy. 0 = no limit. |
| AI companies | 0 | Computer players to fill the market (see below). More can be added at any time. |
| Rounds | 5 | |
| Demand per company | 300, 350, 400, 450, 500 MW | Multiplied by the number of companies (AI included). Growing demand forces new investment. |
| Hours per round | 1,000 | Each round represents this many hours with the same conditions. Profits = MW × €/MWh × hours. |
| Forecast error | ± 4 % | Actual demand is drawn when the market clears, so bidding very high risks being left out. |
| Price cap | 500 €/MWh | Paid to everyone if supply can't cover demand (scarcity). |
| Pricing rule | Pay-as-clear | Switch to **pay-as-bid** in a second game to show how strategies change. |
| Plants without a bid | Not offered | Alternatives: auto-bid at marginal cost, or at the price cap. |
| Plant value at the end | 50 % | Net worth = cash + plants at this % of purchase price. Lower values punish late over-investment. |
| Timers | 120 s shop, 90 s bidding | 0 = you advance manually. |
| Show owners | Yes | Whether the public merit-order chart shows who owns each bar. |
| CO₂ price | 30 €/t | Enters every fossil plant's marginal cost. Raise it in a second game to watch coal and gas swap places. |
| Shop | see below | Per technology: on/off, unit size, price, fuel price, efficiency, CO₂ factor, variable O&M, availability range. The marginal cost is computed from these. |

Default shop (stylised so a plant pays back in about 2–4 rounds):

| Technology | Unit | Price | Fuel (€/MWh<sub>th</sub>) | Efficiency | CO₂ (t/MWh<sub>th</sub>) | Var. O&M | Marginal cost at 30 €/t | Availability |
|---|---|---|---|---|---|---|---|---|
| Solar PV | 100 MW | €8M | 0 | – | 0 | 0 | 0 €/MWh | 15–70 % (weather) |
| Wind | 150 MW | €15M | 0 | – | 0 | 0 | 0 €/MWh | 20–90 % (weather) |
| Nuclear | 500 MW | €85M | 3.3 | 33 % | 0 | 0 | 10 €/MWh | 100 % |
| Lignite | 400 MW | €36M | 4 | 40 % | 0.36 | 1 | 38 €/MWh | 100 % |
| Hard coal | 300 MW | €18M | 9 | 42 % | 0.34 | 2 | 47.7 €/MWh | 100 % |
| Gas CCGT | 250 MW | €7M | 33 | 58 % | 0.20 | 0 | 67.2 €/MWh | 100 % |
| Gas OCGT | 100 MW | €2M | 33 | 38 % | 0.20 | 3 | 105.6 €/MWh | 100 % |
| Oil | 50 MW | €0.6M | 45 | 35 % | 0.27 | 5 | 156.7 €/MWh | 100 % |

Marginal cost = fuel ÷ efficiency + CO₂ price × CO₂ factor ÷ efficiency + variable O&M.
Nuclear costs more than the starting budget, so a company can only afford it after earning profits. That's deliberate.

If a company somehow overspends or exceeds the plant limit (e.g. two quick clicks), its latest purchases are undone when the shop closes.

### AI companies

If there aren't enough students, add computer players: set **AI companies** when creating the game, or use
**+ Add AI company** on `host.html`. AI companies run in the host's browser (keep `host.html` open), appear with 🤖 in all
tables, and can't be joined by students. Each round they:

* **Buy** plants as soon as the shop opens, until their share of the demand forecast (+10%) is covered, within their cash
  and the plant limit. They pick the technology with the best expected operating profit per euro invested at the last
  clearing price (70 €/MWh in round 1), with a bit of randomness. That's a simple screening-curve rule.
* **Bid** as soon as bidding opens, according to their strategy (changeable any time on `host.html`):
  * **Competitive:** bids exactly its marginal cost (the textbook benchmark).
  * **Mark-up:** bids 20–60% above cost.
  * **Random:** bids between 80% and 200% of cost.

The logic is in [js/ai.js](js/ai.js). Comparing the students with a competitive AI company makes a good debrief point.

### Market rules (as students see them)

* Demand is inelastic: the forecast ± error.
* Offers are sorted by price (the merit order) and accepted until demand is covered.
  Offers at exactly the marginal price share the remaining demand pro rata.
* **Pay-as-clear:** every accepted plant gets the clearing price (the bid of the last accepted offer).
* Operating profit = (price received − marginal cost) × MWh dispatched.
* Ranking by **net worth** = cash + plants valued at the end-value %.

## Learning tools

The game is built so students *discover* that bidding marginal cost is the safe choice:

* **🧮 Cost calculator** (shop, bid form, Market and History tabs) for any plant:
  1. the **marginal cost breakdown**: fuel ÷ efficiency + CO₂ price × emission factor ÷ efficiency + variable O&M;
  2. the **LCOE** within the game: marginal cost + investment × (1 − end value) ÷ (MW × running hours × rounds),
     with adjustable rounds and running hours (try a peaker at 10 % running hours);
  3. a **bid simulator**: "if the clearing price is P and I bid B, what do I earn?" It shows that under pay-as-clear the price
     you receive doesn't depend on your bid, and a bid above the price means €0. "Use this bid" copies the value into the form;
  4. a **sunk-cost note**: the investment doesn't matter for bidding, only for buying.
* **Feedback after each round** for each company: "If you had bid your marginal costs you would have earned €X (you earned €Y)",
  plus a note for each plant: not dispatched although cheaper than the price, produced at a loss, set the price with a mark-up (risky),
  correctly stayed off, or earned the full margin.
* **Key concepts** glossary in the Rules tab: merit order, marginal cost, clearing price, inframarginal rent,
  merit-order effect, scarcity, LCOE, sunk cost.
* **🔬 What-if explorer** on `host.html` for any cleared round, with **📽️ Show on projector**. It re-clears the round with the same plants:
  * **Everyone bids marginal cost**: the competitive benchmark;
  * **No renewables** and **Renewable boom (×3)**: the merit-order effect, and who wins or loses from renewables;
  * **Scarcity (+30% demand)**: demand not covered, price at the cap;
  * or any combination of bids (as played / marginal cost), wind & solar (0, ×0.5, ×1, ×2, ×3) and demand (−30% … +50%).

  It shows the scenario's merit order, clearing price, unserved demand, renewable share, total producer profit,
  what consumers pay, and each company's profit next to the actual result.

## Debrief ideas

* **Bidding:** students often bid well above cost "to make money". Some expensive offers are not dispatched and
  earn nothing. Cheap plants that bid high get pushed out by more expensive plants that bid low.
  With pay-as-clear and many small players, bidding your marginal cost is (almost) a dominant strategy:
  inframarginal plants earn the difference to the clearing price anyway (see the "Did bidding above cost pay off?" chart).
* **The price-setting plant earns zero.** So how does a peaker ever pay back its investment? Only in scarcity hours.
  This leads to "missing money", scarcity pricing and capacity markets.
* **Investment:** cheap-to-build, expensive-to-run plants vs. expensive-to-build, cheap-to-run ones
  (screening curves). Zero-marginal-cost renewables push the price down for everybody (merit-order effect)
  and earn less the more of them there are (cannibalisation).
* **Over- and under-investment:** if everyone builds, prices collapse. If nobody builds, demand growth leads to
  price-cap rounds. Late investments may not pay back before the game ends.
* **Market power:** with high demand and few large players, withholding or high bids *can* pay off.
* **Pay-as-bid** (second game): students now try to guess the clearing price. Prices don't fall, they just
  get harder to predict.

## Using the results in Python

`Download results (CSV)` (on `host.html` after the game) gives one row per plant per round
(`round, participant, technology, round_built, investment_cost_eur, capacity_mw, available_mw, marginal_cost_eur_mwh, bid_eur_mwh, dispatched_mw, clearing_price_eur_mwh, profit_eur, …`).

[analysis/merit_order_from_game.py](analysis/merit_order_from_game.py) rebuilds the merit order with pandas and
matplotlib and compares the students' bids with the competitive (bid = marginal cost) outcome:

```bash
python analysis/merit_order_from_game.py merit_order_game_ABCD.csv 3
```

That makes a nice exercise: give students the CSV and ask them to write the clearing function themselves.

## Files

| File | Purpose |
|---|---|
| `index.html` | Landing page: join with a code, or host |
| `host.html`, `js/host.js` | Instructor: setup, phase control, market clearing, private company monitor |
| `screen.html`, `js/screen.js` | Projector view (public information only) |
| `play.html`, `js/play.js` | Student view: shop, fleet, bidding, own results |
| `js/market.js` | Technology catalogue, availability draw, **market clearing** (pure functions) |
| `js/ai.js` | Computer-controlled companies: investment and bidding rules |
| `js/scenarios.js` | What-if re-clearing (competitive, renewables, demand) and the per-company "bid marginal cost" check |
| `js/views.js`, `js/charts.js`, `js/ui.js` | Shared HTML blocks, SVG charts, helpers (finances, CSV export) |
| `js/store.js`, `js/config.js` | Firebase / local-storage sync layer and its configuration |
| `js/loadguard.js` | Shows a message if the app fails to load |
| `database.rules.json` | Firebase Realtime Database security rules |

The default shop is `DEFAULT_CATALOGUE` in `js/market.js`. It can also be edited per game in the host's setup form.

## Design

The look follows the [University of Freiburg corporate design](https://cd.uni-freiburg.de/):
Uni-Blau `#344A9A`, Dunkelblau `#00004A` and Sand backgrounds, flush-left text, rectangular areas and full-bleed colour bands.
All colours are CSS variables at the top of [css/style.css](css/style.css).

* **Typeface:** the house font *Social* is licensed and not bundled. Pages use it if it's installed on the device,
  otherwise Arial, the official CD fallback.
* **Logo:** not included, because the logo policy governs its use (ask Marketing und Events / cd@zv.uni-freiburg.de).
  If you may use it, save it as `img/logo.svg` and it appears in every page header automatically.
* **Chart colours:** the power plant technologies keep conventional energy colours (yellow solar, blue wind, …),
  checked for colour-blind separation. The CD palette doesn't have eight distinguishable colours for data.

## Notes and limitations

* The host's browser runs the market clearing and the timers. Keep `host.html` open during the game.
* The database rules are open per game code (no login), which suits a classroom. A determined student could
  edit data with the browser dev tools. For graded use, add Firebase Anonymous Auth and stricter rules.
* Old games stay in the database. Delete the `games` node in the Firebase console now and then.

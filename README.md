# ⚡ Merit Order Game

A browser-based classroom game for teaching how the electricity market and the merit order work.
Each student (or team) starts with money, **buys a fleet of power plants**, and bids its electricity into a
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
(each tab is a separate player). ES modules don't load from `file://`, so you need the local server.

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
| `host.html` | **you only** (laptop) | Controls, plus a private monitor: every team's fleet, cash, net worth, live bids with mark-ups, and who owns what |
| `screen.html` | **the class** (projector) | Join code and QR, shop, demand outlook, phase and timer, who has bought or bid, results and leaderboard. No private data. Open it with the **📽️ Open projector screen** button. |
| `play.html` | students (phones) | Shop, own fleet, bid form, own results and history |

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
| Who plays | Teams | Define team names; students pick their team on join. Teammates share cash and fleet, and any member can buy or bid. Or: individual play. |
| Starting money | €50M | Per team / player. |
| Rounds | 5 | |
| Demand per team | 400, 500, 600, 650, 700 MW | Multiplied by the number of active teams. Growing demand forces new investment. |
| Hours per round | 1,000 | Each round represents this many hours with the same conditions. Profits = MW × €/MWh × hours. |
| Forecast error | ± 4 % | Actual demand is drawn when the market clears, so bidding very high risks being left out. |
| Price cap | 500 €/MWh | Paid to everyone if supply can't cover demand (scarcity). |
| Pricing rule | Pay-as-clear | Switch to **pay-as-bid** in a second game to show how strategies change. |
| Plants without a bid | Not offered | Alternatives: auto-bid at marginal cost, or at the price cap. |
| Plant value at the end | 50 % | Net worth = cash + plants at this % of purchase price. Lower values punish late over-investment. |
| Timers | 120 s shop, 90 s bidding | 0 = you advance manually. |
| Show owners | Yes | Whether the public merit-order chart shows who owns each bar. |
| Shop | see below | Per technology: on/off, unit size, marginal cost, price, availability range. |

Default shop (stylised so a plant pays back in about 2–4 rounds):

| Technology | Unit | Marginal cost | Price | Availability |
|---|---|---|---|---|
| Solar PV | 100 MW | 0 €/MWh | €8M | 15–70 % (weather) |
| Wind | 150 MW | 0 €/MWh | €15M | 20–90 % (weather) |
| Nuclear | 500 MW | 10 €/MWh | €85M | 100 % |
| Lignite | 400 MW | 30 €/MWh | €42M | 100 % |
| Hard coal | 300 MW | 45 €/MWh | €18M | 100 % |
| Gas CCGT | 250 MW | 65 €/MWh | €7M | 100 % |
| Gas OCGT | 100 MW | 110 €/MWh | €2M | 100 % |
| Oil | 50 MW | 160 €/MWh | €0.6M | 100 % |

Nuclear costs more than the starting budget, so a team can only afford it after earning profits. That's deliberate.

If two teammates buy at the same moment and overspend, the latest purchases are undone when the shop closes.

### Market rules (as students see them)

* Demand is inelastic: the forecast ± error.
* Offers are sorted by price (the merit order) and accepted until demand is covered.
  Offers at exactly the marginal price share the remaining demand pro rata.
* **Pay-as-clear:** every accepted plant gets the clearing price (the bid of the last accepted offer).
* Operating profit = (price received − marginal cost) × MWh dispatched.
* Ranking by **net worth** = cash + plants valued at the end-value %.

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
| `host.html`, `js/host.js` | Instructor: setup, phase control, market clearing, private team monitor |
| `screen.html`, `js/screen.js` | Projector view (public information only) |
| `play.html`, `js/play.js` | Student view: shop, fleet, bidding, own results |
| `js/market.js` | Technology catalogue, availability draw, **market clearing** (pure functions) |
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

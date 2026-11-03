# ⚡ Merit Order Game

A browser-based classroom game for teaching how the electricity market and the merit order work.
Each student (or team) owns one or more power plants and bids into a day-ahead market, round after round.
The host's screen shows the merit-order curve, the clearing price and a leaderboard after each round,
and at the end a debrief showing whether bidding above marginal cost paid off.

It is a static website (HTML + JavaScript, no build step), so it runs on **GitHub Pages**.
Real-time sync between the students' phones and the projector goes through a free **Firebase Realtime Database**.

## Quick start: try it locally (no setup)

With `js/config.js` left as is (`firebaseConfig = null`), the game runs in **local demo mode**:
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

1. Open `…/host.html` on the projector → configure → **Create game**.
2. Students scan the QR code (or go to the site and type the 4-letter code) and enter their name / pick their team.
3. **Start game: assign plants.** Every student sees their plant: technology, capacity and marginal cost.
4. **Open bidding** for round 1. Students submit an offer price (€/MWh) for each of their plants.
   They can change it until bidding closes (by the timer or by you).
5. **Close bidding & clear market.** Everyone sees the merit order, the clearing price and their profit.
6. Repeat. You can adjust the demand level before each round.
7. **Finish game** → final leaderboard, debrief charts, and **Download results (CSV)** for the Python part of the lecture.

If the host tab is closed or reloaded, open `host.html` again and click **Resume**: all state is in the database.
Students who reload keep their identity (it is stored per browser tab).

### Settings

| Setting | Default | Notes |
|---|---|---|
| Who bids | Individually | **Teams:** define team names; students pick their team on join. Teammates share a fleet and any member can submit the team's bid. |
| Plants per player/team | 1 / 3 | Team fleets are dealt snake-draft by marginal cost, so every team gets a mix of cheap and expensive plants. |
| Rounds and demand | 5 rounds: 55, 70, 80, 65, 88 % | Demand as a % of installed capacity. High values (>85 %) bring scarcity and market power into play. |
| Forecast error | ± 4 % | Students see the forecast. Actual demand is drawn when the market clears, so bidding very high risks being left out. |
| Price cap | 500 €/MWh | Paid to everyone if supply can't cover demand. |
| Pricing rule | Pay-as-clear | Switch to **pay-as-bid** in a second game to show how strategies change. |
| Plants without a bid | Not offered | Alternatives: auto-bid at marginal cost, or at the price cap. |
| Timer | 90 s | 0 = you close bidding manually. |
| Show owners | Yes | Whether students see who owns each bar in the merit-order chart. |

### Market rules (as students see them)

* Each round is one hour. Demand is inelastic: the forecast ± error.
* Offers are sorted by price (the merit order) and accepted until demand is covered.
  Offers at exactly the marginal price share the remaining demand pro rata.
* **Pay-as-clear:** every accepted plant gets the clearing price (the bid of the last accepted offer).
* Profit = (price received − marginal cost) × MWh dispatched.

## Debrief ideas

* **Round 1 typically:** students bid well above cost "to make money". Some expensive offers are not dispatched and
  earn nothing. Cheap plants that bid high get pushed out by more expensive plants that bid low.
* **"Did bidding above cost pay off?"** (debrief chart): with pay-as-clear and many small players,
  bidding your marginal cost is (almost) a dominant strategy. You can never be paid less than your own bid,
  and you are dispatched exactly when it is profitable. Inframarginal plants earn the difference to the
  clearing price anyway.
* **The price-setting plant earns zero.** This gives the "missing money" and scarcity-pricing discussion.
* **High-demand rounds:** if a few large plants are pivotal, withholding or high bids *can* pay off. This is the
  door to market power, market monitoring and the price cap.
* **Pay-as-bid** (second game): students now try to guess the clearing price. Prices don't fall, they just
  get harder to predict.

## Using the results in Python

`Download results (CSV)` gives one row per plant per round
(`round, participant, technology, capacity_mw, marginal_cost_eur_mwh, bid_eur_mwh, dispatched_mw, clearing_price_eur_mwh, profit_eur, …`).

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
| `host.html`, `js/host.js` | Instructor view: setup, round control, market clearing, results, debrief |
| `play.html`, `js/play.js` | Student view: plant(s), bidding, own results |
| `js/market.js` | Plant catalogue, fleet generation, **market clearing** (pure functions) |
| `js/charts.js` | SVG merit-order and debrief charts |
| `js/store.js`, `js/config.js` | Firebase / local-storage sync layer and its configuration |
| `database.rules.json` | Firebase Realtime Database security rules |

Plant technologies, cost ranges and capacities are defined in `TECH` at the top of `js/market.js`. Adjust them to match your lecture.

## Notes and limitations

* The host's browser runs the market clearing. Keep the host tab open during a round.
* The database rules are open per game code (no login), which suits a classroom. A determined student could
  edit data with the browser dev tools. For graded use, add Firebase Anonymous Auth and stricter rules.
* Old games stay in the database. Delete the `games` node in the Firebase console now and then.

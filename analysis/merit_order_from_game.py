"""Rebuild the merit order from a Merit Order Game export.

Usage:
    python merit_order_from_game.py merit_order_game_ABCD.csv [round]

The CSV comes from the host's "Download results (CSV)" button after the game:
one row per power plant per round.
"""
import sys

import matplotlib.pyplot as plt
import pandas as pd

TECH_COLORS = {
    "solar": "#E3A008", "wind": "#2F86D6", "nuclear": "#C455A8", "lignite": "#A85C1A",
    "coal": "#0E9080", "ccgt": "#F28E2B", "ocgt": "#C93A3A", "oil": "#6A5ACD",
}


def merit_order(df: pd.DataFrame, price_col: str) -> pd.DataFrame:
    """Sort offers by price and add the cumulative capacity (the x-axis of the merit order)."""
    mo = df.dropna(subset=[price_col]).sort_values([price_col, "marginal_cost_eur_mwh"]).copy()
    mo["cum_end"] = mo["capacity_mw"].cumsum()
    mo["cum_start"] = mo["cum_end"] - mo["capacity_mw"]
    return mo


def clearing_price(mo: pd.DataFrame, demand: float, price_col: str) -> float:
    """Price of the first offer whose cumulative capacity covers demand."""
    covering = mo[mo["cum_end"] >= demand]
    return covering[price_col].iloc[0] if len(covering) else float("nan")


def plot(ax, mo, demand, price_col, title):
    for _, o in mo.iterrows():
        ax.bar(o["cum_start"], o[price_col], width=o["capacity_mw"], align="edge",
               color=TECH_COLORS.get(o["technology"], "grey"), edgecolor="white", linewidth=1)
    p = clearing_price(mo, demand, price_col)
    ax.axvline(demand, color="black", lw=2, label=f"Demand {demand:,.0f} MW")
    ax.axhline(p, color="#b3261e", ls="--", lw=2, label=f"Price {p:,.0f} €/MWh")
    ax.set(title=title, xlabel="Cumulative capacity (MW)", ylabel="€/MWh")
    ax.legend(loc="upper left")


if __name__ == "__main__":
    df = pd.read_csv(sys.argv[1])
    rnd = int(sys.argv[2]) if len(sys.argv) > 2 else df["round"].max()
    r = df[df["round"] == rnd]
    demand = r["demand_mw"].iloc[0]

    # What students actually bid vs. what a perfectly competitive market would look like.
    bids = merit_order(r, "bid_eur_mwh")
    competitive = merit_order(r, "marginal_cost_eur_mwh")
    print(f"Round {rnd}: demand {demand:,.0f} MW")
    print(f"  clearing price with students' bids : {clearing_price(bids, demand, 'bid_eur_mwh'):6.1f} €/MWh")
    print(f"  clearing price if everyone bid MC  : {clearing_price(competitive, demand, 'marginal_cost_eur_mwh'):6.1f} €/MWh")

    print("\nTotal profit per participant:")
    print(df.groupby("participant")["profit_eur"].sum().sort_values(ascending=False).to_string())

    fig, axes = plt.subplots(1, 2, figsize=(13, 5), sharey=True)
    plot(axes[0], bids, demand, "bid_eur_mwh", f"Round {rnd}: submitted bids")
    plot(axes[1], competitive, demand, "marginal_cost_eur_mwh", f"Round {rnd}: bids = marginal cost")
    axes[0].set_ylim(0, min(bids["bid_eur_mwh"].max(), competitive["marginal_cost_eur_mwh"].max() * 1.6) * 1.1)
    plt.tight_layout()
    plt.show()

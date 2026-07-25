#!/usr/bin/env python3
"""
Generate mock Huntington floor-plan data for the Evotti dashboard demo.

Scope (deliberately small for the demo): we only track dealer *payoffs* to
Huntington and the outstanding floor-plan *balance* -- no interest, curtailments,
or fees. Each record is one boat (one HIN) that a dealer floored with Huntington:

  - status "on_floor"  -> still in inventory; huntington_advance is the balance.
  - status "paid_off"  -> boat retailed; the dealer paid Huntington the advance
                          (payoff_amount == huntington_advance; interest ignored).

Grain: one row per unit (HIN). Dealers match the sales data (10, two per region).

Output:
  dashboard/huntington-data.js   -- window.EVOTTI_HUNTINGTON = {asOf, units:[...]}
  dashboard/huntington-data.json -- same payload as JSON

Deterministic: fixed seed, so re-running reproduces the same data.
"""

import json
import os
import random
from datetime import date, timedelta

SEED = 20260724
AS_OF = date(2026, 7, 24)

# Dealer -> region (matches scripts/gen_sales_data.py and the launcher).
DEALERS = [
    ("Great Lakes Marine", "Great Lakes"),
    ("Northwind Boatworks", "Great Lakes"),
    ("Harborline Boats", "Southeast"),
    ("Palmetto Marine", "Southeast"),
    ("Gulf Coast Yachts", "Gulf"),
    ("Bayou Marine Group", "Gulf"),
    ("Bay State Marine", "Northeast"),
    ("Cape & Isles Boats", "Northeast"),
    ("Cascade Watersports", "West"),
    ("Pacific Edge Marine", "West"),
]

# Model -> (average retail price, demand weight, 2-letter HIN code).
MODELS = [
    ("190 Sport",    72000, 1.00, "SP"),
    ("240 Series",   98000, 0.95, "SE"),
    ("280 Cruiser", 135000, 0.55, "CR"),
    ("320 Flagship", 210000, 0.28, "FL"),
]

WHOLESALE = 0.82   # Huntington advance as a share of retail (dealer cost)


def pick_model(rng):
    total = sum(w for (_, _, w, _) in MODELS)
    r = rng.random() * total
    upto = 0.0
    for m in MODELS:
        upto += m[2]
        if r <= upto:
            return m
    return MODELS[-1]


def biz_add(d, n):
    """Add n business days to d."""
    added = 0
    while added < n:
        d += timedelta(days=1)
        if d.weekday() < 5:
            added += 1
    return d


def hin(rng, code, serial, floored):
    # Plausible 12-char HIN: MIC 'EVT' + 5-digit serial + model code + MYY.
    return "EVT{:05d}{}{}{:02d}".format(serial, code, floored.strftime("%m"), floored.year % 100)


def main():
    rng = random.Random(SEED)
    units = []
    serial = 1000

    for dname, region in DEALERS:
        # Per-dealer size factor so dealers differ in scale.
        scale = rng.uniform(0.75, 1.35)

        # ---- on floor now (the outstanding balance) --------------------------
        n_floor = int(round(rng.uniform(6, 14) * scale))
        for _ in range(n_floor):
            model, asp, _w, code = pick_model(rng)
            floored = AS_OF - timedelta(days=rng.randint(10, 150))
            advance = round(asp * WHOLESALE * rng.uniform(0.97, 1.03))
            serial += 1
            units.append({
                "hin": hin(rng, code, serial, floored),
                "dealer": dname, "region": region, "model": model,
                "retail_price": round(asp * rng.uniform(0.98, 1.05)),
                "huntington_advance": advance,
                "floored_date": floored.isoformat(),
                "status": "on_floor",
                "sold_date": None, "payoff_date": None, "payoff_amount": None,
            })

        # ---- paid off this month (July MTD -> current-month payoffs) ---------
        n_july = int(round(rng.uniform(3, 9) * scale))
        for _ in range(n_july):
            model, asp, _w, code = pick_model(rng)
            sold = date(2026, 7, rng.randint(1, AS_OF.day))
            while sold.weekday() >= 5:
                sold -= timedelta(days=1)
            floored = sold - timedelta(days=rng.randint(25, 160))
            payoff = biz_add(sold, rng.randint(1, 3))
            if payoff > AS_OF:
                payoff = sold
            advance = round(asp * WHOLESALE * rng.uniform(0.97, 1.03))
            serial += 1
            units.append({
                "hin": hin(rng, code, serial, floored),
                "dealer": dname, "region": region, "model": model,
                "retail_price": round(asp * rng.uniform(0.98, 1.05)),
                "huntington_advance": advance,
                "floored_date": floored.isoformat(),
                "status": "paid_off",
                "sold_date": sold.isoformat(),
                "payoff_date": payoff.isoformat(),
                "payoff_amount": advance,
            })

        # ---- paid off last month (June -> history/depth for filters) ---------
        n_prior = int(round(rng.uniform(2, 6) * scale))
        for _ in range(n_prior):
            model, asp, _w, code = pick_model(rng)
            sold = date(2026, 6, rng.randint(1, 30))
            while sold.weekday() >= 5:
                sold -= timedelta(days=1)
            floored = sold - timedelta(days=rng.randint(25, 160))
            payoff = biz_add(sold, rng.randint(1, 3))
            advance = round(asp * WHOLESALE * rng.uniform(0.97, 1.03))
            serial += 1
            units.append({
                "hin": hin(rng, code, serial, floored),
                "dealer": dname, "region": region, "model": model,
                "retail_price": round(asp * rng.uniform(0.98, 1.05)),
                "huntington_advance": advance,
                "floored_date": floored.isoformat(),
                "status": "paid_off",
                "sold_date": sold.isoformat(),
                "payoff_date": payoff.isoformat(),
                "payoff_amount": advance,
            })

    payload = {"asOf": AS_OF.isoformat(), "units": units}
    os.makedirs("dashboard", exist_ok=True)

    with open("dashboard/huntington-data.json", "w") as f:
        json.dump(payload, f, separators=(",", ":"))
    with open("dashboard/huntington-data.js", "w") as f:
        f.write("// Evotti Huntington floor-plan demo data -- generated by "
                "scripts/gen_huntington_data.py. Do not edit by hand.\n")
        f.write("window.EVOTTI_HUNTINGTON = ")
        json.dump(payload, f, separators=(",", ":"))
        f.write(";\n")

    _summary(units)


def _summary(units):
    cur = "2026-07"
    mtd = [u for u in units if u["status"] == "paid_off" and u["payoff_date"][:7] == cur]
    floor = [u for u in units if u["status"] == "on_floor"]
    paid = sum(u["payoff_amount"] for u in mtd)
    bal = sum(u["huntington_advance"] for u in floor)
    print("units: {}  ({} on floor, {} paid off)".format(
        len(units), len(floor), len([u for u in units if u["status"] == "paid_off"])))
    print("MTD (Jul) payoffs: {} boats  ${:,.0f}".format(len(mtd), paid))
    print("outstanding floor-plan balance: {} boats  ${:,.0f}".format(len(floor), bal))
    print("sample:", json.dumps(units[0]))


if __name__ == "__main__":
    main()

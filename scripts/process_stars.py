import json
import math
import os
import sys

import numpy as np
import pandas as pd


def bv_to_rgb(bv):
    """Convert B-V color index to RGB tuple using Ballesteros formula."""
    if bv is None or np.isnan(bv):
        return 200, 200, 255  # default blue-white

    bv = max(-0.4, min(2.0, bv))

    # Temperature from B-V (Ballesteros 2012)
    temp = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62))

    # Planck RGB approximation
    if temp <= 6600:
        r = 255
        g = int(99.4708 * math.log(temp / 100) - 161.1196)
        g = max(0, min(255, g))
        if temp <= 1900:
            b = 0
        else:
            b = int(138.5177 * math.log(temp / 100 - 10) - 305.0448)
            b = max(0, min(255, b))
    else:
        r = int(329.6987 * ((temp / 100 - 60) ** -0.1332))
        r = max(0, min(255, r))
        g = int(288.1221 * ((temp / 100 - 60) ** -0.0755))
        g = max(0, min(255, g))
        b = 255

    return r, g, b


def process_catalog(csv_path, output_path, mag_limit=7.0):
    """Process HYG catalog CSV into stars.json."""
    print(f"Loading catalog from {csv_path}...")
    df = pd.read_csv(csv_path, low_memory=False)
    print(f"  Total rows: {len(df)}")

    # The HYG v3 database has these relevant columns:
    # id, hip, proper, ra, dec, dist, mag, ci (color index B-V), x, y, z
    # x, y, z are already in parsecs (equatorial Cartesian)

    # Filter: need valid 3D position and magnitude
    df = df.dropna(subset=["x", "y", "z", "mag"])
    print(f"  After dropping NaN positions/mag: {len(df)}")

    # Filter by magnitude (keep stars brighter than limit)
    df = df[df["mag"] <= mag_limit]
    print(f"  After magnitude filter (<= {mag_limit}): {len(df)}")

    # Filter out extremely distant stars (unreliable positions)
    df = df[df["dist"] <= 2000]  # parsecs
    df = df[df["dist"] > 0]
    print(f"  After distance filter (0-2000 pc): {len(df)}")

    # Build star records
    stars = []
    for _, row in df.iterrows():
        # Get color from B-V color index
        ci = row.get("ci", None)
        if ci is not None and not np.isnan(ci):
            r, g, b = bv_to_rgb(ci)
        else:
            r, g, b = 200, 200, 255

        # Get name (proper name or empty)
        name = None
        if pd.notna(row.get("proper", None)):
            name = str(row["proper"]).strip()
            if not name:
                name = None

        # HIP id
        hip = None
        if pd.notna(row.get("hip", None)):
            hip = int(row["hip"])

        star = {
            "id": hip if hip else int(row.get("id", 0)),
            "x": round(float(row["x"]), 4),
            "y": round(float(row["y"]), 4),
            "z": round(float(row["z"]), 4),
            "mag": round(float(row["mag"]), 2),
            "r": r,
            "g": g,
            "b": b,
        }

        if name:
            star["name"] = name

        stars.append(star)

    print(f"  Final star count: {len(stars)}")

    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    with open(output_path, "w") as f:
        json.dump(stars, f, separators=(",", ":"))

    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"  Written to {output_path} ({size_mb:.1f} MB)")

    return stars


if __name__ == "__main__":
    csv_path = os.path.join(os.path.dirname(__file__), "hygdata.csv")
    output_path = os.path.join(os.path.dirname(__file__), "..", "data", "stars.json")

    if not os.path.exists(csv_path):
        print(f"ERROR: {csv_path} not found.")
        print("Download from: https://github.com/astronexus/HYG-Database")
        print("Save the hyg_v3.csv file as scripts/hygdata.csv")
        sys.exit(1)

    process_catalog(csv_path, output_path)
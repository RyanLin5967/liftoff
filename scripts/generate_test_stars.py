"""
Generate test stars.json with real bright star data + random background stars.
Use this for development. Replace with real Hipparcos data for production.

python scripts/generate_test_stars.py
"""

import json
import math
import os
import random

# Real bright stars with approximate Hipparcos Cartesian coordinates (parsecs)
# Source: actual Hipparcos data for the brightest stars
BRIGHT_STARS = [
    {"id": 32349, "name": "Sirius", "x": -1.812, "y": 0.094, "z": -0.474, "mag": -1.46, "bv": 0.00},
    {"id": 30438, "name": "Canopus", "x": -44.0, "y": -72.0, "z": -55.0, "mag": -0.74, "bv": 0.15},
    {"id": 69673, "name": "Arcturus", "x": -6.8, "y": 8.5, "z": 5.8, "mag": -0.05, "bv": 1.23},
    {"id": 71683, "name": "Alpha Centauri A", "x": -0.50, "y": -0.36, "z": -1.15, "mag": -0.01, "bv": 0.71},
    {"id": 91262, "name": "Vega", "x": 0.94, "y": -5.79, "z": 6.98, "mag": 0.03, "bv": 0.00},
    {"id": 24436, "name": "Rigel", "x": -71.0, "y": -156.0, "z": -132.0, "mag": 0.13, "bv": -0.03},
    {"id": 37279, "name": "Procyon", "x": -1.47, "y": -2.75, "z": 0.57, "mag": 0.34, "bv": 0.42},
    {"id": 24608, "name": "Betelgeuse", "x": -98.0, "y": -111.0, "z": -75.0, "mag": 0.42, "bv": 1.85},
    {"id": 7588, "name": "Achernar", "x": 9.1, "y": -20.7, "z": -27.4, "mag": 0.46, "bv": -0.16},
    {"id": 68702, "name": "Hadar", "x": -80.0, "y": -37.0, "z": -100.0, "mag": 0.61, "bv": -0.23},
    {"id": 97649, "name": "Altair", "x": -2.40, "y": -3.49, "z": 4.13, "mag": 0.77, "bv": 0.22},
    {"id": 60718, "name": "Acrux", "x": -46.0, "y": -35.0, "z": -76.0, "mag": 0.76, "bv": -0.24},
    {"id": 65474, "name": "Spica", "x": -36.0, "y": -55.0, "z": 68.0, "mag": 0.97, "bv": -0.23},
    {"id": 80763, "name": "Antares", "x": -57.0, "y": 43.0, "z": 73.0, "mag": 0.96, "bv": 1.83},
    {"id": 37826, "name": "Pollux", "x": -6.2, "y": -9.2, "z": 5.8, "mag": 1.14, "bv": 1.00},
    {"id": 102098, "name": "Deneb", "x": -474.0, "y": -440.0, "z": 637.0, "mag": 1.25, "bv": 0.09},
    {"id": 27989, "name": "Bellatrix", "x": -33.0, "y": -50.0, "z": -43.0, "mag": 1.64, "bv": -0.22},
    {"id": 26311, "name": "Alnilam", "x": -156.0, "y": -270.0, "z": -215.0, "mag": 1.69, "bv": -0.18},
    {"id": 25336, "name": "Mintaka", "x": -108.0, "y": -222.0, "z": -192.0, "mag": 2.23, "bv": -0.18},
    {"id": 25930, "name": "Alnitak", "x": -79.0, "y": -176.0, "z": -150.0, "mag": 1.77, "bv": -0.20},
    {"id": 26727, "name": "Betelgeuse-link", "x": -98.0, "y": -111.0, "z": -75.0, "mag": 0.50, "bv": 1.85},
    {"id": 54061, "name": "Dubhe", "x": 25.0, "y": -18.0, "z": 33.0, "mag": 1.79, "bv": 1.07},
    {"id": 53910, "name": "Merak", "x": 15.0, "y": -12.0, "z": 21.0, "mag": 2.37, "bv": 0.03},
    {"id": 58001, "name": "Phecda", "x": 16.0, "y": -3.0, "z": 25.0, "mag": 2.44, "bv": 0.04},
    {"id": 59774, "name": "Megrez", "x": 16.0, "y": -4.0, "z": 24.0, "mag": 3.31, "bv": 0.07},
    {"id": 62956, "name": "Alioth", "x": 17.0, "y": -3.0, "z": 24.0, "mag": 1.77, "bv": -0.02},
    {"id": 65378, "name": "Mizar", "x": 16.0, "y": -3.0, "z": 24.0, "mag": 2.27, "bv": 0.02},
    {"id": 67301, "name": "Alkaid", "x": 18.0, "y": -7.0, "z": 29.0, "mag": 1.86, "bv": -0.10},
    {"id": 3179, "name": "Schedar", "x": 29.0, "y": 62.0, "z": 21.0, "mag": 2.23, "bv": 1.17},
    {"id": 4427, "name": "Caph", "x": 8.4, "y": 14.0, "z": 5.1, "mag": 2.27, "bv": 0.34},
    {"id": 6686, "name": "Gamma Cas", "x": 38.0, "y": 80.0, "z": 27.0, "mag": 2.47, "bv": -0.15},
    {"id": 49669, "name": "Regulus", "x": -7.2, "y": -24.5, "z": 11.5, "mag": 1.35, "bv": -0.11},
    {"id": 87937, "name": "Proxima Centauri", "x": -0.474, "y": -0.363, "z": -1.156, "mag": 11.13, "bv": 1.90},
]


def bv_to_rgb(bv):
    bv = max(-0.4, min(2.0, bv))
    temp = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62))
    if temp <= 6600:
        r = 255
        g = int(99.4708 * math.log(temp / 100) - 161.1196)
        g = max(0, min(255, g))
        b = 0 if temp <= 1900 else int(138.5177 * math.log(temp / 100 - 10) - 305.0448)
        b = max(0, min(255, b))
    else:
        r = int(329.6987 * ((temp / 100 - 60) ** -0.1332))
        r = max(0, min(255, r))
        g = int(288.1221 * ((temp / 100 - 60) ** -0.0755))
        g = max(0, min(255, g))
        b = 255
    return r, g, b


def generate_test_stars(num_random=3000, output_path="data/stars.json"):
    stars = []

    # Add real bright stars
    for s in BRIGHT_STARS:
        r, g, b = bv_to_rgb(s["bv"])
        star = {
            "id": s["id"],
            "x": s["x"],
            "y": s["y"],
            "z": s["z"],
            "mag": s["mag"],
            "r": r,
            "g": g,
            "b": b,
        }
        if s.get("name"):
            star["name"] = s["name"]
        stars.append(star)

    # Generate random background stars
    random.seed(42)
    used_ids = {s["id"] for s in stars}
    star_id = 200000

    for _ in range(num_random):
        while star_id in used_ids:
            star_id += 1
        used_ids.add(star_id)

        # Random position in a sphere (up to 500 parsecs)
        dist = random.uniform(1, 500) ** 0.5  # Bias toward closer
        theta = random.uniform(0, 2 * math.pi)
        phi = math.acos(random.uniform(-1, 1))

        x = dist * math.sin(phi) * math.cos(theta)
        y = dist * math.sin(phi) * math.sin(theta)
        z = dist * math.cos(phi)

        # Random magnitude (biased toward dimmer)
        mag = random.uniform(1.0, 7.0)

        # Random color (B-V)
        bv = random.gauss(0.6, 0.5)
        bv = max(-0.3, min(2.0, bv))
        r, g, b = bv_to_rgb(bv)

        stars.append({
            "id": star_id,
            "x": round(x, 3),
            "y": round(y, 3),
            "z": round(z, 3),
            "mag": round(mag, 2),
            "r": r,
            "g": g,
            "b": b,
        })
        star_id += 1

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(stars, f, separators=(",", ":"))

    print(f"Generated {len(stars)} test stars ({len(BRIGHT_STARS)} real + {num_random} random)")
    print(f"Written to {output_path}")
    return stars


if __name__ == "__main__":
    output = os.path.join(os.path.dirname(__file__), "..", "data", "stars.json")
    generate_test_stars(output_path=output)
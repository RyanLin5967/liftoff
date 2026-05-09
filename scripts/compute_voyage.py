import json
import math
import os


# --------------- CONSTANTS ---------------

# Proxima Centauri coordinates (from Hipparcos)
# RA: 217.429°, Dec: -62.679°, Parallax: 768.5 mas
PROXIMA_RA_DEG = 217.429
PROXIMA_DEC_DEG = -62.679
PROXIMA_PARALLAX_MAS = 768.5

# Compute Proxima's Cartesian position
_dist = 1000.0 / PROXIMA_PARALLAX_MAS  # 1.301 parsecs
_ra = math.radians(PROXIMA_RA_DEG)
_dec = math.radians(PROXIMA_DEC_DEG)
PROXIMA_X = _dist * math.cos(_dec) * math.cos(_ra)
PROXIMA_Y = _dist * math.cos(_dec) * math.sin(_ra)
PROXIMA_Z = _dist * math.sin(_dec)

# Sol is at origin
SOL_X, SOL_Y, SOL_Z = 0.0, 0.0, 0.0

# Mission parameters
TOTAL_YEARS = 250
DEPARTURE_EARTH_YEAR = 2750
NUM_WAYPOINTS = 1000
SOL_ABSOLUTE_MAG = 4.83  # Sun's absolute magnitude
PROXIMA_ABSOLUTE_MAG = 15.49  # Proxima's absolute magnitude
PC_TO_LY = 3.26156  # parsecs to light-years

# Total distance
TOTAL_DIST_PC = math.sqrt(
    (PROXIMA_X - SOL_X) ** 2
    + (PROXIMA_Y - SOL_Y) ** 2
    + (PROXIMA_Z - SOL_Z) ** 2
)
TOTAL_DIST_LY = TOTAL_DIST_PC * PC_TO_LY
SPEED_LY_PER_YEAR = TOTAL_DIST_LY / TOTAL_YEARS

# Light horizon: signal undetectable beyond this distance (light-years)
# Tuned so the horizon hits around year 200 for dramatic effect
SIGNAL_DETECTION_LIMIT_LY = 3.4


def compute_trajectory():
    """Generate 1000 waypoints from Sol to Proxima Centauri."""
    print("Computing trajectory...")
    print(f"  Proxima position: ({PROXIMA_X:.4f}, {PROXIMA_Y:.4f}, {PROXIMA_Z:.4f}) pc")
    print(f"  Total distance: {TOTAL_DIST_PC:.3f} pc = {TOTAL_DIST_LY:.3f} ly")
    print(f"  Ship speed: {SPEED_LY_PER_YEAR:.5f} ly/year = {SPEED_LY_PER_YEAR / 1:.5f}c")

    trajectory = []
    for i in range(NUM_WAYPOINTS):
        t = i / (NUM_WAYPOINTS - 1)  # 0 to 1
        year = t * TOTAL_YEARS

        # Ship position (linear interpolation)
        x = SOL_X + t * (PROXIMA_X - SOL_X)
        y = SOL_Y + t * (PROXIMA_Y - SOL_Y)
        z = SOL_Z + t * (PROXIMA_Z - SOL_Z)

        # Distance from Sol
        dist_from_sol_pc = math.sqrt(x**2 + y**2 + z**2)
        dist_from_sol_ly = dist_from_sol_pc * PC_TO_LY

        # Sol apparent magnitude from this position
        if dist_from_sol_pc > 0.0001:
            sol_mag = SOL_ABSOLUTE_MAG + 5 * math.log10(dist_from_sol_pc / 0.01)
            # Note: formula is M + 5*log10(d/10pc), but for very close distances
            # we use d in parsecs: m = M + 5*log10(d) + 5
            sol_mag = SOL_ABSOLUTE_MAG + 5 * math.log10(dist_from_sol_pc) + 5
        else:
            sol_mag = -26.74  # From Earth

        # Distance from Proxima
        dx = x - PROXIMA_X
        dy = y - PROXIMA_Y
        dz = z - PROXIMA_Z
        dist_from_proxima_pc = math.sqrt(dx**2 + dy**2 + dz**2)

        # Proxima apparent magnitude from this position
        if dist_from_proxima_pc > 0.0001:
            proxima_mag = PROXIMA_ABSOLUTE_MAG + 5 * math.log10(dist_from_proxima_pc) + 5
        else:
            proxima_mag = 11.13  # From Earth-distance

        # Earth light year currently reaching this position
        # Light from Earth year Y takes (dist_from_sol_ly) years to arrive
        # The ship has been traveling for `year` years since departure
        # Light arriving now was emitted at: departure_year + (year - dist_from_sol_ly/c)
        # Since c = 1 ly/year: emission_time = year - dist_from_sol_ly (in ship time)
        # Earth calendar year: departure_year + (year - dist_from_sol_ly)
        earth_light_year = DEPARTURE_EARTH_YEAR + (year - dist_from_sol_ly)

        trajectory.append({
            "index": i,
            "year": round(year, 2),
            "x": round(x, 6),
            "y": round(y, 6),
            "z": round(z, 6),
            "earth_light_year": round(earth_light_year, 1),
            "sol_mag": round(sol_mag, 2),
            "proxima_mag": round(proxima_mag, 2),
            "dist_from_sol_ly": round(dist_from_sol_ly, 4),
        })

    return trajectory


def compute_light_horizon(trajectory):
    """Find the waypoint where signals from Earth become undetectable."""
    print(f"Computing light horizon (detection limit: {SIGNAL_DETECTION_LIMIT_LY} ly)...")

    horizon = None
    for wp in trajectory:
        if wp["dist_from_sol_ly"] >= SIGNAL_DETECTION_LIMIT_LY:
            horizon = {
                "ship_year": wp["year"],
                "last_earth_year": round(wp["earth_light_year"]),
                "waypoint_index": wp["index"],
            }
            print(f"  Light horizon at ship year {wp['year']}, Earth year {wp['earth_light_year']:.0f}")
            break

    if horizon is None:
        # Shouldn't happen with our parameters, but fallback
        last = trajectory[-1]
        horizon = {
            "ship_year": last["year"],
            "last_earth_year": round(last["earth_light_year"]),
            "waypoint_index": last["index"],
        }

    return horizon


def compute_milestones(trajectory):
    """Find key moments in the voyage."""
    print("Computing milestones...")
    milestones = []

    # Sol invisible to naked eye (magnitude > 6.0)
    for wp in trajectory:
        if wp["sol_mag"] > 6.0:
            milestones.append({
                "waypoint_index": wp["index"],
                "year": wp["year"],
                "label": "Sol drops below naked-eye visibility",
                "type": "sol",
            })
            print(f"  Sol invisible at year {wp['year']}")
            break

    # Halfway point
    half_idx = NUM_WAYPOINTS // 2
    wp = trajectory[half_idx]
    milestones.append({
        "waypoint_index": wp["index"],
        "year": wp["year"],
        "label": "Halfway point",
        "type": "distance",
    })
    print(f"  Halfway at year {wp['year']}")

    # 90% of journey
    idx_90 = int(NUM_WAYPOINTS * 0.9)
    wp90 = trajectory[idx_90]
    milestones.append({
        "waypoint_index": wp90["index"],
        "year": wp90["year"],
        "label": "90% of journey complete",
        "type": "distance",
    })
    print(f"  90% complete at year {wp90['year']}")

    # Entering destination system (last 10 years)
    for wp in trajectory:
        if wp["year"] >= TOTAL_YEARS - 10:
            milestones.append({
                "waypoint_index": wp["index"],
                "year": wp["year"],
                "label": "Entering the Proxima Centauri system",
                "type": "destination",
            })
            print(f"  Entering destination system at year {wp['year']}")
            break

    # Sort by waypoint index
    milestones.sort(key=lambda m: m["waypoint_index"])
    return milestones


def get_memory_pins():
    """Return pre-written memory pin entries."""
    return [
        {
            "waypoint_index": 0,
            "year": 0,
            "author": "Captain Elena Vasquez",
            "generation": 1,
            "title": "Launch day",
            "text": "I watched Earth shrink in the observation port until it was just another blue star. 1,247 souls aboard. We carry everything humanity was. I hope we carry enough.",
        },
        {
            "waypoint_index": 12,
            "year": 3,
            "author": "Dr. James Okafor",
            "generation": 1,
            "title": "First harvest",
            "text": "First successful crop harvest using only ship-grown soil. The lettuce tastes different than Earth lettuce. The children won't know the difference. That thought keeps me up at night.",
        },
        {
            "waypoint_index": 48,
            "year": 12,
            "author": "Maria Santos",
            "generation": 1,
            "title": "Goodbye, Sol",
            "text": "Sol dropped below naked-eye visibility today. I went to the observation deck to say goodbye. Forty people were already there. Nobody spoke.",
        },
        {
            "waypoint_index": 124,
            "year": 31,
            "author": "Kofi Asante",
            "generation": 2,
            "title": "Rain",
            "text": "Mom talks about something called 'rain.' She says water fell from the sky. I've tried to imagine it but I don't think I understand. The recycler drips sometimes. Maybe that's what she means.",
        },
        {
            "waypoint_index": 268,
            "year": 67,
            "author": "Yuki Tanaka",
            "generation": 3,
            "title": "The Oort Cloud",
            "text": "We crossed the Oort Cloud boundary today. Or we think we did. There's no sign, no marker. Someone painted a line on the corridor floor of Section 4 and everyone stepped over it and cheered. That's what borders are now.",
        },
        {
            "waypoint_index": 336,
            "year": 84,
            "author": "Ship Council",
            "generation": 3,
            "title": "Water crisis",
            "text": "Water recycling failure in Sections 7-9. 16-day crisis. Rationing to 1.5 liters per person per day. No casualties. Chief Engineer Park Jimin worked 72 consecutive hours to fabricate a replacement filter from salvaged materials.",
        },
        {
            "waypoint_index": 500,
            "year": 125,
            "author": "Anonymous",
            "generation": 5,
            "title": "Halfway",
            "text": "Halfway. They're celebrating in the commons. I don't understand what there is to celebrate. We're as far from where we came from as where we're going. Both are equally imaginary to me.",
        },
        {
            "waypoint_index": 500,
            "year": 125,
            "author": "Aisha Okonkwo",
            "generation": 5,
            "title": "Teaching Earth",
            "text": "I teach the children about Earth. I show them photographs of oceans and forests. They look at me the way I look at paintings of heaven \u2014 with polite interest in a place they'll never visit and aren't sure is real.",
        },
        {
            "waypoint_index": 624,
            "year": 156,
            "author": "Soren Lindqvist",
            "generation": 6,
            "title": "New music",
            "text": "I composed something today. It's not jazz and it's not classical \u2014 those are Earth words for Earth music. I don't know what to call it. The rhythm comes from the engine vibration. The melody comes from the ventilation harmonics. It's ours.",
        },
        {
            "waypoint_index": 756,
            "year": 189,
            "author": "Dr. Amara Osei",
            "generation": 7,
            "title": "Where do we go",
            "text": "A child asked me today where people go when they die. On Earth, there were many answers. Here, the answer is simple and terrible: the recycler. Their carbon becomes our crops. Their water becomes our water. We eat our ancestors. Nobody says this out loud.",
        },
        {
            "waypoint_index": 880,
            "year": 220,
            "author": "Kai Nakamura",
            "generation": 8,
            "title": "It's real",
            "text": "I used to think the destination was a myth, like Earth. But today I went to the observation deck and Proxima is visibly brighter than last year. It's real. It's actually real. We're going somewhere.",
        },
        {
            "waypoint_index": 988,
            "year": 247,
            "author": "Dr. Sofia Reyes",
            "generation": 10,
            "title": "Alive",
            "text": "Spectral analysis of Proxima b confirms nitrogen-oxygen atmosphere. Liquid water signature detected. The planet is alive. In three years, we'll be the first humans to breathe air we didn't make ourselves.",
        },
    ]


def load_constellations(stars_data):
    """
    Load constellation line data.
    
    Uses Stellarium's constellation data format. If the file isn't available,
    falls back to a built-in set of major constellations with HIP IDs.
    """
    # Built-in major constellations (HIP star ID pairs for lines)
    # Source: IAU/Stellarium constellation lines
    constellations = [
        {
            "name": "Orion",
            "stars": [
                [26727, 26311],  # Betelgeuse - Bellatrix
                [26727, 27366],  # Betelgeuse - Meissa region
                [26311, 25336],  # Bellatrix - Mintaka
                [25336, 25930],  # Mintaka - Alnilam
                [25930, 26221],  # Alnilam - Alnitak
                [26221, 27989],  # Alnitak - Saiph
                [25336, 24436],  # Mintaka - Rigel
                [27989, 26727],  # Saiph - Betelgeuse
                [24436, 26311],  # Rigel - Bellatrix
            ],
        },
        {
            "name": "Ursa Major",
            "stars": [
                [54061, 53910],  # Dubhe - Merak
                [53910, 58001],  # Merak - Phecda
                [58001, 59774],  # Phecda - Megrez
                [59774, 62956],  # Megrez - Alioth
                [62956, 65378],  # Alioth - Mizar
                [65378, 67301],  # Mizar - Alkaid
                [59774, 54061],  # Megrez - Dubhe
            ],
        },
        {
            "name": "Cassiopeia",
            "stars": [
                [3179, 4427],   # Schedar - Caph
                [3179, 6686],   # Schedar - Gamma Cas
                [6686, 8886],   # Gamma Cas - Ruchbah
                [8886, 11569],  # Ruchbah - Segin
            ],
        },
        {
            "name": "Crux",
            "stars": [
                [60718, 62434],  # Acrux - Gacrux
                [61084, 59747],  # Mimosa - Delta Cru
            ],
        },
        {
            "name": "Scorpius",
            "stars": [
                [80763, 78820],  # Antares - Dschubba
                [78820, 78265],
                [78265, 77450],
                [80763, 82396],
                [82396, 82514],
                [82514, 83081],
                [83081, 84143],
                [84143, 86228],
                [86228, 87073],  # Shaula
            ],
        },
        {
            "name": "Leo",
            "stars": [
                [49669, 50583],  # Regulus - Eta Leo
                [50583, 50335],
                [50335, 49583],  # Algieba
                [49583, 49669],
                [50583, 54872],  # Denebola
                [54872, 57632],
                [57632, 54879],
            ],
        },
        {
            "name": "Cygnus",
            "stars": [
                [102098, 100453],  # Deneb - Sadr
                [100453, 95947],   # Sadr - Gienah
                [100453, 97649],   # Sadr - Delta Cyg
                [100453, 104732],  # Cross
                [97649, 94779],
            ],
        },
        {
            "name": "Canis Major",
            "stars": [
                [32349, 33579],  # Sirius - Mirzam
                [32349, 33856],
                [33856, 34444],  # Wezen
                [34444, 35904],  # Aludra
                [33856, 35037],
            ],
        },
    ]

    # Validate: check which star IDs actually exist in our dataset
    star_ids = set()
    for s in stars_data:
        star_ids.add(s["id"])

    for const in constellations:
        valid_lines = []
        for pair in const["stars"]:
            if pair[0] in star_ids and pair[1] in star_ids:
                valid_lines.append(pair)
        const["stars"] = valid_lines

        if len(valid_lines) < len(const["stars"]):
            missing = len(const["stars"]) - len(valid_lines)

    constellations = [c for c in constellations if len(c["stars"]) >= 2]
    print(f"  Loaded {len(constellations)} constellations")

    return constellations


def main():
    # Load stars data (needed for constellation validation)
    stars_path = os.path.join(os.path.dirname(__file__), "..", "data", "stars.json")
    if os.path.exists(stars_path):
        with open(stars_path) as f:
            stars_data = json.load(f)
        print(f"Loaded {len(stars_data)} stars from {stars_path}")
    else:
        print(f"WARNING: {stars_path} not found. Run process_stars.py first.")
        print("  Continuing without constellation validation...")
        stars_data = []

    # Compute trajectory
    trajectory = compute_trajectory()

    # Compute light horizon
    light_horizon = compute_light_horizon(trajectory)

    # Add light horizon pin to the pin list
    pins = get_memory_pins()
    pins.append({
        "waypoint_index": light_horizon["waypoint_index"],
        "year": light_horizon["ship_year"],
        "author": "SYSTEM",
        "generation": 0,
        "title": "Light horizon",
        "text": f"The last detectable light from Earth reached the ship today. Emission date: approximately Earth year {light_horizon['last_earth_year']}. All subsequent photons from Sol's vicinity fall below the noise floor of our instruments. Earth's future is now permanently unknowable to this vessel.",
    })
    pins.sort(key=lambda p: p["waypoint_index"])

    # Compute milestones
    milestones = compute_milestones(trajectory)

    # Add light horizon as a milestone too
    milestones.append({
        "waypoint_index": light_horizon["waypoint_index"],
        "year": light_horizon["ship_year"],
        "label": "Light horizon \u2014 last light from Earth",
        "type": "light",
    })
    milestones.sort(key=lambda m: m["waypoint_index"])

    # Load constellations
    constellations = load_constellations(stars_data)

    # Strip per-waypoint fields not needed by frontend (keep JSON smaller)
    trajectory_clean = []
    for wp in trajectory:
        trajectory_clean.append({
            "index": wp["index"],
            "year": wp["year"],
            "x": wp["x"],
            "y": wp["y"],
            "z": wp["z"],
            "earth_light_year": wp["earth_light_year"],
            "sol_mag": wp["sol_mag"],
        })

    # Assemble voyage.json
    voyage = {
        "trajectory": trajectory_clean,
        "light_horizon": light_horizon,
        "constellations": constellations,
        "milestones": milestones,
        "pins": pins,
        "metadata": {
            "total_years": TOTAL_YEARS,
            "total_distance_pc": round(TOTAL_DIST_PC, 4),
            "total_distance_ly": round(TOTAL_DIST_LY, 4),
            "total_waypoints": NUM_WAYPOINTS,
            "ship_speed_ly_per_year": round(SPEED_LY_PER_YEAR, 5),
            "departure_earth_year": DEPARTURE_EARTH_YEAR,
            "num_stars": len(stars_data),
            "proxima": {
                "x": round(PROXIMA_X, 6),
                "y": round(PROXIMA_Y, 6),
                "z": round(PROXIMA_Z, 6),
            },
            "sol": {"x": 0.0, "y": 0.0, "z": 0.0},
        },
    }

    output_path = os.path.join(os.path.dirname(__file__), "..", "data", "voyage.json")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    with open(output_path, "w") as f:
        json.dump(voyage, f, indent=2)

    size_kb = os.path.getsize(output_path) / 1024
    print(f"\nWritten to {output_path} ({size_kb:.0f} KB)")
    print(f"  {len(trajectory)} waypoints")
    print(f"  {len(milestones)} milestones")
    print(f"  {len(pins)} memory pins")
    print(f"  {len(constellations)} constellations")
    print(f"  Light horizon: ship year {light_horizon['ship_year']}, Earth year {light_horizon['last_earth_year']}")


if __name__ == "__main__":
    main()
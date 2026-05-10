# Voyage

An interactive 3D interstellar journey. Pick a destination star, set your speed, and scrub through centuries of travel as 119,000 real stars shift around you.

Built for the Atlas Hackathon 2025.

## What it does

Voyage turns featureless interstellar space into a navigable timeline. As you scrub through the journey:

- **Stars shift with real parallax** from the Hipparcos catalog, with colors based on spectral data
- **Constellations deform and dissolve** because the stars were never actually near each other
- **Flyby events appear** when the trajectory passes near named stars, brown dwarfs, or exoplanet hosts
- **Earth's radio fades** into static, then silence at the computed light horizon
- **Memory pins** from past generations mark the route with their stories. Add your own and they sync to everyone through Firebase.

You can pick any destination star and adjust the ship's speed. The trajectory, milestones, light horizon, and flyby events all recompute on the fly.

## Data sources

| Source | What it provides |
|--------|-----------------|
| [Hipparcos catalog (HYG v4)](https://github.com/astronexus/HYG-Database) | 119,000 stars with 3D positions, magnitudes, and B-V color indices |
| [RECONS Top 100 nearest stars](http://www.recons.org) | Brown dwarfs and cool dwarfs that Hipparcos missed (Luhman 16, WISE objects, etc.) |
| [NASA Exoplanet Archive](https://exoplanetarchive.ipac.caltech.edu) | Confirmed exoplanet counts per host star, used to enrich flyby descriptions |

Brown dwarfs from RECONS are matched against the main catalog by position (within 0.05 pc) to avoid duplicates. Non-matching entries get negative synthetic IDs so they don't collide with Hipparcos numbers.

## Setup

### Requirements

- Node.js >= 20
- A browser that supports ES modules and WebGL

### Install and run

```bash
git clone <repo-url>
cd voyage
npm install
```

### Firebase (optional, for shared memory pins)

Without Firebase, memory pins are saved to localStorage. To enable shared pins:

1. Go to [Firebase Console](https://console.firebase.google.com) and create a project
2. Add a Web app and copy the config values
3. Create a Firestore database in test mode
4. Create a `.env` file in the project root:

```
FIREBASE_API_KEY=your-api-key
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=123456789
FIREBASE_APP_ID=1:123456789:web:abc123
```

5. Run:

```bash
npm run dev
```

This builds `firebase-config.json` from your `.env` and starts a local server on port 5173.

If you skip Firebase setup, the app still works. Pins just stay local.

## Project structure

```
voyage/
├── index.html                  Main page
├── src/
│   ├── main.js                 App entry, UI, slider logic, event timeline
│   ├── scene.js                Three.js scene, star rendering, camera, post-processing
│   ├── voyage-engine.js        Data loading, trajectory math, flyby computation
│   ├── audio-engine.js         Web Audio fading Earth radio
│   └── firebase.js             Firestore shared memory pins
├── data/
│   ├── stars.json              Processed Hipparcos catalog
│   ├── voyage.json             Trajectory, milestones, seed memory pins
│   ├── recons_top100_nearest_stars.csv
│   └── PSCompPars_*.csv        NASA Exoplanet Archive export
├── scripts/
│   ├── process_stars.py        Hipparcos CSV to stars.json
│   ├── compute_voyage.py       Trajectory, light horizon, milestones
│   ├── generate_test_stars.py  Test data for development
│   └── build-firebase-config.mjs  .env to firebase-config.json
├── audio/
│   ├── earth-radio.mp3         Ambient Earth signal loop
│   └── static.mp3              Radio static loop
└── package.json
```

## How it works

**Star rendering:** Each star is an instanced quad with a custom GLSL shader that handles size attenuation, spectral coloring, and a style attribute that distinguishes regular stars, brown dwarfs, and exoplanet hosts. Bloom post-processing (UnrealBloomPass) makes bright stars glow.

**Trajectory computation:** A straight-line path from Sol to the destination, divided into 1,000 waypoints. At each waypoint, Sol's apparent magnitude is computed from the distance formula. The light horizon is where signal attenuation makes Earth undetectable (capped at 85% of trip distance).

**Flyby detection:** For every named star, brown dwarf, and exoplanet host, the engine projects the star onto the trajectory line and computes closest-approach distance. Anything within 5 ly gets a flyby event with year, distance, spectral type, and planet count.

**Memory pins:** Seed pins (Captain Vasquez, etc.) ship in voyage.json and cover the first 15 years. User-added pins go to Firestore (or localStorage as fallback), partitioned by destination star ID so different voyages have separate log books.

**Audio:** Two looping audio sources (Earth radio + static) routed through Web Audio GainNodes. Volume is tied to distance from Sol via inverse-square. At the light horizon, radio cuts to zero and static fades over 8 simulated years.

## Tech stack

- Three.js (custom shaders, instanced rendering, UnrealBloomPass)
- Web Audio API
- Firebase Firestore
- Python (pandas, numpy) for data preprocessing
- Hipparcos, RECONS, and NASA Exoplanet Archive datasets

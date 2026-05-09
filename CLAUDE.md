# Prompt for Frontend Person (Person B)

You are helping me build a hackathon project called "Voyage" — an interactive 3D journey through interstellar space along a generation ship's trajectory from Sol to Proxima Centauri. Users scrub through 250 years of travel using a slider. Stars shift around them (real parallax from real star data). Earth's constellations deform and dissolve. Fading radio from Earth goes silent at the "light horizon" — the moment when Earth's light stops reaching the ship forever. Memory pins along the route contain journal entries from different generations of crew.

My teammate (Person A) is handling all data processing and computation. They produce:
- `data/stars.json` — 30-50k real stars with 3D positions, colors, and magnitudes
- `data/voyage.json` — trajectory waypoints, light horizon data, constellation lines, milestones, and memory pin content
- `src/voyage-engine.js` — a JS module with functions I call to get computed data
- `src/audio-engine.js` — a JS module that handles the fading Earth radio audio

My job is to build everything the user SEES and INTERACTS with using Three.js.

---

## Project structure

```
voyage/
├── index.html
├── data/
│   ├── stars.json              ← Person A produces this
│   └── voyage.json             ← Person A produces this
├── audio/
│   ├── earth-radio.mp3         ← Person A sources this
│   └── static.mp3              ← Person A sources this
├── src/
│   ├── main.js                 ← I own this (app entry, slider wiring)
│   ├── scene.js                ← I own this (Three.js scene, stars, camera)
│   ├── ui.js                   ← I own this (info panel, pin popups, milestone labels)
│   ├── voyage-engine.js        ← Person A owns this (I import it)
│   └── audio-engine.js         ← Person A owns this (I import it)
└── package.json
```

---

## Data I receive (exact schemas)

### stars.json

Array of star objects:
```json
[
  {
    "id": 32349,
    "x": -1.812,       // 3D position in parsecs
    "y": 0.094,
    "z": -0.474,
    "mag": -1.46,       // apparent magnitude (lower = brighter)
    "r": 162,           // RGB color 0-255
    "g": 192,
    "b": 255,
    "name": "Sirius"    // string or null
  }
]
```

### voyage.json

```json
{
  "trajectory": [
    {
      "index": 0,
      "year": 0.0,
      "x": 0.0, "y": 0.0, "z": 0.0,
      "earth_light_year": 2750.0,
      "sol_mag": -26.74
    }
    // ... 1000 waypoints total
  ],
  "light_horizon": {
    "ship_year": 203.4,
    "last_earth_year": 2897,
    "waypoint_index": 814
  },
  "constellations": [
    {
      "name": "Orion",
      "stars": [[27989, 26727], [26727, 25336], ...]
    }
  ],
  "milestones": [
    {
      "waypoint_index": 48,
      "year": 12.0,
      "label": "Sol drops below naked-eye visibility",
      "type": "sol"
    }
  ],
  "pins": [
    {
      "waypoint_index": 0,
      "year": 0,
      "author": "Captain Elena Vasquez",
      "generation": 1,
      "title": "Launch day",
      "text": "I watched Earth shrink in the observation port..."
    }
  ],
  "metadata": {
    "total_years": 250,
    "total_distance_ly": 4.244,
    "total_waypoints": 1000,
    "proxima": { "x": -0.472, "y": -0.362, "z": -1.152 },
    "sol": { "x": 0.0, "y": 0.0, "z": 0.0 }
  }
}
```

---

## API from voyage-engine.js (Person A's module)

Functions I import and call:

```javascript
import * as Voyage from './voyage-engine.js';

// Initialize — loads JSON files, must be called first
const { starsData, voyageData } = await Voyage.init();

// Get interpolated waypoint for any year 0-250
const wp = Voyage.getWaypoint(year);
// Returns: { x, y, z, year, earthLightYear, solMag, waypointIndex }

// Get star positions relative to ship position
const positions = Voyage.getStarPositions(shipX, shipY, shipZ);
// Returns: Float32Array of [x,y,z, x,y,z, ...] — use directly as BufferAttribute

// Get star colors (only need to call once, colors don't change)
const colors = Voyage.getStarColors();
// Returns: Float32Array of [r,g,b, r,g,b, ...] normalized 0-1

// Get star sizes based on magnitude (only need to call once)
const sizes = Voyage.getStarSizes();
// Returns: Float32Array of point sizes

// Get constellation lines relative to ship position
const constLines = Voyage.getConstellationLines(shipX, shipY, shipZ);
// Returns: [{ name: "Orion", positions: Float32Array }, ...]

// Get named stars near the ship
const nearby = Voyage.getNearbyStars(shipX, shipY, shipZ, 1.5);
// Returns: [{ id, name, distance, relX, relY, relZ, ... }, ...]
// maxDistancePc = 1.5 parsecs ≈ 5 light-years

// Get memory pins near current position
const pins = Voyage.getActivePins(waypointIndex, 20);
// Returns: pins within 20 waypoints of current position

// Get milestones near current position
const milestones = Voyage.getActiveMilestones(waypointIndex, 10);

// Light horizon info
const lh = Voyage.getLightHorizon();
// Returns: { ship_year, last_earth_year, waypoint_index }

const pastHorizon = Voyage.isPastLightHorizon(year);
// Returns: boolean
```

---

## API from audio-engine.js (Person A's module)

```javascript
import * as Audio from './audio-engine.js';

await Audio.init();           // Load audio files
Audio.start();                // Begin playback (call after user interaction for browser autoplay policy)
Audio.update(year, lightHorizonYear);  // Call on every slider change
Audio.setMasterVolume(0.3);   // 0-1
```

---

## What I need to build

### main.js — App entry point

```javascript
import * as Voyage from './voyage-engine.js';
import * as Audio from './audio-engine.js';
import { createScene, updateScene } from './scene.js';
import { createUI, updateUI } from './ui.js';

async function setup() {
  // Load data
  const { starsData, voyageData } = await Voyage.init();

  // Create Three.js scene
  const scene = createScene(starsData);

  // Create UI elements
  const ui = createUI();

  // Audio init (start on first user interaction)
  await Audio.init();
  let audioStarted = false;

  // Slider handler
  ui.slider.addEventListener('input', (e) => {
    if (!audioStarted) { Audio.start(); audioStarted = true; }

    const year = parseFloat(e.target.value);
    const wp = Voyage.getWaypoint(year);

    // Update 3D scene
    updateScene(scene, wp, Voyage);

    // Update audio
    Audio.update(year, Voyage.getLightHorizon().ship_year);

    // Update UI panels
    updateUI(ui, wp, Voyage);
  });
}

setup();
```

### scene.js — Three.js scene

Responsible for:
1. Scene, camera, renderer setup
2. Star field (THREE.Points)
3. Trajectory line (THREE.Line)
4. Ship position indicator (glowing point on trajectory)
5. Constellation lines (THREE.LineSegments, one per constellation)
6. Memory pin markers (THREE.Sprite along trajectory)
7. Light horizon sphere (THREE.Mesh, transparent, expanding from Sol)
8. Post-processing (UnrealBloomPass for star glow)
9. Camera controls (OrbitControls)

Key implementation details:

**Star field:**
```javascript
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

// Use custom ShaderMaterial for size attenuation and per-point sizing
const material = new THREE.ShaderMaterial({
  vertexShader: `
    attribute float size;
    varying vec3 vColor;
    void main() {
      vColor = color;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = size * (200.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    varying vec3 vColor;
    void main() {
      float d = length(gl_PointCoord - vec2(0.5));
      if (d > 0.5) discard;
      float alpha = 1.0 - smoothstep(0.0, 0.5, d);
      gl_FragColor = vec4(vColor, alpha);
    }
  `,
  transparent: true,
  vertexColors: true,
  depthWrite: false
});

const stars = new THREE.Points(geometry, material);
scene.add(stars);
```

**Updating star positions on scrub:**
```javascript
function updateScene(sceneState, wp, Voyage) {
  const newPositions = Voyage.getStarPositions(wp.x, wp.y, wp.z);
  sceneState.starGeometry.attributes.position.array.set(newPositions);
  sceneState.starGeometry.attributes.position.needsUpdate = true;

  // Update constellation lines
  const constLines = Voyage.getConstellationLines(wp.x, wp.y, wp.z);
  // Update each constellation's LineSegments geometry...

  // Update ship position indicator
  sceneState.shipMarker.position.set(0, 0, 0); // Ship is always at origin; stars move around it

  // Update light horizon sphere
  // ... radius based on current year ...
}
```

**Camera:** Use OrbitControls. The "ship" is always at the scene origin (0,0,0). Stars move around it. This way the camera orbits around the viewer's position naturally. The trajectory line shows where the ship has been and will go, relative to the current position.

**Post-processing bloom:**
```javascript
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.5,   // strength
  0.4,   // radius
  0.85   // threshold
);
composer.addPass(bloom);
// In render loop: composer.render() instead of renderer.render()
```

### ui.js — HTML overlay UI

All UI is HTML/CSS positioned over the Three.js canvas. Not 3D elements.

Elements:
1. **Year slider** — `<input type="range" min="0" max="250" step="0.1">` at the bottom of the screen
2. **Year display** — Shows "Year 125 of 250" near the slider
3. **Light info panel** — Top-left, shows "Light from Earth year 2873 is reaching you now" or "No light from Earth will ever reach this ship again" if past horizon
4. **Sol status** — Shows Sol's current magnitude and visibility status
5. **Memory pin popup** — A panel that slides in from the right when a pin is clicked. Shows author, generation, title, text. Has a close button.
6. **Milestone notification** — A brief notification that appears when you scrub past a milestone ("Sol is now invisible to the naked eye")
7. **Mute button** — Toggle audio on/off

Styling: dark theme, semi-transparent backgrounds (rgba(0,0,0,0.6)), white text, minimal and clean. The 3D scene should dominate — UI is informational overlay only.

---

## Visual design notes

- Background: not pure black. Use renderer.setClearColor(0x020208) for a very dark blue-black.
- Stars: warm colors for red/orange stars, cool blue-white for hot stars. Bloom makes bright stars glow.
- Trajectory line: thin, semi-transparent white or blue line. Shows the full path. The "past" portion (already traveled) could be slightly brighter than the "future" portion.
- Memory pins: small diamond or circle sprites along the trajectory, subtle glow, brighter when nearby.
- Constellation lines: very thin (0.3-0.5 opacity), white or light blue. Fade out as constellations deform beyond recognition (when the maximum star displacement exceeds some threshold).
- Light horizon sphere: very subtle. A faint expanding shell from Sol's position. Almost invisible — just enough to see. Changes color or disappears at the horizon moment.

---

## My timeline

Hours 0-2: Three.js project setup. Scene, camera, renderer, OrbitControls. Temporary star field (50 test stars). Slider wired to a year variable. Basic rendering loop with bloom.

Hours 2-4: Trajectory line rendering. Ship position indicator. Camera follow behavior. Slider controls year smoothly.

Hours 4-5: FIRST INTEGRATION — receive real star data from Person A. Load stars.json, render 30-50k real stars with colors and sizes. This is the "wow" moment — the scene goes from 50 dots to a galaxy.

Hours 5-7: Constellation line rendering (load from voyage.json, render as LineSegments, update on scrub). Constellation labels for major ones.

Hours 7-9: Memory pin markers along trajectory. Click handler → popup panel with entry text. Style the popup. Milestone notifications.

Hours 9-11: Light info panel (current Earth light year display). Light horizon visualization. Connect to audio engine from Person A.

Hours 11-13: Visual polish — bloom tuning, star sizing, color refinement, smooth transitions, responsive layout. Camera animation improvements.

Hours 13-15: Demo rehearsal with Person A. Final tweaks. Practice the pitch.

---

## Key Three.js imports needed

```
three (core)
three/examples/jsm/controls/OrbitControls
three/examples/jsm/postprocessing/EffectComposer
three/examples/jsm/postprocessing/RenderPass
three/examples/jsm/postprocessing/UnrealBloomPass
```

Install with: `npm install three`

Or use CDN:
```html
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.162.0/build/three.module.js",
    "three/examples/": "https://cdn.jsdelivr.net/npm/three@0.162.0/examples/"
  }
}
</script>
```
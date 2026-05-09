# Voyage — A Generation Ship Journey Experience

## The pitch (30 seconds)

Space has no landmarks. No seasons, no geography, no borders. For 250 years, a generation ship travels through nothing. Every day looks the same. Every year feels the same. The void has no story.

Voyage gives it one. Every point in space has a history — who was here, what they saw, what light was reaching them from home, what they left behind. Voyage turns featureless emptiness into a landscape of human memory. And it answers the question every ship-born person secretly asks: how far are we from home — not in distance, but in time, in memory, in light?

## Track

**Echoes of Earth** — Preserve humanity's memories or knowledge for generations who may never see Earth again.

## What it is

An interactive 3D journey through interstellar space along a generation ship's trajectory from Sol to Proxima Centauri. Users scrub through 250 years of travel and experience the voyage through three layers:

1. **The sky** — Real stars from the Hipparcos catalog rendered in 3D. As the ship moves, constellations deform and dissolve, nearby stars shift, the destination star grows brighter. The universe visibly changes around you.

2. **The memories** — Past generations left recordings pinned to spatial positions along the route. "We were here when Sol disappeared from view." "We were here during the famine." "We were here when the first child was born who would live to see arrival." The journey becomes a story told through space.

3. **The light** — Earth's light chases the ship. At any point, you can see what year's light from Earth is currently reaching you. A visualization shows the light wavefront propagating outward from Sol and intersecting the ship's path. At a computable point — the light horizon — the last light from Earth reaches the ship. After that, silence forever.

## Core features (priority order)

### P0 — Must have for demo

**1. 3D star field from real data**
- Load Hipparcos catalog (~100k stars with 3D positions, colors, magnitudes)
- Render as Three.js Points with per-star color and brightness
- Stars shift position as the ship moves (parallax from real 3D coordinates)
- Camera controls (orbit, zoom) so the viewer can look around from the ship's position

**2. Ship trajectory and scrub slider**
- A visible line through space from Sol to Proxima Centauri
- HTML slider tied to time (Year 0 to Year 250)
- Moving the slider moves the ship's position along the trajectory
- Star positions update in real-time as you scrub

**3. Light horizon**
- Compute when light from each Earth-year reaches the ship at each trajectory point
- Display: "The light from Earth's year [X] is reaching you now"
- Visualize the light wavefront (expanding sphere from Sol's position)
- The moment it stops reaching the ship = the light horizon
- Display: "In [Y] years, the last light from Earth reaches this ship. After that, silence."

**4. Memory pins (pre-populated)**
- 12-15 recordings from different generations pinned to spatial positions
- Clickable markers on the trajectory line
- Clicking opens a panel with: author name, generation, year, text entry
- Include generational contrast pins (multiple entries at the same position from different generations)

### P1 — Should have

**5. Constellation lines**
- IAU constellation line data (which stars connect)
- Render lines between connected stars
- Watch constellations deform as you scrub (because stars are at different depths)
- Label major constellations (Orion, Big Dipper, etc.)

**6. Nearby star labels**
- At each trajectory point, compute which stars are within 5 light-years
- Display labels with star name and distance
- Labels appear/disappear as you pass by stars

**7. Fading Earth radio (audio)**
- Ambient audio layer: faint music/broadcast fragments
- Volume tied to inverse-square of distance from Sol
- Pitch slightly lowered by Doppler shift computation
- Gradually becomes static, then silence after the light horizon
- Use Web Audio API (GainNode for volume, playbackRate for pitch)

**8. Bidirectional light display**
- "Light from this moment reaches Earth in [X] years"
- Shows that the ship is also sending light backward — Earth sees the ship's past
- "Earth is currently seeing the ship as it was in Year [Y]"

### P2 — Nice to have

**9. Send a message home**
- Text input where the viewer composes a message
- Tool computes: "This message reaches Earth in [X] years"
- Animated light pulse traveling backward along the trajectory toward Sol
- Message saved to the journey (persistent storage)

**10. Proper motion**
- Stars move over centuries (documented in Hipparcos as proper motion vectors)
- Project star positions forward in time based on proper motion data
- Stars aren't frozen — they slowly drift over the 250-year voyage

**11. Astronomical milestones**
- Waypoint markers on the trajectory: "Halfway point," "Sol drops below naked-eye visibility," "Proxima becomes brightest star," "First resolved disk of destination"
- Computed from stellar magnitudes and distances along trajectory

**12. Sol visibility tracker**
- Compute Sol's apparent magnitude from each point on the trajectory
- Show: "Sol is now magnitude [X] — [visible to naked eye / requires binoculars / requires telescope / invisible]"
- The moment Sol becomes invisible is a major emotional milestone

---
/**
 * Voyage Engine — core data and computation module.
 *
 * Loads stars.json and voyage.json, exposes functions for the Three.js scene
 * to call on every slider update.
 *
 * Usage:
 *   import * as Voyage from './voyage-engine.js';
 *   const { starsData, voyageData } = await Voyage.init();
 *   const wp = Voyage.getWaypoint(125.5);
 *   const positions = Voyage.getStarPositions(wp.x, wp.y, wp.z);
 */

let starsData = null;
let voyageData = null;
let starMap = null; // Map<id, star> for constellation lookups

export async function init() {
  const [starsRes, voyageRes] = await Promise.all([
    fetch("./data/stars.json"),
    fetch("./data/voyage.json"),
  ]);

  starsData = await starsRes.json();
  voyageData = await voyageRes.json();

  // Build lookup map for constellation line rendering
  starMap = new Map();
  starsData.forEach((s, idx) => {
    starMap.set(s.id, { ...s, _idx: idx });
  });

  return { starsData, voyageData };
}

/**
 * Get interpolated waypoint data for a given year (0 to totalYears).
 */
export function getWaypoint(year) {
  const traj = voyageData.trajectory;
  const totalYears = voyageData.metadata.total_years;

  // Clamp
  year = Math.max(0, Math.min(totalYears, year));

  // Map year to trajectory index
  const t = (year / totalYears) * (traj.length - 1);
  const i = Math.floor(t);
  const frac = t - i;
  const a = traj[Math.min(i, traj.length - 1)];
  const b = traj[Math.min(i + 1, traj.length - 1)];

  return {
    x: a.x + frac * (b.x - a.x),
    y: a.y + frac * (b.y - a.y),
    z: a.z + frac * (b.z - a.z),
    year,
    earthLightYear: a.earth_light_year + frac * (b.earth_light_year - a.earth_light_year),
    solMag: a.sol_mag + frac * (b.sol_mag - a.sol_mag),
    waypointIndex: Math.round(t),
    distFromSolLy: year * voyageData.metadata.ship_speed_ly_per_year,
  };
}

/**
 * Get star positions relative to ship position.
 * Returns Float32Array for direct use as BufferAttribute.
 */
export function getStarPositions(shipX, shipY, shipZ) {
  const len = starsData.length;
  const positions = new Float32Array(len * 3);
  for (let i = 0; i < len; i++) {
    const s = starsData[i];
    positions[i * 3] = s.x - shipX;
    positions[i * 3 + 1] = s.y - shipY;
    positions[i * 3 + 2] = s.z - shipZ;
  }
  return positions;
}

/**
 * Get star colors. Only needs to be called once (colors don't change).
 * Returns Float32Array normalized to 0-1 for BufferAttribute.
 */
export function getStarColors() {
  const len = starsData.length;
  const colors = new Float32Array(len * 3);
  for (let i = 0; i < len; i++) {
    colors[i * 3] = starsData[i].r / 255;
    colors[i * 3 + 1] = starsData[i].g / 255;
    colors[i * 3 + 2] = starsData[i].b / 255;
  }
  return colors;
}

/**
 * Get star sizes based on apparent magnitude.
 * Brighter (lower mag) = bigger point. Only call once.
 */
export function getStarSizes() {
  const len = starsData.length;
  const sizes = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const mag = starsData[i].mag;
    // mag -1.5 → size 5, mag 7 → size 0.3
    sizes[i] = Math.max(0.3, 5.0 * Math.pow(10, -0.15 * (mag - (-1.5))));
  }
  return sizes;
}

/**
 * Get constellation line segments relative to ship position.
 * Returns array of { name, positions: Float32Array }.
 * Each pair of 3 floats in positions is one line segment endpoint.
 */
export function getConstellationLines(shipX, shipY, shipZ) {
  if (!voyageData.constellations) return [];

  return voyageData.constellations.map((c) => {
    const positions = [];
    c.stars.forEach(([id1, id2]) => {
      const s1 = starMap.get(id1);
      const s2 = starMap.get(id2);
      if (s1 && s2) {
        positions.push(
          s1.x - shipX, s1.y - shipY, s1.z - shipZ,
          s2.x - shipX, s2.y - shipY, s2.z - shipZ
        );
      }
    });
    return { name: c.name, positions: new Float32Array(positions) };
  });
}

/**
 * Get named stars within maxDistPc parsecs of the ship.
 * Returns sorted by distance (closest first).
 */
export function getNearbyStars(shipX, shipY, shipZ, maxDistPc = 1.5) {
  const maxDist2 = maxDistPc * maxDistPc;
  const nearby = [];
  for (const star of starsData) {
    if (!star.name) continue;
    const dx = star.x - shipX;
    const dy = star.y - shipY;
    const dz = star.z - shipZ;
    const dist2 = dx * dx + dy * dy + dz * dz;
    if (dist2 < maxDist2) {
      nearby.push({
        ...star,
        distance: Math.sqrt(dist2),
        distanceLy: Math.sqrt(dist2) * 3.26156,
        relX: dx,
        relY: dy,
        relZ: dz,
      });
    }
  }
  return nearby.sort((a, b) => a.distance - b.distance);
}

/**
 * Get memory pins within `range` waypoint indices of current position.
 */
export function getActivePins(waypointIndex, range = 20) {
  return voyageData.pins.filter(
    (p) => Math.abs(p.waypoint_index - waypointIndex) <= range
  );
}

/**
 * Get milestones within `range` waypoint indices of current position.
 */
export function getActiveMilestones(waypointIndex, range = 15) {
  return voyageData.milestones.filter(
    (m) => Math.abs(m.waypoint_index - waypointIndex) <= range
  );
}

/**
 * Get all milestones (for placing markers on trajectory).
 */
export function getAllMilestones() {
  return voyageData.milestones;
}

/**
 * Get all memory pins (for placing markers on trajectory).
 */
export function getAllPins() {
  return voyageData.pins;
}

/**
 * Get light horizon data.
 */
export function getLightHorizon() {
  return voyageData.light_horizon;
}

/**
 * Check if a given year is past the light horizon.
 */
export function isPastLightHorizon(year) {
  return year >= voyageData.light_horizon.ship_year;
}

/**
 * Get voyage metadata.
 */
export function getMetadata() {
  return voyageData.metadata;
}

/**
 * Get the trajectory path as a Float32Array for rendering the full line.
 * Positions are ABSOLUTE (not relative to ship) since the trajectory
 * line itself moves with the stars.
 */
export function getTrajectoryPositions(shipX, shipY, shipZ) {
  const traj = voyageData.trajectory;
  const positions = new Float32Array(traj.length * 3);
  for (let i = 0; i < traj.length; i++) {
    positions[i * 3] = traj[i].x - shipX;
    positions[i * 3 + 1] = traj[i].y - shipY;
    positions[i * 3 + 2] = traj[i].z - shipZ;
  }
  return positions;
}

const PARSEC_TO_LY = 3.26156;
const SOL_ABS_MAG = 4.83;
const DEFAULT_DEPARTURE_YEAR = 2750;
const SIGNAL_HORIZON_LY = 3.5;
const TOTAL_WAYPOINTS = 1000;

/**
 * Recompute the entire voyage in-memory based on a destination star and ship speed.
 * Mutates voyageData.trajectory, .milestones, .light_horizon, .metadata.
 *
 * @param {Object} opts
 * @param {number} opts.destinationStarId  HIP id of a star in starsData
 * @param {number} opts.speedC             Ship speed as a fraction of c (0 < speedC < 1)
 * @returns {Object} the updated voyageData
 */
export function setVoyage({ destinationStarId, speedC }) {
  if (!starsData || !voyageData) {
    throw new Error('setVoyage called before init()');
  }
  const dest = starsData.find((s) => s.id === destinationStarId);
  if (!dest) throw new Error(`No star with HIP ${destinationStarId}`);
  if (!Number.isFinite(speedC) || speedC <= 0 || speedC >= 1) {
    throw new Error(`Speed must be 0 < speedC < 1 (fraction of c); got ${speedC}`);
  }

  const distance_pc = Math.hypot(dest.x, dest.y, dest.z);
  const distance_ly = distance_pc * PARSEC_TO_LY;
  const speed_ly_per_year = speedC; // c == 1 ly/yr
  const total_years = distance_ly / speed_ly_per_year;
  const total_waypoints = TOTAL_WAYPOINTS;
  const departureEarthYear = DEFAULT_DEPARTURE_YEAR;
  const destName = dest.name || `HIP ${dest.id}`;

  // Trajectory: linear interpolation Sol → destination over `total_years`.
  const trajectory = new Array(total_waypoints);
  for (let i = 0; i < total_waypoints; i++) {
    const t = i / (total_waypoints - 1);
    const year = t * total_years;
    const x = dest.x * t;
    const y = dest.y * t;
    const z = dest.z * t;
    const distFromSolPc = Math.hypot(x, y, z);
    const distFromSolLy = distFromSolPc * PARSEC_TO_LY;
    // Earth's calendar year whose light is currently reaching the ship.
    // Light from year Y arrives at the ship at ship-year (Y - dep) + dist_from_sol_ly,
    // so for ship-year `year` and ship distance `distFromSolLy`:
    //     Y = dep + year - distFromSolLy
    const earthLightYear = departureEarthYear + year - distFromSolLy;
    const solMag =
      distFromSolPc > 0 ? SOL_ABS_MAG + 5 * Math.log10(distFromSolPc / 10) : -26.74;

    trajectory[i] = {
      index: i,
      year,
      x,
      y,
      z,
      earth_light_year: earthLightYear,
      sol_mag: solMag,
    };
  }

  // Light horizon: signal undetectable beyond SIGNAL_HORIZON_LY from Earth.
  // Cap at 85% of trip distance so it's always before destination.
  const horizonDistanceLy = Math.min(SIGNAL_HORIZON_LY, 0.85 * distance_ly);
  const horizonShipYear = horizonDistanceLy / speed_ly_per_year;
  const horizonWaypointIndex = Math.min(
    total_waypoints - 1,
    Math.round((horizonShipYear / total_years) * (total_waypoints - 1))
  );
  const horizonEarthLightYear = departureEarthYear + horizonShipYear - horizonDistanceLy;

  // Milestones — recomputed each setVoyage. Hand-crafted/user-added pins live
  // in voyageData.pins and are NOT touched here.
  const milestones = [];
  let solInvisibleIdx = -1;
  for (let i = 0; i < total_waypoints; i++) {
    if (trajectory[i].sol_mag > 6) { solInvisibleIdx = i; break; }
  }
  if (solInvisibleIdx >= 0) {
    milestones.push({
      waypoint_index: solInvisibleIdx,
      year: trajectory[solInvisibleIdx].year,
      label: 'Sol drops below naked-eye visibility',
      type: 'sol',
    });
  }
  const halfIdx = Math.floor(total_waypoints / 2);
  milestones.push({
    waypoint_index: halfIdx,
    year: trajectory[halfIdx].year,
    label: `Halfway to ${destName}`,
    type: 'distance',
  });
  milestones.push({
    waypoint_index: horizonWaypointIndex,
    year: horizonShipYear,
    label: 'Light horizon — Earth signal fades',
    type: 'horizon',
  });
  milestones.push({
    waypoint_index: total_waypoints - 1,
    year: total_years,
    label: `Arrival at ${destName}`,
    type: 'destination',
  });

  voyageData.trajectory = trajectory;
  voyageData.light_horizon = {
    ship_year: horizonShipYear,
    last_earth_year: Math.round(horizonEarthLightYear),
    waypoint_index: horizonWaypointIndex,
  };
  voyageData.milestones = milestones;
  voyageData.metadata = {
    ...(voyageData.metadata || {}),
    total_years,
    total_distance_pc: distance_pc,
    total_distance_ly: distance_ly,
    total_waypoints,
    ship_speed_ly_per_year: speed_ly_per_year,
    ship_speed_c: speedC,
    departure_earth_year: departureEarthYear,
    destination_name: destName,
    destination: { x: dest.x, y: dest.y, z: dest.z, name: destName, id: dest.id },
    proxima: { x: dest.x, y: dest.y, z: dest.z }, // legacy alias
    sol: { x: 0, y: 0, z: 0 },
  };

  // Recompute waypoint_index for any user-added pins so getActivePins keeps
  // working when total_years changes.
  if (Array.isArray(voyageData.pins)) {
    for (const pin of voyageData.pins) {
      if (typeof pin.year === 'number' && total_years > 0) {
        const t = Math.max(0, Math.min(1, pin.year / total_years));
        pin.waypoint_index = Math.round(t * (total_waypoints - 1));
      }
    }
  }

  return voyageData;
}

/**
 * Helper for the destination picker: returns named stars sorted by distance.
 */
export function getNamedStars(maxLy = 50) {
  if (!starsData) return [];
  const maxPc = maxLy / PARSEC_TO_LY;
  const out = [];
  for (const s of starsData) {
    if (!s.name) continue;
    const dPc = Math.hypot(s.x, s.y, s.z);
    if (dPc > maxPc) continue;
    out.push({ id: s.id, name: s.name, distancePc: dPc, distanceLy: dPc * PARSEC_TO_LY });
  }
  out.sort((a, b) => a.distancePc - b.distancePc);
  return out;
}

/**
 * Look up a single star by HIP id.
 */
export function getStarById(id) {
  if (!starMap) return null;
  return starMap.get(id) || null;
}
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
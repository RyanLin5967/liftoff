import { createScene, updateScene } from './scene.js';
import {
    createUI,
    updateUI,
    showMilestone,
    openPinPopup,
    setMuted,
    onTimelinePinClick,
    onMemorySubmit,
    addTimelinePin,
    showStarTooltip,
    hideStarTooltip,
} from './ui.js';

const PARSEC_TO_LY = 3.26156;
const EARTH_DEPARTURE_YEAR = 2750;

function colorDescriptor(r, g, b) {
    if (b > r + 25 && b > g) return 'Blue-white (hot)';
    if (b > 220 && r > 220 && g > 220) return 'White';
    if (r > 230 && g > 200 && b > 150) return 'Yellow';
    if (r > 230 && g > 160 && b < 150) return 'Orange';
    if (r > 200 && g < 160 && b < 130) return 'Red (cool)';
    return 'Mixed';
}

const USER_PINS_STORAGE_KEY = 'voyage:user-pins:v1';

function loadUserPins() {
    try {
        const raw = localStorage.getItem(USER_PINS_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveUserPins(pins) {
    try {
        localStorage.setItem(USER_PINS_STORAGE_KEY, JSON.stringify(pins));
    } catch (e) {
        console.warn('Failed to persist user pins', e);
    }
}

function waypointIndexForYear(voyageData, year) {
    const total = voyageData.metadata?.total_waypoints ?? voyageData.trajectory?.length ?? 1000;
    const totalYears = voyageData.metadata?.total_years ?? 250;
    const t = Math.max(0, Math.min(1, year / totalYears));
    return Math.round(t * (total - 1));
}

let Voyage = null;
let Audio = null;

async function loadEngines() {
    try {
        Voyage = await import('./voyage-engine.js');
        if (typeof Voyage.init !== 'function') Voyage = null;
    } catch (e) {
        console.warn('voyage-engine.js not available — using placeholder data', e);
    }

    try {
        Audio = await import('./audio-engine.js');
        if (typeof Audio.init !== 'function') Audio = null;
    } catch (e) {
        console.warn('audio-engine.js not available — audio disabled', e);
    }
}

function buildPlaceholderEngine() {
    const starCount = 800;
    const starsData = [];
    for (let i = 0; i < starCount; i++) {
        const r = 8 + Math.random() * 40;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const temp = Math.random();
        starsData.push({
            id: i,
            x: r * Math.sin(phi) * Math.cos(theta),
            y: r * Math.sin(phi) * Math.sin(theta),
            z: r * Math.cos(phi),
            mag: 1 + Math.random() * 5,
            r: Math.floor(180 + temp * 75),
            g: Math.floor(180 + Math.random() * 60),
            b: Math.floor(220 + (1 - temp) * 35),
            name: null,
        });
    }

    const proxima = { x: -0.472, y: -0.362, z: -1.152 };
    const totalYears = 250;
    const total = 1000;
    const trajectory = [];
    for (let i = 0; i < total; i++) {
        const t = i / (total - 1);
        trajectory.push({
            index: i,
            year: t * totalYears,
            x: proxima.x * t,
            y: proxima.y * t,
            z: proxima.z * t,
            earth_light_year: 2750 + t * totalYears,
            sol_mag: -26.74 + t * 30,
        });
    }

    const voyageData = {
        trajectory,
        light_horizon: { ship_year: 203.4, last_earth_year: 2897, waypoint_index: 814 },
        constellations: [],
        milestones: [
            { waypoint_index: 48, year: 12.0, label: 'Sol drops below naked-eye visibility', type: 'sol' },
            { waypoint_index: 400, year: 100, label: 'Halfway to Proxima Centauri', type: 'distance' },
            { waypoint_index: 814, year: 203.4, label: 'Light horizon — Earth is gone forever', type: 'horizon' },
        ],
        pins: [
            { waypoint_index: 0, year: 0, author: 'Captain Elena Vasquez', generation: 1, title: 'Launch day', text: 'I watched Earth shrink in the observation port.' },
            { waypoint_index: 400, year: 100, author: 'Mira Vasquez-Okonkwo', generation: 4, title: 'Halfway home', text: 'My grandmother used to say the stars looked the same from any window. She was wrong.' },
        ],
        metadata: { total_years: totalYears, total_distance_ly: 4.244, total_waypoints: total, proxima, sol: { x: 0, y: 0, z: 0 } },
    };

    const positions = new Float32Array(starsData.length * 3);
    const colors = new Float32Array(starsData.length * 3);
    const sizes = new Float32Array(starsData.length);
    for (let i = 0; i < starsData.length; i++) {
        const s = starsData[i];
        colors[i * 3]     = s.r / 255;
        colors[i * 3 + 1] = s.g / 255;
        colors[i * 3 + 2] = s.b / 255;
        sizes[i] = Math.max(0.4, 4 - s.mag * 0.5);
    }

    function lerp(a, b, t) { return a + (b - a) * t; }

    return {
        async init() { return { starsData, voyageData }; },
        getWaypoint(year) {
            const t = Math.max(0, Math.min(1, year / totalYears));
            const idxF = t * (total - 1);
            const i0 = Math.floor(idxF);
            const i1 = Math.min(total - 1, i0 + 1);
            const f = idxF - i0;
            const a = trajectory[i0], b = trajectory[i1];
            return {
                x: lerp(a.x, b.x, f),
                y: lerp(a.y, b.y, f),
                z: lerp(a.z, b.z, f),
                year,
                earthLightYear: lerp(a.earth_light_year, b.earth_light_year, f),
                solMag: lerp(a.sol_mag, b.sol_mag, f),
                waypointIndex: Math.round(idxF),
            };
        },
        getStarPositions(sx, sy, sz) {
            for (let i = 0; i < starsData.length; i++) {
                const s = starsData[i];
                positions[i * 3]     = s.x - sx;
                positions[i * 3 + 1] = s.y - sy;
                positions[i * 3 + 2] = s.z - sz;
            }
            return positions;
        },
        getStarColors() { return colors; },
        getStarSizes() { return sizes; },
        getConstellationLines() { return []; },
        getNearbyStars() { return []; },
        getActivePins(idx, window = 20) {
            return voyageData.pins.filter((p) => Math.abs(p.waypoint_index - idx) <= window);
        },
        getActiveMilestones(idx, window = 10) {
            return voyageData.milestones.filter((m) => Math.abs(m.waypoint_index - idx) <= window);
        },
        getLightHorizon() { return voyageData.light_horizon; },
        isPastLightHorizon(year) { return year >= voyageData.light_horizon.ship_year; },
    };
}

async function setup() {
    await loadEngines();

    if (!Voyage) {
        Voyage = buildPlaceholderEngine();
        console.info('Using placeholder Voyage engine. Hand off to Person A when voyage-engine.js is ready.');
    }

    const { starsData, voyageData } = await Voyage.init();

    // Hydrate user-added memories from localStorage before the UI renders pins.
    const userPins = loadUserPins();
    for (const p of userPins) {
        if (!voyageData.pins.some((existing) => existing._id === p._id)) {
            voyageData.pins.push(p);
        }
    }

    const scene = createScene(starsData, voyageData, Voyage);
    const ui = createUI(voyageData);

    let muted = false;
    const seenMilestones = new Set();

    const initialWp = Voyage.getWaypoint(0);
    updateScene(scene, initialWp, Voyage);
    updateUI(ui, initialWp, Voyage);

    onTimelinePinClick(ui, (pin) => openPinPopup(ui, pin));

    if (typeof scene.onStarHover === 'function') {
        scene.onStarHover((idx, clientX, clientY) => {
            if (idx == null) {
                hideStarTooltip(ui);
                return;
            }
            const star = starsData[idx];
            if (!star) {
                hideStarTooltip(ui);
                return;
            }
            const wp = Voyage.getWaypoint(parseFloat(ui.slider.value) || 0);
            const dx = star.x - wp.x;
            const dy = star.y - wp.y;
            const dz = star.z - wp.z;
            const distShipPc = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const distSolPc = Math.sqrt(star.x * star.x + star.y * star.y + star.z * star.z);
            const distShipLy = distShipPc * PARSEC_TO_LY;
            const distSolLy = distSolPc * PARSEC_TO_LY;

            // Apparent magnitude from current ship position.
            // Derive absolute magnitude from the Earth-based mag, then re-apply
            // the distance-modulus formula at our distance.
            let magShip = star.mag;
            if (distSolPc > 0 && distShipPc > 0) {
                const absMag = star.mag - 5 * Math.log10(distSolPc / 10);
                magShip = absMag + 5 * Math.log10(distShipPc / 10);
            }

            // Calendar year light reaching the ship was emitted.
            // Light travels at 1 ly/yr; we are at calendar year (2750 + ship_year).
            let lightEmittedYear = null;
            let lightEmittedYearLabel = null;
            if (Number.isFinite(distShipLy)) {
                const calendarNow = EARTH_DEPARTURE_YEAR + wp.year;
                lightEmittedYear = calendarNow - distShipLy;
                lightEmittedYearLabel = lightEmittedYear < 0
                    ? `${Math.abs(lightEmittedYear).toFixed(0)} BCE`
                    : `${Math.round(lightEmittedYear)} CE`;
            }

            showStarTooltip(ui, {
                name: star.name || `Unnamed star`,
                hipId: star.id,
                r: star.r, g: star.g, b: star.b,
                colorDesc: colorDescriptor(star.r, star.g, star.b),
                distFromShipLy: distShipLy,
                distFromSolLy: distSolLy,
                magShip,
                magEarth: star.mag,
                lightEmittedYear,
                lightEmittedYearLabel,
            }, clientX, clientY);
        });
    }

    onMemorySubmit(ui, (entry) => {
        const pin = {
            _id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            _userAdded: true,
            waypoint_index: waypointIndexForYear(voyageData, entry.year),
            year: entry.year,
            generation: entry.generation,
            title: entry.title,
            author: entry.author,
            text: entry.text,
        };
        voyageData.pins.push(pin);
        saveUserPins(voyageData.pins.filter((p) => p._userAdded));
        addTimelinePin(ui, pin);
        openPinPopup(ui, pin);
    });

    if (Audio) {
        try {
            await Audio.init();
        } catch (e) {
            console.warn('Audio init failed', e);
            Audio = null;
        }
    }

    function tryStartAudio() {
        if (!Audio) return;
        Audio.start();
        Audio.setMasterVolume(muted ? 0 : 0.6);
        Audio.update(parseFloat(ui.slider.value) || 0, Voyage.getLightHorizon().ship_year);
    }

    // Attempt autoplay; browsers may block until first user gesture.
    tryStartAudio();
    const gestureEvents = ['pointerdown', 'keydown', 'touchstart', 'click'];
    const onGesture = () => tryStartAudio();
    for (const evt of gestureEvents) document.addEventListener(evt, onGesture);

    ui.slider.addEventListener('input', (e) => {
        tryStartAudio();

        const year = parseFloat(e.target.value);
        const wp = Voyage.getWaypoint(year);

        updateScene(scene, wp, Voyage);
        updateUI(ui, wp, Voyage);

        if (Audio && !muted) {
            Audio.update(year, Voyage.getLightHorizon().ship_year);
        }

        const ms = Voyage.getActiveMilestones(wp.waypointIndex, 2);
        for (const m of ms) {
            const key = `${m.waypoint_index}-${m.label}`;
            if (m.waypoint_index <= wp.waypointIndex && !seenMilestones.has(key)) {
                seenMilestones.add(key);
                showMilestone(ui, m.label);
            }
        }
    });

    ui.muteButton.addEventListener('click', () => {
        tryStartAudio();
        muted = !muted;
        setMuted(ui, muted);
        if (Audio) {
            Audio.setMasterVolume(muted ? 0 : 0.3);
        }
    });

    document.getElementById('loading').classList.add('hidden');
}

setup().catch((err) => {
    console.error('Voyage setup failed:', err);
    const loading = document.getElementById('loading');
    if (loading) loading.textContent = 'Failed to load — see console';
});
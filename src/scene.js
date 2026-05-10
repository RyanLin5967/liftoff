import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// === Ship model — swap this path to use a different GLB ===
// Path is relative to index.html (the page root).
const SHIP_MODEL_PATH = './spaceship.glb';
// Scene units are PARSECS. Real ships are ~10⁻¹³ pc and Earth is ~2×10⁻¹⁰ pc;
// rendering at literal scale would make them invisible. These constants
// are a deliberate visibility-vs-scale-realism compromise — small enough that
// Earth & ship don't dominate a multi-light-year trajectory, but big enough
// to be recognizable when the camera is near them.
const SHIP_SCALE = 0.0015;
const SHIP_MODEL_EULER = new THREE.Euler(0, Math.PI, 0); // 180° yaw so the nose faces forward
// ===========================================================

// === Earth model + textures ===
const EARTH_MODEL_PATH = './Earth.obj';
const EARTH_TEXTURE_DIR = './Earth_Texture/';
// ===============================

// === Planet sizing ===
// Earth at 0.005 pc is ~25 million × real, but only ~0.4% of the Sol→Proxima
// trajectory length, which preserves a real sense of "leaving home and going
// far". For other planets, multiply by their Earth-relative radius — capped
// at PLANET_RADIUS_MAX so Jupiter doesn't render bigger than its own orbit.
const PLANET_SCALE = 0.005;
const EARTH_RADIUS = PLANET_SCALE * 1.0;
const PLANET_RADIUS_MAX = PLANET_SCALE * 3.0; // visual cap (gas giants)
// 1 AU in scene-space parsecs. Real ratio is 1 AU ≈ 4.85e-6 pc; this is
// hugely scaled up so the planets are spread out enough to actually see.
// At 0.012, Neptune sits ~0.36 pc from Sol (~28% of the way to Proxima).
const PLANET_AU_SCALE = 0.012;
// =====================

// === Solar system planets (excluding Earth — Earth is anchored to the
// ship's launch point separately).
// `lon` = ecliptic longitude in degrees. Approximate values for May 2026
// looked up from the Astronomical Almanac; only used to spread the planets
// around their orbits so they don't all sit on the same axis.
const SCALE = 4
const PLANETS = [
    { name: 'Mercury', obj: './mercury.obj', tex: './Mercury_Texture/',
      files: { base: 'mercury_Base_Color.png',  normal: 'mercury_Normal.png',  roughness: 'mercury_Roughness.png' },
      au: 0.387 * SCALE * SCALE, radius: 0.383, lon: 110 },
    { name: 'Venus',   obj: './venus.obj',   tex: './Venus_Texture/',
      files: { base: 'venus_Base_Color.png',    normal: 'venus_Normal.png',    roughness: 'venus_Roughness.png' },
      au: 0.723 * SCALE * SCALE, radius: 0.949, lon: 200 },
    { name: 'Mars',    obj: './mars.obj',    tex: './Mars_Texture/',
      files: { base: 'mars_Base_Color.png',     normal: 'mars_Normal.png' },
      au: 1.524 * SCALE * SCALE, radius: 0.532, lon: 140 },
    { name: 'Jupiter', obj: './jupiter.obj', tex: './Jupiter_Texture/',
      files: { base: 'jupiter_MAT_Base_Color.png', normal: 'jupiter_MAT_Normal.png', roughness: 'jupiter_MAT_Roughness.png' },
      au: 5.20 * SCALE, radius: 11.21, lon: 80 },
    { name: 'Saturn',  obj: './saturn.obj',  tex: './Saturn_Texture/',
      files: { base: 'saturn_Base_Color.png',   normal: 'saturn_Normal.png',   roughness: 'saturn_Roughness.png' },
      rings: { base: 'saturn_rings_Base_Color.png', opacity: 'saturn_rings_Opacity.png',
               roughness: 'saturn_rings_Roughness.png', normal: 'saturn_rings_normal.png' },
      au: 9.58 * SCALE, radius: 9.45, lon: 250 },
    { name: 'Uranus',  obj: './uranus.obj',  tex: './Uranus_Texture/',
      files: { base: 'uranus_baseColor.png',    roughness: 'uranus_roughness.png' },
      au: 19.18* SCALE, radius: 4.01, lon: 60 },
    { name: 'Neptune', obj: './neptune.obj', tex: './Neptune_Texture/',
      files: { base: 'neptune_Base_Color.png',  normal: 'neptune_Normal.png',  roughness: 'neptune_Roughness.png' },
      au: 30.05* SCALE, radius: 3.88, lon: 0 },
];
// ===============================

const STAR_VERTEX = `
    attribute vec3 instancePosition;
    attribute vec3 instanceColor;
    attribute float instanceSize;
    attribute float instanceStyle;   // 0=star, 1=dwarf disk, 2=exoplanet host
    uniform float uScreenHeight;
    varying vec3 vColor;
    varying vec2 vUv;
    varying float vStyle;

    void main() {
        vColor = instanceColor;
        vUv = uv;
        vStyle = instanceStyle;

        // View-space position of the quad center (the star/planet).
        vec4 mvCenter = modelViewMatrix * vec4(instancePosition, 1.0);
        float depth = max(0.001, -mvCenter.z);

        // Apparent size in screen pixels. Linear inverse-distance for the
        // far/dim end. Hard-capped at default view so a bright nearby star
        // (e.g. Alpha Centauri at 1.3 pc) doesn't render as a giant orb —
        // the cap relaxes when you zoom in (depth < 0.05 pc) so close-up
        // approach to a star still feels dramatic.
        float linear = instanceSize * (90.0 / depth);
        float maxPx = 45.0 + 240.0 * smoothstep(0.05, 0.002, depth);
        float pixelSize = min(linear, maxPx);

        float viewPerPixel = depth / (projectionMatrix[1][1] * uScreenHeight * 0.5);
        float worldOffset = pixelSize * viewPerPixel;

        // PlaneGeometry vertices are in [-0.5, 0.5]; offset in view-space xy
        // so the quad always faces the camera.
        mvCenter.xy += position.xy * worldOffset;
        gl_Position = projectionMatrix * mvCenter;
    }
`;

const STAR_FRAGMENT = `
    varying vec3 vColor;
    varying vec2 vUv;
    varying float vStyle;

    void main() {
        vec2 p = vUv - vec2(0.5);
        float d = length(p);

        if (vStyle < 0.5) {
            // ───────── Star: soft glowing point with bright core ─────────
            if (d > 0.5) discard;
            float alpha = 1.0 - smoothstep(0.0, 0.5, d);
            gl_FragColor = vec4(vColor, alpha);
        } else if (vStyle < 1.5) {
            // ───────── Brown / cool dwarf: small shaded disk ─────────
            if (d > 0.46) discard;
            float disk = 1.0 - smoothstep(0.40, 0.46, d);
            float lit  = clamp(0.45 + 0.55 * (-p.x + p.y) * 2.0, 0.25, 1.15);
            float rim  = 1.0 - smoothstep(0.30, 0.46, d) * 0.35;
            // Dim overall so it doesn't out-shine real stars.
            gl_FragColor = vec4(vColor * lit * rim * 0.55, disk * 0.55);
        } else {
            // ───────── Exoplanet host: stellar core + very faint orbit ring ─────────
            if (d > 0.5) discard;
            float core = 1.0 - smoothstep(0.0, 0.32, d);
            float ring = (1.0 - smoothstep(0.40, 0.43, d))
                       * smoothstep(0.36, 0.39, d) * 0.20;   // was 0.85 — much subtler
            vec3 ringColor = mix(vColor, vec3(0.55, 0.75, 1.0), 0.6);
            vec3 col = vColor * core + ringColor * ring;
            float alpha = clamp(core + ring, 0.0, 1.0);
            gl_FragColor = vec4(col, alpha);
        }
    }
`;

const SHIP_FORWARD = new THREE.Vector3(1, 0, 0);

export function createScene(starsData, voyageData, Voyage) {
    const container = document.getElementById('canvas-container');

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020208);

    const camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        0.001,
        2000
    );

    // Derive a "standard" view from the trajectory direction so the same
    // composition works for any destination: camera above-and-behind the ship,
    // tilted forward along the trajectory line. Target stays at the ship
    // (origin) so OrbitControls dragging orbits around the ship.
    function computeStandardView() {
        const meta = voyageData?.metadata;
        const dest = meta?.destination ?? meta?.proxima;
        const target = new THREE.Vector3(0, 0, 0);
        if (!dest || !(dest.x || dest.y || dest.z)) {
            return { pos: new THREE.Vector3(0.04, 0.025, 0.04), target };
        }
        // Build a trajectory-aligned frame.
        const forward = new THREE.Vector3(dest.x, dest.y, dest.z).normalize();
        const worldUp = new THREE.Vector3(0, 1, 0);
        let right = new THREE.Vector3().crossVectors(forward, worldUp);
        if (right.lengthSq() < 1e-6) right.set(1, 0, 0); // forward parallel to up
        right.normalize();
        const up = new THREE.Vector3().crossVectors(right, forward).normalize();

        // Behind-and-above the ship at small (ship-scale) distance so the
        // ship + Earth are clearly visible while the trajectory line still
        // recedes off into the distance over many parsecs.
        const pos = new THREE.Vector3(0.022, 0.05, 0.022);

        return { pos, target };
    }

    {
        const initialView = computeStandardView();
        camera.position.copy(initialView.pos);
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x020208, 1);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;          // snappier stop, less drift
    controls.rotateSpeed = 0.7;             // faster orbit drag
    controls.zoomSpeed = 1.1;               // quicker scroll zoom
    controls.panSpeed = 0.9;
    controls.screenSpacePanning = true;     // pan in screen space (intuitive)
    controls.enablePan = true;
    controls.minDistance = 0.002;   // can zoom in to ship/Earth scale
    controls.maxDistance = 80;
    // Keep the camera from flipping past the poles (causes disorienting snaps).
    controls.minPolarAngle = 0.05;
    controls.maxPolarAngle = Math.PI - 0.05;

    // Initial orbit target is whatever computeStandardView gave us (always the
    // ship at origin while we read it from there).
    {
        const initialView = computeStandardView();
        controls.target.copy(initialView.target);
    }

    const stars = createStarField(starsData, Voyage);
    scene.add(stars.points);

    const trajectory = createTrajectoryLine(voyageData);
    scene.add(trajectory.future);
    scene.add(trajectory.past);

    // External lighting — soft environment for smooth PBR + two directional lights
    // that wrap the ship from opposite sides.
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    scene.add(new THREE.AmbientLight(0x6a7488, 0.25));
    const keyLight = new THREE.DirectionalLight(0xfff1d8, 1.6);
    keyLight.position.set(2, 1.5, 1);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x88aaff, 0.9);
    rimLight.position.set(-1.2, -0.4, -1.2);
    scene.add(rimLight);

    const ship = createShip();
    scene.add(ship.group);

    // Earth sits at trajectory origin (Sol). Its position is updated each
    // frame by updateScene so it stays at world (0,0,0) while the ship
    // sits at the camera origin.
    const earth = createEarth();
    scene.add(earth.group);

    // Other 7 solar-system planets, at scaled heliocentric positions.
    const planets = createPlanets();
    scene.add(planets.group);

    const constellations = new THREE.Group();
    scene.add(constellations);


    // Bloom post-processing
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.6,
        0.5,
        0.82
    );
    composer.addPass(bloom);

    // Star hover: screen-space picking against star geometry positions.
    // Geometry is already in ship-relative coords, so projecting through the
    // camera gives us NDC directly.
    const hoverState = {
        mouseNDC: new THREE.Vector2(NaN, NaN),
        clientX: 0,
        clientY: 0,
        dirty: false,
        lastIdx: -1,
        handler: null,
    };

    renderer.domElement.addEventListener('mousemove', (e) => {
        const rect = renderer.domElement.getBoundingClientRect();
        hoverState.mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        hoverState.mouseNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        hoverState.clientX = e.clientX;
        hoverState.clientY = e.clientY;
        hoverState.dirty = true;
    });

    renderer.domElement.addEventListener('mouseleave', () => {
        hoverState.mouseNDC.x = NaN;
        hoverState.mouseNDC.y = NaN;
        hoverState.dirty = true;
    });

    // Re-pick whenever the camera moves (orbit drag, damping, zoom).
    controls.addEventListener('change', () => { hoverState.dirty = true; });

    // Star click: register a handler to fire when the user clicks on a star
    // (vs dragging the camera). Uses a small movement threshold to distinguish.
    const clickHandlers = [];
    let downX = 0, downY = 0, downIdx = -1;
    renderer.domElement.addEventListener('pointerdown', (e) => {
        downX = e.clientX;
        downY = e.clientY;
        // Force a fresh pick using this exact event position so we don't rely on
        // hover state (which may be stale, NaN on touch devices, etc.)
        const rect = renderer.domElement.getBoundingClientRect();
        hoverState.mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        hoverState.mouseNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        downIdx = pickStar();
    });
    renderer.domElement.addEventListener('pointerup', (e) => {
        const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
        if (moved > 5) return; // treated as drag
        if (downIdx < 0) return;
        clickHandlers.forEach((h) => h(downIdx, e.clientX, e.clientY));
    });

    function onStarClick(handler) {
        clickHandlers.push(handler);
    }

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        composer.setSize(window.innerWidth, window.innerHeight);
        bloom.setSize(window.innerWidth, window.innerHeight);
        stars.material.uniforms.uScreenHeight.value = window.innerHeight;
    });

    const _pickVec = new THREE.Vector3();
    function pickStar() {
        if (!Number.isFinite(hoverState.mouseNDC.x)) return -1;
        const positions = stars.geometry.attributes.instancePosition.array;
        const sizes = stars.geometry.attributes.instanceSize.array;
        const count = positions.length / 3;
        const aspect = camera.aspect || 1;
        // ~14px on a 1080p screen; expand slightly for big bright stars
        const baseThreshold = 0.018;
        // Among all candidates within picking radius, prefer the one closest
        // to the camera (smallest NDC z) — i.e. the star drawn ON TOP. Falls
        // back to closest-in-screen-space when only one candidate matches.
        let bestIdx = -1;
        let bestDepth = Infinity;
        let bestD2 = Infinity;
        for (let i = 0; i < count; i++) {
            _pickVec.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
            _pickVec.project(camera);
            if (_pickVec.z < -1 || _pickVec.z > 1) continue;
            const dx = (_pickVec.x - hoverState.mouseNDC.x) * aspect;
            const dy = _pickVec.y - hoverState.mouseNDC.y;
            const sizeBoost = (sizes[i] || 1) * 0.0008;
            const tol = baseThreshold + sizeBoost;
            const d2 = dx * dx + dy * dy;
            if (d2 >= tol * tol) continue;
            // Within picking radius. Prefer closer-to-camera (smaller z).
            // Use d2 as a tiebreaker if depths are essentially equal.
            if (
                _pickVec.z < bestDepth - 1e-4 ||
                (Math.abs(_pickVec.z - bestDepth) <= 1e-4 && d2 < bestD2)
            ) {
                bestDepth = _pickVec.z;
                bestD2 = d2;
                bestIdx = i;
            }
        }
        return bestIdx;
    }

    function animate() {
        requestAnimationFrame(animate);
        controls.update();

        if (hoverState.dirty && hoverState.handler) {
            hoverState.dirty = false;
            const idx = pickStar();
            hoverState.lastIdx = idx;
            hoverState.handler(
                idx >= 0 ? idx : null,
                hoverState.clientX,
                hoverState.clientY
            );
        }

        composer.render();
    }
    animate();

    function onStarHover(handler) {
        hoverState.handler = handler;
    }

    function fitControlsToTrip(distancePc) {
        // Allow the orbit camera enough range to see both the ship and the
        // far end of the trajectory comfortably.
        const target = Math.max(80, distancePc * 8);
        controls.maxDistance = target;
    }
    fitControlsToTrip(voyageData.metadata?.total_distance_pc || 1.3);

    function resetView() {
        const v = computeStandardView();
        camera.position.copy(v.pos);
        controls.target.copy(v.target);
        controls.update();
        hoverState.dirty = true;
    }

    return {
        scene, camera, renderer, controls, composer,
        starGeometry: stars.geometry,
        starMaterial: stars.material,
        trajectory,
        ship,
        earth,
        planets,
        constellations,
        voyageData,
        onStarHover,
        onStarClick,
        fitControlsToTrip,
        resetView,
    };
}

/**
 * Rebuild the trajectory line geometry from a fresh voyageData.trajectory.
 * Call this after voyage-engine.setVoyage() changes the destination/speed.
 */
export function rebuildTrajectory(state, voyageData) {
    const traj = voyageData.trajectory;
    const n = traj.length;
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
        positions[i * 3]     = traj[i].x;
        positions[i * 3 + 1] = traj[i].y;
        positions[i * 3 + 2] = traj[i].z;
    }
    state.trajectory.future.geometry.dispose();
    state.trajectory.past.geometry.dispose();
    const futureGeo = new THREE.BufferGeometry();
    futureGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    state.trajectory.future.geometry = futureGeo;

    const pastGeo = new THREE.BufferGeometry();
    pastGeo.setAttribute('position', new THREE.BufferAttribute(positions.slice(), 3));
    pastGeo.setDrawRange(0, 1);
    state.trajectory.past.geometry = pastGeo;
    state.trajectory.totalCount = n;
    state.voyageData = voyageData;

    if (typeof state.fitControlsToTrip === 'function') {
        state.fitControlsToTrip(voyageData.metadata?.total_distance_pc || 1.3);
    }
}

function createStarField(starsData, Voyage) {
    const count = starsData.length;
    const positions = Voyage.getStarPositions(0, 0, 0);
    const colors = Voyage.getStarColors();
    const sizes = Voyage.getStarSizes();

    // Per-instance render style + size override. Non-stars use a different
    // shader branch (planet-like disk), and we boost their minimum size so
    // they're actually visible at distance — synthesized brown dwarfs and
    // exoplanet hosts have very faint apparent magnitudes.
    const styles = new Float32Array(count);
    const adjustedSizes = new Float32Array(sizes);
    for (let i = 0; i < count; i++) {
        const cat = starsData[i].category;
        if (cat === 'exoplanet_host') {
            styles[i] = 2;
            if (adjustedSizes[i] < 1.0) adjustedSizes[i] = 1.0;
        } else {
            // Brown dwarfs and HYG stars: render as regular stars.
            styles[i] = 0;
        }
    }

    // Base geometry: a unit quad. PlaneGeometry vertices range [-0.5, 0.5].
    const baseGeometry = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = baseGeometry.index;
    geometry.attributes.position = baseGeometry.attributes.position;
    geometry.attributes.uv = baseGeometry.attributes.uv;

    geometry.setAttribute(
        'instancePosition',
        new THREE.InstancedBufferAttribute(new Float32Array(positions), 3)
    );
    geometry.setAttribute(
        'instanceColor',
        new THREE.InstancedBufferAttribute(colors, 3)
    );
    geometry.setAttribute(
        'instanceSize',
        new THREE.InstancedBufferAttribute(adjustedSizes, 1)
    );
    geometry.setAttribute(
        'instanceStyle',
        new THREE.InstancedBufferAttribute(styles, 1)
    );
    geometry.instanceCount = count;

    const material = new THREE.ShaderMaterial({
        uniforms: {
            uScreenHeight: { value: window.innerHeight },
        },
        vertexShader: STAR_VERTEX,
        fragmentShader: STAR_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });

    // Mesh, not Points — instanced billboard quads.
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    return { points: mesh, geometry, material };
}

function createTrajectoryLine(voyageData) {
    const traj = voyageData.trajectory;
    const n = traj.length;

    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
        positions[i * 3]     = traj[i].x;
        positions[i * 3 + 1] = traj[i].y;
        positions[i * 3 + 2] = traj[i].z;
    }

    const futureGeo = new THREE.BufferGeometry();
    futureGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const futureMat = new THREE.LineBasicMaterial({
        color: 0x6688cc,
        transparent: true,
        opacity: 0.28,
    });
    const future = new THREE.Line(futureGeo, futureMat);

    const pastGeo = new THREE.BufferGeometry();
    pastGeo.setAttribute('position', new THREE.BufferAttribute(positions.slice(), 3));
    pastGeo.setDrawRange(0, 1);
    const pastMat = new THREE.LineBasicMaterial({
        color: 0xcfe1ff,
        transparent: true,
        opacity: 0.55,
    });
    const past = new THREE.Line(pastGeo, pastMat);

    return { future, past, totalCount: n };
}

function createShip() {
    // Outer group: trajectory tangent rotates this each frame.
    // Inner group: holds the loaded model + any calibration transform.
    const group = new THREE.Group();
    const modelHolder = new THREE.Group();
    modelHolder.scale.setScalar(SHIP_SCALE);
    modelHolder.rotation.copy(SHIP_MODEL_EULER);
    group.add(modelHolder);

    const ship = { group, modelHolder, model: null };

    new GLTFLoader().load(
        SHIP_MODEL_PATH,
        (gltf) => {
            // Strip baked emissive so the ship is lit by the scene from outside,
            // not glowing from within. Tweak emissiveIntensity if you want some
            // panels to keep glowing.
            gltf.scene.traverse((obj) => {
                if (!obj.isMesh || !obj.material) return;
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                for (const mat of mats) {
                    if ('emissive' in mat) mat.emissive.setHex(0x000000);
                    if ('emissiveIntensity' in mat) mat.emissiveIntensity = 0;
                    if ('emissiveMap' in mat) mat.emissiveMap = null;
                    mat.needsUpdate = true;
                }
            });
            ship.model = gltf.scene;
            modelHolder.add(gltf.scene);
        },
        undefined,
        (err) => {
            console.error(`Failed to load ship model at ${SHIP_MODEL_PATH}:`, err);
        },
    );

    return ship;
}

function createEarth() {
    // Outer group: positioned each frame to keep Earth at world origin.
    // Inner wrapper: holds the OBJ at unit radius after normalization, then
    // we set group.scale = EARTH_RADIUS for the final visible size.
    const group = new THREE.Group();
    const wrapper = new THREE.Group();
    group.add(wrapper);
    group.scale.setScalar(EARTH_RADIUS);

    // Refs returned to the caller so animate() can spin surface/clouds.
    const earth = { group, wrapper, surface: null, clouds: null };

    const texLoader = new THREE.TextureLoader();
    const sRGB = (path) => {
        const t = texLoader.load(EARTH_TEXTURE_DIR + path);
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
    };
    const linear = (path) => texLoader.load(EARTH_TEXTURE_DIR + path);

    const earthMat = new THREE.MeshStandardMaterial({
        map:           sRGB('earth_MAT_baseColor.png'),
        normalMap:   linear('earth_MAT_normal.png'),
        roughnessMap: linear('earth_MAT_roughness.png'),
        emissiveMap:   sRGB('earth_MAT_glow.png'),
        emissive: new THREE.Color(0xffaa55),
        emissiveIntensity: 1.0,
        roughness: 1.0,
        metalness: 0.0,
    });

    const cloudMat = new THREE.MeshStandardMaterial({
        map:           sRGB('clouds_MAT_baseColor.png'),
        normalMap:   linear('clouds_MAT_normal.png'),
        roughnessMap: linear('clouds_MAT_roughness.png'),
        alphaMap:    linear('clouds_MAT_opacity.png'),
        transparent: true,
        depthWrite: false,
        roughness: 1.0,
        metalness: 0.0,
    });

    new OBJLoader().load(
        EARTH_MODEL_PATH,
        (obj) => {
            // Assign materials by mesh / group name. The OBJ has
            // `earth_twilight_GEO` and `clouds_GEO`. Match loosely by substring
            // so naming variations still work.
            obj.traverse((child) => {
                if (!child.isMesh) return;
                const name = (child.name || '').toLowerCase();
                if (name.includes('cloud')) {
                    child.material = cloudMat;
                    earth.clouds = child;
                } else {
                    child.material = earthMat;
                    earth.surface = child;
                }
            });

            // Fallbacks if traversal didn't tag both meshes (OBJ group naming
            // can be quirky). Pick the first two meshes by index.
            if (!earth.surface || !earth.clouds) {
                const meshes = [];
                obj.traverse((c) => { if (c.isMesh) meshes.push(c); });
                if (!earth.surface && meshes[0]) {
                    meshes[0].material = earthMat;
                    earth.surface = meshes[0];
                }
                if (!earth.clouds && meshes[1]) {
                    meshes[1].material = cloudMat;
                    earth.clouds = meshes[1];
                }
            }

            // Normalize the OBJ so its bounding sphere has radius 1.
            const bbox = new THREE.Box3().setFromObject(obj);
            const sphere = new THREE.Sphere();
            bbox.getBoundingSphere(sphere);
            if (sphere.radius > 0) {
                obj.position.copy(sphere.center).multiplyScalar(-1);
                wrapper.scale.setScalar(1 / sphere.radius);
            }
            wrapper.add(obj);
        },
        undefined,
        (err) => {
            console.error(`Failed to load Earth model at ${EARTH_MODEL_PATH}:`, err);
        },
    );

    return earth;
}

/**
 * Build one planet from a PLANETS[] config. Same OBJ-normalize-then-scale
 * pattern as createEarth(): outer group is positioned per-frame to keep the
 * planet at its heliocentric coordinate; wrapper holds the loaded model
 * normalized to a unit sphere and is then scaled by the planet's visual radius.
 *
 * Saturn additionally gets an annulus mesh for its rings (textured separately).
 */
function createPlanet(cfg) {
    const visualRadius = Math.min(PLANET_RADIUS_MAX, PLANET_SCALE * cfg.radius);

    // Heliocentric position in the trajectory frame's XY plane.
    const orbitR = PLANET_AU_SCALE * cfg.au;
    const lonRad = (cfg.lon ?? 0) * Math.PI / 180;
    const orbitX = orbitR * Math.cos(lonRad);
    const orbitY = orbitR * Math.sin(lonRad);

    const group = new THREE.Group();           // positioned per frame to track Sol
    const orbitNode = new THREE.Group();        // holds the offset to orbital pos
    orbitNode.position.set(orbitX, orbitY, 0);
    group.add(orbitNode);

    const wrapper = new THREE.Group();
    wrapper.scale.setScalar(visualRadius);
    orbitNode.add(wrapper);

    const planet = { name: cfg.name, group, orbitNode, wrapper, mesh: null, rings: null };

    const texLoader = new THREE.TextureLoader();
    const sRGB   = (file) => { const t = texLoader.load(cfg.tex + file); t.colorSpace = THREE.SRGBColorSpace; return t; };
    const linear = (file) => texLoader.load(cfg.tex + file);

    const matOpts = {
        map: sRGB(cfg.files.base),
        roughness: 1.0,
        metalness: 0.0,
    };
    if (cfg.files.normal)    matOpts.normalMap    = linear(cfg.files.normal);
    if (cfg.files.roughness) matOpts.roughnessMap = linear(cfg.files.roughness);
    const planetMat = new THREE.MeshStandardMaterial(matOpts);

    new OBJLoader().load(cfg.obj, (obj) => {
        obj.traverse((c) => { if (c.isMesh) { c.material = planetMat; planet.mesh = c; } });
        // Normalize to unit-sphere so wrapper.scale = visualRadius gives the
        // exact final size regardless of OBJ's source units.
        const bbox = new THREE.Box3().setFromObject(obj);
        const sphere = new THREE.Sphere();
        bbox.getBoundingSphere(sphere);
        const inner = new THREE.Group();
        if (sphere.radius > 0) {
            obj.position.copy(sphere.center).multiplyScalar(-1);
            inner.scale.setScalar(1 / sphere.radius);
        }
        inner.add(obj);
        wrapper.add(inner);
    }, undefined, (err) => console.error(`Failed to load ${cfg.name} model:`, err));

    // Saturn-only: ring annulus.
    if (cfg.rings) {
        const ringInner = 1.2;  // multiples of planet visual radius
        const ringOuter = 2.2;
        const ringGeo = new THREE.RingGeometry(ringInner, ringOuter, 96);
        // RingGeometry's default UVs are weird; remap so the ring texture
        // wraps as a simple radial gradient (1D across the band).
        const uv = ringGeo.attributes.uv;
        const pos = ringGeo.attributes.position;
        for (let i = 0; i < uv.count; i++) {
            const r = Math.hypot(pos.getX(i), pos.getY(i));
            const t = (r - ringInner) / (ringOuter - ringInner);
            uv.setXY(i, t, 0.5);
        }
        const ringMat = new THREE.MeshStandardMaterial({
            map: sRGB(cfg.rings.base),
            alphaMap: linear(cfg.rings.opacity),
            roughnessMap: cfg.rings.roughness ? linear(cfg.rings.roughness) : null,
            normalMap:    cfg.rings.normal    ? linear(cfg.rings.normal)    : null,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            roughness: 1.0,
            metalness: 0.0,
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.rotation.x = Math.PI / 2; // lay flat in XZ plane
        // Tilt rings ~26.7° (Saturn's real axial tilt) for character.
        ringMesh.rotation.y = (26.7 * Math.PI) / 180;
        wrapper.add(ringMesh);
        planet.rings = ringMesh;
    }

    return planet;
}

/**
 * Build the whole solar system (excluding Earth — that lives near the ship).
 * Returns a parent group that should be positioned at -wp each frame so the
 * planets sit at their heliocentric coordinates relative to Sol (which is
 * itself at -wp in scene coords).
 */
function createPlanets() {
    const group = new THREE.Group();
    const planets = PLANETS.map((cfg) => {
        const p = createPlanet(cfg);
        group.add(p.group);
        return p;
    });
    return { group, planets };
}

export function updateScene(state, wp, Voyage) {
    // Update star positions relative to ship — these are per-instance now.
    const newPositions = Voyage.getStarPositions(wp.x, wp.y, wp.z);
    state.starGeometry.attributes.instancePosition.array.set(newPositions);
    state.starGeometry.attributes.instancePosition.needsUpdate = true;

    // Move trajectory so ship sits at origin
    state.trajectory.future.position.set(-wp.x, -wp.y, -wp.z);
    state.trajectory.past.position.set(-wp.x, -wp.y, -wp.z);

    // Orient ship along the trajectory tangent (+X is the ship's nose)
    const traj = state.voyageData.trajectory;
    const i = Math.min(traj.length - 2, Math.max(0, wp.waypointIndex));
    const a = traj[i], b = traj[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const dir = new THREE.Vector3(dx / len, dy / len, dz / len);
    state.ship.group.quaternion.setFromUnitVectors(SHIP_FORWARD, dir);

    // Earth is anchored one EARTH_RADIUS BEHIND trajectory[0] along the launch
    // direction, so at year 0 the ship's origin lies exactly on Earth's surface
    // (the trajectory line starts tangent to Earth and travels outward — never
    // through the planet). Recompute launch dir each frame so it stays correct
    // when the destination changes.
    if (state.earth) {
        const t0 = traj[0], t1 = traj[1] ?? t0;
        const ldx = t1.x - t0.x, ldy = t1.y - t0.y, ldz = t1.z - t0.z;
        const lLen = Math.hypot(ldx, ldy, ldz) || 1;
        const lx = ldx / lLen, ly = ldy / lLen, lz = ldz / lLen;
        state.earth.group.position.set(
            -wp.x - EARTH_RADIUS * lx,
            -wp.y - EARTH_RADIUS * ly,
            -wp.z - EARTH_RADIUS * lz,
        );
    }

    // Solar-system planets — group sits exactly at Sol's scene position so
    // each planet's own offset (set in createPlanet) places it correctly.
    if (state.planets) {
        state.planets.group.position.set(-wp.x, -wp.y, -wp.z);
    }

    // Reveal "past" portion up to current waypoint
    const drawCount = Math.max(2, Math.min(state.trajectory.totalCount, wp.waypointIndex + 1));
    state.trajectory.past.geometry.setDrawRange(0, drawCount);

    // Constellation lines (rebuild geometry — only a few per scrub)
    const constLines = Voyage.getConstellationLines(wp.x, wp.y, wp.z) || [];
    rebuildConstellations(state, constLines);
}

function rebuildConstellations(state, constLines) {
    // Lazy-create line objects keyed by name
    if (!state._constMap) state._constMap = new Map();
    const seen = new Set();

    for (const c of constLines) {
        seen.add(c.name);
        let entry = state._constMap.get(c.name);
        if (!entry) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(c.positions.slice(), 3));
            const material = new THREE.LineBasicMaterial({
                color: 0xaaccff,
                transparent: true,
                opacity: 0.35,
            });
            const segs = new THREE.LineSegments(geometry, material);
            state.constellations.add(segs);
            entry = { geometry, material, segs };
            state._constMap.set(c.name, entry);
        } else {
            const arr = entry.geometry.attributes.position.array;
            if (arr.length === c.positions.length) {
                arr.set(c.positions);
                entry.geometry.attributes.position.needsUpdate = true;
            } else {
                entry.geometry.setAttribute('position', new THREE.BufferAttribute(c.positions.slice(), 3));
            }
        }
    }

    for (const [name, entry] of state._constMap) {
        if (!seen.has(name)) {
            state.constellations.remove(entry.segs);
            entry.geometry.dispose();
            entry.material.dispose();
            state._constMap.delete(name);
        }
    }
}

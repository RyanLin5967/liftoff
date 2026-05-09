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
// Tweak these if the model appears the wrong size or facing the wrong way.
const SHIP_SCALE = 0.12;
const SHIP_MODEL_EULER = new THREE.Euler(0, Math.PI, 0); // 180° yaw so the nose faces forward
// ===========================================================

// === Earth model + textures ===
// Earth.obj uses two named groups: `earth_twilight_GEO` (surface) and
// `clouds_GEO` (cloud shell). Textures live in ./Earth_Texture/.
const EARTH_MODEL_PATH = './Earth.obj';
const EARTH_TEXTURE_DIR = './Earth_Texture/';
// ===============================

// === Planet sizing — real-world ratio, scaled for visibility ===
// PLANET_SCALE sets the absolute visual size of an Earth-sized planet.
// To add other planets, multiply by their real-world Earth-relative radius
// (Mars ≈ 0.532, Jupiter ≈ 11.2, Proxima b ≈ 1.07, etc.) so proportions stay real.
const PLANET_SCALE = 0.4;
const EARTH_RADIUS = PLANET_SCALE * 1.0;
// ================================================================

const STAR_VERTEX = `
    attribute float size;
    varying vec3 vColor;
    void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (200.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const STAR_FRAGMENT = `
    varying vec3 vColor;
    void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float alpha = 1.0 - smoothstep(0.0, 0.5, d);
        gl_FragColor = vec4(vColor, alpha);
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
    camera.position.set(0.6, 0.4, 1.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x020208, 1);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.rotateSpeed = 0.4;
    controls.zoomSpeed = 0.6;
    controls.minDistance = 0.1;
    controls.maxDistance = 80;

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

    const constellations = new THREE.Group();
    scene.add(constellations);

    const lightHorizon = createLightHorizonSphere();
    scene.add(lightHorizon);

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
    });

    const _pickVec = new THREE.Vector3();
    function pickStar() {
        if (!Number.isFinite(hoverState.mouseNDC.x)) return -1;
        const positions = stars.geometry.attributes.position.array;
        const sizes = stars.geometry.attributes.size.array;
        const count = positions.length / 3;
        const aspect = camera.aspect || 1;
        // ~14px on a 1080p screen; expand slightly for big bright stars
        const baseThreshold = 0.018;
        let bestIdx = -1;
        let bestDist2 = baseThreshold * baseThreshold;
        for (let i = 0; i < count; i++) {
            _pickVec.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
            _pickVec.project(camera);
            if (_pickVec.z < -1 || _pickVec.z > 1) continue;
            const dx = (_pickVec.x - hoverState.mouseNDC.x) * aspect;
            const dy = _pickVec.y - hoverState.mouseNDC.y;
            const sizeBoost = (sizes[i] || 1) * 0.0008;
            const tol = baseThreshold + sizeBoost;
            const d2 = dx * dx + dy * dy;
            if (d2 < tol * tol && d2 < bestDist2) {
                bestDist2 = d2;
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

    return {
        scene, camera, renderer, controls, composer,
        starGeometry: stars.geometry,
        starMaterial: stars.material,
        trajectory,
        ship,
        earth,
        constellations,
        lightHorizon,
        voyageData,
        onStarHover,
        onStarClick,
        fitControlsToTrip,
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

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions.slice(), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.ShaderMaterial({
        vertexShader: STAR_VERTEX,
        fragmentShader: STAR_FRAGMENT,
        transparent: true,
        vertexColors: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    return { points, geometry, material };
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

function createLightHorizonSphere() {
    const geometry = new THREE.SphereGeometry(1, 32, 32);
    const material = new THREE.MeshBasicMaterial({
        color: 0x4488dd,
        transparent: true,
        opacity: 0.05,
        side: THREE.BackSide,
        depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.setScalar(0.001);
    return mesh;
}

export function updateScene(state, wp, Voyage) {
    // Update star positions relative to ship
    const newPositions = Voyage.getStarPositions(wp.x, wp.y, wp.z);
    state.starGeometry.attributes.position.array.set(newPositions);
    state.starGeometry.attributes.position.needsUpdate = true;

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
    // (no more spawning inside the planet). Cache the launch dir once.
    if (state.earth) {
        if (!state._launchDir) {
            const t0 = traj[0], t1 = traj[1] ?? t0;
            const ldx = t1.x - t0.x, ldy = t1.y - t0.y, ldz = t1.z - t0.z;
            const lLen = Math.hypot(ldx, ldy, ldz) || 1;
            state._launchDir = new THREE.Vector3(ldx / lLen, ldy / lLen, ldz / lLen);
        }
        const ld = state._launchDir;
        state.earth.group.position.set(
            -wp.x - EARTH_RADIUS * ld.x,
            -wp.y - EARTH_RADIUS * ld.y,
            -wp.z - EARTH_RADIUS * ld.z,
        );
    }

    // Reveal "past" portion up to current waypoint
    const drawCount = Math.max(2, Math.min(state.trajectory.totalCount, wp.waypointIndex + 1));
    state.trajectory.past.geometry.setDrawRange(0, drawCount);

    // Light horizon sphere — centered at Sol (-wp in ship-relative space),
    // with radius = distance from Sol to ship, so the sphere's surface always
    // passes through the ship's center. Color flips after the horizon year.
    state.lightHorizon.position.set(-wp.x, -wp.y, -wp.z);
    const horizonYr = Voyage.getLightHorizon().ship_year;
    const past = wp.year >= horizonYr;
    const radius = Math.max(0.001, Math.hypot(wp.x, wp.y, wp.z));
    state.lightHorizon.scale.setScalar(radius);
    state.lightHorizon.material.color.setHex(past ? 0xff7755 : 0x4488dd);
    state.lightHorizon.material.opacity = past ? 0.02 : 0.06;

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

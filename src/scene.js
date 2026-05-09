import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// === Ship model — swap this path to use a different GLB ===
// Path is relative to index.html (the page root).
const SHIP_MODEL_PATH = './spaceship.glb';
// Tweak these if the model appears the wrong size or facing the wrong way.
const SHIP_SCALE = 0.12;
const SHIP_MODEL_EULER = new THREE.Euler(0, Math.PI, 0); // 180° yaw so the nose faces forward
// ===========================================================

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

    // Lighting so the ship's metal surfaces are visible against the starfield
    scene.add(new THREE.AmbientLight(0x556677, 0.45));
    const keyLight = new THREE.DirectionalLight(0xffeedd, 0.9);
    keyLight.position.set(2, 1.5, 1);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x88aaff, 0.5);
    rimLight.position.set(-1, -0.5, -1.2);
    scene.add(rimLight);

    const ship = createShip();
    scene.add(ship.group);

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

    return {
        scene, camera, renderer, controls, composer,
        starGeometry: stars.geometry,
        starMaterial: stars.material,
        trajectory,
        ship,
        constellations,
        lightHorizon,
        voyageData,
        onStarHover,
    };
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

    // Warm cabin glow so the ship reads as inhabited even at distance
    const cabinLight = new THREE.PointLight(0xffe4b0, 0.4, 0.15);
    group.add(cabinLight);

    const ship = { group, modelHolder, model: null };

    new GLTFLoader().load(
        SHIP_MODEL_PATH,
        (gltf) => {
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

    // Reveal "past" portion up to current waypoint
    const drawCount = Math.max(2, Math.min(state.trajectory.totalCount, wp.waypointIndex + 1));
    state.trajectory.past.geometry.setDrawRange(0, drawCount);

    // Light horizon sphere — radius is current Earth-light distance in parsecs
    // earthLightYear is years of Earth time; convert relative growth roughly to parsecs.
    // The sphere is centered at -wp (Sol's position relative to ship).
    state.lightHorizon.position.set(-wp.x, -wp.y, -wp.z);
    const horizonYr = Voyage.getLightHorizon().ship_year;
    const past = wp.year >= horizonYr;
    const radius = Math.max(0.001, wp.year / Math.max(1, horizonYr)) * 1.4;
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

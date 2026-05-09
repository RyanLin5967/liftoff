import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

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

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        composer.setSize(window.innerWidth, window.innerHeight);
        bloom.setSize(window.innerWidth, window.innerHeight);
    });

    function animate() {
        requestAnimationFrame(animate);
        controls.update();

        const t = performance.now() * 0.001;
        // Habitat ring spins for artificial gravity
        ship.habitat.rotation.x = t * 0.6;
        // Engine plume pulses
        ship.engineGlow.material.opacity = 0.85 + 0.15 * Math.sin(t * 4.0);
        ship.engineGlow.scale.setScalar(1.0 + 0.08 * Math.sin(t * 4.0));

        composer.render();
    }
    animate();

    return {
        scene, camera, renderer, controls, composer,
        starGeometry: stars.geometry,
        starMaterial: stars.material,
        trajectory,
        ship,
        constellations,
        lightHorizon,
        voyageData,
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
    // Ship is built along +X (forward). Overall length ~0.08 parsec-units
    // so it reads as a vehicle without dwarfing the trajectory.
    const group = new THREE.Group();

    const hullMat = new THREE.MeshStandardMaterial({
        color: 0xc8d2e0,
        metalness: 0.85,
        roughness: 0.35,
        emissive: 0x111822,
        emissiveIntensity: 0.6,
    });
    const ringMat = new THREE.MeshStandardMaterial({
        color: 0xa8b8cc,
        metalness: 0.7,
        roughness: 0.4,
        emissive: 0x334466,
        emissiveIntensity: 0.5,
    });
    const accentMat = new THREE.MeshStandardMaterial({
        color: 0x6677aa,
        metalness: 0.9,
        roughness: 0.3,
    });

    // Central spine (cylinder oriented along X)
    const hullGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.06, 20);
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.rotation.z = Math.PI / 2;
    group.add(hull);

    // Forward command pod
    const noseGeo = new THREE.SphereGeometry(0.009, 20, 16);
    const nose = new THREE.Mesh(noseGeo, hullMat);
    nose.position.x = 0.032;
    group.add(nose);

    // Forward sensor spike
    const spikeGeo = new THREE.CylinderGeometry(0.0008, 0.002, 0.012, 8);
    const spike = new THREE.Mesh(spikeGeo, accentMat);
    spike.rotation.z = Math.PI / 2;
    spike.position.x = 0.044;
    group.add(spike);

    // Rotating habitat ring (this is where humans live — spins for gravity)
    const habitat = new THREE.Group();
    const ringGeo = new THREE.TorusGeometry(0.024, 0.005, 14, 64);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    habitat.add(ring);

    // Lit windows around the inside of the habitat ring
    const windowMat = new THREE.MeshBasicMaterial({ color: 0xffeebb });
    const windowCount = 24;
    for (let i = 0; i < windowCount; i++) {
        const a = (i / windowCount) * Math.PI * 2;
        const w = new THREE.Mesh(new THREE.SphereGeometry(0.0012, 6, 6), windowMat);
        w.position.set(0, Math.sin(a) * 0.024, Math.cos(a) * 0.024);
        habitat.add(w);
    }

    // Spokes connecting habitat ring to the spine
    for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const spokeGeo = new THREE.CylinderGeometry(0.0008, 0.0008, 0.024, 6);
        const spoke = new THREE.Mesh(spokeGeo, accentMat);
        spoke.position.set(0, Math.sin(a) * 0.012, Math.cos(a) * 0.012);
        spoke.lookAt(0, Math.sin(a) * 0.024, Math.cos(a) * 0.024);
        spoke.rotateX(Math.PI / 2);
        habitat.add(spoke);
    }
    habitat.position.x = 0.005;
    group.add(habitat);

    // Aft fuel/cargo modules — three small cylinders ringed around the spine
    for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const tankGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.018, 12);
        const tank = new THREE.Mesh(tankGeo, accentMat);
        tank.rotation.z = Math.PI / 2;
        tank.position.set(-0.018, Math.sin(a) * 0.009, Math.cos(a) * 0.009);
        group.add(tank);
    }

    // Engine bell at the rear
    const bellGeo = new THREE.CylinderGeometry(0.005, 0.012, 0.014, 20, 1, true);
    const bell = new THREE.Mesh(bellGeo, accentMat);
    bell.rotation.z = -Math.PI / 2;
    bell.position.x = -0.038;
    group.add(bell);

    // Engine plume — bright, additive, picked up by bloom
    const glowGeo = new THREE.SphereGeometry(0.008, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({
        color: 0x88ccff,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });
    const engineGlow = new THREE.Mesh(glowGeo, glowMat);
    engineGlow.position.x = -0.046;
    group.add(engineGlow);

    // Warm cabin glow so the ship reads as inhabited even at distance
    const cabinLight = new THREE.PointLight(0xffe4b0, 0.4, 0.15);
    cabinLight.position.set(0.005, 0, 0);
    group.add(cabinLight);

    return { group, habitat, engineGlow };
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

/**
 * Firestore-backed shared memory pins.
 *
 * Pins are partitioned by `destinationStarId` so two users on the same voyage
 * see each other's entries, while picking a different destination opens a
 * different "log book." If config is missing, every export silently no-ops
 * and the rest of the app falls back to its localStorage path.
 *
 * ─── Setup (one-time, ~3 minutes) ────────────────────────────────────────
 * 1. https://console.firebase.google.com → Add project (skip Analytics).
 * 2. In the project, click the </> icon → "Add app" → Web → register a name.
 * 3. Firebase will display a `firebaseConfig` object — copy it.
 * 4. Replace the values in `firebaseConfig` below with yours.
 * 5. In the Firebase console, go to "Firestore Database" → "Create database"
 *    → start in **test mode** (anyone can read/write, expires in 30 days —
 *    fine for a hackathon).
 * ─────────────────────────────────────────────────────────────────────────
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
import {
    getFirestore,
    collection,
    query,
    where,
    addDoc,
    onSnapshot,
    serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js';

// Browsers can't read .env files (dotenv is a Node-only library; `process`
// doesn't exist here). Instead we fetch a static JSON file at the project
// root that's generated from .env by `scripts/build-firebase-config.mjs`.
// Top-level await makes any importer of this module wait until the config
// has loaded (or failed) before continuing.
let firebaseConfig = null;
try {
    const res = await fetch('./firebase-config.json');
    if (res.ok) firebaseConfig = await res.json();
} catch {
    // Network/parse error — leave config null; init() logs a helpful warning.
}

let _db = null;
let _initState = 'pending'; // 'pending' | 'ready' | 'failed'

function init() {
    if (_initState !== 'pending') return;
    if (!firebaseConfig || !firebaseConfig.apiKey) {
        console.warn(
            '[firebase] firebase-config.json missing — pins will stay local-only.\n' +
            'Fix: put FIREBASE_API_KEY, AUTH_DOMAIN, PROJECT_ID, STORAGE_BUCKET, ' +
            'MESSAGING_SENDER_ID, APP_ID in .env and run `npm run build:config`.'
        );
        _initState = 'failed';
        return;
    }
    try {
        const app = initializeApp(firebaseConfig);
        _db = getFirestore(app);
        _initState = 'ready';
        console.info('[firebase] Connected — memory pins are now shared.');
    } catch (e) {
        console.error('[firebase] init failed', e);
        _initState = 'failed';
    }
}

export function isAvailable() {
    init();
    return _initState === 'ready';
}

/**
 * Live-subscribe to all pins for `destinationStarId`. The callback fires once
 * with the initial snapshot, then again each time a pin is added/removed.
 * Returns an unsubscribe function (call it before subscribing to a different
 * voyage).
 */
export function watchVoyagePins(destinationStarId, callback) {
    if (!isAvailable()) return () => {};
    const q = query(
        collection(_db, 'pins'),
        where('destinationStarId', '==', destinationStarId),
    );
    return onSnapshot(
        q,
        (snap) => {
            const pins = [];
            snap.forEach((doc) => {
                pins.push({ _id: doc.id, _userAdded: true, ...doc.data() });
            });
            callback(pins);
        },
        (err) => console.warn('[firebase] watch error', err)
    );
}

/**
 * Persist a new pin to the shared collection for `destinationStarId`.
 * Returns the new doc id, or null on failure.
 */
export async function addVoyagePin(pin, destinationStarId) {
    if (!isAvailable()) return null;
    try {
        const ref = await addDoc(collection(_db, 'pins'), {
            ...pin,
            destinationStarId,
            createdAt: serverTimestamp(),
        });
        return ref.id;
    } catch (e) {
        console.error('[firebase] add pin failed', e);
        return null;
    }
}

/**
 * Reads .env at the project root and writes firebase-config.json (also at the
 * root, gitignored) which the browser then fetches via src/firebase.js.
 *
 * Why this exists: dotenv only runs in Node — it can't be imported into a
 * <script type="module"> that runs in the browser. So we shuffle the .env
 * values into a static JSON file at build time, and the browser just reads
 * that JSON.
 *
 * Run with:    npm run build:config    (also chained into npm run dev)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');
const outPath = path.join(root, 'firebase-config.json');

if (!fs.existsSync(envPath)) {
    console.warn(`[build:config] No .env found at ${envPath} — skipping.`);
    process.exit(0);
}

// Minimal .env parser: KEY=value per line, # comments, optional surrounding
// quotes. Avoids needing the `dotenv` dep.
const env = {};
for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
    ) {
        value = value.slice(1, -1);
    }
    env[key] = value;
}

const config = {
    apiKey:            env.FIREBASE_API_KEY,
    authDomain:        env.AUTH_DOMAIN,
    projectId:         env.PROJECT_ID,
    storageBucket:     env.STORAGE_BUCKET,
    messagingSenderId: env.MESSAGING_SENDER_ID,
    appId:             env.APP_ID,
};

const missing = Object.entries(config).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
    console.error(
        `[build:config] Missing required keys in .env: ${missing.join(', ')}.\n` +
        `Add them to ${envPath} (FIREBASE_API_KEY, AUTH_DOMAIN, PROJECT_ID, ` +
        `STORAGE_BUCKET, MESSAGING_SENDER_ID, APP_ID).`
    );
    process.exit(1);
}

fs.writeFileSync(outPath, JSON.stringify(config, null, 2) + '\n');
console.log(`[build:config] Wrote ${path.relative(root, outPath)}`);

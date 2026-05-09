/**
 * Audio Engine — fading Earth radio that goes silent at the light horizon.
 *
 * Usage:
 *   import * as Audio from './audio-engine.js';
 *   await Audio.init();
 *   Audio.start();  // call after a user gesture (click/input) for autoplay policy
 *   Audio.update(year, lightHorizonYear);  // call on every slider change
 */

let audioCtx = null;
let radioSource = null;
let staticSource = null;
let radioGain = null;
let staticGain = null;
let masterGain = null;
let radioBuffer = null;
let staticBuffer = null;
let isInitialized = false;
let isPlaying = false;

/**
 * Initialize audio context and load audio files.
 * Call once on page load.
 */
export async function init() {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.25;
    masterGain.connect(audioCtx.destination);

    radioGain = audioCtx.createGain();
    radioGain.connect(masterGain);

    staticGain = audioCtx.createGain();
    staticGain.gain.value = 0;
    staticGain.connect(masterGain);

    // Try to load audio files. If they don't exist, generate synthetic audio.
    try {
      const [radioRes, staticRes] = await Promise.all([
        fetch("./audio/earth-radio.mp3"),
        fetch("./audio/static.mp3"),
      ]);

      if (radioRes.ok && staticRes.ok) {
        radioBuffer = await audioCtx.decodeAudioData(await radioRes.arrayBuffer());
        staticBuffer = await audioCtx.decodeAudioData(await staticRes.arrayBuffer());
      } else {
        throw new Error("Audio files not found, generating synthetic audio");
      }
    } catch {
      // Generate synthetic audio if files aren't available
      radioBuffer = generateTone(audioCtx, 8, [220, 330, 440], 0.15);
      staticBuffer = generateStatic(audioCtx, 4);
      console.log("Using synthetic audio (place mp3 files in ./audio/ for real audio)");
    }

    isInitialized = true;
  } catch (err) {
    console.warn("Audio init failed:", err);
  }
}

/**
 * Generate a simple ambient tone buffer as fallback.
 */
function generateTone(ctx, durationSec, frequencies, amplitude) {
  const sampleRate = ctx.sampleRate;
  const length = sampleRate * durationSec;
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < length; i++) {
    let sample = 0;
    const t = i / sampleRate;
    for (const freq of frequencies) {
      sample += Math.sin(2 * Math.PI * freq * t) * amplitude / frequencies.length;
    }
    // Slow amplitude modulation for a "breathing" effect
    sample *= 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.1 * t);
    data[i] = sample;
  }
  return buffer;
}

/**
 * Generate white noise buffer as fallback static.
 */
function generateStatic(ctx, durationSec) {
  const sampleRate = ctx.sampleRate;
  const length = sampleRate * durationSec;
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < length; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.3;
  }
  return buffer;
}

/**
 * Start audio playback. Must be called after a user gesture (click, input)
 * due to browser autoplay policy.
 */
export function start() {
  if (!isInitialized || isPlaying) return;

  // Resume context if suspended (autoplay policy)
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  radioSource = audioCtx.createBufferSource();
  radioSource.buffer = radioBuffer;
  radioSource.loop = true;
  radioSource.connect(radioGain);
  radioSource.start();

  staticSource = audioCtx.createBufferSource();
  staticSource.buffer = staticBuffer;
  staticSource.loop = true;
  staticSource.connect(staticGain);
  staticSource.start();

  isPlaying = true;
}

/**
 * Update audio based on current year and light horizon.
 * Call on every slider change.
 */
export function update(year, lightHorizonYear) {
  if (!isInitialized || !isPlaying) return;

  const now = audioCtx.currentTime;
  const distanceLy = 0.01698 * year;

  // Radio volume: fades with distance squared
  // Strong at year 0, barely audible by year 100, nearly silent by year 150
  const radioVolume = 1.0 / (1.0 + distanceLy * distanceLy * 0.8);

  // Static: increases as radio fades
  const staticVolume = Math.min(0.35, (1 - radioVolume) * 0.4);

  if (year >= lightHorizonYear) {
    // Past light horizon: everything fades to silence
    const yearsPast = year - lightHorizonYear;
    const fade = Math.max(0, 1 - yearsPast / 8); // Silence over 8 years

    radioGain.gain.setTargetAtTime(0, now, 0.15);
    staticGain.gain.setTargetAtTime(staticVolume * fade, now, 0.15);
  } else {
    radioGain.gain.setTargetAtTime(radioVolume, now, 0.15);
    staticGain.gain.setTargetAtTime(staticVolume, now, 0.15);
  }
}

/**
 * Set master volume (0 to 1).
 */
export function setMasterVolume(vol) {
  if (masterGain) {
    masterGain.gain.setTargetAtTime(vol, audioCtx.currentTime, 0.1);
  }
}

/**
 * Mute/unmute toggle.
 */
export function toggleMute() {
  if (!masterGain) return false;
  const isMuted = masterGain.gain.value < 0.01;
  masterGain.gain.setTargetAtTime(isMuted ? 0.25 : 0, audioCtx.currentTime, 0.1);
  return !isMuted; // returns new mute state
}

/**
 * Check if audio is ready.
 */
export function isReady() {
  return isInitialized;
}
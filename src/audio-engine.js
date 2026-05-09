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
let radioGain = null;
let masterGain = null;
let radioBuffer = null;
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
    radioGain.gain.value = 1.0;
    radioGain.connect(masterGain);

    try {
      const radioRes = await fetch("./audio/earth-radio.mp3");
      if (!radioRes.ok) throw new Error(`earth-radio.mp3 fetch failed: ${radioRes.status}`);
      radioBuffer = await audioCtx.decodeAudioData(await radioRes.arrayBuffer());
    } catch (e) {
      console.warn("Falling back to synthetic radio tone:", e);
      radioBuffer = generateTone(audioCtx, 8, [220, 330, 440], 0.15);
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
    sample *= 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.1 * t);
    data[i] = sample;
  }
  return buffer;
}

/**
 * Start audio playback. Safe to call multiple times — always tries to resume
 * the context (browsers leave it suspended until a user gesture).
 */
export function start() {
  if (!isInitialized) return;

  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  if (isPlaying) return;

  radioSource = audioCtx.createBufferSource();
  radioSource.buffer = radioBuffer;
  radioSource.loop = true;
  radioSource.connect(radioGain);
  radioSource.start();

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

  const radioVolume = 1.0 / (1.0 + distanceLy * distanceLy * 0.8);

  if (year >= lightHorizonYear) {
    radioGain.gain.setTargetAtTime(0, now, 0.15);
  } else {
    radioGain.gain.setTargetAtTime(radioVolume, now, 0.15);
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
  return !isMuted;
}

/**
 * Check if audio is ready.
 */
export function isReady() {
  return isInitialized;
}

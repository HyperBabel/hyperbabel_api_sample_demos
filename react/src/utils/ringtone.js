/**
 * HyperBabel React Demo — Ringtone Utility
 *
 * Generates a ringtone using the Web Audio API (no external audio file needed).
 * Produces a polyphonic ring pattern that mimics a classic phone ring.
 *
 * Usage:
 *   import { startRingtone, stopRingtone } from '../utils/ringtone';
 *   startRingtone();   // Start ringing
 *   stopRingtone();    // Stop ringing
 *
 * No audio file required — synthesised entirely in the browser.
 * Falls back silently if Web Audio API is unavailable.
 */

let audioCtx = null;
let gainNode = null;
let intervalId = null;
let isPlaying = false;

/**
 * Play a single DTMF-style ring burst (two tones: 480 Hz + 440 Hz for 2s, 4s gap).
 * @param {AudioContext} ctx
 * @param {GainNode} masterGain
 */
const playRingBurst = (ctx, masterGain) => {
  const now = ctx.currentTime;

  // Create two oscillators (classic double-ring tone)
  const freqs = [480, 440];
  freqs.forEach((freq) => {
    const osc = ctx.createOscillator();
    const envGain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    // Envelope: quick attack, sustain, quick release
    envGain.gain.setValueAtTime(0, now);
    envGain.gain.linearRampToValueAtTime(0.25, now + 0.05);
    envGain.gain.setValueAtTime(0.25, now + 0.8);
    envGain.gain.linearRampToValueAtTime(0, now + 1.0);

    osc.connect(envGain);
    envGain.connect(masterGain);

    osc.start(now);
    osc.stop(now + 1.05);
  });
};

/**
 * Start the incoming call ringtone.
 * Repeats every 3 seconds. Safe to call multiple times (idempotent).
 */
export const startRingtone = () => {
  if (isPlaying) return; // Already playing

  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(0.6, audioCtx.currentTime);
    gainNode.connect(audioCtx.destination);

    isPlaying = true;

    // Play immediately + repeat every 3 seconds
    playRingBurst(audioCtx, gainNode);
    intervalId = setInterval(() => {
      if (audioCtx && isPlaying) playRingBurst(audioCtx, gainNode);
    }, 3000);
  } catch (err) {
    // Web Audio API unavailable (e.g., old browser) — fail silently
    console.info('[Ringtone] Web Audio API unavailable:', err.message);
  }
};

/**
 * Stop the ringtone and release audio resources.
 * Safe to call even if ringtone was never started.
 */
export const stopRingtone = () => {
  isPlaying = false;

  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }

  if (gainNode) {
    try {
      gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.1);
    } catch { /* ignore */ }
    gainNode = null;
  }

  if (audioCtx) {
    try {
      audioCtx.close();
    } catch { /* ignore */ }
    audioCtx = null;
  }
};

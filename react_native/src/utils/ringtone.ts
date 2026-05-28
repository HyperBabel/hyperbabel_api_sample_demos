/**
 * HyperBabel Demo — Ringtone Utility
 *
 * Plays an incoming-call ringtone via expo-audio while simultaneously
 * triggering a repeating device vibration pattern. expo-av is deprecated;
 * expo-audio is the SDK 54+ replacement.
 *
 * Usage:
 *   import { startRingtone, stopRingtone } from '@/utils/ringtone';
 *   await startRingtone();   // idempotent — safe to call multiple times
 *   stopRingtone();          // stops audio + vibration immediately
 *
 * Falls back silently when audio hardware is unavailable.
 */

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Vibration } from 'react-native';

// ── Internal state ─────────────────────────────────────────────────────────

let player: AudioPlayer | null = null;
let isRinging = false;

// Vibration pattern: [wait, vibrate, pause, vibrate, pause, ...]  (ms)
// Produces two short pulses (like a phone ring) then a 2-second pause.
const VIBRATION_PATTERN = [0, 400, 200, 400, 2000];

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Start the incoming call ringtone.
 * Loops the audio file and repeats the vibration pattern indefinitely.
 * Safe to call multiple times (idempotent).
 */
export const startRingtone = async (): Promise<void> => {
  if (isRinging) return;
  isRinging = true;

  // Configure audio session for playback even when device is on silent.
  // expo-audio renames the expo-av flags: playsInSilentModeIOS →
  // playsInSilentMode, staysActiveInBackground → shouldPlayInBackground.
  try {
    await setAudioModeAsync({
      allowsRecording:         false,
      playsInSilentMode:       true,
      shouldPlayInBackground:  true,
      shouldRouteThroughEarpiece: false,
    });
  } catch {
    // Non-fatal — audio mode config failure should not block the UI
  }

  // Play the bundled ringtone file, looped.
  try {
    const newPlayer = createAudioPlayer(require('../../assets/sounds/ringtone.mp3'));
    newPlayer.loop   = true;
    newPlayer.volume = 1.0;
    newPlayer.play();
    player = newPlayer;
  } catch {
    // Audio file unavailable — vibration will still work
  }

  // Start repeating vibration pattern (repeat = true)
  Vibration.vibrate(VIBRATION_PATTERN, true);
};

/**
 * Stop the ringtone and vibration.
 * Safe to call even if never started (idempotent).
 */
export const stopRingtone = (): void => {
  isRinging = false;

  // Stop vibration immediately
  Vibration.cancel();

  // Pause + release the audio player. .remove() drops the native handle so
  // the audio session can be torn down — the next startRingtone() creates
  // a fresh player.
  if (player) {
    try { player.pause(); } catch { /* no-op */ }
    try { player.remove(); } catch { /* no-op */ }
    player = null;
  }
};

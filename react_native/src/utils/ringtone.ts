/**
 * HyperBabel Demo — Ringtone Utility
 *
 * Plays an incoming-call ringtone via expo-av while simultaneously
 * triggering a repeating device vibration pattern.
 *
 * Usage:
 *   import { startRingtone, stopRingtone } from '@/utils/ringtone';
 *   await startRingtone();   // idempotent — safe to call multiple times
 *   stopRingtone();          // stops audio + vibration immediately
 *
 * Falls back silently when audio hardware is unavailable.
 */

import { Audio } from 'expo-av';
import { Vibration } from 'react-native';

// ── Internal state ─────────────────────────────────────────────────────────

let sound: Audio.Sound | null = null;
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

  // Configure audio session for playback even when device is on silent
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS:         false,
      playsInSilentModeIOS:       true,   // ring even when iOS is on silent ringer
      staysActiveInBackground:    true,
      shouldDuckAndroid:          false,
    });
  } catch {
    // Non-fatal — audio mode config failure should not block the UI
  }

  // Play the bundled ringtone file, looped
  try {
    const { sound: newSound } = await Audio.Sound.createAsync(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../../assets/sounds/ringtone.mp3'),
      { shouldPlay: true, isLooping: true, volume: 1.0 },
    );
    sound = newSound;
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

  // Stop and unload audio
  if (sound) {
    sound.stopAsync().catch(() => {});
    sound.unloadAsync().catch(() => {});
    sound = null;
  }
};

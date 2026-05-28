/**
 * HyperBabel Demo — usePermissions Hook
 *
 * Requests and checks Camera + Microphone permissions before
 * starting any video call or live stream.
 *
 * Mic permission flows through expo-audio's AudioModule instead of expo-av —
 * expo-av is deprecated in Expo SDK 54+.
 *
 * Returns:
 *  - granted: whether both permissions are approved
 *  - request: trigger permission prompt (async)
 *  - checking: loading state during initial check
 */

import { useState, useEffect, useCallback } from 'react';
import { Camera } from 'expo-camera';
import { AudioModule } from 'expo-audio';
import { Alert, Linking } from 'react-native';

export interface PermissionsState {
  cameraGranted: boolean;
  micGranted:    boolean;
  allGranted:    boolean;
  checking:      boolean;
  request:       () => Promise<boolean>;
}

export function usePermissions(): PermissionsState {
  const [cameraGranted, setCameraGranted] = useState(false);
  const [micGranted,    setMicGranted]    = useState(false);
  const [checking,      setChecking]      = useState(true);

  useEffect(() => {
    (async () => {
      const [cam, mic] = await Promise.all([
        Camera.getCameraPermissionsAsync(),
        AudioModule.getRecordingPermissionsAsync(),
      ]);
      setCameraGranted(cam.granted);
      setMicGranted(mic.granted);
      setChecking(false);
    })();
  }, []);

  const request = useCallback(async (): Promise<boolean> => {
    const [cam, mic] = await Promise.all([
      Camera.requestCameraPermissionsAsync(),
      AudioModule.requestRecordingPermissionsAsync(),
    ]);

    const camOk = cam.granted;
    const micOk = mic.granted;

    setCameraGranted(camOk);
    setMicGranted(micOk);

    if (!camOk || !micOk) {
      const missing = [!camOk && 'Camera', !micOk && 'Microphone'].filter(Boolean).join(' and ');
      Alert.alert(
        'Permissions Required',
        `${missing} access is needed for video calls. Please enable it in your device Settings.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
      return false;
    }

    return true;
  }, []);

  return {
    cameraGranted,
    micGranted,
    allGranted: cameraGranted && micGranted,
    checking,
    request,
  };
}

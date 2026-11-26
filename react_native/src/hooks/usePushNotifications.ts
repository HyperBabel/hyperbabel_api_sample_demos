/**
 * HyperBabel Demo — usePushNotifications Hook
 *
 * Requests permission for push notifications and registers the FCM
 * registration token with HyperBabel — on iOS as well as Android (HyperBabel
 * delivers to FCM tokens only; Firebase Messaging maps them to APNs on iOS).
 * Also sets up a foreground handler for incoming messages.
 *
 * The token is released at sign-out by AuthContext.logout()
 * (POST /customer/logout with `push_tokens`).
 */

import { useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import * as pushService from '@/services/pushService';
import { PUSH_TOKEN_CACHE_KEY as TOKEN_CACHE_KEY } from '@/services/pushService';
import { useAuth } from '@/context/AuthContext';
import * as SecureStore from 'expo-secure-store';

export function usePushNotifications() {
  const { user } = useAuth();

  const registerToken = useCallback(async (token: string) => {
    if (!user) return;
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    try {
      await pushService.registerToken(user.userId, token, platform);
      await SecureStore.setItemAsync(TOKEN_CACHE_KEY, token);
    } catch { /* ignore */ }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    let mounted = true;

    async function setupPush() {
      // 1. Request permission
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      if (!enabled || !mounted) return;

      // 2. Get the FCM registration token (iOS included)
      try {
        const token = await messaging().getToken();
        if (token) {
          const cached = await SecureStore.getItemAsync(TOKEN_CACHE_KEY);
          // Only re-register if we haven't or if it changed
          if (cached !== token) {
            await registerToken(token);
          }
        }
      } catch { /* ignore if token fails (e.g., Simulator) */ }
    }

    setupPush();

    // 3. Listen for token refreshes
    const unsubRefresh = messaging().onTokenRefresh((token) => registerToken(token));

    // 4. Foreground message handler
    const unsubMessage = messaging().onMessage(async (remoteMessage) => {
      // Typically shown via local Toast or head-up notification
      const { notification } = remoteMessage;
      if (notification?.title) {
        // e.g., Toast.show({ title: notification.title, body: notification.body })
        console.log('[FCM Foreground]', notification.title, notification.body);
      }
    });

    return () => {
      mounted = false;
      unsubRefresh();
      unsubMessage();
    };
  }, [user, registerToken]);
}

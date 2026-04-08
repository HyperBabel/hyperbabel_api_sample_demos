/**
 * HyperBabel Demo — Root Layout
 *
 * Wraps the entire app with:
 *  - AuthProvider     (user identity + API key)
 *  - CallProvider     (global incoming call state)
 *  - GestureHandlerRootView (required by react-native-gesture-handler)
 *  - StatusBar config (dark, translucent)
 *
 * The IncomingCallOverlay and IncomingCallListener are mounted here so
 * they remain active regardless of which screen the user is on.
 */

import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { Slot } from 'expo-router';
import { StyleSheet } from 'react-native';

import { AuthProvider } from '@/context/AuthContext';
import { CallProvider } from '@/context/CallContext';
import { RealtimeProvider } from '@/context/RealtimeContext';
import { ToastProvider } from '@/components/ui/Toast';
import { IncomingCallListener } from '@/components/IncomingCallListener';
import { IncomingCallOverlay } from '@/components/IncomingCallOverlay';
import { colors } from '@/theme';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <AuthProvider>
        <RealtimeProvider>
          <CallProvider>
            <ToastProvider>
              <StatusBar style="light" backgroundColor={colors.background} translucent />
              {/* Always-active real-time listeners */}
              <IncomingCallListener />
              {/* Global overlays */}
              <IncomingCallOverlay />
              <Slot />
            </ToastProvider>
          </CallProvider>
        </RealtimeProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
});

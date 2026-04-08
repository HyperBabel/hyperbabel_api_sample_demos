/**
 * HyperBabel Demo — Main Tab Navigator Layout
 *
 * Bottom tab navigation for authenticated users.
 * Tabs: Dashboard | Chat | Streams | Settings
 *
 * Auth guard: redirects to login if user is not authenticated.
 */

import { Tabs, router } from 'expo-router';
import { useEffect } from 'react';
import { Text } from 'react-native';

import { useAuth }     from '@/context/AuthContext';
import { usePresence } from '@/hooks/usePresence';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { colors, spacing, borderRadius } from '@/theme';

// ── Simple text icons (no icon library dependency for now) ─────────────────

function TabIcon({ icon, focused }: { icon: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{icon}</Text>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────

export default function MainLayout() {
  const { user, isReady } = useAuth();

  // Start presence heartbeats for the logged-in user
  usePresence();

  // Register push notifications
  usePushNotifications();

  // Auth guard — redirect unauthenticated users to login
  useEffect(() => {
    if (isReady && !user) {
      router.replace('/(auth)/login');
    }
  }, [isReady, user]);

  if (!user) return null;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor:   colors.surface,
          borderTopColor:    colors.border,
          borderTopWidth:    1,
          height:            84,
          paddingBottom:     spacing[5],
          paddingTop:        spacing[2],
        },
        tabBarActiveTintColor:   colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize:   10,
          fontWeight: '600',
          marginTop:  2,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title:    'Home',
          tabBarIcon: ({ focused }) => <TabIcon icon="🏠" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title:    'Chat',
          tabBarIcon: ({ focused }) => <TabIcon icon="💬" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="streams"
        options={{
          title:    'Live',
          tabBarIcon: ({ focused }) => <TabIcon icon="📡" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title:    'Settings',
          tabBarIcon: ({ focused }) => <TabIcon icon="⚙️" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

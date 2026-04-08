/**
 * HyperBabel Demo — Realtime Context
 *
 * Manages the singleton HyperBabel real-time connection lifecycle.
 * Initializes on login, disconnects on logout.
 *
 * Exposes the channel service so any component can subscribe to
 * room messages, typing events, or private call invitations without
 * manually managing the connection.
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import realtimeService, { RealtimeChannelService } from '@/services/realtimeService';
import { useAuth } from './AuthContext';

interface RealtimeContextValue {
  channelService: RealtimeChannelService | null;
  connectionState: string;
  isConnected: boolean;
}

const RealtimeContext = createContext<RealtimeContextValue>({
  channelService:  null,
  connectionState: 'disconnected',
  isConnected:     false,
});

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [channelService, setChannelService]   = useState<RealtimeChannelService | null>(null);
  const [connectionState, setConnectionState] = useState('disconnected');
  const connectingRef = useRef(false);

  useEffect(() => {
    if (!user) {
      // Logout — disconnect and clear service
      realtimeService.disconnect();
      setChannelService(null);
      setConnectionState('disconnected');
      connectingRef.current = false;
      return;
    }

    if (connectingRef.current) return;
    connectingRef.current = true;

    (async () => {
      try {
        setConnectionState('connecting');
        const svc = await realtimeService.init(user.userId, user.userName, user.langCode);
        setChannelService(svc);
        setConnectionState(svc.getState());
      } catch {
        setConnectionState('failed');
      } finally {
        connectingRef.current = false;
      }
    })();
  }, [user]);

  const isConnected = connectionState === 'connected';

  return (
    <RealtimeContext.Provider value={{ channelService, connectionState, isConnected }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime(): RealtimeContextValue {
  return useContext(RealtimeContext);
}

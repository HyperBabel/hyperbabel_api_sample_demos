/**
 * HyperBabel Demo — Video Call Screen
 *
 * Full video call lifecycle using HyperBabel Video RTC:
 *  - usePermissions: request camera + mic before joining
 *  - Join: accepted incoming call, or start a new call. This screen is the
 *    ONLY place a call is started (the chat screen just navigates here).
 *  - Rejoin: detects existing active call and shows rejoin banner
 *  - Remote video tiles, local PiP camera preview
 *  - Controls: mute, camera on/off, flip, in-call chat, end/leave
 *  - In-call chat overlay (InCallChat component)
 *  - Publishes through RtcClient, which applies the shared presets in
 *    services/videoQuality.ts — the pixels sent stay inside the tier the
 *    call declares when it starts
 *  - Keeps the session healthy: reports the media join, sends a heartbeat
 *    once a minute, and renews the one-hour video token before it expires
 *  - Follows call events on the room channel: closes when the call ends; as
 *    the caller, gives up after 45 s without an answer (and, in a 1:1 call,
 *    when the callee declines, misses or is busy); hangs up when the last
 *    remote participant leaves
 *  - Sets CallContext.isInCall for busy guard
 *
 * Route: /video-call/[roomId]
 * Params:
 *   roomId      — United Chat room ID
 *   sessionId   — (optional) the session the incoming invite was for
 *   isIncoming  — '1' if this was an accepted incoming call
 *   targets     — (optional) comma-separated user ids to ring; required by
 *                 the API for group rooms, omitted for 1:1 rooms
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator, Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  // All video-RTC symbols flow through rtcService so the screen body talks
  // about HyperBabel concepts only — the vendor SDK is hidden one layer in.
  RtcClient, RtcSurfaceView, VideoSourceType,
} from '@/services/rtcService';

import { useAuth }                from '@/context/AuthContext';
import { useCall }                from '@/context/CallContext';
import { useRealtime }            from '@/context/RealtimeContext';
import { usePermissions }         from '@/hooks/usePermissions';
import { InCallChat }             from '@/components/video/InCallChat';
import { useToast }               from '@/components/ui/Toast';
import { colors, spacing, textPresets, borderRadius } from '@/theme';
import * as unitedChat            from '@/services/unitedChatService';
import type { VideoCallSession }  from '@/services/unitedChatService';

/** Everything needed to enter the video channel, whichever API supplied it. */
interface CallJoinInfo {
  sessionId:   string;
  channelName: string;
  appId:       string;
  token:       string;
  uid:         number;
}

/** The platform wants a call heartbeat once a minute. */
const HEARTBEAT_INTERVAL_MS = 60_000;

/** The caller gives up if nobody has joined this long after starting the call. */
const RING_TIMEOUT_MS = 45_000;

/** joined-rtc is retried while the server reports the stamp did not land. */
const JOINED_RTC_ATTEMPTS = 5;
const JOINED_RTC_RETRY_MS = 2_000;

/** What the caller of a 1:1 call is told when the callee does not pick up. */
const UNANSWERED_NOTICE = new Map<string, string>([
  ['call_rejected', 'Declined'],
  ['call_missed',   'No answer'],
  ['call_busy',     'Busy'],
]);

/**
 * Build join info from a session (start or active response). Only YOUR OWN
 * participant entry carries a token, so look yourself up by user id.
 */
const joinInfoFromSession = (session: VideoCallSession, userId: string): CallJoinInfo | null => {
  const me = session.participants?.find((p) => p.user_id === userId);
  if (!me?.rtc_token) return null;
  return {
    sessionId:   session.id,
    channelName: session.channel_name,
    appId:       session.app_id ?? '',
    token:       me.rtc_token,
    uid:         me.uid,
  };
};

export default function VideoCallScreen() {
  const { roomId, isIncoming, sessionId, targets } = useLocalSearchParams<{
    roomId:      string;
    isIncoming?: string;
    sessionId?:  string;
    targets?:    string;
  }>();
  const { user }                            = useAuth();
  const { setIsInCall, clearIncomingCall }  = useCall();
  const { channelService }                  = useRealtime();
  const { show: showToast }                 = useToast();
  const { allGranted, checking, request }   = usePermissions();

  const [activeSession, setActiveSession] = useState<VideoCallSession | null>(null);
  const [roomChannel, setRoomChannel] = useState<string | null>(null);
  const [remoteUids,  setRemoteUids]  = useState<number[]>([]);
  const [muted,       setMuted]       = useState(false);
  const [cameraOff,   setCameraOff]   = useState(false);
  const [chatVisible, setChatVisible] = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [permDenied,  setPermDenied]  = useState(false);
  const [hasRejoin,   setHasRejoin]   = useState(false); // existing call detected

  const rtcRef         = useRef<RtcClient | null>(null);
  // The call's session id — every call action (leave / end / heartbeat /
  // token renewal) sends it as `session_id`, and call events are matched on it.
  const sessionIdRef   = useRef<string | null>(null);
  const heartbeatRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const joinedRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set when THIS screen started the call (we are the one ringing others).
  const isCallerRef    = useRef(false);
  const is1to1Ref      = useRef(false);
  // Has any remote participant joined the video channel yet?
  const answeredRef    = useRef(false);
  // Set once the screen starts closing, so every exit path runs only once.
  const exitingRef     = useRef(false);

  // ── 1. Permission gate ──────────────────────────────────────────────────

  useEffect(() => {
    if (checking) return;
    if (allGranted) {
      joinCall();
    } else {
      request().then((granted) => {
        if (!granted) setPermDenied(true);
        else joinCall();
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking]);

  // ── 2. Leaving ──────────────────────────────────────────────────────────

  const stopCallTimers = () => {
    if (heartbeatRef.current)   { clearInterval(heartbeatRef.current);  heartbeatRef.current = null; }
    if (ringTimerRef.current)   { clearTimeout(ringTimerRef.current);   ringTimerRef.current = null; }
    if (joinedRetryRef.current) { clearTimeout(joinedRetryRef.current); joinedRetryRef.current = null; }
  };

  /**
   * Close the call screen — exactly once, whichever path gets here first.
   * `leave` also reports our departure (video-call/leave — not the chat
   * room); skip it when the server has already ended the session.
   */
  const exitCall = async ({ leave = false, notice }: { leave?: boolean; notice?: string } = {}) => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    stopCallTimers();
    const sid = sessionIdRef.current;
    if (leave && user && roomId && sid) {
      // Best effort: once heartbeats stop, the platform reclaims the session.
      await unitedChat.leaveVideoCall(roomId, user.userId, sid).catch(() => {});
    }
    setIsInCall(false);
    clearIncomingCall();
    rtcRef.current?.leave().catch(() => {});
    if (notice) showToast({ title: notice, type: 'info' });
    router.back();
  };

  useEffect(() => {
    exitingRef.current = false;
    return () => {
      // Closing the screen any other way (e.g. a back gesture) still ends our
      // part in the call — and must not leave the app flagged as busy, or
      // every later invite is dropped.
      const sid = sessionIdRef.current;
      if (!exitingRef.current && user && roomId && sid) {
        unitedChat.leaveVideoCall(roomId, user.userId, sid).catch(() => {});
      }
      exitingRef.current = true;
      stopCallTimers();
      rtcRef.current?.leave().catch(() => {});
      rtcRef.current?.release();
      rtcRef.current = null;
      setIsInCall(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** As the caller (1:1 or group): give up if nobody joins in time. */
  const startRingTimeout = () => {
    if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
    ringTimerRef.current = setTimeout(() => {
      ringTimerRef.current = null;
      if (!answeredRef.current) exitCall({ leave: true, notice: 'No answer' });
    }, RING_TIMEOUT_MS);
  };

  // ── 3. Call events on the room channel ──────────────────────────────────

  // Call events (ended / declined / missed / busy) arrive on the room's
  // real-time channel. Its name comes from the room resource.
  useEffect(() => {
    if (!roomId) return;
    unitedChat.getRoom(roomId)
      .then((room) => setRoomChannel(room?.realtime_channel ?? null))
      .catch(() => {});
  }, [roomId]);

  useEffect(() => {
    if (!channelService || !roomChannel) return;
    const unsubscribe = channelService.subscribeToRoom(roomChannel, ({ message, type }) => {
      const evt = unitedChat.callEventFrom(type, message);
      if (!evt || evt.session_id !== sessionIdRef.current) return;
      // Someone answered: give them a fresh 45 s to reach the media channel,
      // so an answer in the last seconds of the ring still connects.
      if (evt.event === 'call_accepted') {
        if (isCallerRef.current && !answeredRef.current && ringTimerRef.current) startRingTimeout();
        return;
      }
      if (evt.event === 'call_ended') {
        // The server has already ended the session — nothing to report.
        exitCall({ notice: 'Call ended' });
        return;
      }
      // 1:1 only — in a group call, one callee declining must not end the
      // call for the others.
      const notice = UNANSWERED_NOTICE.get(evt.event);
      if (notice && isCallerRef.current && is1to1Ref.current && !answeredRef.current) {
        exitCall({ leave: true, notice });
      }
    });
    // Removes only this listener — the chat screen keeps its own
    // subscription to the same channel.
    return () => unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelService, roomChannel]);

  // ── 4. Video channel ────────────────────────────────────────────────────

  /** Report the media join; retried while the server says it did not land. */
  const markJoined = (userId: string, sid: string, attempt = 1) => {
    unitedChat.markJoinedRtc(roomId, userId, sid)
      .then((res) => res.matched)
      .catch(() => false)
      .then((matched) => {
        if (matched || exitingRef.current || attempt >= JOINED_RTC_ATTEMPTS) return;
        joinedRetryRef.current = setTimeout(() => markJoined(userId, sid, attempt + 1), JOINED_RTC_RETRY_MS);
      });
  };

  /** Liveness ping: one right away, then once a minute. Failures never surface. */
  const startHeartbeat = (userId: string, sid: string) => {
    const beat = () => { unitedChat.sendCallHeartbeat(roomId, userId, sid).catch(() => {}); };
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    beat();
    heartbeatRef.current = setInterval(beat, HEARTBEAT_INTERVAL_MS);
  };

  const joinChannel = async (join: CallJoinInfo) => {
    if (!user) return;
    const userId = user.userId;
    sessionIdRef.current = join.sessionId;

    // RtcClient sizes what we publish with the shared presets
    // (services/videoQuality.ts) and re-sizes it on every join and leave, so
    // the call stays inside the tier declared when it started.
    const rtc = new RtcClient();
    rtcRef.current = rtc;
    await rtc.join(
      {
        appId:       join.appId,
        channelName: join.channelName,
        token:       join.token,
        uid:         join.uid,
        role:        'publisher',
      },
      {
        onJoined: () => {
          if (exitingRef.current) return;
          console.log('[RTC] Joined');
          markJoined(userId, join.sessionId);
          startHeartbeat(userId, join.sessionId);
        },
        onUserJoined: (uid) => {
          answeredRef.current = true;
          setRemoteUids((prev) => [...new Set([...prev, uid])]);
        },
        onUserLeft: (uid) => {
          setRemoteUids((prev) => prev.filter((u) => u !== uid));
          // Hang up only when NOBODY is left — a group call goes on when one
          // of two peers leaves. RtcClient drops the leaver from its roster
          // before calling this, so the count is already final here.
          if (rtc.remoteCount === 0) exitCall({ leave: true, notice: 'Call ended' });
        },
        // Call tokens last one hour — fetch a fresh one for our own slot.
        onTokenWillExpire: () => {
          unitedChat.renewVideoCallToken(roomId, userId, join.sessionId)
            .then((fresh) => rtc.renewToken(fresh.rtc_token))
            .catch((err) => console.warn('[RTC] token renewal failed', err));
        },
      },
    );
  };

  // ── 5. Join call ────────────────────────────────────────────────────────

  const checkExistingCall = async (): Promise<VideoCallSession | null> => {
    try {
      // `{ active: false, session: null }` when nothing is running.
      const res = await unitedChat.getActiveVideoCall(roomId);
      return res.active ? res.session : null;
    } catch {
      return null;
    }
  };

  const joinCall = async () => {
    if (!user) return;
    setLoading(true);

    try {
      let join: CallJoinInfo | null = null;

      if (isIncoming === '1') {
        // Match call events to the accepted invite right away, so a hang-up
        // that lands while we are still joining is not missed.
        if (sessionId) sessionIdRef.current = sessionId;
        // The overlay already accepted the invite. Accept does not return a
        // token, so read our own slot from the active session.
        const { session } = await unitedChat.getActiveVideoCall(roomId);
        join = session && (!sessionId || session.id === sessionId)
          ? joinInfoFromSession(session, user.userId)
          : null;
        if (!join) {
          Alert.alert('Call ended', 'This call is no longer active.');
          exitCall();
          return;
        }
      } else {
        // A call already running in this room → offer to rejoin it instead
        // of starting a second one.
        const existing = await checkExistingCall();
        if (existing) {
          setActiveSession(existing);
          setHasRejoin(true);
          return;
        }
        // Start the call. Group rooms must name who to ring; 1:1 rooms ring
        // the other member automatically.
        const targetIds = (targets ?? '').split(',').filter(Boolean);
        const res = await unitedChat.startVideoCall(roomId, user.userId, targetIds);
        if (res.quality_warning) console.warn('[call] quality_warning:', res.quality_warning);
        join = {
          sessionId:   res.session.id,
          channelName: res.session.channel_name,
          appId:       res.session.app_id ?? '',
          token:       res.caller.rtc_token ?? '',
          uid:         res.caller.uid,
        };
        // We are ringing people now: match call events to this session
        // from here on, and stop ringing if nobody joins in time.
        sessionIdRef.current = res.session.id;
        isCallerRef.current  = true;
        is1to1Ref.current    = res.session.call_type === '1to1';
        startRingTimeout();
      }

      setIsInCall(true);
      await joinChannel(join);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to join call.');
      // Also leaves the session if it was created but joining it failed.
      exitCall({ leave: true });
    } finally {
      setLoading(false);
    }
  };

  const rejoinCall = async () => {
    if (!activeSession || !user) return;
    const me = activeSession.participants?.find((p) => p.user_id === user.userId);
    if (!me) {
      Alert.alert('Cannot join', 'You are not a participant in this call.');
      router.back();
      return;
    }
    setHasRejoin(false);
    setLoading(true);
    sessionIdRef.current = activeSession.id;
    try {
      // Someone who left (or never answered) is not 'active' on the server.
      // Accepting again puts them back in the session.
      if (me.status !== 'active') {
        await unitedChat.acceptVideoCall(roomId, user.userId, activeSession.id);
      }
      // The original token may be past its one-hour lifetime — get a fresh one.
      const fresh = await unitedChat.renewVideoCallToken(roomId, user.userId, activeSession.id);
      setIsInCall(true);
      await joinChannel({
        sessionId:   fresh.session_id,
        channelName: fresh.channel_name,
        appId:       fresh.app_id,
        token:       fresh.rtc_token,
        uid:         fresh.uid,
      });
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to rejoin call.');
      exitCall({ leave: true });
    } finally {
      setLoading(false);
    }
  };

  // ── 6. Controls ─────────────────────────────────────────────────────────

  const toggleMute = () => {
    rtcRef.current?.muteAudio(!muted);
    setMuted((v) => !v);
  };

  const toggleCamera = () => {
    rtcRef.current?.muteVideo(!cameraOff);
    setCameraOff((v) => !v);
  };

  const flipCamera = () => rtcRef.current?.flipCamera();

  const handleLeave = () => exitCall({ leave: true });

  const handleEnd = () => {
    Alert.alert('End Call', 'End the call for everyone?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End for All', style: 'destructive', onPress: async () => {
        const sid = sessionIdRef.current;
        let ended = false;
        try {
          if (user && roomId && sid) {
            await unitedChat.endVideoCall(roomId, user.userId, sid);
            ended = true;
          }
        } catch {
          // Only the caller or a room owner / sub_admin may end a call for
          // everyone (403 otherwise) — leave instead, so the session does not
          // keep counting this user as present.
        }
        exitCall({ leave: !ended });
      }},
      { text: 'Leave Only', onPress: handleLeave },
    ]);
  };

  // ── 7. Render ───────────────────────────────────────────────────────────

  if (permDenied) {
    return (
      <View style={[styles.fullscreen, styles.centered]}>
        <Text style={styles.permIcon}>🎥</Text>
        <Text style={styles.permTitle}>Camera & Mic Required</Text>
        <Text style={styles.permSub}>Please enable permissions in Settings</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading || checking) {
    return (
      <View style={[styles.fullscreen, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.connectText}>Connecting…</Text>
      </View>
    );
  }

  // Rejoin banner state
  if (hasRejoin && activeSession) {
    return (
      <View style={[styles.fullscreen, styles.centered]}>
        <Text style={styles.rejoinIcon}>📹</Text>
        <Text style={styles.rejoinTitle}>Call In Progress</Text>
        <Text style={styles.rejoinSub}>
          {activeSession.participants?.filter((p) => p.status === 'active').length ?? 0} participant(s) in the call
        </Text>
        <TouchableOpacity style={styles.rejoinBtn} onPress={rejoinCall}>
          <Text style={styles.rejoinBtnText}>Rejoin Call</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.ignoreBtn} onPress={() => router.back()}>
          <Text style={styles.ignoreBtnText}>Ignore</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.fullscreen}>
      {/* Remote video(s) */}
      {remoteUids.length > 0 ? (
        <View style={styles.remoteWrap}>
          {remoteUids.map((uid) => (
            <RtcSurfaceView
              key={uid}
              style={styles.remoteVideo}
              canvas={{ uid, sourceType: VideoSourceType.VideoSourceRemote }}
            />
          ))}
        </View>
      ) : (
        <View style={[styles.remoteWrap, styles.waitWrap]}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.waitText}>Waiting for others…</Text>
        </View>
      )}

      {/* Local camera PiP */}
      {!cameraOff && (
        <View style={styles.pipWrap}>
          <RtcSurfaceView
            style={styles.pipVideo}
            canvas={{ uid: 0, sourceType: VideoSourceType.VideoSourceCamera }}
          />
        </View>
      )}

      {/* Participant count */}
      <SafeAreaView style={styles.topBar}>
        <View style={styles.participantBadge}>
          <Text style={styles.participantText}>👥 {remoteUids.length + 1}</Text>
        </View>
      </SafeAreaView>

      {/* Controls */}
      <SafeAreaView style={styles.controlsBar}>
        <ControlBtn icon={muted ? '🔇' : '🎙'} label={muted ? 'Unmute' : 'Mute'} onPress={toggleMute} />
        <ControlBtn icon={cameraOff ? '📵' : '📹'} label={cameraOff ? 'Cam On' : 'Cam Off'} onPress={toggleCamera} />
        <ControlBtn icon="🔄" label="Flip" onPress={flipCamera} />
        <ControlBtn icon="💬" label="Chat" onPress={() => setChatVisible((v) => !v)} active={chatVisible} />
        <ControlBtn icon="✕" label="End" onPress={handleEnd} danger />
      </SafeAreaView>

      {/* In-call chat overlay */}
      {roomId && (
        <InCallChat
          roomId={roomId}
          visible={chatVisible}
          onClose={() => setChatVisible(false)}
        />
      )}
    </View>
  );
}

// ── Control button ──────────────────────────────────────────────────────────

function ControlBtn({
  icon, label, onPress, danger, active
}: {
  icon: string; label: string; onPress: () => void; danger?: boolean; active?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.ctrlBtn} onPress={onPress} activeOpacity={0.75}>
      <View style={[
        styles.ctrlBtnInner,
        danger  && styles.ctrlBtnDanger,
        active  && styles.ctrlBtnActive,
      ]}>
        <Text style={styles.ctrlBtnIcon}>{icon}</Text>
      </View>
      <Text style={styles.ctrlBtnLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  fullscreen:      { flex: 1, backgroundColor: '#000' },
  centered:        { alignItems: 'center', justifyContent: 'center' },

  connectText:     { ...textPresets.body, color: colors.textSecondary, marginTop: spacing[4] },

  remoteWrap:      { flex: 1 },
  remoteVideo:     { flex: 1 },
  waitWrap:        { alignItems: 'center', justifyContent: 'center', gap: spacing[4] },
  waitText:        { ...textPresets.h4, color: colors.textSecondary },

  pipWrap:         { position: 'absolute', top: 80, right: spacing[4], width: 90, height: 130, borderRadius: borderRadius.lg, overflow: 'hidden', borderWidth: 2, borderColor: colors.primary },
  pipVideo:        { flex: 1 },

  topBar:          { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: spacing[5] },
  participantBadge:{ alignSelf: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderRadius: borderRadius.full, marginTop: spacing[3] },
  participantText: { ...textPresets.caption, color: colors.white, fontWeight: '700' },

  controlsBar:     { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', paddingVertical: spacing[5], backgroundColor: 'rgba(0,0,0,0.72)' },
  ctrlBtn:         { alignItems: 'center', gap: spacing[2] },
  ctrlBtnInner:    { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  ctrlBtnDanger:   { backgroundColor: colors.error },
  ctrlBtnActive:   { backgroundColor: colors.primary },
  ctrlBtnIcon:     { fontSize: 24 },
  ctrlBtnLabel:    { ...textPresets.caption, color: colors.white, fontSize: 11 },

  // Permission denied
  permIcon:        { fontSize: 52, marginBottom: spacing[4] },
  permTitle:       { ...textPresets.h4, color: colors.white, marginBottom: spacing[2] },
  permSub:         { ...textPresets.body, color: colors.textSecondary, marginBottom: spacing[8], textAlign: 'center', paddingHorizontal: spacing[8] },
  backBtn:         { backgroundColor: colors.primary, paddingHorizontal: spacing[8], paddingVertical: spacing[4], borderRadius: borderRadius.xl },
  backBtnText:     { ...textPresets.label, color: colors.white, fontWeight: '700' },

  // Rejoin
  rejoinIcon:      { fontSize: 52, marginBottom: spacing[4] },
  rejoinTitle:     { ...textPresets.h3, color: colors.white, marginBottom: spacing[2] },
  rejoinSub:       { ...textPresets.body, color: colors.textSecondary, marginBottom: spacing[8] },
  rejoinBtn:       { backgroundColor: colors.callAccept, paddingHorizontal: spacing[10], paddingVertical: spacing[4], borderRadius: borderRadius.xl, marginBottom: spacing[4] },
  rejoinBtnText:   { ...textPresets.label, color: colors.white, fontWeight: '700', fontSize: 18 },
  ignoreBtn:       { paddingVertical: spacing[3] },
  ignoreBtnText:   { ...textPresets.label, color: colors.textMuted },
});

/**
 * HyperBabel React Demo — Incoming Call Overlay
 *
 * Renders a premium glassmorphism overlay popup when another user initiates
 * a video call. Reads `incomingCall` from CallContext — mounts only when non-null.
 *
 * Architecture:
 *   App.jsx → <CallProvider> → <IncomingCallListener> (subscribes to private channel)
 *                            → <IncomingCallOverlay>  (this component — root level UI)
 *
 * User actions:
 *  ✅ Accept  — calls acceptVideoCall() API → navigate to VideoCallPage
 *  ❌ Reject  — calls rejectVideoCall() API → dismiss popup
 *
 * Auto-dismiss: If no action is taken within RING_TIMEOUT_MS (30s),
 * the call is rejected automatically (treated as missed call).
 *
 * Ringtone: Synthesised via Web Audio API (no external audio file required).
 * Stops immediately when the user accepts, rejects, or the timeout expires.
 *
 * CSS classes used from index.css: .hb-call-overlay-*, .animate-scale-in
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCall } from '../context/CallContext';
import * as unitedChat from '../services/unitedChatService';
import { startRingtone, stopRingtone } from '../utils/ringtone';

const RING_TIMEOUT_MS = 30_000; // Auto-reject after 30 s

export default function IncomingCallOverlay() {
  const navigate = useNavigate();
  const { incomingCall, setIncomingCall } = useCall();
  const [countdown, setCountdown] = useState(30);
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const timerRef     = useRef(null);
  const countdownRef = useRef(null);

  // ── Start ring timer and ringtone when a new incoming call arrives ───────
  useEffect(() => {
    if (!incomingCall) {
      clearTimeout(timerRef.current);
      clearInterval(countdownRef.current);
      setCountdown(30);
      stopRingtone();
      return;
    }

    setCountdown(30);
    setAccepting(false);
    setRejecting(false);

    // Start synthesised ringtone
    startRingtone();

    // Auto-reject after RING_TIMEOUT_MS
    timerRef.current = setTimeout(() => {
      handleReject(true /* isMissed */);
    }, RING_TIMEOUT_MS);

    // Countdown display ticker
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => {
      clearTimeout(timerRef.current);
      clearInterval(countdownRef.current);
      stopRingtone();
    };
  }, [incomingCall?.roomId]); // re-run only when a different call arrives

  if (!incomingCall) return null;

  // ── Accept ────────────────────────────────────────────────────────────────
  const handleAccept = async () => {
    if (accepting || rejecting) return;
    setAccepting(true);

    clearTimeout(timerRef.current);
    clearInterval(countdownRef.current);
    stopRingtone();

    try {
      const user = JSON.parse(localStorage.getItem('hb_user') || '{}');
      await unitedChat.acceptVideoCall(incomingCall.roomId, user.user_id);
    } catch (err) {
      console.warn('[IncomingCallOverlay] acceptVideoCall API failed (non-critical):', err.message);
    }

    setIncomingCall(null);

    // Navigate to video call — VideoCallPage.useEffect will set isInCall=true
    navigate(`/video-call/${incomingCall.roomId}`, {
      state: {
        roomType: incomingCall.callType || '1to1',
        roomName: incomingCall.callerName || 'Video Call',
        rejoin:   false,
        // Session data forwarded from IncomingCallListener → VideoCallPage establishes RTC connection
        session: incomingCall.channelName
          ? { id: incomingCall.sessionId, channel_name: incomingCall.channelName }
          : null,
        rtcToken: incomingCall.rtcToken || undefined,
        uid:      incomingCall.uid      || undefined,
      },
    });
  };

  // ── Reject ────────────────────────────────────────────────────────────────
  const handleReject = async (isMissed = false) => {
    if (accepting) return; // Don't reject right after accepting
    setRejecting(true);

    clearTimeout(timerRef.current);
    clearInterval(countdownRef.current);
    stopRingtone();

    try {
      const user = JSON.parse(localStorage.getItem('hb_user') || '{}');
      await unitedChat.rejectVideoCall(incomingCall.roomId, user.user_id);
    } catch (err) {
      console.warn('[IncomingCallOverlay] rejectVideoCall API failed (non-critical):', err.message);
    }

    setIncomingCall(null);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const callTypeLabel = incomingCall.callType === 'group' ? 'Group Video Call' : '1:1 Video Call';
  const callerInitial = (incomingCall.callerName || incomingCall.callerId || '?')[0].toUpperCase();

  // Countdown ring segment as SVG (progress from 30→0)
  const radius  = 52;
  const circumference = 2 * Math.PI * radius;
  const progress = (countdown / 30) * circumference;

  return (
    <>
      {/* ── Dark glassmorphism backdrop ── */}
      <div className="hb-call-backdrop" />

      {/* ── Popup card ── */}
      <div
        className="hb-call-card"
        role="dialog"
        aria-modal="true"
        aria-label={`Incoming call from ${incomingCall.callerName || incomingCall.callerId}`}
      >
        {/* Gradient glow behind the card */}
        <div className="hb-call-glow" />

        {/* Call type pill */}
        <div className="hb-call-type-pill">
          {incomingCall.callType === 'group' ? '👥' : '📹'} {callTypeLabel}
        </div>

        {/* Avatar with countdown ring */}
        <div className="hb-call-avatar-wrap">
          {/* SVG countdown ring */}
          <svg className="hb-call-countdown-ring" viewBox="0 0 120 120">
            {/* Background ring */}
            <circle cx="60" cy="60" r={radius} className="hb-call-ring-bg" />
            {/* Animated progress ring */}
            <circle
              cx="60" cy="60" r={radius}
              className="hb-call-ring-progress"
              strokeDasharray={`${progress} ${circumference}`}
              transform="rotate(-90 60 60)"
            />
          </svg>

          {/* Avatar inner */}
          <div className="hb-call-avatar">
            {incomingCall.callerAvatar
              ? <img src={incomingCall.callerAvatar} alt="" className="hb-call-avatar-img" />
              : <span className="hb-call-avatar-initial">{callerInitial}</span>
            }
          </div>

          {/* Pulsing ring animation */}
          <div className="hb-call-pulse-ring" />
        </div>

        {/* Caller info */}
        <div className="hb-call-caller-name">
          {incomingCall.callerName || incomingCall.callerId}
        </div>
        <div className="hb-call-subtitle">Incoming call</div>

        {/* Countdown text */}
        <div className="hb-call-countdown">
          Auto-reject in <strong>{countdown}s</strong>
        </div>

        {/* Action buttons */}
        <div className="hb-call-actions">
          <button
            className={`hb-call-btn hb-call-btn-reject ${rejecting ? 'loading' : ''}`}
            onClick={() => handleReject(false)}
            disabled={accepting || rejecting}
            title="Reject call"
            aria-label="Reject incoming call"
          >
            <span className="hb-call-btn-icon">📵</span>
            <span className="hb-call-btn-label">{rejecting ? '…' : 'Decline'}</span>
          </button>

          <button
            className={`hb-call-btn hb-call-btn-accept ${accepting ? 'loading' : ''}`}
            onClick={handleAccept}
            disabled={accepting || rejecting}
            title="Accept call"
            aria-label="Accept incoming call"
          >
            <span className="hb-call-btn-icon">📞</span>
            <span className="hb-call-btn-label">{accepting ? '…' : 'Accept'}</span>
          </button>
        </div>
      </div>
    </>
  );
}

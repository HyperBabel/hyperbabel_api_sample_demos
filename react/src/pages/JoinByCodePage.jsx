/**
 * HyperBabel React Demo — Join an open room from an invite link
 *
 * Route: /join?code=<invite_code>
 *
 * The open-room member panel (ChatHubPage) copies links of this shape. This
 * page redeems the code with POST /unitedchat/rooms/join-by-code
 * `{ invite_code, user_id, display_name }` — no room id needed — and opens
 * the room it answers with (`room_id`). Joining a room you are already in is
 * fine. Errors: 404 = unknown code, 403 `banned` / `room_full`.
 *
 * Not signed in yet? It sends you to the login page first, which brings you
 * back here afterwards.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Header from '../components/Header';
import * as unitedChat from '../services/unitedChatService';

export default function JoinByCodePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isReady } = useAuth();
  const code = (searchParams.get('code') || '').trim();
  const [error, setError] = useState('');
  // Redeem once per code (StrictMode runs effects twice in development).
  const redeemedRef = useRef(null);

  useEffect(() => {
    if (!isReady) return;
    if (!user?.user_id) {
      navigate('/login', { replace: true, state: { from: `/join?code=${encodeURIComponent(code)}` } });
      return;
    }
    if (!code) { setError('This invite link has no code.'); return; }
    if (redeemedRef.current === code) return;
    redeemedRef.current = code;

    unitedChat
      .joinByCode(code, user.user_id, user.display_name || user.user_id)
      .then((res) => {
        if (res?.room_id) navigate(`/chat/${res.room_id}`, { replace: true });
        else setError('The server did not return a room for this code.');
      })
      .catch((err) => {
        setError(err.status === 404 ? 'This invite code is not valid (or the room is gone).' : err.message);
      });
  }, [isReady, user?.user_id, user?.display_name, code, navigate]);

  return (
    <>
      <Header />
      <div className="page-container">
        <div className="glass-card" style={{ padding: '24px', maxWidth: '420px', margin: '40px auto', textAlign: 'center' }}>
          {error ? (
            <>
              <div style={{ fontWeight: 700, marginBottom: '8px' }}>Could not join the room</div>
              <div className="text-muted" style={{ marginBottom: '16px' }}>{error}</div>
              <Link to="/chat" className="btn btn-secondary">Go to Chat</Link>
            </>
          ) : (
            <div className="text-muted">Joining the room…</div>
          )}
        </div>
      </div>
    </>
  );
}

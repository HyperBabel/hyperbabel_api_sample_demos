/**
 * HyperBabel JavaScript Demo — app shell + hash router.
 *
 * Routes:
 *   #/login                    — sign in (Firebase Email/Password + Anonymous)
 *   #/signup                   — sign up (Firebase createUserWithEmailAndPassword)
 *   #/home                     — room list
 *   #/chat/:roomId             — chat in a room (text + real-time push)
 *   #/video/:roomId            — 1:1 video call
 *   #/streams                  — live stream list
 *   #/stream/host              — host a new live stream
 *   #/stream/viewer/:sessionId — watch a live stream
 *   #/settings                 — usage / push tokens / playground / logout
 *   #/blocks                   — block list management
 *
 * Real-time call invites land via a global IncomingCall listener — see
 * `incomingCall.js`.
 */

import { renderLogin       } from './pages/login.js';
import { renderSignup      } from './pages/signup.js';
import { renderHome        } from './pages/home.js';
import { renderChat        } from './pages/chat.js';
import { renderVideoCall   } from './pages/videoCall.js';
import { renderStreams     } from './pages/streams.js';
import { renderStreamHost  } from './pages/streamHost.js';
import { renderStreamViewer} from './pages/streamViewer.js';
import { renderSettings    } from './pages/settings.js';
import { renderBlocks      } from './pages/blocks.js';
import { ensureIncomingCallListener } from './incomingCall.js';

const navigate = (hash) => {
  if (window.location.hash === hash) {
    handleRoute();
  } else {
    window.location.hash = hash;
  }
};

function handleRoute() {
  const hash = window.location.hash || '#/login';
  const user = JSON.parse(localStorage.getItem('hb_user') || '{}');

  // Highlight nav.
  const nav = document.getElementById('nav');
  if (nav) {
    nav.innerHTML = user.user_id
      ? `<a href="#/home" class="${hash.startsWith('#/home') ? 'active' : ''}">Rooms</a>
         <a href="#/streams" class="${hash.startsWith('#/streams') || hash.startsWith('#/stream') ? 'active' : ''}">Streams</a>
         <a href="#/settings" class="${hash.startsWith('#/settings') ? 'active' : ''}">Settings</a>`
      : '';
  }

  // After login we want the call listener active everywhere.
  if (user.user_id) ensureIncomingCallListener(navigate);

  if (hash.startsWith('#/login'))                    return renderLogin(navigate);
  if (hash.startsWith('#/signup'))                   return renderSignup(navigate);
  if (hash.startsWith('#/home'))                     return renderHome(navigate);
  if (hash.startsWith('#/chat/'))                    return renderChat(decodeURIComponent(hash.slice('#/chat/'.length)), navigate);
  if (hash.startsWith('#/video/'))                   return renderVideoCall(decodeURIComponent(hash.slice('#/video/'.length)), navigate);
  if (hash.startsWith('#/stream/host'))              return renderStreamHost(navigate);
  if (hash.startsWith('#/stream/viewer/'))           return renderStreamViewer(decodeURIComponent(hash.slice('#/stream/viewer/'.length)), navigate);
  if (hash.startsWith('#/streams'))                  return renderStreams(navigate);
  if (hash.startsWith('#/settings'))                 return renderSettings(navigate);
  if (hash.startsWith('#/blocks'))                   return renderBlocks(navigate);

  navigate(user.user_id ? '#/home' : '#/login');
}

window.addEventListener('hashchange', handleRoute);
window.addEventListener('DOMContentLoaded', handleRoute);

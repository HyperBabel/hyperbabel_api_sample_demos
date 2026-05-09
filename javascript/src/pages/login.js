/**
 * Login page — captures the user's identity for this demo session.
 *
 * The HyperBabel Console is the source of truth for production accounts;
 * this screen is a simulator that simply seeds local storage so the rest of
 * the demo has someone to talk to. After sign-in we also auto-register a
 * synthetic web push token so the platform's notification surface lights up
 * end-to-end.
 */

import * as push from '../api/push.js';

export function renderLogin(navigate) {
  const main = document.getElementById('app');
  main.innerHTML = `
    <div class="card" style="max-width: 420px; margin: 32px auto;">
      <h2>Sign in to the demo</h2>
      <p class="muted">Enter a user identity for this demo session. In production
        these fields come from your own auth flow.</p>

      <label for="user_id">User ID</label>
      <input id="user_id" placeholder="e.g. developer-001" autofocus />

      <label for="display_name">Display Name</label>
      <input id="display_name" placeholder="Alice" />

      <label for="preferred_lang_cd">Preferred Language</label>
      <select id="preferred_lang_cd">
        <option value="en">English</option>
        <option value="ko">한국어 (Korean)</option>
        <option value="ja">日本語 (Japanese)</option>
        <option value="zh">中文 (Chinese)</option>
        <option value="es">Español (Spanish)</option>
        <option value="fr">Français (French)</option>
        <option value="de">Deutsch (German)</option>
      </select>

      <label for="api_key">API Key (optional override)</label>
      <input id="api_key" placeholder="hb_live_… (defaults to VITE_HB_API_KEY)" />

      <button id="signin">Sign in →</button>
      <div id="login-error" class="error"></div>
    </div>
  `;

  document.getElementById('signin').onclick = () => {
    const userId = document.getElementById('user_id').value.trim();
    const displayName = document.getElementById('display_name').value.trim() || userId;
    const lang = document.getElementById('preferred_lang_cd').value;
    const apiKey = document.getElementById('api_key').value.trim();
    if (!userId) {
      document.getElementById('login-error').textContent = 'User ID is required.';
      return;
    }
    localStorage.setItem('hb_user', JSON.stringify({
      user_id: userId,
      display_name: displayName,
      preferred_lang_cd: lang,
    }));
    if (apiKey) localStorage.setItem('hb_api_key', apiKey);

    // Auto-register a synthetic web push token. Production apps swap this
    // for the real ServiceWorker push subscription endpoint.
    autoRegisterPushToken(userId).catch(() => {});

    navigate('#/home');
  };
}

async function autoRegisterPushToken(userId) {
  let token = localStorage.getItem('hb_push_token');
  if (!token) {
    token = `demo-web-${Date.now()}`;
    localStorage.setItem('hb_push_token', token);
  }
  await push.registerToken(userId, token, 'web');
}

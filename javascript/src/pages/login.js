/**
 * Login page — Customer Auth pattern B1 (Firebase Direct Exchange).
 *
 *   1. The user signs in with Firebase Auth (Email/Password by default;
 *      a one-tap "Anonymous" button is exposed for kiosk-style use).
 *   2. We exchange the resulting Firebase ID token for a HyperBabel
 *      customer JWT via POST /customer/auth/firebase-exchange.
 *   3. The JWT pair is persisted to localStorage by `persistSession()`
 *      and attached to every subsequent API request by `api/client.js`.
 *
 * If VITE_FIREBASE_* env vars are missing the page renders a setup-help
 * banner instead of the form. See README → Quickstart.
 */

import * as push from '../api/push.js';
import {
  isFirebaseConfigured,
  signInWithEmailAndExchange,
  signInAnonymouslyAndExchange,
  persistSession,
} from '../api/firebaseAuth.js';

export function renderLogin(navigate) {
  const main = document.getElementById('app');
  const firebaseReady = isFirebaseConfigured();

  if (!firebaseReady) {
    main.innerHTML = `
      <div class="card" style="max-width: 480px; margin: 32px auto;">
        <h2>Sign in to the demo</h2>
        <div class="warning-banner" style="background: rgba(245,158,11,0.10); border: 1px solid #f59e0b; border-radius: 12px; padding: 16px; margin-top: 16px;">
          <strong style="color: #fcd34d; display: block; margin-bottom: 6px;">Firebase config missing</strong>
          <div style="color: #fde68a; font-size: 0.9em; line-height: 1.5;">
            Populate <code>VITE_FIREBASE_*</code> in your <code>.env.local</code>
            and allow-list your Firebase project in HyperBabel Console
            → Customer Auth. See the README for the full Quickstart.
          </div>
        </div>
      </div>
    `;
    return;
  }

  main.innerHTML = `
    <div class="card" style="max-width: 480px; margin: 32px auto;">
      <h2>Sign in to the demo</h2>
      <p class="muted">
        Sign in with Firebase. We exchange the ID token for a
        short-lived HyperBabel customer JWT — your org API key never
        ships in this app.
      </p>

      <label for="email">Email</label>
      <input id="email" type="email" autocomplete="email" placeholder="you@example.com" autofocus />

      <label for="password">Password</label>
      <input id="password" type="password" autocomplete="current-password" placeholder="••••••••" />

      <label for="display_name">Display Name (optional)</label>
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

      <button id="signin" style="margin-top: 12px;">Sign in →</button>

      <div style="display: flex; align-items: center; gap: 12px; margin: 24px 0 16px;">
        <div style="flex: 1; height: 1px; background: rgba(255,255,255,0.10);"></div>
        <span style="font-size: 0.75em; color: rgba(255,255,255,0.5);">or</span>
        <div style="flex: 1; height: 1px; background: rgba(255,255,255,0.10);"></div>
      </div>

      <button id="signin-anon" class="secondary" style="width: 100%;">
        Continue anonymously (kiosk mode)
      </button>

      <p style="text-align: center; margin-top: 20px; font-size: 0.85em;">
        New here? <a href="#/signup">Create an account</a>
      </p>

      <div id="login-error" class="error"></div>
    </div>
  `;

  const errorEl = document.getElementById('login-error');
  const signinBtn = document.getElementById('signin');
  const anonBtn   = document.getElementById('signin-anon');

  const showError = (msg) => { errorEl.textContent = msg; };
  const clearError = () => { errorEl.textContent = ''; };
  const setLoading = (busy) => {
    signinBtn.disabled = busy;
    anonBtn.disabled   = busy;
    signinBtn.textContent = busy ? 'Signing in…' : 'Sign in →';
  };

  const langSelect = document.getElementById('preferred_lang_cd');
  const displayInp = document.getElementById('display_name');

  signinBtn.onclick = async () => {
    clearError();
    const email = document.getElementById('email').value.trim();
    const pass  = document.getElementById('password').value;
    if (!email || !pass) {
      showError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const exchange = await signInWithEmailAndExchange(email, pass, langSelect.value);
      await finishSignIn(exchange, displayInp.value, langSelect.value, navigate);
    } catch (err) {
      showError(err?.message || 'Sign-in failed.');
      setLoading(false);
    }
  };

  anonBtn.onclick = async () => {
    clearError();
    setLoading(true);
    try {
      const exchange = await signInAnonymouslyAndExchange(langSelect.value);
      await finishSignIn(exchange, displayInp.value, langSelect.value, navigate);
    } catch (err) {
      showError(err?.message || 'Anonymous sign-in failed.');
      setLoading(false);
    }
  };
}

async function finishSignIn(exchange, displayName, langCode, navigate) {
  persistSession(exchange, displayName, langCode);
  // Best-effort web-push token registration. Failures don't block sign-in
  // and don't surface to the user — the demo continues without push if
  // FCM isn't configured.
  autoRegisterPushToken(exchange.external_user_id).catch(() => {});
  navigate('#/home');
}

async function autoRegisterPushToken(userId) {
  let token = localStorage.getItem('hb_push_token');
  if (!token) {
    // Synthetic placeholder. Production apps swap this for the real
    // ServiceWorker push subscription endpoint.
    token = `demo-web-${Date.now()}`;
    localStorage.setItem('hb_push_token', token);
  }
  await push.registerToken(userId, token, 'web');
}

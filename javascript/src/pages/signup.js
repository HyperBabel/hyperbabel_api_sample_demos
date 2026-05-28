/**
 * Sign-up page — Customer Auth pattern B1.
 *
 * Creates a new Firebase user with email + password, then exchanges the
 * resulting ID token for a HyperBabel customer JWT. The matching
 * `com_users` row is created server-side on first exchange, so no extra
 * "create user" call is needed.
 */

import {
  isFirebaseConfigured,
  signUpWithEmailAndExchange,
  persistSession,
} from '../api/firebaseAuth.js';

const isValidEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export function renderSignup(navigate) {
  const main = document.getElementById('app');
  const firebaseReady = isFirebaseConfigured();

  if (!firebaseReady) {
    main.innerHTML = `
      <div class="card" style="max-width: 480px; margin: 32px auto;">
        <h2>Create your account</h2>
        <div class="warning-banner" style="background: rgba(245,158,11,0.10); border: 1px solid #f59e0b; border-radius: 12px; padding: 16px; margin-top: 16px;">
          <strong style="color: #fcd34d; display: block; margin-bottom: 6px;">Firebase config missing</strong>
          <div style="color: #fde68a; font-size: 0.9em; line-height: 1.5;">
            Populate <code>VITE_FIREBASE_*</code> in your <code>.env.local</code>
            and allow-list your Firebase project in HyperBabel Console
            → Customer Auth. See the README for the full Quickstart.
          </div>
        </div>
        <p style="text-align: center; margin-top: 20px; font-size: 0.85em;">
          <a href="#/login">← Back to sign in</a>
        </p>
      </div>
    `;
    return;
  }

  main.innerHTML = `
    <div class="card" style="max-width: 480px; margin: 32px auto;">
      <h2>Create your account</h2>
      <p class="muted">
        We use Firebase Auth in the browser, then exchange the ID
        token for a short-lived HyperBabel customer JWT.
      </p>

      <label for="email">Email</label>
      <input id="email" type="email" autocomplete="email" placeholder="you@example.com" autofocus />

      <label for="password">Password (at least 6 chars)</label>
      <input id="password" type="password" autocomplete="new-password" placeholder="••••••••" />

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

      <button id="signup" style="margin-top: 12px;">Create account</button>

      <p style="text-align: center; margin-top: 20px; font-size: 0.85em;">
        Already have an account? <a href="#/login">Sign in</a>
      </p>

      <div id="signup-error" class="error"></div>
    </div>
  `;

  const errorEl = document.getElementById('signup-error');
  const btn     = document.getElementById('signup');

  btn.onclick = async () => {
    errorEl.textContent = '';
    const email = document.getElementById('email').value.trim();
    const pass  = document.getElementById('password').value;
    if (!isValidEmail(email)) {
      errorEl.textContent = 'Please enter a valid email address.';
      return;
    }
    if (pass.length < 6) {
      errorEl.textContent = 'Password must be at least 6 characters (Firebase minimum).';
      return;
    }
    btn.disabled   = true;
    btn.textContent = 'Creating account…';
    try {
      const lang     = document.getElementById('preferred_lang_cd').value;
      const display  = document.getElementById('display_name').value;
      const exchange = await signUpWithEmailAndExchange(email, pass, lang);
      persistSession(exchange, display, lang);
      navigate('#/home');
    } catch (err) {
      errorEl.textContent = err?.message || 'Sign-up failed.';
      btn.disabled    = false;
      btn.textContent = 'Create account';
    }
  };
}

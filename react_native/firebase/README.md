# Firebase Native Config

This folder holds the two Firebase config files that ship with every Firebase
project. They are **developer-supplied secrets** — git ignores them so the
demo repo stays clean and your private project IDs never leak.

```
firebase/
├── README.md                       ← this file
├── .gitkeep                        ← keeps the folder in git
├── google-services.json            ← drop here (Android, gitignored)
└── GoogleService-Info.plist        ← drop here (iOS, gitignored)
```

## How to populate this folder

1. **Create or open** your Firebase project at
   <https://console.firebase.google.com/>.

2. **Register your apps** in the Firebase project:
   - Android — bundle ID `com.hyperbabel.demo`
   - iOS — bundle ID `com.hyperbabel.demo`

   (Edit `app.json` if you want a different bundle ID — the matching ID in
   Firebase must agree, otherwise the native SDK throws on launch.)

3. **Download the config files** from Firebase Console → Project Settings:
   - Android → "Your apps" → `google-services.json`
   - iOS → "Your apps" → `GoogleService-Info.plist`

4. **Drop both files into this `firebase/` folder.** `app.config.ts` detects
   them automatically on the next Metro start and wires up the native plugin.

5. **Allow-list the Firebase project ID in HyperBabel Console:**
   <https://console.hyperbabel.com/dashboard/customer-auth> →
   *Add Firebase project* → paste your project ID → paste a Firebase ID
   token to prove ownership → click *Verify and add*.

   This step is what tells HyperBabel "trust ID tokens from this project."
   Without it, `/customer/auth/firebase-exchange` returns 403.

6. **Start the demo**:
   ```sh
   npm install
   npm run ios   # or: npm run android
   ```

   Sign in or sign up on the login screen. The demo calls Firebase Auth, gets
   an ID token, exchanges it at HyperBabel for a customer JWT, and stores the
   JWT pair in SecureStore. The original Firebase ID token never leaves the
   device after exchange.

## What if I skip this folder?

The demo still builds and runs — `app.config.ts` simply omits the Firebase
plugin and the login screen shows a "Firebase config missing" message
instead of the sign-in form. Useful for browsing the source without setting
up a Firebase project first.

## Reference

- HyperBabel Customer Auth guide: <https://hyperbabel.com/docs#customer-auth>
- Pattern in use here: **B1 — Firebase Direct Exchange** (no backend on
  your side; the mobile app talks straight to HyperBabel)

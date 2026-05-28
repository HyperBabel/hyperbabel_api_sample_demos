# Firebase Native Config

This folder holds the Firebase config file that ships with every Android
Firebase project. It is a **developer-supplied secret** — git ignores
it so the demo repo stays clean and your private project ID never
leaks.

```
firebase/
├── README.md                       ← this file
├── .gitkeep                        ← keeps the folder in git
└── google-services.json            ← drop here (Android source, gitignored)
```

## Why a single source-of-truth copy

Android's `com.google.gms.google-services` plugin processes
`app/google-services.json` at build time. To keep one source of truth
(and one `.gitignore` rule), the demo's `app/build.gradle.kts` defines
a `copyFirebaseConfig` task that copies `firebase/google-services.json`
to `app/google-services.json` on every build. Both paths are
gitignored.

## How to populate this folder

1. **Create or open** your Firebase project at
   <https://console.firebase.google.com/>.

2. **Register your Android app** in the Firebase project:
   - Package name must match `applicationId` in
     `app/build.gradle.kts`. The template uses `com.hyperbabel.demo` —
     change it on either side if you want something different.
   - SHA-1 fingerprint is optional for Email/Password auth, required
     for some other providers (Google Sign-In, dynamic links, etc.).

3. **Download `google-services.json`** from Firebase Console →
   Project Settings → Your Android app.

4. **Drop it into this `firebase/` folder.** Run `./gradlew build`
   (or just press Run in Android Studio) — the `copyFirebaseConfig`
   task moves it to `app/` and the plugin picks it up automatically.

5. **Allow-list the Firebase project ID in HyperBabel Console:**
   <https://console.hyperbabel.com/dashboard/customer-auth> →
   *Add Firebase project* → paste your project ID → paste a Firebase ID
   token to prove ownership → click *Verify and add*.

   This step tells HyperBabel "trust ID tokens from this project."
   Without it, `/customer/auth/firebase-exchange` returns 403.

## What if I skip this folder?

The app still builds and runs — `FirebaseApp.initializeApp()` returns
null when no config is present, `FirebaseAuthService.isFirebaseReady`
goes false, and the sign-in screen renders a "Firebase config missing"
hint instead of the form. Useful for browsing the source without
setting up a Firebase project first.

## Reference

- HyperBabel Customer Auth guide: <https://hyperbabel.com/docs#customer-auth>
- Pattern in use here: **B1 — Firebase Direct Exchange** (no backend
  on your side; the mobile app talks straight to HyperBabel)

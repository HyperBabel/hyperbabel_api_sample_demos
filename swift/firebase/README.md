# Firebase Native Config

This folder holds the Firebase config file that ships with every iOS
Firebase project. It is a **developer-supplied secret** — git ignores
it so the demo repo stays clean and your private project ID never
leaks.

```
firebase/
├── README.md                       ← this file
├── .gitkeep                        ← keeps the folder in git
└── GoogleService-Info.plist        ← drop here (iOS, gitignored)
```

## How to populate this folder

1. **Create or open** your Firebase project at
   <https://console.firebase.google.com/>.

2. **Register your iOS app** in the Firebase project:
   - Bundle ID must match your Xcode target's
     `PRODUCT_BUNDLE_IDENTIFIER` exactly. The demo template uses
     `com.hyperbabel.demo` — change it on either side if you want
     something different.

3. **Download `GoogleService-Info.plist`** from Firebase Console →
   Project Settings → Your iOS app.

4. **Drop it into this `firebase/` folder.**

5. **Add it to your Xcode target**:
   - Drag `firebase/GoogleService-Info.plist` from Finder into your
     Xcode project navigator.
   - In the import sheet, **uncheck** "Copy items if needed" so the
     file lives only here (and stays gitignored). Tick the demo app
     target so it's bundled into the .app at build time.
   - Verify under Build Phases → Copy Bundle Resources that
     `GoogleService-Info.plist` is listed.

   `HyperBabelDemoApp.init()` reads the bundled plist on launch via
   `FirebaseApp.configure()` — no extra code needed.

6. **Allow-list the Firebase project ID in HyperBabel Console:**
   <https://console.hyperbabel.com/dashboard/customer-auth> →
   *Add Firebase project* → paste your project ID → paste a Firebase ID
   token to prove ownership → click *Verify and add*.

   This step tells HyperBabel "trust ID tokens from this project."
   Without it, `/customer/auth/firebase-exchange` returns 403.

## What if I skip this folder?

The app still builds and runs — `FirebaseApp.configure()` is wrapped
in a presence check, and the sign-in screen renders a "Firebase config
missing" hint instead of the form. Useful for browsing the source
without setting up a Firebase project first.

## Reference

- HyperBabel Customer Auth guide: <https://hyperbabel.com/docs#customer-auth>
- Pattern in use here: **B1 — Firebase Direct Exchange** (no backend
  on your side; the mobile app talks straight to HyperBabel)

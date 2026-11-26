# Firebase Native Config

This folder holds the two Firebase config files that ship with every
Firebase project. They are **developer-supplied** — git ignores them so
the demo repo stays clean and your private project IDs never leak.

```
firebase/
├── README.md                       ← this file
├── .gitkeep                        ← keeps the folder in git
├── google-services.json            ← drop here (Android source, gitignored)
└── GoogleService-Info.plist        ← drop here (iOS source, gitignored)
```

The app reads Firebase settings **only** from these two native files.
Nothing Firebase-related goes in `.env` — there are no `FIREBASE_*`
variables (see `.env.example`).

## Why these live OUTSIDE android/ and ios/

Flutter's native builds look for these files inside the platform
projects:

- Android: `android/app/google-services.json`
- iOS:     `ios/Runner/GoogleService-Info.plist`, added to the Runner target

`android/` and `ios/` are not in this repository — you generate them with
`flutter create` (project README → Quickstart step 4). Keeping a
**single source-of-truth copy in `firebase/`** gives you one place to
find / rotate / share the config; the copies in the platform folders are
gitignored as well.

## How to populate this folder

1. **Create or open** your Firebase project at
   <https://console.firebase.google.com/>.

2. **Register your apps** in the Firebase project (Project settings →
   Your apps) with the IDs `flutter create` generated:
   - Android — the `applicationId` in `android/app/build.gradle.kts`
     (`android/app/build.gradle` on Flutter versions that generate Groovy)
   - iOS — the bundle ID (`PRODUCT_BUNDLE_IDENTIFIER` in
     `ios/Runner.xcodeproj`; Xcode → Runner target → Signing & Capabilities)

3. **Download the config files** from the same page:
   - Android → `google-services.json`
   - iOS → `GoogleService-Info.plist`

4. **Drop both files into this `firebase/` folder.**

5. **Allow-list the Firebase project ID in HyperBabel Console:**
   <https://console.hyperbabel.com/dashboard/customer-auth> →
   *Add Firebase project* → paste your project ID → paste a Firebase ID
   token to prove ownership → click *Verify and add*.

   This step is what tells HyperBabel "trust ID tokens from this
   project." Without it, `/customer/auth/firebase-exchange` returns
   **401** `{ "error": "Firebase project \"<id>\" is not registered with HyperBabel" }`
   — the sign-in screen shows that message.

## Installing the files into the platform projects

Run from `sample_demos/flutter` after `flutter create`, and again whenever
you replace the files here.

**Android**

```bash
cp firebase/google-services.json android/app/google-services.json
```

Android only reads the file through the **Google Services Gradle plugin** —
add it as described in the project README → Platform setup → Android setup.
Without the plugin, `Firebase.initializeApp()` fails on Android even though
the file is there.

**iOS**

```bash
cp firebase/GoogleService-Info.plist ios/Runner/GoogleService-Info.plist
```

Then, once: open `ios/Runner.xcworkspace` in Xcode, right-click the
**Runner** folder → *Add Files to "Runner"…* → pick
`Runner/GoogleService-Info.plist` with the **Runner** target checked. A
file that is only copied into the folder is not bundled into the app.
Later `cp` runs just overwrite the file the project already references.

**Alternative: `flutterfire configure`.** The FlutterFire CLI can register
the apps and write both files for you, but it also generates
`lib/firebase_options.dart`. This demo calls `Firebase.initializeApp()`
without options, which reads the native files above; if you prefer the
generated file instead, change that call in `lib/main.dart` to
`Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform)`.

## What if I skip this folder?

The app still builds and runs — `Firebase.initializeApp()` in `main.dart`
is wrapped in `try/catch`, and the sign-in screen renders a "Firebase
config missing" hint instead of the form. Useful for browsing the source
without setting up a Firebase project first. (On Android, leave the Google
Services Gradle plugin out until you have the file — the plugin fails the
build without it.)

## Reference

- HyperBabel Customer Auth guide: <https://hyperbabel.com/docs#customer-auth>
- Pattern in use here: **B1 — Firebase Direct Exchange** (no backend on
  your side; the mobile app talks straight to HyperBabel)

# Firebase Native Config

This folder holds the two Firebase config files that ship with every
Firebase project. They are **developer-supplied secrets** — git ignores
them so the demo repo stays clean and your private project IDs never
leak.

```
firebase/
├── README.md                       ← this file
├── .gitkeep                        ← keeps the folder in git
├── google-services.json            ← drop here (Android source, gitignored)
└── GoogleService-Info.plist        ← drop here (iOS source, gitignored)
```

## Why these live OUTSIDE android/ and ios/

Flutter's native build looks for these files inside the platform
projects:

- Android: `android/app/google-services.json`
- iOS:     `ios/Runner/GoogleService-Info.plist`

Keeping a **single source-of-truth copy in `firebase/`** and a
build-step copy into the platform folders gives you:

1. One place to find / rotate / share the config.
2. Both files under the same `.gitignore` rule (just `firebase/*`).
3. No risk of one platform getting an out-of-sync update.

Set up the build-step copies once:

**Android** (`android/app/build.gradle`, inside `android { ... }`):

```gradle
task copyFirebaseConfig(type: Copy) {
  from "${rootProject.projectDir}/../firebase/google-services.json"
  into "${projectDir}"
}
preBuild.dependsOn copyFirebaseConfig
```

**iOS** — Xcode → Runner target → Build Phases → "+" → New Run Script
Phase, before Compile Sources:

```sh
cp "${SRCROOT}/../firebase/GoogleService-Info.plist" "${SRCROOT}/Runner/GoogleService-Info.plist"
```

(Or, if you prefer keeping the files only in `firebase/` without copying,
follow the `flutterfire configure` path which generates
`lib/firebase_options.dart` directly — see the project README.)

## How to populate this folder

1. **Create or open** your Firebase project at
   <https://console.firebase.google.com/>.

2. **Register your apps** in the Firebase project:
   - Android — application ID matches `android/app/build.gradle`
     (`applicationId`)
   - iOS — bundle ID matches `ios/Runner.xcodeproj`
     (`PRODUCT_BUNDLE_IDENTIFIER`)

3. **Download the config files** from Firebase Console → Project
   Settings:
   - Android → "Your apps" → `google-services.json`
   - iOS → "Your apps" → `GoogleService-Info.plist`

4. **Drop both files into this `firebase/` folder.** The build-step
   copies in `android/` and `ios/` pick them up on the next `flutter run`.

5. **Copy the Web SDK config block** from the same Firebase Console
   page into your `.env` file (`FIREBASE_API_KEY`, etc.). This is what
   `lib/main.dart` reads via `flutter_dotenv`.

6. **Allow-list the Firebase project ID in HyperBabel Console:**
   <https://console.hyperbabel.com/dashboard/customer-auth> →
   *Add Firebase project* → paste your project ID → paste a Firebase ID
   token to prove ownership → click *Verify and add*.

   This step is what tells HyperBabel "trust ID tokens from this
   project." Without it, `/customer/auth/firebase-exchange` returns 403.

## What if I skip this folder?

The app still builds and runs — `Firebase.initializeApp()` in `main.dart`
is wrapped in `try/catch`, and the sign-in screen renders a "Firebase
config missing" hint instead of the form. Useful for browsing the source
without setting up a Firebase project first.

## Reference

- HyperBabel Customer Auth guide: <https://hyperbabel.com/docs#customer-auth>
- Pattern in use here: **B1 — Firebase Direct Exchange** (no backend on
  your side; the mobile app talks straight to HyperBabel)

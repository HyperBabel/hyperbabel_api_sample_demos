import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("org.jetbrains.kotlin.plugin.compose")
}

// Conditionally apply the google-services plugin only when the source
// Firebase config exists. This lets the demo build and run on a fresh
// clone without Firebase setup — the sign-in screen renders a "Firebase
// config missing" hint instead. Drop the file into firebase/ and
// re-sync to enable Firebase auth.
val firebaseSourceConfig = rootProject.file("firebase/google-services.json")
if (firebaseSourceConfig.exists()) {
    apply(plugin = "com.google.gms.google-services")
}

// Read optional defaults from local.properties so we never bake credentials
// into the repo. Only HB_API_URL is read here — the demo no longer accepts
// an org API key (it uses Customer Auth pattern B1 via Firebase Direct
// Exchange instead — see api/FirebaseAuthService.kt).
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
val defaultApiUrl: String = localProps.getProperty("HB_API_URL", "https://api.hyperbabel.com/api/v1")

// ── Copy Firebase config from firebase/ to app/ at build time ──────────
//
// `firebase/google-services.json` is the source of truth. The
// google-services plugin processes `app/google-services.json`, so we
// copy on every build. Both paths are gitignored. If the file is absent
// the copy is a no-op and FirebaseApp.initializeApp() returns null at
// runtime — the sign-in screen renders a "Firebase config missing" hint
// instead of crashing.
tasks.register<Copy>("copyFirebaseConfig") {
    from(rootProject.file("firebase/google-services.json"))
    into(projectDir)
    onlyIf { rootProject.file("firebase/google-services.json").exists() }
}
tasks.named("preBuild").configure { dependsOn("copyFirebaseConfig") }

android {
    namespace = "com.hyperbabel.demo"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.hyperbabel.demo"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"

        buildConfigField("String", "HB_API_URL", "\"$defaultApiUrl\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    packaging {
        resources.excludes += setOf(
            "META-INF/AL2.0",
            "META-INF/LGPL2.1",
        )
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.09.02")
    implementation(composeBom)

    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-compose:1.9.2")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.5")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.5")
    implementation("androidx.navigation:navigation-compose:2.8.0")

    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")

    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.8.1")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.1")

    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.jakewharton.retrofit:retrofit2-kotlinx-serialization-converter:1.0.0")

    // Customer Auth pattern B1 — Firebase Direct Exchange.
    // See api/FirebaseAuthService.kt and https://hyperbabel.com/docs#customer-auth.
    implementation(platform("com.google.firebase:firebase-bom:33.6.0"))
    implementation("com.google.firebase:firebase-auth-ktx")
    implementation("com.google.firebase:firebase-messaging-ktx")

    // EncryptedSharedPreferences — Android Keystore-backed secure storage
    // for the customer JWT pair. iOS Keychain equivalent.
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    // Real-Time + Video underlying SDKs. Aliased on import in our wrappers.
    implementation("io.ably:ably-android:1.2.45")
    implementation("io.agora.rtc:full-sdk:4.4.0")

    debugImplementation("androidx.compose.ui:ui-tooling")
}

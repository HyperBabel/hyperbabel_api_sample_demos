plugins {
    id("com.android.application") version "8.5.2" apply false
    id("org.jetbrains.kotlin.android") version "2.0.20" apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "2.0.20" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.20" apply false

    // Customer Auth pattern B1 (Firebase Direct Exchange). The plugin
    // processes app/google-services.json at build time. See
    // app/build.gradle.kts for the copy-task that picks the file up
    // from the source-of-truth location at firebase/.
    id("com.google.gms.google-services") version "4.4.2" apply false
}

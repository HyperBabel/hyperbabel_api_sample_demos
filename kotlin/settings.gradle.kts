pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // Required for the underlying video RTC SDK.
        maven { url = uri("https://download.agora.io/sdk/release/maven") }
    }
}

rootProject.name = "hyperbabel-kotlin-demo"
include(":app")

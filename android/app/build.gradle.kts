plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

fun String.escapeForBuildConfig(): String = replace("\\", "\\\\").replace("\"", "\\\"")

// Default is the app's OWN bundled assets, served by WebViewAssetLoader, so a
// freshly installed APK boots with no network and no dev server. Override in
// android/gradle.properties (WEB_SHELL_URL=http://localhost:3000/) only for
// live-reload dev against `adb reverse`.
val bundledEntryUrl = "https://appassets.androidplatform.net/assets/www/index.html"
val webShellUrl =
    (findProperty("WEB_SHELL_URL") as String?)
        ?.trim()
        ?.ifBlank { null }
        ?: bundledEntryUrl
val webShellApplicationId =
    (findProperty("WEB_SHELL_APPLICATION_ID") as String?)
        ?.trim()
        ?.ifBlank { null }
        ?: "com.solanamobile.webshell"
val webShellVersionCode =
    (findProperty("WEB_SHELL_VERSION_CODE") as String?)
        ?.trim()
        ?.ifBlank { null }
        ?.toIntOrNull()
        ?: 1
val webShellVersionName =
    (findProperty("WEB_SHELL_VERSION_NAME") as String?)
        ?.trim()
        ?.ifBlank { null }
        ?: "1.0"
val webShellSigningStoreFile =
    (findProperty("WEB_SHELL_SIGNING_STORE_FILE") as String?)
        ?.trim()
        ?.ifBlank { null }
val webShellSigningStorePassword =
    (findProperty("WEB_SHELL_SIGNING_STORE_PASSWORD") as String?)
        ?.trim()
        ?.ifBlank { null }
        ?: System
            .getenv("WEB_SHELL_SIGNING_STORE_PASSWORD")
            ?.trim()
            ?.ifBlank { null }
val webShellSigningKeyAlias =
    (findProperty("WEB_SHELL_SIGNING_KEY_ALIAS") as String?)
        ?.trim()
        ?.ifBlank { null }
val webShellSigningKeyPassword =
    (findProperty("WEB_SHELL_SIGNING_KEY_PASSWORD") as String?)
        ?.trim()
        ?.ifBlank { null }
        ?: System
            .getenv("WEB_SHELL_SIGNING_KEY_PASSWORD")
            ?.trim()
            ?.ifBlank { null }
val hasReleaseSigning =
    webShellSigningStoreFile != null &&
        webShellSigningStorePassword != null &&
        webShellSigningKeyAlias != null

// FLAG_SECURE is a BUILD decision, never a user setting.
//
// The flag blocks screenshots, screen recording and the recents thumbnail for the
// whole window. That is the right default for a wallet that puts a private
// balance and a recipient address on screen — and it is the wrong one for the
// build being used to shoot the demo video, where the recorder captures black
// frames instead of the app.
//
// So: release ON, debug OFF, plus an explicit escape for a signed build that has
// to be filmed:
//     ./gradlew :app:assembleRelease -PWEB_SHELL_FLAG_SECURE=false
// Nobody in the UI ever sees or touches this, which is the point.
val flagSecureOverride: Boolean? =
    (findProperty("WEB_SHELL_FLAG_SECURE") as String?)
        ?.trim()
        ?.lowercase()
        ?.takeIf { it.isNotEmpty() }
        ?.let { it == "true" || it == "1" || it == "yes" }

android {
    namespace = "com.vanta.privacywallet"
    compileSdk {
        version = release(36)
    }

    defaultConfig {
        applicationId = webShellApplicationId
        minSdk = 28
        targetSdk = 36
        versionCode = webShellVersionCode
        versionName = webShellVersionName

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        buildConfigField("String", "WEB_SHELL_URL", "\"${webShellUrl.escapeForBuildConfig()}\"")
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("webShellRelease") {
                storeFile = file(webShellSigningStoreFile!!)
                storePassword = webShellSigningStorePassword
                keyAlias = webShellSigningKeyAlias
                keyPassword = webShellSigningKeyPassword ?: webShellSigningStorePassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("webShellRelease")
            }
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            buildConfigField("boolean", "FLAG_SECURE", (flagSecureOverride ?: true).toString())
        }
        debug {
            // Off by default: a debug build is exactly the one being screenshotted
            // while something is being fixed.
            buildConfigField("boolean", "FLAG_SECURE", (flagSecureOverride ?: false).toString())
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.core.splashscreen)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.swiperefreshlayout)
    implementation(libs.androidx.webkit)
    debugImplementation(libs.androidx.compose.ui.tooling)
}

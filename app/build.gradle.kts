plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "cg.fast.n1"
    compileSdk = 35

    defaultConfig {
        applicationId = "cg.fast.n1"
        minSdk = 26
        targetSdk = 35
        versionCode = 606
        versionName = "6.0"

        val googleMapsKey = System.getenv("FAST_GOOGLE_MAPS_API_KEY")?.takeIf { it.isNotBlank() }
            ?: "AIzaSyBWo0btwLFoZaRze_TkMxoWkOMWorNyIRw"
        buildConfigField("String", "SUPABASE_URL", "\"https://hmwxwzfcpdvgzjgxruup.supabase.co\"")
        buildConfigField("String", "SUPABASE_PUBLISHABLE_KEY", "\"sb_publishable_RYYcI3j1QU9LAUa-0s1eZQ_x6HpDr38\"")
        buildConfigField("String", "PYTHON_API_URL", "\"https://fast-n1-python-api.vercel.app\"")
        buildConfigField("String", "GOOGLE_MAPS_API_KEY", "\"${googleMapsKey.replace("\\", "\\\\").replace("\"", "\\\"")}\"")
    }

    buildFeatures { buildConfig = true }

    val releaseStorePath = System.getenv("FAST_KEYSTORE_PATH")
    if (!releaseStorePath.isNullOrBlank()) {
        signingConfigs {
            create("production") {
                storeFile = file(releaseStorePath)
                storePassword = System.getenv("FAST_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("FAST_KEY_ALIAS")
                keyPassword = System.getenv("FAST_KEY_PASSWORD")
                enableV1Signing = true
                enableV2Signing = true
                enableV3Signing = true
                enableV4Signing = true
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isDebuggable = false
            isJniDebuggable = false
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfigs.findByName("production")?.let { signingConfig = it }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.13.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("com.google.android.gms:play-services-location:21.3.0")
}

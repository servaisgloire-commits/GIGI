plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val mapsApiKey = (System.getenv("FAST_GOOGLE_MAPS_API_KEY") ?: "").trim()

android {
    namespace = "cg.fast.n1"
    compileSdk = 35

    defaultConfig {
        applicationId = "cg.fast.n1"
        minSdk = 26
        targetSdk = 35
        versionCode = 14092029
        versionName = "14.09.2026"
        buildConfigField("String", "SUPABASE_URL", "\"https://hmwxwzfcpdvgzjgxruup.supabase.co\"")
        buildConfigField("String", "SUPABASE_PUBLISHABLE_KEY", "\"sb_publishable_RYYcI3j1QU9LAUa-0s1eZQ_x6HpDr38\"")
        buildConfigField("String", "PYTHON_API_URL", "\"https://fast-n1-python-api.vercel.app\"")
        buildConfigField("boolean", "MAPS_NATIVE_CONFIGURED", mapsApiKey.isNotBlank().toString())
        manifestPlaceholders["MAPS_API_KEY"] = mapsApiKey
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
        debug { }
        create("directInstall") {
            initWith(getByName("release"))
            isDebuggable = false
            isJniDebuggable = false
            signingConfigs.findByName("production")?.let { signingConfig = it }
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
    implementation("com.google.android.gms:play-services-maps:20.0.0")
}

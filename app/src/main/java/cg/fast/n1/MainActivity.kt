package cg.fast.n1

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.GeolocationPermissions
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {
    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        web.setBackgroundColor(android.graphics.Color.rgb(5, 8, 13))
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            geolocationEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            @Suppress("DEPRECATION") allowFileAccessFromFileURLs = true
            @Suppress("DEPRECATION") allowUniversalAccessFromFileURLs = true
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(origin: String?, callback: GeolocationPermissions.Callback?) {
                callback?.invoke(origin, ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED, false)
            }
        }
        web.webViewClient = WebViewClient()
        web.addJavascriptInterface(FastBridge(), "FASTNative")
        web.loadUrl("file:///android_asset/index.html")
        setContentView(web)
        val perms = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
        if (Build.VERSION.SDK_INT >= 33) perms.add(Manifest.permission.POST_NOTIFICATIONS)
        ActivityCompat.requestPermissions(this, perms.toTypedArray(), 1001)
    }

    inner class FastBridge {
        @android.webkit.JavascriptInterface fun supabaseUrl(): String = BuildConfig.SUPABASE_URL
        @android.webkit.JavascriptInterface fun supabasePublishableKey(): String = BuildConfig.SUPABASE_PUBLISHABLE_KEY
        @android.webkit.JavascriptInterface fun pythonApiUrl(): String = BuildConfig.PYTHON_API_URL
        @android.webkit.JavascriptInterface fun appVersion(): String = BuildConfig.VERSION_NAME

        @android.webkit.JavascriptInterface
        fun setAccessToken(token: String) {
            getSharedPreferences("fast", MODE_PRIVATE).edit().putString("access_token", token).apply()
        }

        @android.webkit.JavascriptInterface
        fun startDriverTracking() {
            if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return
            val intent = Intent(this@MainActivity, DriverLocationService::class.java)
            ContextCompat.startForegroundService(this@MainActivity, intent)
        }

        @android.webkit.JavascriptInterface
        fun stopDriverTracking() {
            stopService(Intent(this@MainActivity, DriverLocationService::class.java))
        }

        @android.webkit.JavascriptInterface
        fun callSupport(phone: String) { runOnUiThread { startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))) } }

        @android.webkit.JavascriptInterface
        fun emailSupport(email: String) { runOnUiThread { startActivity(Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:$email"))) } }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() { if (::web.isInitialized && web.canGoBack()) web.goBack() else super.onBackPressed() }
}

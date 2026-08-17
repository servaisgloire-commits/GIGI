package cg.fast.n1

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
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
            @Suppress("DEPRECATION")
            allowFileAccessFromFileURLs = true
            @Suppress("DEPRECATION")
            allowUniversalAccessFromFileURLs = true
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(origin: String?, callback: GeolocationPermissions.Callback?) {
                if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                    callback?.invoke(origin, true, false)
                } else {
                    ActivityCompat.requestPermissions(this@MainActivity, arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION), 1001)
                    callback?.invoke(origin, true, false)
                }
            }
        }
        web.webViewClient = WebViewClient()
        web.addJavascriptInterface(FastBridge(), "FASTNative")
        web.loadUrl("file:///android_asset/index.html")
        setContentView(web)

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION), 1001)
        }
    }

    inner class FastBridge {
        @android.webkit.JavascriptInterface
        fun supabaseUrl(): String = BuildConfig.SUPABASE_URL

        @android.webkit.JavascriptInterface
        fun supabasePublishableKey(): String = BuildConfig.SUPABASE_PUBLISHABLE_KEY

        @android.webkit.JavascriptInterface
        fun pythonApiUrl(): String = BuildConfig.PYTHON_API_URL

        @android.webkit.JavascriptInterface
        fun appVersion(): String = BuildConfig.VERSION_NAME

        @android.webkit.JavascriptInterface
        fun callSupport(phone: String) {
            runOnUiThread {
                startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone")))
            }
        }

        @android.webkit.JavascriptInterface
        fun emailSupport(email: String) {
            runOnUiThread {
                val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:$email"))
                startActivity(intent)
            }
        }
    }

    override fun onBackPressed() {
        if (::web.isInitialized && web.canGoBack()) web.goBack() else super.onBackPressed()
    }
}

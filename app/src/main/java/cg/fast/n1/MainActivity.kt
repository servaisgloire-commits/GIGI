package cg.fast.n1

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.webkit.GeolocationPermissions
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {
    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        createDriverOfferChannel()
        web = WebView(this)
        web.setBackgroundColor(android.graphics.Color.WHITE)
        web.setLayerType(View.LAYER_TYPE_HARDWARE, null)
        web.overScrollMode = View.OVER_SCROLL_NEVER
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            setGeolocationEnabled(true)
            allowFileAccess = true
            allowContentAccess = true
            cacheMode = WebSettings.LOAD_DEFAULT
            loadsImagesAutomatically = true
            blockNetworkImage = false
            useWideViewPort = true
            loadWithOverviewMode = true
            textZoom = 100
            mediaPlaybackRequiresUserGesture = false
            @Suppress("DEPRECATION") allowFileAccessFromFileURLs = true
            @Suppress("DEPRECATION") allowUniversalAccessFromFileURLs = true
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(origin: String?, callback: GeolocationPermissions.Callback?) {
                callback?.invoke(
                    origin,
                    ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED,
                    false
                )
            }
        }
        web.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                val qualityLayer = """
                    (function(){
                      document.documentElement.style.webkitFontSmoothing='antialiased';
                      function css(id,href){if(!document.getElementById(id)){var l=document.createElement('link');l.id=id;l.rel='stylesheet';l.href=href;document.head.appendChild(l);}}
                      function js(id,src){if(!document.getElementById(id)){var s=document.createElement('script');s.id=id;s.src=src;document.body.appendChild(s);}}
                      css('fast-polish-css','app-polish.css');
                      css('fast-driver-profile-css','driver-profile.css');
                      css('fast-production-ui-css','production-ui.css');
                      js('fast-quality-js','app-quality.js');
                      js('fast-driver-profile-js','driver-profile.js');
                      js('fast-production-ui-js','production-ui.js');
                    })();
                """.trimIndent()
                view?.evaluateJavascript(qualityLayer, null)
            }
        }
        web.addJavascriptInterface(FastBridge(), "FASTNative")
        web.loadUrl("file:///android_asset/index.html")
        setContentView(web)
        val perms = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
        if (Build.VERSION.SDK_INT >= 33) perms.add(Manifest.permission.POST_NOTIFICATIONS)
        ActivityCompat.requestPermissions(this, perms.toTypedArray(), 1001)
    }

    private fun createDriverOfferChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel("fast_driver_offers", "FAST nouvelles courses", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Notifications des nouvelles courses proposées aux chauffeurs FAST"
                enableVibration(true)
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    inner class FastBridge {
        @android.webkit.JavascriptInterface fun supabaseUrl(): String = BuildConfig.SUPABASE_URL
        @android.webkit.JavascriptInterface fun supabasePublishableKey(): String = BuildConfig.SUPABASE_PUBLISHABLE_KEY
        @android.webkit.JavascriptInterface fun pythonApiUrl(): String = BuildConfig.PYTHON_API_URL
        @android.webkit.JavascriptInterface fun googleMapsApiKey(): String = BuildConfig.GOOGLE_MAPS_API_KEY
        @android.webkit.JavascriptInterface fun appVersion(): String = BuildConfig.VERSION_NAME

        @android.webkit.JavascriptInterface
        fun setAccessToken(token: String) {
            getSharedPreferences("fast", MODE_PRIVATE).edit().putString("access_token", token).apply()
        }

        @android.webkit.JavascriptInterface
        fun startDriverTracking() {
            if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return
            ContextCompat.startForegroundService(this@MainActivity, Intent(this@MainActivity, DriverLocationService::class.java))
        }

        @android.webkit.JavascriptInterface
        fun stopDriverTracking() {
            stopService(Intent(this@MainActivity, DriverLocationService::class.java))
        }

        @android.webkit.JavascriptInterface
        fun notifyDriverOffer(title: String, body: String) {
            val intent = Intent(this@MainActivity, MainActivity::class.java)
            val pending = PendingIntent.getActivity(this@MainActivity, 401, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            val n = NotificationCompat.Builder(this@MainActivity, "fast_driver_offers")
                .setSmallIcon(android.R.drawable.ic_dialog_map)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pending)
                .build()
            if (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
                NotificationManagerCompat.from(this@MainActivity).notify((System.currentTimeMillis() % 100000).toInt(), n)
            }
        }

        @android.webkit.JavascriptInterface
        fun callSupport(phone: String) {
            runOnUiThread { startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))) }
        }

        @android.webkit.JavascriptInterface
        fun emailSupport(email: String) {
            runOnUiThread { startActivity(Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:$email"))) }
        }

        @android.webkit.JavascriptInterface
        fun emailSupportRequest(email: String, subject: String, body: String) {
            runOnUiThread {
                val uri = Uri.parse("mailto:$email?subject=${Uri.encode(subject)}&body=${Uri.encode(body)}")
                startActivity(Intent(Intent.ACTION_SENDTO, uri))
            }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (::web.isInitialized && web.canGoBack()) web.goBack() else super.onBackPressed()
    }
}

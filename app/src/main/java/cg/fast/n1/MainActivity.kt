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
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewAssetLoader

class MainActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private var pendingFileCallback: ValueCallback<Array<Uri>>? = null

    private val fileChooserLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val callback = pendingFileCallback ?: return@registerForActivityResult
        val data = result.data
        val uris: Array<Uri>? = if (result.resultCode == RESULT_OK) {
            when {
                data?.clipData != null -> {
                    val clip = data.clipData!!
                    Array(clip.itemCount) { index -> clip.getItemAt(index).uri }
                }
                data?.data != null -> arrayOf(data.data!!)
                else -> null
            }
        } else null
        callback.onReceiveValue(uris)
        pendingFileCallback = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        createDriverOfferChannel()

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web = WebView(this)
        web.setBackgroundColor(android.graphics.Color.WHITE)
        web.setLayerType(View.LAYER_TYPE_HARDWARE, null)
        web.overScrollMode = View.OVER_SCROLL_NEVER
        web.isFocusable = true
        web.isFocusableInTouchMode = true
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            setGeolocationEnabled(true)
            allowFileAccess = false
            allowContentAccess = false
            cacheMode = WebSettings.LOAD_DEFAULT
            loadsImagesAutomatically = true
            blockNetworkImage = false
            useWideViewPort = true
            loadWithOverviewMode = true
            textZoom = 100
            mediaPlaybackRequiresUserGesture = false
            @Suppress("DEPRECATION") allowFileAccessFromFileURLs = false
            @Suppress("DEPRECATION") allowUniversalAccessFromFileURLs = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(origin: String?, callback: GeolocationPermissions.Callback?) {
                val allowedOrigin = origin?.startsWith("https://appassets.androidplatform.net") == true
                callback?.invoke(
                    origin,
                    allowedOrigin && ContextCompat.checkSelfPermission(
                        this@MainActivity,
                        Manifest.permission.ACCESS_FINE_LOCATION
                    ) == PackageManager.PERMISSION_GRANTED,
                    false
                )
            }

            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                pendingFileCallback?.onReceiveValue(null)
                pendingFileCallback = filePathCallback

                val picker = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                    putExtra(
                        Intent.EXTRA_MIME_TYPES,
                        arrayOf(
                            "application/pdf",
                            "image/jpeg",
                            "image/png",
                            "image/webp",
                            "image/heic",
                            "image/heif"
                        )
                    )
                    putExtra(
                        Intent.EXTRA_ALLOW_MULTIPLE,
                        fileChooserParams?.mode == FileChooserParams.MODE_OPEN_MULTIPLE
                    )
                }

                return try {
                    fileChooserLauncher.launch(picker)
                    true
                } catch (_: Exception) {
                    pendingFileCallback?.onReceiveValue(null)
                    pendingFileCallback = null
                    false
                }
            }
        }

        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse? {
                val local = request?.url?.let { assetLoader.shouldInterceptRequest(it) }
                return local ?: super.shouldInterceptRequest(view, request)
            }

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val uri = request?.url ?: return true
                val isLocalApp = uri.scheme == "https" && uri.host == "appassets.androidplatform.net"
                if (isLocalApp) return false

                if (request.isForMainFrame && uri.scheme == "https") {
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
                    return true
                }
                return uri.scheme != "https"
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                if (url?.startsWith("https://appassets.androidplatform.net/assets/") != true) return
                val qualityLayer = """
                    (function(){
                      document.documentElement.style.webkitFontSmoothing='antialiased';
                      function hasStylesheet(href){return Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(function(l){return (l.getAttribute('href')||'').endsWith(href);});}
                      function hasScript(src){return Array.from(document.scripts).some(function(s){return (s.getAttribute('src')||'').endsWith(src);});}
                      function css(id,href){if(document.getElementById(id)||hasStylesheet(href))return;var l=document.createElement('link');l.id=id;l.rel='stylesheet';l.href=href;document.head.appendChild(l);}
                      function js(id,src){if(document.getElementById(id)||hasScript(src))return;var s=document.createElement('script');s.id=id;s.async=false;s.src=src;document.body.appendChild(s);}
                      css('fast-polish-css','app-polish.css');
                      css('fast-driver-profile-css','driver-profile.css');
                      css('fast-production-ui-css','production-ui.css');
                      js('fast-quality-js','app-quality.js');
                      js('fast-driver-profile-js','driver-profile.js');
                      js('fast-production-ui-js','production-ui.js');
                      js('fast-recovery-fix-js','recovery-fix.js');
                      js('fast-update-manager-js','update-manager.js');
                      js('fast-global-market-js','global-market.js');
                      js('fast-global-polish-js','global-polish.js');
                    })();
                """.trimIndent()
                view?.evaluateJavascript(qualityLayer, null)
                view?.requestFocus(View.FOCUS_DOWN)
            }
        }

        web.addJavascriptInterface(FastBridge(), "FASTNative")
        web.loadUrl("https://appassets.androidplatform.net/assets/index.html")
        setContentView(web)
        web.requestFocus(View.FOCUS_DOWN)

        val perms = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
        if (Build.VERSION.SDK_INT >= 33) perms.add(Manifest.permission.POST_NOTIFICATIONS)
        ActivityCompat.requestPermissions(this, perms.toTypedArray(), 1001)
    }

    override fun onResume() {
        super.onResume()
        if (::web.isInitialized) {
            web.onResume()
            web.resumeTimers()
            web.requestFocus(View.FOCUS_DOWN)
        }
    }

    override fun onPause() {
        if (::web.isInitialized) web.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        pendingFileCallback?.onReceiveValue(null)
        pendingFileCallback = null
        if (::web.isInitialized) {
            web.removeJavascriptInterface("FASTNative")
            web.stopLoading()
            web.loadUrl("about:blank")
            web.clearHistory()
            web.removeAllViews()
            web.destroy()
        }
        super.onDestroy()
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

    private fun isAllowedUpdateUrl(url: String): Boolean {
        val uri = runCatching { Uri.parse(url) }.getOrNull() ?: return false
        if (uri.scheme != "https") return false
        val host = (uri.host ?: "").lowercase()
        return host == "github.com" || host.endsWith(".githubusercontent.com") || host.endsWith(".github.com")
    }

    inner class FastBridge {
        @android.webkit.JavascriptInterface fun supabaseUrl(): String = BuildConfig.SUPABASE_URL
        @android.webkit.JavascriptInterface fun supabasePublishableKey(): String = BuildConfig.SUPABASE_PUBLISHABLE_KEY
        @android.webkit.JavascriptInterface fun pythonApiUrl(): String = BuildConfig.PYTHON_API_URL
        @android.webkit.JavascriptInterface fun googleMapsApiKey(): String = BuildConfig.GOOGLE_MAPS_API_KEY
        @android.webkit.JavascriptInterface fun appVersion(): String = BuildConfig.VERSION_NAME
        @android.webkit.JavascriptInterface fun appBuildCode(): Int = BuildConfig.VERSION_CODE
        @android.webkit.JavascriptInterface fun isDebugBuild(): Boolean = BuildConfig.DEBUG

        @android.webkit.JavascriptInterface
        fun openExternalUrl(url: String) {
            val uri = runCatching { Uri.parse(url) }.getOrNull() ?: return
            if (uri.scheme != "https") return
            runOnUiThread {
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
            }
        }

        @android.webkit.JavascriptInterface
        fun installUpdate(url: String): Boolean {
            if (!isAllowedUpdateUrl(url)) return false
            val uri = Uri.parse(url)
            runOnUiThread {
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
            }
            return true
        }

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
            val pending = PendingIntent.getActivity(
                this@MainActivity,
                401,
                intent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            val notification = NotificationCompat.Builder(this@MainActivity, "fast_driver_offers")
                .setSmallIcon(android.R.drawable.ic_dialog_map)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pending)
                .build()
            if (
                Build.VERSION.SDK_INT < 33 ||
                ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
            ) {
                NotificationManagerCompat.from(this@MainActivity)
                    .notify((System.currentTimeMillis() % 100000).toInt(), notification)
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

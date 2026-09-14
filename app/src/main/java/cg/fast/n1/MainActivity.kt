package cg.fast.n1

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
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
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    private val picker = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val cb = fileCallback ?: return@registerForActivityResult
        val data = result.data
        val values = if (result.resultCode == RESULT_OK) {
            when {
                data?.clipData != null -> Array(data.clipData!!.itemCount) { i -> data.clipData!!.getItemAt(i).uri }
                data?.data != null -> arrayOf(data.data!!)
                else -> null
            }
        } else null
        cb.onReceiveValue(values)
        fileCallback = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this)
        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            setGeolocationEnabled(true)
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            cacheMode = WebSettings.LOAD_DEFAULT
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse? {
                return request?.url?.let(loader::shouldInterceptRequest) ?: super.shouldInterceptRequest(view, request)
            }

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                if (request?.isForMainFrame == false) return false
                val uri = request?.url ?: return true
                if (uri.scheme == "https" && uri.host == "appassets.androidplatform.net") return false
                if (uri.scheme == "https") runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
                return true
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(origin: String?, callback: GeolocationPermissions.Callback?) {
                val allowed = ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                callback?.invoke(origin, allowed, false)
            }

            override fun onShowFileChooser(view: WebView?, callback: ValueCallback<Array<Uri>>?, params: FileChooserParams?): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                    putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("image/jpeg", "image/png", "image/webp", "application/pdf"))
                }
                picker.launch(intent)
                return true
            }
        }

        webView.addJavascriptInterface(FastNativeBridge(), "FastNative")
        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html")
        setContentView(webView)

        ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION), 1001)
    }

    override fun onResume() {
        super.onResume()
        if (::webView.isInitialized) webView.evaluateJavascript("window.FAST_RESUME && window.FAST_RESUME()", null)
    }

    override fun onDestroy() {
        fileCallback?.onReceiveValue(null)
        fileCallback = null
        if (::webView.isInitialized) {
            webView.removeJavascriptInterface("FastNative")
            webView.stopLoading()
            webView.loadUrl("about:blank")
            webView.removeAllViews()
            webView.destroy()
        }
        super.onDestroy()
    }

    inner class FastNativeBridge {
        @JavascriptInterface
        fun config(): String = JSONObject().apply {
            put("supabaseUrl", BuildConfig.SUPABASE_URL)
            put("supabaseKey", BuildConfig.SUPABASE_PUBLISHABLE_KEY)
            put("apiUrl", BuildConfig.PYTHON_API_URL)
            put("version", BuildConfig.VERSION_NAME)
            put("packageId", BuildConfig.APPLICATION_ID)
        }.toString()

        @JavascriptInterface
        fun openExternal(url: String) {
            if (!url.startsWith("https://")) return
            runOnUiThread { runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } }
        }

        @JavascriptInterface
        fun openDriverMap(
            destinationLat: Double,
            destinationLng: Double,
            currentLat: Double,
            currentLng: Double,
            hasCurrent: Boolean,
            polyline: String,
            etaMin: Double,
            distanceKm: Double,
            phase: String,
            targetLabel: String,
        ) {
            if (!destinationLat.isFinite() || !destinationLng.isFinite()) return
            runOnUiThread {
                val intent = Intent(this@MainActivity, DriverMapActivity::class.java).apply {
                    putExtra(DriverMapActivity.EXTRA_DESTINATION_LAT, destinationLat)
                    putExtra(DriverMapActivity.EXTRA_DESTINATION_LNG, destinationLng)
                    putExtra(DriverMapActivity.EXTRA_CURRENT_LAT, currentLat)
                    putExtra(DriverMapActivity.EXTRA_CURRENT_LNG, currentLng)
                    putExtra(DriverMapActivity.EXTRA_HAS_CURRENT, hasCurrent)
                    putExtra(DriverMapActivity.EXTRA_POLYLINE, polyline)
                    putExtra(DriverMapActivity.EXTRA_ETA_MIN, etaMin)
                    putExtra(DriverMapActivity.EXTRA_DISTANCE_KM, distanceKm)
                    putExtra(DriverMapActivity.EXTRA_PHASE, phase)
                    putExtra(DriverMapActivity.EXTRA_TARGET_LABEL, targetLabel)
                }
                runCatching { startActivity(intent) }
            }
        }

        @JavascriptInterface
        fun openNavigation(lat: Double, lng: Double) {
            runOnUiThread {
                val navigation = Intent(Intent.ACTION_VIEW, Uri.parse("google.navigation:q=$lat,$lng&mode=d")).apply {
                    setPackage("com.google.android.apps.maps")
                }
                val opened = runCatching { startActivity(navigation) }.isSuccess
                if (!opened) {
                    val fallback = Uri.parse("https://www.google.com/maps/dir/?api=1&destination=$lat,$lng&travelmode=driving&dir_action=navigate")
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, fallback)) }
                }
            }
        }
    }
}

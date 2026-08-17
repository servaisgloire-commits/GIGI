package cg.fast.n1

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val web = WebView(this)
        web.setBackgroundColor(android.graphics.Color.rgb(5, 8, 13))
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.databaseEnabled = true
        web.webChromeClient = WebChromeClient()
        web.webViewClient = WebViewClient()
        web.addJavascriptInterface(FastBridge(), "FASTNative")
        web.loadUrl("file:///android_asset/index.html")
        setContentView(web)
    }

    inner class FastBridge {
        @android.webkit.JavascriptInterface
        fun supabaseUrl(): String = BuildConfig.SUPABASE_URL

        @android.webkit.JavascriptInterface
        fun pythonApiUrl(): String = BuildConfig.PYTHON_API_URL

        @android.webkit.JavascriptInterface
        fun appVersion(): String = BuildConfig.VERSION_NAME
    }
}

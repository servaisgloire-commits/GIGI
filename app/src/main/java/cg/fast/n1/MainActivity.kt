package cg.fast.n1

import android.Manifest
import android.annotation.SuppressLint
import android.app.DownloadManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
import android.view.View
import android.webkit.GeolocationPermissions
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File

class MainActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private var pendingFileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingUpdateUrl: String? = null
    private var updateDownloadId: Long = -1L
    private var updateFile: File? = null

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

    private val updateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action != DownloadManager.ACTION_DOWNLOAD_COMPLETE) return
            val id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L)
            if (id != updateDownloadId) return
            val manager = getSystemService(DOWNLOAD_SERVICE) as DownloadManager
            val cursor = manager.query(DownloadManager.Query().setFilterById(id))
            cursor.use {
                if (!it.moveToFirst()) {
                    notifyUpdateStatus("error", "Téléchargement introuvable")
                    return
                }
                val status = it.getInt(it.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
                if (status == DownloadManager.STATUS_SUCCESSFUL) {
                    notifyUpdateStatus("downloaded", "Téléchargement terminé. Ouverture de l’installateur…")
                    installDownloadedUpdate()
                } else {
                    notifyUpdateStatus("error", "Le téléchargement de la mise à jour a échoué")
                }
            }
        }
    }

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
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                val qualityLayer = """
                    (function(){
                      document.documentElement.style.webkitFontSmoothing='antialiased';
                      function css(id,href){if(!document.getElementById(id)){var l=document.createElement('link');l.id=id;l.rel='stylesheet';l.href=href;document.head.appendChild(l);}}
                      function js(id,src){if(!document.getElementById(id)){var s=document.createElement('script');s.id=id;s.async=false;s.src=src;document.body.appendChild(s);}}
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
            }
        }
        web.addJavascriptInterface(FastBridge(), "FASTNative")
        web.loadUrl("file:///android_asset/index.html")
        setContentView(web)

        ContextCompat.registerReceiver(
            this,
            updateReceiver,
            IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
            ContextCompat.RECEIVER_NOT_EXPORTED
        )

        val perms = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
        if (Build.VERSION.SDK_INT >= 33) perms.add(Manifest.permission.POST_NOTIFICATIONS)
        ActivityCompat.requestPermissions(this, perms.toTypedArray(), 1001)
    }

    override fun onResume() {
        super.onResume()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && packageManager.canRequestPackageInstalls()) {
            pendingUpdateUrl?.let { url ->
                pendingUpdateUrl = null
                startUpdateDownload(url)
            }
        }
    }

    override fun onDestroy() {
        runCatching { unregisterReceiver(updateReceiver) }
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

    private fun notifyUpdateStatus(state: String, message: String) {
        runOnUiThread {
            if (!::web.isInitialized) return@runOnUiThread
            val s = JSONObject.quote(state)
            val m = JSONObject.quote(message)
            web.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('fast:update-status',{detail:{state:$s,message:$m}}));",
                null
            )
        }
    }

    private fun isAllowedUpdateUrl(url: String): Boolean {
        val uri = runCatching { Uri.parse(url) }.getOrNull() ?: return false
        if (uri.scheme != "https") return false
        val host = (uri.host ?: "").lowercase()
        return host == "github.com" || host.endsWith(".githubusercontent.com") || host.endsWith(".github.com")
    }

    private fun startUpdateDownload(url: String) {
        if (!isAllowedUpdateUrl(url)) {
            notifyUpdateStatus("error", "Adresse de mise à jour non autorisée")
            return
        }
        val downloads = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: filesDir
        val file = File(downloads, "FAST-N1-update.apk")
        runCatching { if (file.exists()) file.delete() }
        updateFile = file
        val request = DownloadManager.Request(Uri.parse(url)).apply {
            setTitle("FAST N°1")
            setDescription("Téléchargement de la mise à jour")
            setMimeType("application/vnd.android.package-archive")
            setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            setAllowedOverMetered(true)
            setAllowedOverRoaming(false)
            setDestinationInExternalFilesDir(this@MainActivity, Environment.DIRECTORY_DOWNLOADS, file.name)
        }
        val manager = getSystemService(DOWNLOAD_SERVICE) as DownloadManager
        updateDownloadId = manager.enqueue(request)
        notifyUpdateStatus("downloading", "Téléchargement de la mise à jour…")
    }

    private fun installDownloadedUpdate() {
        val file = updateFile ?: return notifyUpdateStatus("error", "Fichier de mise à jour manquant")
        if (!file.exists() || file.length() <= 0L) return notifyUpdateStatus("error", "APK téléchargé invalide")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !packageManager.canRequestPackageInstalls()) {
            notifyUpdateStatus("permission", "Autorisez FAST à installer les mises à jour")
            val settingsIntent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName"))
            startActivity(settingsIntent)
            return
        }
        val apkUri = FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(apkUri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        runCatching { startActivity(intent) }
            .onFailure { notifyUpdateStatus("error", "Impossible d’ouvrir l’installateur Android") }
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
            runOnUiThread {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !packageManager.canRequestPackageInstalls()) {
                    pendingUpdateUrl = url
                    notifyUpdateStatus("permission", "Autorisez FAST à installer les mises à jour")
                    runCatching {
                        startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
                    }
                } else {
                    startUpdateDownload(url)
                }
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

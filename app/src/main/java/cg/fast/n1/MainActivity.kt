package cg.fast.n1

import android.Manifest
import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewAssetLoader
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.GoogleMap
import com.google.android.gms.maps.MapView
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.LatLngBounds
import com.google.android.gms.maps.model.Marker
import com.google.android.gms.maps.model.MarkerOptions
import com.google.android.gms.maps.model.Polyline
import com.google.android.gms.maps.model.PolylineOptions
import org.json.JSONArray
import org.json.JSONObject

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var mainMapView: MapView
    private var mainGoogleMap: GoogleMap? = null
    private var mainMapEnabled = false
    private var mainMapLoaded = false
    private var forwardingMapGesture = false
    private var mainMapTouchBoundaryRatio = 0.58f
    private var mainMapTouchTopBoundaryRatio = 0.11f
    private var lastBackPressAt = 0L
    private var mainPickupMarker: Marker? = null
    private var mainDestinationMarker: Marker? = null
    private var mainDriverMarker: Marker? = null
    private var mainDriverAnimator: ValueAnimator? = null
    private val mainNearbyMarkers = mutableListOf<Marker>()
    private var mainRoutePolyline: Polyline? = null
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

    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    @SuppressLint("SetJavaScriptEnabled", "ClickableViewAccessibility")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        val root = FrameLayout(this).apply { setBackgroundColor(Color.rgb(238, 243, 248)) }
        mainMapView = MapView(this).apply {
            visibility = View.INVISIBLE
            onCreate(savedInstanceState)
        }
        root.addView(
            mainMapView,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        )
        mainMapView.getMapAsync { configureMainMap(it) }

        webView = WebView(this).apply { setBackgroundColor(Color.TRANSPARENT) }
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

        webView.setOnTouchListener { _, event ->
            if (!mainMapEnabled || mainMapView.visibility != View.VISIBLE) return@setOnTouchListener false
            val boundary = webView.height * mainMapTouchBoundaryRatio
            val headerGuard = dp(88).toFloat()
            val interactiveTopGuard = webView.height * mainMapTouchTopBoundaryRatio
            val touchTop = maxOf(headerGuard, interactiveTopGuard)
            if (event.actionMasked == MotionEvent.ACTION_DOWN) {
                forwardingMapGesture = event.y > touchTop && event.y < boundary
            }
            if (!forwardingMapGesture) return@setOnTouchListener false
            val copy = MotionEvent.obtain(event)
            val handled = mainMapView.dispatchTouchEvent(copy)
            copy.recycle()
            if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL) {
                forwardingMapGesture = false
            }
            handled || true
        }

        ensureRideOfferChannel()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        webView.addJavascriptInterface(FastNativeBridge(), "FastNative")
        root.addView(
            webView,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        )
        setContentView(root)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val now = System.currentTimeMillis()
                if (now - lastBackPressAt <= BACK_EXIT_WINDOW_MS) {
                    finish()
                    return
                }
                lastBackPressAt = now
                Toast.makeText(
                    this@MainActivity,
                    "Appuyez encore sur Retour pour quitter FAST.",
                    Toast.LENGTH_SHORT,
                ).show()
            }
        })
        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html")

        ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION), 1001)
    }

    private fun configureMainMap(map: GoogleMap) {
        mainGoogleMap = map
        mainMapLoaded = false
        Log.i(MAIN_MAP_TAG, "map_ready")
        map.mapType = GoogleMap.MAP_TYPE_NORMAL
        map.isTrafficEnabled = true
        map.isBuildingsEnabled = true
        map.uiSettings.apply {
            isScrollGesturesEnabled = true
            isZoomGesturesEnabled = true
            isRotateGesturesEnabled = true
            isTiltGesturesEnabled = true
            isCompassEnabled = true
            isZoomControlsEnabled = true
            isMapToolbarEnabled = false
            isMyLocationButtonEnabled = false
        }
        enableMainLocationLayer()
        updateMainMapPadding()
        armMainMapLoadedCallback()
    }

    private fun armMainMapLoadedCallback() {
        val map = mainGoogleMap ?: return
        map.setOnMapLoadedCallback {
            mainMapLoaded = true
            Log.i(MAIN_MAP_TAG, "map_loaded")
        }
    }

    @SuppressLint("MissingPermission")
    private fun enableMainLocationLayer() {
        val map = mainGoogleMap ?: return
        val allowed = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (allowed) runCatching { map.isMyLocationEnabled = true }
    }

    private fun updateMainMapPadding() {
        val map = mainGoogleMap ?: return
        if (!::webView.isInitialized || webView.height <= 0) return
        val boundaryPx = (webView.height * mainMapTouchBoundaryRatio).toInt()
        val bottom = (webView.height - boundaryPx + dp(12)).coerceAtLeast(dp(82))
        map.setPadding(dp(8), dp(92), dp(10), bottom)
    }

    private fun setMainCamera(lat: Double, lng: Double, zoom: Double) {
        if (!lat.isFinite() || !lng.isFinite()) return
        val map = mainGoogleMap ?: return
        val safeZoom = zoom.takeIf { it.isFinite() }?.toFloat()?.coerceIn(3f, 20f) ?: 15f
        map.animateCamera(CameraUpdateFactory.newLatLngZoom(LatLng(lat, lng), safeZoom))
    }

    private fun fitMainBounds(minLat: Double, minLng: Double, maxLat: Double, maxLng: Double) {
        if (!listOf(minLat, minLng, maxLat, maxLng).all { it.isFinite() }) return
        val map = mainGoogleMap ?: return
        val southWest = LatLng(kotlin.math.min(minLat, maxLat), kotlin.math.min(minLng, maxLng))
        val northEast = LatLng(kotlin.math.max(minLat, maxLat), kotlin.math.max(minLng, maxLng))
        if (southWest == northEast) {
            map.animateCamera(CameraUpdateFactory.newLatLngZoom(southWest, 15f))
            return
        }
        runCatching {
            map.animateCamera(CameraUpdateFactory.newLatLngBounds(LatLngBounds(southWest, northEast), dp(72)))
        }
    }

    private fun updateMainMarkers(
        hasPickup: Boolean,
        pickupLat: Double,
        pickupLng: Double,
        hasDestination: Boolean,
        destinationLat: Double,
        destinationLng: Double,
    ) {
        val map = mainGoogleMap ?: return
        mainPickupMarker?.remove()
        mainDestinationMarker?.remove()
        mainPickupMarker = null
        mainDestinationMarker = null
        if (hasPickup && pickupLat.isFinite() && pickupLng.isFinite()) {
            mainPickupMarker = map.addMarker(
                MarkerOptions()
                    .position(LatLng(pickupLat, pickupLng))
                    .title("Départ")
                    .icon(BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_AZURE))
            )
        }
        if (hasDestination && destinationLat.isFinite() && destinationLng.isFinite()) {
            mainDestinationMarker = map.addMarker(
                MarkerOptions()
                    .position(LatLng(destinationLat, destinationLng))
                    .title("Destination")
                    .icon(BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_RED))
            )
        }
    }

    private fun updateMainRoute(encoded: String) {
        val map = mainGoogleMap ?: return
        mainRoutePolyline?.remove()
        mainRoutePolyline = null
        val points = decodePolyline(encoded)
        if (points.size < 2) return
        mainRoutePolyline = map.addPolyline(
            PolylineOptions()
                .addAll(points)
                .color(Color.rgb(11, 87, 208))
                .width(dp(7).toFloat())
                .geodesic(false)
        )
    }

    private fun updateNearbyDrivers(json: String) {
        val map = mainGoogleMap ?: return
        mainNearbyMarkers.forEach { it.remove() }
        mainNearbyMarkers.clear()
        runCatching {
            val rows = JSONArray(json)
            for (i in 0 until rows.length()) {
                val item = rows.optJSONObject(i) ?: continue
                val lat = item.optDouble("lat", Double.NaN)
                val lng = item.optDouble("lng", Double.NaN)
                if (!lat.isFinite() || !lng.isFinite()) continue
                map.addMarker(
                    MarkerOptions()
                        .position(LatLng(lat, lng))
                        .title("Chauffeur FAST")
                        .icon(BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_BLUE))
                )?.let(mainNearbyMarkers::add)
            }
        }
    }

    private fun updateMainDriver(lat: Double, lng: Double) {
        if (!lat.isFinite() || !lng.isFinite()) return
        val map = mainGoogleMap ?: return
        val target = LatLng(lat, lng)
        val marker = mainDriverMarker
        if (marker == null) {
            mainDriverMarker = map.addMarker(
                MarkerOptions()
                    .position(target)
                    .title("Votre chauffeur FAST")
                    .icon(BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_BLUE))
                    .zIndex(20f)
            )
            return
        }

        marker.isVisible = true
        val start = marker.position
        val latDelta = target.latitude - start.latitude
        val lngDelta = target.longitude - start.longitude
        if (kotlin.math.abs(latDelta) > 0.05 || kotlin.math.abs(lngDelta) > 0.05) {
            mainDriverAnimator?.cancel()
            marker.position = target
            return
        }

        mainDriverAnimator?.cancel()
        mainDriverAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 900L
            addUpdateListener { animation ->
                val t = animation.animatedFraction.toDouble()
                marker.position = LatLng(
                    start.latitude + latDelta * t,
                    start.longitude + lngDelta * t,
                )
            }
            start()
        }
    }

    private fun decodePolyline(encoded: String): List<LatLng> {
        if (encoded.isBlank()) return emptyList()
        val result = ArrayList<LatLng>()
        var index = 0
        var lat = 0
        var lng = 0
        while (index < encoded.length) {
            var b: Int
            var shift = 0
            var value = 0
            do {
                if (index >= encoded.length) return result
                b = encoded[index++].code - 63
                value = value or ((b and 0x1f) shl shift)
                shift += 5
            } while (b >= 0x20)
            lat += if ((value and 1) != 0) (value shr 1).inv() else value shr 1

            shift = 0
            value = 0
            do {
                if (index >= encoded.length) return result
                b = encoded[index++].code - 63
                value = value or ((b and 0x1f) shl shift)
                shift += 5
            } while (b >= 0x20)
            lng += if ((value and 1) != 0) (value shr 1).inv() else value shr 1
            result += LatLng(lat / 1e5, lng / 1e5)
        }
        return result
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun ensureRideOfferChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            RIDE_OFFER_CHANNEL_ID,
            "Courses FAST disponibles",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Notifications envoyées aux chauffeurs lorsqu’une nouvelle course FAST est disponible."
            enableVibration(true)
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun showRideOfferNotification(offerId: String, title: String, message: String) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return

        val notificationId = (offerId.hashCode() and Int.MAX_VALUE).takeIf { it != 0 } ?: 2001
        val openApp = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            notificationId,
            openApp,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(this, RIDE_OFFER_CHANNEL_ID)
            .setSmallIcon(R.drawable.fast_logo)
            .setContentTitle(title.take(80))
            .setContentText(message.take(220))
            .setStyle(NotificationCompat.BigTextStyle().bigText(message.take(500)))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setVibrate(longArrayOf(0, 250, 120, 250))
            .build()
        NotificationManagerCompat.from(this).notify(notificationId, notification)
    }

    override fun onStart() {
        super.onStart()
        if (::mainMapView.isInitialized) mainMapView.onStart()
    }

    override fun onResume() {
        super.onResume()
        if (::mainMapView.isInitialized) mainMapView.onResume()
        if (::webView.isInitialized) webView.evaluateJavascript("window.FAST_RESUME && window.FAST_RESUME()", null)
    }

    override fun onPause() {
        if (::mainMapView.isInitialized) mainMapView.onPause()
        super.onPause()
    }

    override fun onStop() {
        if (::mainMapView.isInitialized) mainMapView.onStop()
        super.onStop()
    }

    override fun onLowMemory() {
        super.onLowMemory()
        if (::mainMapView.isInitialized) mainMapView.onLowMemory()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        if (::mainMapView.isInitialized) mainMapView.onSaveInstanceState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 1001) {
            enableMainLocationLayer()
            val granted = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
            if (::webView.isInitialized) {
                webView.evaluateJavascript("window.FAST_LOCATION_PERMISSION_CHANGED && window.FAST_LOCATION_PERMISSION_CHANGED($granted)", null)
            }
        }
    }

    override fun onDestroy() {
        mainDriverAnimator?.cancel()
        mainDriverAnimator = null
        fileCallback?.onReceiveValue(null)
        fileCallback = null
        if (::webView.isInitialized) {
            webView.removeJavascriptInterface("FastNative")
            webView.stopLoading()
            webView.loadUrl("about:blank")
            webView.removeAllViews()
            webView.destroy()
        }
        if (::mainMapView.isInitialized) mainMapView.onDestroy()
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
        fun googleMapsApiKey(): String = BuildConfig.GOOGLE_MAPS_API_KEY

        @JavascriptInterface
        fun nativeMainMapAvailable(): Boolean = BuildConfig.MAPS_NATIVE_CONFIGURED

        @JavascriptInterface
        fun nativeMainMapLoaded(): Boolean = mainMapLoaded

        @JavascriptInterface
        fun enableMainMap(lat: Double, lng: Double, zoom: Double) {
            if (!BuildConfig.MAPS_NATIVE_CONFIGURED) return
            runOnUiThread {
                mainMapEnabled = true
                mainMapLoaded = false
                mainMapView.visibility = View.VISIBLE
                mainMapView.requestLayout()
                mainMapView.invalidate()
                armMainMapLoadedCallback()
                setMainCamera(lat, lng, zoom)
                updateMainMapPadding()
                mainMapView.post {
                    mainMapView.requestLayout()
                    mainMapView.invalidate()
                    updateMainMapPadding()
                }
            }
        }

        @JavascriptInterface
        fun setMainMapTouchBoundary(topCssPx: Double, viewportCssPx: Double) {
            if (!topCssPx.isFinite() || !viewportCssPx.isFinite() || viewportCssPx <= 0) return
            val ratio = (topCssPx / viewportCssPx).toFloat().coerceIn(0.22f, 0.94f)
            runOnUiThread {
                mainMapTouchBoundaryRatio = ratio
                updateMainMapPadding()
            }
        }

        @JavascriptInterface
        fun setMainMapTouchTopBoundary(bottomCssPx: Double, viewportCssPx: Double) {
            if (!bottomCssPx.isFinite() || !viewportCssPx.isFinite() || viewportCssPx <= 0) return
            val ratio = (bottomCssPx / viewportCssPx).toFloat().coerceIn(0f, 0.80f)
            runOnUiThread {
                mainMapTouchTopBoundaryRatio = ratio
            }
        }

        @JavascriptInterface
        fun setMainMapCamera(lat: Double, lng: Double, zoom: Double) {
            runOnUiThread { setMainCamera(lat, lng, zoom) }
        }

        @JavascriptInterface
        fun fitMainMapBounds(minLat: Double, minLng: Double, maxLat: Double, maxLng: Double) {
            runOnUiThread { fitMainBounds(minLat, minLng, maxLat, maxLng) }
        }

        @JavascriptInterface
        fun setMainMapMarkers(
            hasPickup: Boolean,
            pickupLat: Double,
            pickupLng: Double,
            hasDestination: Boolean,
            destinationLat: Double,
            destinationLng: Double,
        ) {
            runOnUiThread {
                updateMainMarkers(hasPickup, pickupLat, pickupLng, hasDestination, destinationLat, destinationLng)
            }
        }

        @JavascriptInterface
        fun setMainMapRoute(polyline: String) {
            runOnUiThread { updateMainRoute(polyline) }
        }

        @JavascriptInterface
        fun setMainMapNearbyDrivers(json: String) {
            runOnUiThread { updateNearbyDrivers(json) }
        }

        @JavascriptInterface
        fun clearMainMapNearbyDrivers() {
            runOnUiThread {
                mainNearbyMarkers.forEach { it.remove() }
                mainNearbyMarkers.clear()
            }
        }

        @JavascriptInterface
        fun setMainMapDriverLocation(lat: Double, lng: Double) {
            runOnUiThread { updateMainDriver(lat, lng) }
        }

        @JavascriptInterface
        fun notifyRideOffer(offerId: String, title: String, message: String) {
            if (offerId.isBlank() || title.isBlank() || message.isBlank()) return
            runOnUiThread { showRideOfferNotification(offerId, title, message) }
        }

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

    companion object {
        private const val RIDE_OFFER_CHANNEL_ID = "fast_ride_offers"
        private const val MAIN_MAP_TAG = "FAST_NATIVE_MAIN"
        private const val BACK_EXIT_WINDOW_MS = 2_000L
    }
}

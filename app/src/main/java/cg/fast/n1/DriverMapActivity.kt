package cg.fast.n1

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.GoogleMap
import com.google.android.gms.maps.MapView
import com.google.android.gms.maps.OnMapReadyCallback
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.LatLngBounds
import com.google.android.gms.maps.model.MarkerOptions
import com.google.android.gms.maps.model.PolylineOptions

class DriverMapActivity : AppCompatActivity(), OnMapReadyCallback {
    private lateinit var mapView: MapView
    private var destination: LatLng? = null
    private var current: LatLng? = null
    private var routePolyline: String = ""
    private var etaMin: Double = 0.0
    private var distanceKm: Double = 0.0
    private var phase: String = "to_destination"
    private var targetLabel: String = "Destination"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val destinationLat = intent.getDoubleExtra(EXTRA_DESTINATION_LAT, Double.NaN)
        val destinationLng = intent.getDoubleExtra(EXTRA_DESTINATION_LNG, Double.NaN)
        if (!destinationLat.isFinite() || !destinationLng.isFinite()) {
            finish()
            return
        }
        destination = LatLng(destinationLat, destinationLng)

        if (intent.getBooleanExtra(EXTRA_HAS_CURRENT, false)) {
            val currentLat = intent.getDoubleExtra(EXTRA_CURRENT_LAT, Double.NaN)
            val currentLng = intent.getDoubleExtra(EXTRA_CURRENT_LNG, Double.NaN)
            if (currentLat.isFinite() && currentLng.isFinite()) current = LatLng(currentLat, currentLng)
        }

        routePolyline = intent.getStringExtra(EXTRA_POLYLINE).orEmpty()
        etaMin = intent.getDoubleExtra(EXTRA_ETA_MIN, 0.0)
        distanceKm = intent.getDoubleExtra(EXTRA_DISTANCE_KM, 0.0)
        phase = intent.getStringExtra(EXTRA_PHASE).orEmpty().ifBlank { "to_destination" }
        targetLabel = intent.getStringExtra(EXTRA_TARGET_LABEL).orEmpty().ifBlank {
            if (phase == "to_pickup") "Point de prise en charge" else "Destination"
        }

        if (!BuildConfig.MAPS_NATIVE_CONFIGURED) {
            openGoogleMapsFallback(destination!!)
            finish()
            return
        }

        window.statusBarColor = Color.WHITE
        window.navigationBarColor = Color.WHITE
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR

        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.rgb(238, 243, 248))
        }
        mapView = MapView(this)
        root.addView(
            mapView,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        )
        addOverlay(root)
        setContentView(root)

        mapView.onCreate(savedInstanceState)
        mapView.getMapAsync(this)
    }

    override fun onMapReady(map: GoogleMap) {
        Log.i(TAG, "map_ready")
        map.mapType = GoogleMap.MAP_TYPE_NORMAL
        map.isTrafficEnabled = true
        map.isBuildingsEnabled = true
        map.uiSettings.apply {
            isScrollGesturesEnabled = true
            isZoomGesturesEnabled = true
            isRotateGesturesEnabled = true
            isTiltGesturesEnabled = true
            isCompassEnabled = true
            isMapToolbarEnabled = false
            isZoomControlsEnabled = false
            isMyLocationButtonEnabled = true
        }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        ) {
            runCatching { map.isMyLocationEnabled = true }
        }

        val destinationPoint = destination ?: return
        map.addMarker(
            MarkerOptions()
                .position(destinationPoint)
                .title(targetLabel)
                .icon(BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_RED))
        )

        current?.let {
            map.addMarker(
                MarkerOptions()
                    .position(it)
                    .title("Votre position")
                    .icon(BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_AZURE))
            )
        }

        val routePoints = decodePolyline(routePolyline)
        if (routePoints.size >= 2) {
            map.addPolyline(
                PolylineOptions()
                    .addAll(routePoints)
                    .color(Color.rgb(11, 87, 208))
                    .width(dp(7).toFloat())
                    .geodesic(false)
            )
        }

        val cameraPoints = buildList {
            addAll(routePoints)
            current?.let(::add)
            add(destinationPoint)
        }
        moveCameraToRoute(map, cameraPoints)
        map.setPadding(0, dp(88), 0, dp(138))
        map.setOnMapLoadedCallback { Log.i(TAG, "map_loaded") }
    }

    private fun moveCameraToRoute(map: GoogleMap, points: List<LatLng>) {
        val unique = points.distinctBy { "${it.latitude}:${it.longitude}" }
        if (unique.size <= 1) {
            val focus = unique.firstOrNull() ?: destination ?: return
            map.moveCamera(CameraUpdateFactory.newLatLngZoom(focus, 16f))
            return
        }
        val builder = LatLngBounds.Builder()
        unique.forEach(builder::include)
        map.moveCamera(
            CameraUpdateFactory.newLatLngBounds(
                builder.build(),
                resources.displayMetrics.widthPixels,
                resources.displayMetrics.heightPixels,
                dp(52),
            )
        )
    }

    private fun addOverlay(root: FrameLayout) {
        val back = TextView(this).apply {
            text = "‹  FAST"
            textSize = 16f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.rgb(15, 23, 42))
            gravity = Gravity.CENTER
            setPadding(dp(16), 0, dp(16), 0)
            background = roundedBackground(Color.WHITE, 18f)
            elevation = dp(8).toFloat()
            setOnClickListener { finish() }
        }
        root.addView(
            back,
            FrameLayout.LayoutParams(dp(94), dp(50)).apply {
                gravity = Gravity.TOP or Gravity.START
                leftMargin = dp(16)
                topMargin = dp(18)
            }
        )

        val info = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(18), dp(13), dp(18), dp(13))
            background = roundedBackground(Color.WHITE, 20f)
            elevation = dp(10).toFloat()
        }
        val phaseLabel = TextView(this).apply {
            text = if (phase == "to_pickup") "VERS LE CLIENT" else "VERS LA DESTINATION"
            textSize = 11f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.rgb(11, 87, 208))
        }
        val title = TextView(this).apply {
            text = targetLabel
            textSize = 17f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.rgb(15, 23, 42))
            maxLines = 1
        }
        val detail = TextView(this).apply {
            val eta = if (etaMin > 0) "${kotlin.math.max(1, kotlin.math.round(etaMin).toInt())} min" else "Navigation active"
            val distance = if (distanceKm > 0) " · ${"%.1f".format(distanceKm)} km" else ""
            text = eta + distance
            textSize = 14f
            setTextColor(Color.rgb(71, 85, 105))
        }
        info.addView(phaseLabel)
        info.addView(title)
        info.addView(detail)
        root.addView(
            info,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                gravity = Gravity.BOTTOM
                leftMargin = dp(16)
                rightMargin = dp(16)
                bottomMargin = dp(18)
            }
        )
    }

    private fun roundedBackground(color: Int, radiusDp: Float): GradientDrawable = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        setColor(color)
        cornerRadius = dp(radiusDp.toInt()).toFloat()
    }

    private fun openGoogleMapsFallback(target: LatLng) {
        val nativeIntent = Intent(Intent.ACTION_VIEW, Uri.parse("google.navigation:q=${target.latitude},${target.longitude}&mode=d")).apply {
            setPackage("com.google.android.apps.maps")
        }
        val opened = runCatching { startActivity(nativeIntent) }.isSuccess
        if (!opened) {
            val fallback = Uri.parse("https://www.google.com/maps/dir/?api=1&destination=${target.latitude},${target.longitude}&travelmode=driving&dir_action=navigate")
            runCatching { startActivity(Intent(Intent.ACTION_VIEW, fallback)) }
        }
    }

    private fun decodePolyline(encoded: String): List<LatLng> {
        if (encoded.isBlank()) return emptyList()
        val points = ArrayList<LatLng>()
        var index = 0
        var lat = 0
        var lng = 0
        try {
            while (index < encoded.length) {
                var result = 0
                var shift = 0
                var b: Int
                do {
                    b = encoded[index++].code - 63
                    result = result or ((b and 0x1f) shl shift)
                    shift += 5
                } while (b >= 0x20 && index < encoded.length)
                val dLat = if ((result and 1) != 0) (result shr 1).inv() else result shr 1
                lat += dLat

                result = 0
                shift = 0
                do {
                    b = encoded[index++].code - 63
                    result = result or ((b and 0x1f) shl shift)
                    shift += 5
                } while (b >= 0x20 && index < encoded.length)
                val dLng = if ((result and 1) != 0) (result shr 1).inv() else result shr 1
                lng += dLng
                points += LatLng(lat / 1e5, lng / 1e5)
            }
        } catch (_: Exception) {
            return emptyList()
        }
        return points
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    override fun onResume() {
        super.onResume()
        if (::mapView.isInitialized) mapView.onResume()
    }

    override fun onStart() {
        super.onStart()
        if (::mapView.isInitialized) mapView.onStart()
    }

    override fun onPause() {
        if (::mapView.isInitialized) mapView.onPause()
        super.onPause()
    }

    override fun onStop() {
        if (::mapView.isInitialized) mapView.onStop()
        super.onStop()
    }

    override fun onDestroy() {
        if (::mapView.isInitialized) mapView.onDestroy()
        super.onDestroy()
    }

    override fun onLowMemory() {
        super.onLowMemory()
        if (::mapView.isInitialized) mapView.onLowMemory()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (::mapView.isInitialized) mapView.onSaveInstanceState(outState)
    }

    companion object {
        private const val TAG = "FAST_NATIVE_MAP"
        const val EXTRA_DESTINATION_LAT = "destination_lat"
        const val EXTRA_DESTINATION_LNG = "destination_lng"
        const val EXTRA_CURRENT_LAT = "current_lat"
        const val EXTRA_CURRENT_LNG = "current_lng"
        const val EXTRA_HAS_CURRENT = "has_current"
        const val EXTRA_POLYLINE = "polyline"
        const val EXTRA_ETA_MIN = "eta_min"
        const val EXTRA_DISTANCE_KM = "distance_km"
        const val EXTRA_PHASE = "phase"
        const val EXTRA_TARGET_LABEL = "target_label"
    }
}

package cg.fast.n1

import android.Manifest
import android.app.ActivityManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.IBinder
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class DriverLocationService : Service() {
    private lateinit var fused: FusedLocationProviderClient
    private val networkExecutor = Executors.newFixedThreadPool(2)
    @Volatile private var running = true
    private var lastSentAt = 0L
    private var lastOfferId: String? = null

    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            val location = result.lastLocation ?: return
            val token = accessToken()
            if (token.isBlank()) return

            val now = System.currentTimeMillis()
            if (location.accuracy > 120f && now - lastSentAt < 12_000L) return
            if (now - lastSentAt < 2_500L) return

            val body = JSONObject().apply {
                put("lat", location.latitude)
                put("lng", location.longitude)
                put("accuracy_m", location.accuracy.toDouble())
                if (location.hasBearing()) put("heading", location.bearing.toDouble())
                if (location.hasSpeed()) put("speed_kmh", location.speed * 3.6)
            }
            lastSentAt = now
            networkExecutor.execute { postLocation(token, body) }
        }
    }

    override fun onCreate() {
        super.onCreate()
        fused = LocationServices.getFusedLocationProviderClient(this)
        createChannels()
        val intent = Intent(this, MainActivity::class.java)
        val pending = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val notification = NotificationCompat.Builder(this, "fast_driver_tracking")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle("FAST chauffeur en ligne")
            .setContentText("GPS haute précision et réception des courses actifs")
            .setOngoing(true)
            .setContentIntent(pending)
            .build()
        startForeground(301, notification)
        startTracking()
        startOfferPolling()
    }

    private fun accessToken(): String =
        getSharedPreferences("fast", MODE_PRIVATE).getString("access_token", "") ?: ""

    private fun isAppInForeground(): Boolean {
        val info = ActivityManager.RunningAppProcessInfo()
        ActivityManager.getMyMemoryState(info)
        return info.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND ||
            info.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_VISIBLE
    }

    private fun postLocation(token: String, body: JSONObject) {
        try {
            val conn = URL(BuildConfig.PYTHON_API_URL + "/v1/driver/location").openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.connectTimeout = 6000
            conn.readTimeout = 6000
            conn.doOutput = true
            conn.setRequestProperty("Authorization", "Bearer $token")
            conn.setRequestProperty("Content-Type", "application/json")
            conn.outputStream.use { it.write(body.toString().toByteArray()) }
            val code = conn.responseCode
            if (code in 200..299) conn.inputStream.close() else conn.errorStream?.close()
            conn.disconnect()
        } catch (_: Exception) { }
    }

    private fun startOfferPolling() {
        networkExecutor.execute {
            while (running) {
                val token = accessToken()
                // Le WebView interroge déjà les offres quand l'app est visible.
                // On garde le polling natif uniquement en arrière-plan pour éviter le trafic en double.
                if (token.isNotBlank() && !isAppInForeground()) pollCurrentOffer(token)
                try { Thread.sleep(6000L) } catch (_: InterruptedException) { break }
            }
        }
    }

    private fun pollCurrentOffer(token: String) {
        try {
            val conn = URL(BuildConfig.PYTHON_API_URL + "/v1/driver/offers/current").openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.connectTimeout = 6000
            conn.readTimeout = 6000
            conn.setRequestProperty("Authorization", "Bearer $token")
            conn.setRequestProperty("Accept", "application/json")
            val code = conn.responseCode
            if (code !in 200..299) {
                conn.errorStream?.close(); conn.disconnect(); return
            }
            val text = conn.inputStream.bufferedReader().use { it.readText() }
            conn.disconnect()
            val offer = JSONObject(text).optJSONObject("offer") ?: return
            val id = offer.optString("id")
            if (id.isBlank() || id == lastOfferId) return
            lastOfferId = id
            val distance = offer.optDouble("distance_km", 0.0)
            val eta = offer.optInt("eta_min", 0)
            notifyOffer(id, "Nouvelle course FAST", "Passager à %.1f km • ETA %d min".format(distance, eta))
        } catch (_: Exception) { }
    }

    private fun notifyOffer(offerId: String, title: String, body: String) {
        val intent = Intent(this, MainActivity::class.java).apply {
            putExtra("fast_offer_id", offerId)
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pending = PendingIntent.getActivity(
            this,
            offerId.hashCode(),
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val notification = NotificationCompat.Builder(this, "fast_driver_offers")
            .setSmallIcon(android.R.drawable.ic_dialog_map)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .setVibrate(longArrayOf(0, 250, 120, 250))
            .build()
        if (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
            NotificationManagerCompat.from(this).notify(offerId.hashCode(), notification)
        }
    }

    private fun startTracking() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
            ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) return

        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 4000L)
            .setMinUpdateIntervalMillis(2500L)
            .setMaxUpdateDelayMillis(8000L)
            .setMinUpdateDistanceMeters(6f)
            .setWaitForAccurateLocation(true)
            .build()
        fused.requestLocationUpdates(request, callback, mainLooper)
    }

    private fun createChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(NotificationChannel("fast_driver_tracking", "FAST GPS chauffeur", NotificationManager.IMPORTANCE_LOW))
            manager.createNotificationChannel(NotificationChannel("fast_driver_offers", "FAST nouvelles courses", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Nouvelles courses FAST même lorsque l'application est en arrière-plan"
                enableVibration(true)
            })
        }
    }

    override fun onDestroy() {
        running = false
        fused.removeLocationUpdates(callback)
        networkExecutor.shutdownNow()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}

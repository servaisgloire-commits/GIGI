package cg.fast.n1

import android.Manifest
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
    private val executor = Executors.newSingleThreadExecutor()
    private var lastSentAt = 0L

    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            val location = result.lastLocation ?: return
            val token = getSharedPreferences("fast", MODE_PRIVATE).getString("access_token", "") ?: ""
            if (token.isBlank()) return

            // Reject very poor fixes when a more useful GPS point is likely to arrive immediately.
            if (location.accuracy > 120f && System.currentTimeMillis() - lastSentAt < 10_000L) return

            val body = JSONObject().apply {
                put("lat", location.latitude)
                put("lng", location.longitude)
                put("accuracy_m", location.accuracy.toDouble())
                if (location.hasBearing()) put("heading", location.bearing.toDouble())
                if (location.hasSpeed()) put("speed_kmh", location.speed * 3.6)
            }
            lastSentAt = System.currentTimeMillis()
            executor.execute {
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
        }
    }

    override fun onCreate() {
        super.onCreate()
        fused = LocationServices.getFusedLocationProviderClient(this)
        createChannel()
        val intent = Intent(this, MainActivity::class.java)
        val pending = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val notification = NotificationCompat.Builder(this, "fast_driver_tracking")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle("FAST chauffeur en ligne")
            .setContentText("GPS haute précision actif • suivi de course en temps réel")
            .setOngoing(true)
            .setContentIntent(pending)
            .build()
        startForeground(301, notification)
        startTracking()
    }

    private fun startTracking() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
            ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) return

        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 3000L)
            .setMinUpdateIntervalMillis(1500L)
            .setMaxUpdateDelayMillis(5000L)
            .setMinUpdateDistanceMeters(4f)
            .setWaitForAccurateLocation(true)
            .build()
        fused.requestLocationUpdates(request, callback, mainLooper)
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel("fast_driver_tracking", "FAST GPS chauffeur", NotificationManager.IMPORTANCE_LOW)
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    override fun onDestroy() {
        fused.removeLocationUpdates(callback)
        executor.shutdownNow()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}

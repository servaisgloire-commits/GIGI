package cg.fast.n1

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class DriverOfferService : Service() {
    private val running = AtomicBoolean(false)
    private val executor = Executors.newSingleThreadScheduledExecutor()
    private val prefs by lazy { getSharedPreferences(PREFS, MODE_PRIVATE) }

    override fun onCreate() {
        super.onCreate()
        ensureChannels()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            prefs.edit().putBoolean(KEY_ENABLED, false).apply()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE)
            } else {
                @Suppress("DEPRECATION")
                stopForeground(true)
            }
            stopSelf()
            return START_NOT_STICKY
        }

        val incoming = intent?.getStringExtra(EXTRA_SESSION).orEmpty()
        if (incoming.isNotBlank()) saveSession(incoming)

        if (readSession().isBlank()) {
            stopSelf()
            return START_NOT_STICKY
        }

        prefs.edit().putBoolean(KEY_ENABLED, true).apply()
        startForeground(MONITOR_NOTIFICATION_ID, monitorNotification())

        if (running.compareAndSet(false, true)) {
            executor.scheduleWithFixedDelay(
                { runCatching { pollCurrentOffer() } },
                0,
                POLL_SECONDS,
                TimeUnit.SECONDS,
            )
        }
        return START_STICKY
    }

    override fun onDestroy() {
        running.set(false)
        executor.shutdownNow()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun ensureChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(
                MONITOR_CHANNEL_ID,
                "FAST chauffeur en ligne",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "Maintient la réception des nouvelles courses lorsque FAST est en arrière-plan."
                setShowBadge(false)
            },
        )
        manager.createNotificationChannel(
            NotificationChannel(
                OFFER_CHANNEL_ID,
                "Courses FAST disponibles",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Notifications de nouvelles courses FAST."
                enableVibration(true)
            },
        )
    }

    private fun monitorNotification() =
        NotificationCompat.Builder(this, MONITOR_CHANNEL_ID)
            .setSmallIcon(R.drawable.fast_logo)
            .setContentTitle("FAST chauffeur en ligne")
            .setContentText("Réception des nouvelles courses active en arrière-plan.")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(openFastPendingIntent(MONITOR_NOTIFICATION_ID))
            .build()

    private fun pollCurrentOffer() {
        var session = parseSession(readSession()) ?: return
        var accessToken = session.optString("access_token")
        if (accessToken.isBlank()) return

        var response = requestCurrentOffer(accessToken)
        if (response.code == 401) {
            session = refreshSession(session) ?: return
            accessToken = session.optString("access_token")
            if (accessToken.isBlank()) return
            response = requestCurrentOffer(accessToken)
        }
        if (response.code !in 200..299 || response.body.isBlank()) return

        val root = runCatching { JSONObject(response.body) }.getOrNull() ?: return
        val offer = root.optJSONObject("offer") ?: return
        val offerId = offer.optString("id").trim()
        if (offerId.isBlank()) return
        if (prefs.getString(KEY_LAST_OFFER, "") == offerId) return

        val ride = root.optJSONObject("ride")
        val pickup = ride?.optString("pickup_address").orEmpty().ifBlank { "Départ" }
        val destination = ride?.optString("destination_address").orEmpty().ifBlank { "Destination" }
        val price = offer.optDouble("offered_price", Double.NaN)
        val currency = offer.optString("currency").ifBlank { ride?.optString("currency").orEmpty().ifBlank { "XAF" } }
        val amount = if (price.isFinite() && price > 0) " • ${Math.round(price)} $currency" else ""
        if (notifyOffer(offerId, "Nouvelle course FAST", "$pickup → $destination$amount")) {
            prefs.edit().putString(KEY_LAST_OFFER, offerId).apply()
        }
    }

    private fun requestCurrentOffer(accessToken: String): HttpResult =
        request(
            url = "${BuildConfig.PYTHON_API_URL.trimEnd('/')}/v1/driver/offers/current",
            method = "GET",
            accessToken = accessToken,
        )

    private fun refreshSession(current: JSONObject): JSONObject? {
        val refreshToken = current.optString("refresh_token").trim()
        if (refreshToken.isBlank() || BuildConfig.SUPABASE_PUBLISHABLE_KEY.isBlank()) return null
        val body = JSONObject().put("refresh_token", refreshToken).toString()
        val response = request(
            url = "${BuildConfig.SUPABASE_URL.trimEnd('/')}/auth/v1/token?grant_type=refresh_token",
            method = "POST",
            headers = mapOf(
                "apikey" to BuildConfig.SUPABASE_PUBLISHABLE_KEY,
                "Content-Type" to "application/json",
            ),
            body = body,
        )
        if (response.code !in 200..299) return null
        val refreshed = runCatching { JSONObject(response.body) }.getOrNull() ?: return null
        val accessToken = refreshed.optString("access_token").trim()
        if (accessToken.isBlank()) return null

        val merged = JSONObject(current.toString())
        merged.put("access_token", accessToken)
        refreshed.optString("refresh_token").takeIf { it.isNotBlank() }?.let { merged.put("refresh_token", it) }
        if (refreshed.has("expires_at")) merged.put("expires_at", refreshed.opt("expires_at"))
        if (refreshed.has("expires_in")) merged.put("expires_in", refreshed.opt("expires_in"))
        if (refreshed.has("user")) merged.put("user", refreshed.opt("user"))
        saveSession(merged.toString())
        return merged
    }

    private fun notifyOffer(offerId: String, title: String, message: String): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS) !=
            android.content.pm.PackageManager.PERMISSION_GRANTED
        ) return false

        val id = (offerId.hashCode() and Int.MAX_VALUE).takeIf { it != 0 } ?: 3201
        val notification = NotificationCompat.Builder(this, OFFER_CHANNEL_ID)
            .setSmallIcon(R.drawable.fast_logo)
            .setContentTitle(title.take(80))
            .setContentText(message.take(220))
            .setStyle(NotificationCompat.BigTextStyle().bigText(message.take(500)))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setAutoCancel(true)
            .setVibrate(longArrayOf(0, 250, 120, 250))
            .setContentIntent(openFastPendingIntent(id))
            .build()
        NotificationManagerCompat.from(this).notify(id, notification)
        return true
    }

    private fun openFastPendingIntent(requestCode: Int): PendingIntent {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        return PendingIntent.getActivity(
            this,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun parseSession(raw: String): JSONObject? =
        runCatching { JSONObject(raw) }.getOrNull()

    private fun readSession(): String {
        val serviceSession = prefs.getString(KEY_SESSION, "").orEmpty()
        if (serviceSession.isNotBlank()) return serviceSession
        return getSharedPreferences(SESSION_PREFS, MODE_PRIVATE)
            .getString(SESSION_PAYLOAD_KEY, "")
            .orEmpty()
    }

    private fun saveSession(raw: String) {
        prefs.edit().putString(KEY_SESSION, raw).apply()
        getSharedPreferences(SESSION_PREFS, MODE_PRIVATE)
            .edit()
            .putString(SESSION_PAYLOAD_KEY, raw)
            .apply()
    }

    private fun request(
        url: String,
        method: String,
        accessToken: String = "",
        headers: Map<String, String> = emptyMap(),
        body: String? = null,
    ): HttpResult {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 6_000
            readTimeout = 8_000
            useCaches = false
            setRequestProperty("Accept", "application/json")
            if (accessToken.isNotBlank()) setRequestProperty("Authorization", "Bearer $accessToken")
            headers.forEach { (key, value) -> setRequestProperty(key, value) }
            if (body != null) {
                doOutput = true
                outputStream.bufferedWriter(Charsets.UTF_8).use { it.write(body) }
            }
        }
        return try {
            val code = connection.responseCode
            val stream = if (code in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            HttpResult(code, text)
        } finally {
            connection.disconnect()
        }
    }

    private data class HttpResult(val code: Int, val body: String)

    companion object {
        const val ACTION_START = "cg.fast.n1.action.START_DRIVER_OFFER_WATCH"
        const val ACTION_STOP = "cg.fast.n1.action.STOP_DRIVER_OFFER_WATCH"
        const val EXTRA_SESSION = "session_json"

        private const val PREFS = "fast.driver.offers"
        private const val KEY_SESSION = "session"
        private const val KEY_ENABLED = "enabled"
        private const val KEY_LAST_OFFER = "last_offer_id"
        private const val SESSION_PREFS = "fast.session.native"
        private const val SESSION_PAYLOAD_KEY = "payload"
        private const val MONITOR_CHANNEL_ID = "fast_driver_background"
        private const val OFFER_CHANNEL_ID = "fast_ride_offers"
        private const val MONITOR_NOTIFICATION_ID = 3100
        private const val POLL_SECONDS = 12L

        fun start(context: Context, sessionJson: String) {
            val intent = Intent(context, DriverOfferService::class.java)
                .setAction(ACTION_START)
                .putExtra(EXTRA_SESSION, sessionJson)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(context, intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_ENABLED, false)
                .remove(KEY_SESSION)
                .apply()
            context.stopService(Intent(context, DriverOfferService::class.java))
        }
    }
}

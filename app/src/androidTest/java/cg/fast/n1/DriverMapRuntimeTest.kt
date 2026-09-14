package cg.fast.n1

import android.content.Context
import android.content.Intent
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DriverMapRuntimeTest {
    @Test
    fun nativeDriverMapLoadsWithProductionConfiguration() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val intent = Intent(context, DriverMapActivity::class.java).apply {
            putExtra(DriverMapActivity.EXTRA_DESTINATION_LAT, -4.2634)
            putExtra(DriverMapActivity.EXTRA_DESTINATION_LNG, 15.2429)
            putExtra(DriverMapActivity.EXTRA_CURRENT_LAT, -4.2793)
            putExtra(DriverMapActivity.EXTRA_CURRENT_LNG, 15.2663)
            putExtra(DriverMapActivity.EXTRA_HAS_CURRENT, true)
            putExtra(DriverMapActivity.EXTRA_POLYLINE, "")
            putExtra(DriverMapActivity.EXTRA_ETA_MIN, 5.0)
            putExtra(DriverMapActivity.EXTRA_DISTANCE_KM, 2.0)
            putExtra(DriverMapActivity.EXTRA_PHASE, "to_destination")
            putExtra(DriverMapActivity.EXTRA_TARGET_LABEL, "FAST Maps runtime check")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        ActivityScenario.launch<DriverMapActivity>(intent).use {
            Thread.sleep(30000)
        }
    }
}

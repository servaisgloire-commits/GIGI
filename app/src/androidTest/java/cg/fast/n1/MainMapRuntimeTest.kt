package cg.fast.n1

import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class MainMapRuntimeTest {
    private fun findWebView(view: View): WebView? {
        if (view is WebView) return view
        if (view is ViewGroup) {
            for (i in 0 until view.childCount) {
                findWebView(view.getChildAt(i))?.let { return it }
            }
        }
        return null
    }

    @Test
    fun mainMapUsesContinuousGoogleSurfaceWithoutIframeReloadLayer() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            val launchLatch = CountDownLatch(1)
            scenario.onActivity { activity ->
                val web = requireNotNull(findWebView(activity.window.decorView.rootView))
                web.evaluateJavascript("(function(){ if(window.showApp){showApp();} if(window.initMap){initMap();} return true; })()") {
                    launchLatch.countDown()
                }
            }
            check(launchLatch.await(5, TimeUnit.SECONDS))
            Thread.sleep(12000)

            val resultLatch = CountDownLatch(1)
            var result = "false"
            scenario.onActivity { activity ->
                val web = requireNotNull(findWebView(activity.window.decorView.rootView))
                val script = """
                    (function(){
                      var host=document.getElementById('map');
                      var continuous=!!(window.google&&google.maps&&state&&state.map&&state.map.provider==='google-live'&&state.map.gmap);
                      var noIframe=!document.querySelector('#map iframe.google-map-frame');
                      var noLegacy=!document.getElementById('fastOneFingerMapSurface');
                      var greedy=continuous && state.map.gmap.get('gestureHandling')==='greedy';
                      return !!(host&&continuous&&noIframe&&noLegacy&&greedy);
                    })()
                """.trimIndent()
                web.evaluateJavascript(script) { value ->
                    result = value
                    resultLatch.countDown()
                }
            }
            check(resultLatch.await(5, TimeUnit.SECONDS))
            assertEquals("true", result)
        }
    }
}

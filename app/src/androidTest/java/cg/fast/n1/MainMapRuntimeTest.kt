package cg.fast.n1

import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertTrue
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
            Thread.sleep(2500)
            val launchLatch = CountDownLatch(1)
            scenario.onActivity { activity ->
                val web = requireNotNull(findWebView(activity.window.decorView.rootView))
                val start = """
                    (function(){
                      try{
                        document.getElementById('auth')?.classList.remove('active');
                        document.getElementById('app')?.classList.add('active');
                        if(window.initMap){ window.initMap(); return 'started'; }
                        return 'missing-init';
                      }catch(e){ return 'start-error:'+String(e&&e.message||e); }
                    })()
                """.trimIndent()
                web.evaluateJavascript(start) { launchLatch.countDown() }
            }
            check(launchLatch.await(5, TimeUnit.SECONDS))
            Thread.sleep(15000)

            val resultLatch = CountDownLatch(1)
            var result = "{}"
            scenario.onActivity { activity ->
                val web = requireNotNull(findWebView(activity.window.decorView.rootView))
                val script = """
                    (function(){
                      var host=document.getElementById('map');
                      var continuous=!!(window.google&&google.maps&&window.state&&state.map&&state.map.provider==='google-live'&&state.map.gmap);
                      var noIframe=!document.querySelector('#map iframe.google-map-frame');
                      var noLegacy=!document.getElementById('fastOneFingerMapSurface');
                      var greedy=continuous && state.map.gmap.get('gestureHandling')==='greedy';
                      var data={
                        host:!!host,
                        google:!!(window.google&&google.maps),
                        provider:(window.state&&state.map&&state.map.provider)||null,
                        continuous:continuous,
                        noIframe:noIframe,
                        noLegacy:noLegacy,
                        greedy:greedy,
                        hasKey:!!(window.FastNative&&FastNative.googleMapsApiKey&&String(FastNative.googleMapsApiKey()||'').length>10)
                      };
                      return JSON.stringify(data);
                    })()
                """.trimIndent()
                web.evaluateJavascript(script) { value ->
                    result = value
                    resultLatch.countDown()
                }
            }
            check(resultLatch.await(5, TimeUnit.SECONDS))
            assertTrue("Continuous map runtime diagnostic: $result", result.contains("\\\"continuous\\\":true") && result.contains("\\\"noIframe\\\":true") && result.contains("\\\"greedy\\\":true"))
        }
    }
}

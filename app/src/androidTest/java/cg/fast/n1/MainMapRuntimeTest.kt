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
                        var auth=document.getElementById('auth');
                        var app=document.getElementById('app');
                        if(auth) auth.classList.remove('active');
                        if(app) app.classList.add('active');
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
                      var appState=(typeof state!=='undefined')?state:null;
                      var continuous=!!(window.google&&google.maps&&appState&&appState.map&&appState.map.provider==='google-live'&&appState.map.gmap);
                      var noIframe=!document.querySelector('#map iframe.google-map-frame');
                      var noLegacy=!document.getElementById('fastOneFingerMapSurface');
                      var greedy=continuous && appState.map.gmap.get('gestureHandling')==='greedy';
                      var googleSurface=!!document.querySelector('#map .gm-style');
                      var noGoogleError=!document.querySelector('#map .gm-err-container,#map .gm-err-content');
                      var data={
                        host:!!host,
                        google:!!(window.google&&google.maps),
                        provider:(appState&&appState.map&&appState.map.provider)||null,
                        continuous:continuous,
                        noIframe:noIframe,
                        noLegacy:noLegacy,
                        greedy:greedy,
                        googleSurface:googleSurface,
                        noGoogleError:noGoogleError,
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
            assertTrue(
                "Continuous map runtime diagnostic: $result",
                result.contains("\\\"continuous\\\":true") &&
                    result.contains("\\\"noIframe\\\":true") &&
                    result.contains("\\\"greedy\\\":true") &&
                    result.contains("\\\"googleSurface\\\":true") &&
                    result.contains("\\\"noGoogleError\\\":true")
            )
        }
    }
}

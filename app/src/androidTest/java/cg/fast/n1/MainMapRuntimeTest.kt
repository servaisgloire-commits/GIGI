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

    private fun evaluate(scenario: ActivityScenario<MainActivity>, script: String, waitSeconds: Long = 6): String {
        val latch = CountDownLatch(1)
        var result = "{}"
        scenario.onActivity { activity ->
            val web = requireNotNull(findWebView(activity.window.decorView.rootView))
            web.evaluateJavascript(script.trimIndent()) { value ->
                result = value
                latch.countDown()
            }
        }
        check(latch.await(waitSeconds, TimeUnit.SECONDS))
        return result
    }

    @Test
    fun mainMapIsVisibleContinuousAndOneFingerReady() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            Thread.sleep(2500)
            evaluate(
                scenario,
                """
                (function(){
                  try{
                    var auth=document.getElementById('auth');
                    var app=document.getElementById('app');
                    if(auth) auth.classList.remove('active');
                    if(app) app.classList.add('active');
                    if(window.initMap) window.initMap();
                    return 'started';
                  }catch(e){ return 'start-error:'+String(e&&e.message||e); }
                })()
                """
            )
            Thread.sleep(7000)

            val result = evaluate(
                scenario,
                """
                (function(){
                  var host=document.getElementById('map');
                  var appState=(typeof state!=='undefined')?state:null;
                  var tiles=[].slice.call(document.querySelectorAll('#map .fast-map-tile'));
                  var loaded=tiles.some(function(img){return img.complete&&img.naturalWidth>0;});
                  var data={
                    host:!!host,
                    provider:(appState&&appState.map&&appState.map.provider)||null,
                    noIframe:!document.querySelector('#map iframe'),
                    noLegacy:!document.getElementById('fastOneFingerMapSurface'),
                    tiles:tiles.length,
                    loaded:loaded,
                    touchAction:host?getComputedStyle(host).touchAction:null,
                    zoomButtons:document.querySelectorAll('#map .fast-map-zoom button').length,
                    canSetView:!!(appState&&appState.map&&typeof appState.map.setView==='function'),
                    canFit:!!(appState&&appState.map&&typeof appState.map.fitBounds==='function')
                  };
                  return JSON.stringify(data);
                })()
                """
            )

            assertTrue(
                "Stable map runtime diagnostic: $result",
                result.contains("\\\"provider\\\":\\\"fast-stable\\\"") &&
                    result.contains("\\\"noIframe\\\":true") &&
                    result.contains("\\\"noLegacy\\\":true") &&
                    result.contains("\\\"loaded\\\":true") &&
                    result.contains("\\\"touchAction\\\":\\\"none\\\"") &&
                    result.contains("\\\"zoomButtons\\\":2") &&
                    result.contains("\\\"canSetView\\\":true") &&
                    result.contains("\\\"canFit\\\":true")
            )
        }
    }

    @Test
    fun clientHomeReturnsAfterCancellationUiReset() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            Thread.sleep(2500)
            val result = evaluate(
                scenario,
                """
                (function(){
                  var auth=document.getElementById('auth');
                  var app=document.getElementById('app');
                  if(auth) auth.classList.remove('active');
                  if(app) app.classList.add('active');
                  var home=document.getElementById('clientHome');
                  var ride=document.getElementById('clientRide');
                  var nav=document.getElementById('bottomNav');
                  if(home){home.classList.add('hidden');home.style.setProperty('--fast-client-sheet-y','300px');}
                  if(ride) ride.classList.remove('hidden');
                  if(nav) nav.style.display='none';
                  if(window.FAST_RESTORE_CLIENT_HOME) window.FAST_RESTORE_CLIENT_HOME();
                  return JSON.stringify({
                    homeVisible:!!home&&!home.classList.contains('hidden'),
                    rideHidden:!!ride&&ride.classList.contains('hidden'),
                    sheetY:home?home.style.getPropertyValue('--fast-client-sheet-y'):null,
                    nav:nav?nav.style.display:null
                  });
                })()
                """
            )
            assertTrue(
                "Cancellation UI recovery diagnostic: $result",
                result.contains("\\\"homeVisible\\\":true") &&
                    result.contains("\\\"rideHidden\\\":true") &&
                    result.contains("\\\"sheetY\\\":\\\"0px\\\"") &&
                    result.contains("\\\"nav\\\":\\\"flex\\\"")
            )
        }
    }
}

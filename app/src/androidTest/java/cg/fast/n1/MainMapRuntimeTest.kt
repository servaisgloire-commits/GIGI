package cg.fast.n1

import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class MainMapRuntimeTest {
    @Test
    fun loginFormExposesPasswordAutofillMetadata() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            Thread.sleep(1500)
            val result = evaluate(scenario, """
                (function(){
                  var username=document.getElementById('loginEmail');
                  var password=document.getElementById('loginPassword');
                  var signup=document.getElementById('signupPassword');
                  return username.name==='username' && username.autocomplete==='username' &&
                    password.name==='password' && password.autocomplete==='current-password' &&
                    signup.autocomplete==='new-password' &&
                    typeof FastNative.commitAutofill==='function';
                })()
            """)
            assertTrue("Login autofill metadata missing: $result", result == "true")
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                scenario.onActivity { activity ->
                    val web = requireNotNull(findWebView(activity.window.decorView.rootView))
                    assertTrue(web.importantForAutofill == View.IMPORTANT_FOR_AUTOFILL_YES)
                }
            }
        }
    }

    private fun findWebView(view: View): WebView? {
        if (view is WebView) return view
        if (view is ViewGroup) {
            for (i in 0 until view.childCount) {
                findWebView(view.getChildAt(i))?.let { return it }
            }
        }
        return null
    }

    private fun grantRuntimePermissions() {
        val automation = InstrumentationRegistry.getInstrumentation().uiAutomation
        listOf(
            "pm grant cg.fast.n1.mobile android.permission.ACCESS_COARSE_LOCATION",
            "pm grant cg.fast.n1.mobile android.permission.ACCESS_FINE_LOCATION",
            "pm grant cg.fast.n1.mobile android.permission.POST_NOTIFICATIONS",
        ).forEach { command ->
            automation.executeShellCommand(command).close()
        }
        Thread.sleep(750)
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
    fun mainMapIsNativeGoogleVisibleAndGestureReady() {
        grantRuntimePermissions()
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            Thread.sleep(3000)
            val start = evaluate(
                scenario,
                """
                (function(){
                  try{
                    var auth=document.getElementById('auth');
                    var app=document.getElementById('app');
                    if(auth) auth.classList.remove('active');
                    if(app) app.classList.add('active');
                    var available=!!(window.FastNative&&FastNative.nativeMainMapAvailable&&FastNative.nativeMainMapAvailable());
                    if(window.initMap) window.initMap();
                    return JSON.stringify({started:true,available:available,hasInit:typeof window.initMap==='function'});
                  }catch(e){ return JSON.stringify({started:false,error:String(e&&e.message||e)}); }
                })()
                """
            )
            assertTrue("Native Google map start diagnostic: $start", start.contains("\\\"available\\\":true"))

            var result = "{}"
            repeat(12) {
                result = evaluate(
                    scenario,
                    """
                    (function(){
                      var host=document.getElementById('map');
                      var appState=(typeof state!=='undefined')?state:null;
                      var bridge=window.FastNative;
                      var data={
                        host:!!host,
                        provider:(appState&&appState.map&&appState.map.provider)||null,
                        nativeAvailable:!!(bridge&&bridge.nativeMainMapAvailable&&bridge.nativeMainMapAvailable()),
                        nativeLoaded:!!(bridge&&bridge.nativeMainMapLoaded&&bridge.nativeMainMapLoaded()),
                        transparent:document.documentElement.classList.contains('fast-native-main-map'),
                        noIframe:!document.querySelector('#map iframe'),
                        noLegacy:!document.getElementById('fastOneFingerMapSurface'),
                        canSetView:!!(appState&&appState.map&&typeof appState.map.setView==='function'),
                        canFit:!!(appState&&appState.map&&typeof appState.map.fitBounds==='function'),
                        nativeBridge:!!bridge
                      };
                      return JSON.stringify(data);
                    })()
                    """
                )
                if (result.contains("\\\"nativeLoaded\\\":true")) return@repeat
                Thread.sleep(2000)
            }

            assertTrue(
                "Native main map runtime diagnostic: $result",
                result.contains("\\\"provider\\\":\\\"google-native-main\\\"") &&
                    result.contains("\\\"nativeAvailable\\\":true") &&
                    result.contains("\\\"nativeLoaded\\\":true") &&
                    result.contains("\\\"transparent\\\":true") &&
                    result.contains("\\\"noIframe\\\":true") &&
                    result.contains("\\\"noLegacy\\\":true") &&
                    result.contains("\\\"canSetView\\\":true") &&
                    result.contains("\\\"canFit\\\":true") &&
                    result.contains("\\\"nativeBridge\\\":true")
            )
        }
    }

    @Test
    fun driverAvailabilityCardIsOutsideNativeMapTouchZone() {
        grantRuntimePermissions()
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            Thread.sleep(2500)
            val diagnostic = evaluate(
                scenario,
                """
                (function(){
                  var auth=document.getElementById('auth');
                  var app=document.getElementById('app');
                  var client=document.getElementById('clientHome');
                  var driver=document.getElementById('driverHome');
                  var card=document.querySelector('.driver-online-card');
                  if(auth) auth.classList.remove('active');
                  if(app) app.classList.add('active');
                  if(client) client.classList.add('hidden');
                  if(driver) driver.classList.remove('hidden');
                  if(window.initMap) window.initMap();
                  window.dispatchEvent(new Event('resize'));
                  var rect=card?card.getBoundingClientRect():null;
                  return {
                    cardVisible:!!card&&getComputedStyle(card).display!=='none',
                    cardBottom:rect?rect.bottom:0,
                    viewport:window.innerHeight||0,
                    toggle:!!document.getElementById('onlineToggle')
                  };
                })()
                """
            )
            Thread.sleep(350)

            var nativeTopRatio = 0f
            scenario.onActivity { activity ->
                val field = MainActivity::class.java.getDeclaredField("mainMapTouchTopBoundaryRatio")
                field.isAccessible = true
                nativeTopRatio = field.getFloat(activity)
            }

            assertTrue("Driver availability diagnostic: $diagnostic", diagnostic.contains("\"cardVisible\":true"))
            assertTrue("Driver availability toggle missing: $diagnostic", diagnostic.contains("\"toggle\":true"))
            assertTrue(
                "Native map must start below the driver availability card; ratio=$nativeTopRatio diagnostic=$diagnostic",
                nativeTopRatio > 0.12f
            )
        }
    }

    @Test
    fun backRequiresTwoPressesToExit() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            Thread.sleep(1000)
            var afterFirstPress = false
            scenario.onActivity { activity ->
                activity.onBackPressedDispatcher.onBackPressed()
                afterFirstPress = activity.isFinishing
            }
            assertFalse("FAST must stay open after the first Back press", afterFirstPress)

            var afterSecondPress = false
            scenario.onActivity { activity ->
                activity.onBackPressedDispatcher.onBackPressed()
                afterSecondPress = activity.isFinishing
            }
            assertTrue("FAST must exit after the second Back press", afterSecondPress)
        }
    }

    @Test
    fun clientHomeReturnsAfterCancellationUiReset() {
        grantRuntimePermissions()
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

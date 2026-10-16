package com.fastn1.connect;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebResourceResponse;
import android.webkit.SslErrorHandler;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

public final class MainActivity extends Activity {
    private static final String HOME = "https://fast-n1-connect.vercel.app/";
    private static final String DOMAIN = "fast-n1-connect.vercel.app";
    private WebView browser;
    private FrameLayout overlay;
    private ProgressBar progress;
    private long lastBack = 0;
    private boolean mainFrameFailed = false;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(75, 71, 125));
        getWindow().setNavigationBarColor(Color.rgb(75, 71, 125));

        FrameLayout root = new FrameLayout(this);
        // Even test builds must not expose the WebView debugging bridge.
        WebView.setWebContentsDebuggingEnabled(false);
        browser = new WebView(this);
        browser.setBackgroundColor(Color.WHITE);
        WebSettings settings = browser.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) settings.setSafeBrowsingEnabled(true);

        browser.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView v, String url, Bitmap icon) {
                mainFrameFailed = false;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                Uri uri = req.getUrl();
                if ("https".equals(uri.getScheme()) && DOMAIN.equals(uri.getHost())) return false;
                if ("https".equals(uri.getScheme()) || "mailto".equals(uri.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                    catch (Exception ignored) { Toast.makeText(MainActivity.this,"Lien externe indisponible",Toast.LENGTH_SHORT).show(); }
                }
                return true;
            }
            @Override public void onReceivedError(WebView v, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame()) { mainFrameFailed = true; showOffline(true); }
            }
            @Override public void onReceivedHttpError(WebView v, WebResourceRequest req, WebResourceResponse resp) {
                if (req.isForMainFrame() && resp.getStatusCode() >= 400) {
                    mainFrameFailed = true; showOffline(true);
                }
            }
            @Override public void onReceivedSslError(WebView v, SslErrorHandler handler, SslError error) {
                handler.cancel(); // Never accept an invalid certificate.
                mainFrameFailed = true;
                showOffline(true);
            }
            @Override public void onPageFinished(WebView v, String url) {
                Uri loaded = url == null ? null : Uri.parse(url);
                if (!mainFrameFailed && loaded != null && "https".equals(loaded.getScheme())
                        && DOMAIN.equals(loaded.getHost())) showOffline(false);
            }
        });
        browser.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int value) {
                progress.setProgress(value);
                progress.setVisibility(value >= 100 ? View.GONE : View.VISIBLE);
            }
        });
        // Report PDFs served by HTTPS use the system browser/download handler.
        // Do not add a JavaScript bridge or expose private Supabase credentials.
        browser.setDownloadListener((url, userAgent, disposition, mime, size) -> {
            Uri uri = Uri.parse(url);
            String host = uri.getHost();
            boolean safeHost = DOMAIN.equals(host)
                    || "hmwxwzfcpdvgzjgxruup.supabase.co".equals(host);
            if ("https".equals(uri.getScheme()) && safeHost) {
                try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                catch (Exception ignored) { Toast.makeText(this, "Téléchargement indisponible", Toast.LENGTH_SHORT).show(); }
            } else {
                Toast.makeText(this, "Téléchargement non pris en charge ici", Toast.LENGTH_SHORT).show();
            }
        });
        root.addView(browser, new FrameLayout.LayoutParams(-1,-1));

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        FrameLayout.LayoutParams progressParams = new FrameLayout.LayoutParams(-1, 4, Gravity.TOP);
        root.addView(progress, progressParams);

        overlay = new FrameLayout(this);
        overlay.setBackgroundColor(Color.WHITE);
        LinearLayout offline = new LinearLayout(this);
        offline.setOrientation(LinearLayout.VERTICAL);
        offline.setGravity(Gravity.CENTER);
        int pad = (int) (getResources().getDisplayMetrics().density * 20);
        offline.setPadding(pad,pad,pad,pad);
        TextView title = new TextView(this);
        title.setText(R.string.offline_title);
        title.setTextColor(Color.rgb(55,52,90));
        title.setTextSize(22);
        title.setGravity(Gravity.CENTER);
        TextView body = new TextView(this);
        body.setText(R.string.offline_text);
        body.setTextColor(Color.DKGRAY);
        body.setTextSize(14);
        body.setPadding(0,pad,0,pad);
        body.setGravity(Gravity.CENTER);
        Button retry = new Button(this);
        retry.setText(R.string.retry);
        retry.setOnClickListener(v -> { showOffline(false); browser.loadUrl(HOME); });
        offline.addView(title);
        offline.addView(body);
        offline.addView(retry);
        overlay.addView(offline, new FrameLayout.LayoutParams(-1,-2,Gravity.CENTER));
        root.addView(overlay, new FrameLayout.LayoutParams(-1,-1));
        showOffline(false);
        setContentView(root);
        if (savedInstanceState == null) browser.loadUrl(HOME);
        else browser.restoreState(savedInstanceState);
    }
    private void showOffline(boolean show) {
        overlay.setVisibility(show ? View.VISIBLE : View.GONE);
    }
    @Override protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        browser.saveState(out);
    }
    @Override public void onBackPressed() {
        if (browser != null && browser.canGoBack()) { browser.goBack(); return; }
        long now=System.currentTimeMillis();
        if (now-lastBack < 2000) { super.onBackPressed(); return; }
        lastBack=now;
        Toast.makeText(this,"Appuyez encore pour quitter FAST Connect",Toast.LENGTH_SHORT).show();
    }
    @Override protected void onDestroy() {
        if(browser!=null){browser.stopLoading();browser.destroy();browser=null;}
        super.onDestroy();
    }
}

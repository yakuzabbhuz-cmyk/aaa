package com.deathlegion.dlchat;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;
import android.webkit.WebChromeClient;
import android.webkit.PermissionRequest;
import android.webkit.GeolocationPermissions;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.graphics.Color;
import android.os.Build;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.RelativeLayout;
import android.util.Log;

public class MainActivity extends Activity {

    private WebView webView;
    // LOCAL bundled app — served from android_asset, NO remote URL loading
    private static final String LOCAL_APP_URL = "file:///android_asset/www/index.html";
    private static final String API_BASE = "https://dl-chat-api.death-legion-dlchat.workers.dev";
    private static final String TAG = "DLChat";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Full screen setup
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().setStatusBarColor(Color.parseColor("#0D0D0D"));
            getWindow().setNavigationBarColor(Color.parseColor("#0D0D0D"));
        }

        // Create layout
        RelativeLayout rootLayout = new RelativeLayout(this);
        rootLayout.setBackgroundColor(Color.parseColor("#0D0D0D"));

        // Setup WebView
        webView = new WebView(this);
        RelativeLayout.LayoutParams params = new RelativeLayout.LayoutParams(
                RelativeLayout.LayoutParams.MATCH_PARENT,
                RelativeLayout.LayoutParams.MATCH_PARENT);
        webView.setLayoutParams(params);
        webView.setBackgroundColor(Color.parseColor("#0D0D0D"));

        // Configure WebView settings
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        // Enable access to local file:// assets
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setGeolocationEnabled(true);
        // Use default cache for local file, no-cache would break local assets
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setUserAgentString("DLChat/1.0.0 Android/" + Build.VERSION.RELEASE + " Mobile");
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);

        // Enable cookies (needed for API calls)
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        // Add JavaScript interface — native bridge
        webView.addJavascriptInterface(new DLChatBridge(), "DLChatNative");

        // WebViewClient — intercept URL loading
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // Allow local file:// access
                if (url.startsWith("file://")) {
                    view.loadUrl(url);
                    return true;
                }
                // Allow API calls (HTTPS fetch/WebSocket — not navigation)
                if (url.startsWith(API_BASE)) {
                    view.loadUrl(url);
                    return true;
                }
                // Allow in-app navigation within our app URLs
                if (url.startsWith("dlchat://")) {
                    view.loadUrl(LOCAL_APP_URL);
                    return true;
                }
                // External links open in system browser
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    startActivity(intent);
                    return true;
                }
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                Log.d(TAG, "Page loaded: " + url);
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                Log.e(TAG, "WebView error: " + errorCode + " - " + description + " for URL: " + failingUrl);
                // Only show offline page if local asset fails to load (shouldn't happen)
                if (failingUrl != null && failingUrl.startsWith("file://")) {
                    view.loadData(getOfflineHtml(), "text/html", "UTF-8");
                }
            }
        });

        // WebChromeClient for permissions, notifications, etc.
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                // Grant microphone/camera for voice calls
                request.grant(request.getResources());
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, false);
            }

            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback,
                    WebChromeClient.FileChooserParams fileChooserParams) {
                // File attach support
                return false;
            }
        });

        rootLayout.addView(webView);
        setContentView(rootLayout);

        // Load the BUNDLED local app — file:///android_asset/www/index.html
        // This is a REAL app, not a website loader!
        Log.d(TAG, "Loading bundled app from: " + LOCAL_APP_URL);
        webView.loadUrl(LOCAL_APP_URL);
    }

    private String getOfflineHtml() {
        return "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>" +
               "<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0D0D0D;display:flex;" +
               "align-items:center;justify-content:center;height:100vh;flex-direction:column;font-family:sans-serif;padding:24px;text-align:center}" +
               "h1{color:#fff;font-size:24px;margin-bottom:12px}p{color:#888;font-size:14px;margin-bottom:24px}" +
               "button{background:#6C63FF;color:#fff;border:none;padding:14px 28px;border-radius:12px;" +
               "font-size:16px;cursor:pointer}" +
               "</style></head><body>" +
               "<div style='font-size:64px;margin-bottom:24px'>⚠️</div>" +
               "<h1>App Error</h1>" +
               "<p>Failed to load the bundled app. Please reinstall DL Chat.</p>" +
               "<button onclick='window.location.reload()'>Retry</button>" +
               "</body></html>";
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onDestroy() {
        webView.destroy();
        super.onDestroy();
    }

    // JavaScript Bridge — exposes native Android APIs to the bundled web app
    public class DLChatBridge {
        @JavascriptInterface
        public String getDeviceInfo() {
            return "{\"platform\":\"android\",\"version\":\"" + Build.VERSION.RELEASE +
                   "\",\"model\":\"" + Build.MODEL + "\",\"manufacturer\":\"" + Build.MANUFACTURER +
                   "\",\"app_version\":\"1.0.0\",\"is_native\":true}";
        }

        @JavascriptInterface
        public String getPlatform() {
            return "android";
        }

        @JavascriptInterface
        public boolean isNativeApp() {
            return true;
        }

        @JavascriptInterface
        public void openExternalUrl(String url) {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            startActivity(intent);
        }

        @JavascriptInterface
        public void shareText(String text, String title) {
            Intent shareIntent = new Intent(Intent.ACTION_SEND);
            shareIntent.setType("text/plain");
            shareIntent.putExtra(Intent.EXTRA_TEXT, text);
            shareIntent.putExtra(Intent.EXTRA_SUBJECT, title);
            startActivity(Intent.createChooser(shareIntent, "Share via"));
        }

        @JavascriptInterface
        public void vibrate(int duration) {
            android.os.Vibrator v = (android.os.Vibrator) getSystemService(android.content.Context.VIBRATOR_SERVICE);
            if (v != null) v.vibrate(duration);
        }

        @JavascriptInterface
        public void showToast(String message) {
            runOnUiThread(() -> {
                android.widget.Toast.makeText(MainActivity.this, message, android.widget.Toast.LENGTH_SHORT).show();
            });
        }

        @JavascriptInterface
        public void copyToClipboard(String text) {
            runOnUiThread(() -> {
                android.content.ClipboardManager clipboard = (android.content.ClipboardManager)
                    getSystemService(android.content.Context.CLIPBOARD_SERVICE);
                android.content.ClipData clip = android.content.ClipData.newPlainText("DL Chat", text);
                clipboard.setPrimaryClip(clip);
                android.widget.Toast.makeText(MainActivity.this, "Copied to clipboard", android.widget.Toast.LENGTH_SHORT).show();
            });
        }
    }
}

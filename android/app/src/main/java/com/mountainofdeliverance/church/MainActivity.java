package com.mountainofdeliverance.church;

import android.app.PictureInPictureParams;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.util.Rational;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;

import java.util.ArrayList;

public class MainActivity extends BridgeActivity {
    private WebView webView;
    private boolean jsInterfaceAdded = false;

    // Flag set by WebView JS — only true when the video player is actively open
    private static boolean pipVideoActive = false;

    /**
     * JavaScript interface for WebView to signal PiP readiness.
     */
    public static class PiPBridge {
        @JavascriptInterface
        public void setVideoActive(boolean active) {
            pipVideoActive = active;
        }

        @JavascriptInterface
        public boolean isVideoActive() {
            return pipVideoActive;
        }
    }

    /**
     * Enables immersive mode — app draws edge-to-edge behind the
     * system bars. The status bar and navigation bar auto-hide, and reappear
     * temporarily when the user swipes down (status bar) or up (nav bar).
     * After a few seconds, they slide away again.
     *
     * Uses WindowInsetsController on Android 11+ (new API),
     * falls back to SYSTEM_UI_FLAG_* on older versions.
     */
    private void enableImmersiveMode() {
        getWindow().setDecorFitsSystemWindows(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            );
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Register plugins
        registerPlugin(PiPPlugin.class);
        registerPlugin(ApkInstallPlugin.class);

        // ── Immersive edge-to-edge mode ──
        // The app draws behind system bars (status bar + navigation bar).
        // System bars auto-hide and reappear on swipe (IMERSIVE_STICKY).
        // When they slide away, the app returns to full screen.
        enableImmersiveMode();
    }

    @Override
    public void onStart() {
        super.onStart();
        if (webView == null && getBridge() != null) {
            webView = getBridge().getWebView();
        }
        if (webView != null) {
            // Prevent white flash before web content renders
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                webView.setBackgroundColor(android.graphics.Color.parseColor("#0F0F0F"));
            } else {
                webView.setBackgroundColor(0xFF0F0F0F);
            }

            // Add JavaScript interface for PiP state tracking (only once)
            if (!jsInterfaceAdded) {
                webView.addJavascriptInterface(new PiPBridge(), "AndroidPiP");
                jsInterfaceAdded = true;
            }
            // Prevent Android system font size from scaling WebView content
            webView.getSettings().setTextZoom(100);
            // Ensure media playback doesn't require user gesture after initial play
            webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        }
        // Re-apply immersive mode (e.g., after returning from PiP)
        enableImmersiveMode();
    }

    @Override
    public void onPause() {
        super.onPause();
        // Keep WebView timers running so audio continues in background
        if (webView != null) {
            webView.resumeTimers();
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // When the window regains focus (system bars auto-hid after swipe),
        // re-apply the immersive flags so bars stay hidden.
        if (hasFocus) {
            enableImmersiveMode();
        }
    }

    @Override
    public void onUserLeaveHint() {
        super.onUserLeaveHint();
        // Only enter PiP if the video player is actively open
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && pipVideoActive) {
            if (getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)) {
                PictureInPictureParams.Builder builder = new PictureInPictureParams.Builder();
                builder.setAspectRatio(new Rational(16, 9));
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    builder.setAutoEnterEnabled(true);
                }
                enterPictureInPictureMode(builder.build());
            }
        }
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        if (webView != null) {
            // Notify the WebView about PiP mode change so the UI can adapt
            String script = String.format(
                "window.dispatchEvent(new CustomEvent('pip-mode-changed', { detail: { isInPip: %s } }))",
                isInPictureInPictureMode ? "true" : "false"
            );
            webView.post(() -> {
                if (webView != null) {
                    webView.evaluateJavascript(script, null);
                }
            });
        }
    }
}

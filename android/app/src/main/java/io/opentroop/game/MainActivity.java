package io.worldfront.game;

import android.os.Bundle;
import android.os.Build;
import android.os.PowerManager;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.webkit.WebView;
import android.webkit.JavascriptInterface;

import com.getcapacitor.BridgeActivity;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.core.view.ViewCompat;

public class MainActivity extends BridgeActivity {
    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;
    private volatile boolean appActive = false;

    private final class WorldFrontPowerBridge {
        @JavascriptInterface
        public boolean isAppActive() {
            return appActive;
        }

        @JavascriptInterface
        public int getThermalStatus() {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return 0;
            PowerManager manager = (PowerManager) getSystemService(POWER_SERVICE);
            return manager == null ? 0 : manager.getCurrentThermalStatus();
        }
    }

    private void publishAppState() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        getBridge().getWebView().evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('worldfront-app-state',"
                        + "{detail:{active:" + appActive + "}}));", null);
    }

    @Override
    public void onPause() {
        appActive = false;
        publishAppState();
        super.onPause();
    }

    @Override
    public void onResume() {
        super.onResume();
        appActive = true;
        publishAppState();
    }

    private final class WorldFrontAudioBridge {
        @JavascriptInterface
        public void requestMayDuck() {
            if (audioManager == null) {
                audioManager = (AudioManager) getSystemService(AUDIO_SERVICE);
            }
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                if (audioFocusRequest == null) {
                    AudioAttributes attributes = new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_GAME)
                            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                            .build();
                    audioFocusRequest = new AudioFocusRequest.Builder(
                            AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                            .setAudioAttributes(attributes)
                            .setAcceptsDelayedFocusGain(false)
                            .setWillPauseWhenDucked(false)
                            .build();
                }
                audioManager.requestAudioFocus(audioFocusRequest);
            } else {
                audioManager.requestAudioFocus(
                        null,
                        AudioManager.STREAM_MUSIC,
                        AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK);
            }
        }

        @JavascriptInterface
        public void abandon() {
            if (audioManager == null) return;
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                if (audioFocusRequest != null) {
                    audioManager.abandonAudioFocusRequest(audioFocusRequest);
                }
            } else {
                audioManager.abandonAudioFocus(null);
            }
        }
    }

    private void installAudioBridge() {
        getBridge().getWebView().addJavascriptInterface(
                new WorldFrontAudioBridge(),
                "WorldFrontAudio"
        );
    }

    private void installSafeAreaBridge() {
        WebView webView = getBridge().getWebView();
        webView.setOnApplyWindowInsetsListener((view, windowInsets) -> {
            WindowInsetsCompat insets = WindowInsetsCompat.toWindowInsetsCompat(windowInsets);
            int safeTopPx = insets.getInsetsIgnoringVisibility(
                    WindowInsetsCompat.Type.displayCutout()
                            | WindowInsetsCompat.Type.statusBars()
            ).top;
            float density = getResources().getDisplayMetrics().density;
            int safeTopCssPx = Math.round(safeTopPx / density);

            webView.evaluateJavascript(
                    "document.documentElement.style.setProperty('--wf-safe-top', '"
                            + safeTopCssPx + "px');",
                    null
            );
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(webView);
    }

    private void hideStatusBar() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (controller != null) {
            controller.hide(WindowInsetsCompat.Type.systemBars());
            controller.setSystemBarsBehavior(
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        installAudioBridge();
        getBridge().getWebView().addJavascriptInterface(
                new WorldFrontPowerBridge(), "WorldFrontPower");
        installSafeAreaBridge();
        hideStatusBar();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideStatusBar();
        }
    }
}

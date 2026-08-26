package io.worldfront.game;

import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.core.view.ViewCompat;

public class MainActivity extends BridgeActivity {
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

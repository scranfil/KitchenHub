package com.kitchenhub.kiosk

import android.os.Handler
import android.webkit.JavascriptInterface

/**
 * Page side of the kiosk. presence.js looks for window.KitchenKiosk.setLevels
 * and, when it is there, does not dim or open the camera itself.
 */
class KioskBridge(
    private val main: Handler,
    private val onLevels: (Int, Int) -> Unit,
    private val onActivity: () -> Unit,
    private val onHeartbeat: () -> Unit
) {
    @JavascriptInterface
    fun setLevels(bright: String?, dim: String?) {
        val brightLevel = bright?.toIntOrNull() ?: return
        val dimLevel = dim?.toIntOrNull() ?: return
        main.post { onLevels(brightLevel, dimLevel) }
    }

    @JavascriptInterface
    fun reportActivity() {
        main.post { onActivity() }
    }

    @JavascriptInterface
    fun heartbeat() {
        main.post { onHeartbeat() }
    }
}

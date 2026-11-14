package com.kitchenhub.kiosk.logic

/**
 * Asks for a WebView reload when the page stops answering, the renderer
 * dies, or the network comes back. Reloads stay minGapMs apart so a crash
 * loop or a flapping link cannot spin.
 */
class Watchdog(
    val staleMs: Long = 3 * 60 * 1000L,
    val minGapMs: Long = 10 * 60 * 1000L
) {
    enum class Reason { STALE, RENDERER, NETWORK }

    var lastBeatMs: Long = -1L
        private set
    var lastReloadMs: Long = -1L
        private set

    private var offline: Boolean = false
    private var pendingNetwork: Boolean = false
    private var pendingRenderer: Boolean = false

    fun start(nowMs: Long) {
        lastBeatMs = nowMs
    }

    fun beat(nowMs: Long) {
        if (lastBeatMs < 0 || nowMs >= lastBeatMs) {
            lastBeatMs = nowMs
        }
    }

    fun onNetworkLost() {
        offline = true
    }

    fun onNetworkRestored() {
        if (!offline) {
            return
        }
        offline = false
        pendingNetwork = true
    }

    fun onRendererGone() {
        pendingRenderer = true
    }

    fun poll(nowMs: Long): Reason? {
        if (!gapOpen(nowMs)) {
            return null
        }
        if (pendingRenderer) {
            pendingRenderer = false
            return Reason.RENDERER
        }
        if (pendingNetwork) {
            pendingNetwork = false
            return Reason.NETWORK
        }
        if (lastBeatMs >= 0 && nowMs - lastBeatMs >= staleMs) {
            return Reason.STALE
        }
        return null
    }

    fun markReloaded(nowMs: Long) {
        lastReloadMs = nowMs
        lastBeatMs = nowMs
        pendingRenderer = false
        pendingNetwork = false
    }

    private fun gapOpen(nowMs: Long): Boolean {
        if (lastReloadMs < 0) {
            return true
        }
        return nowMs - lastReloadMs >= minGapMs
    }
}

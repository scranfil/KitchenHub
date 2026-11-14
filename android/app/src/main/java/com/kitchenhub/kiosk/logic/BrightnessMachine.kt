package com.kitchenhub.kiosk.logic

/**
 * Bright until the kitchen has been still for idleMs, then dim.
 * Motion and touch call activity(). The page can replace the two levels
 * (day 180/12, night 64/4) without restarting the idle clock.
 */
class BrightnessMachine(
    var idleMs: Long = 90_000L,
    brightLevel: Int = 180,
    dimLevel: Int = 12
) {
    enum class Mode { BRIGHT, DIM }

    var brightLevel: Int = brightLevel.coerceIn(0, 255)
        private set
    var dimLevel: Int = dimLevel.coerceIn(0, 255)
        private set
    var mode: Mode = Mode.BRIGHT
        private set

    private var lastActivityMs: Long = 0L
    private var running: Boolean = false

    fun start(nowMs: Long): Int {
        running = true
        lastActivityMs = nowMs
        mode = Mode.BRIGHT
        return level()
    }

    fun activity(nowMs: Long): Int {
        running = true
        lastActivityMs = nowMs
        mode = Mode.BRIGHT
        return level()
    }

    fun tick(nowMs: Long): Int {
        if (!running) {
            return level()
        }
        var now = nowMs
        if (now < lastActivityMs) {
            lastActivityMs = now
        }
        if (mode == Mode.BRIGHT && now - lastActivityMs >= idleMs) {
            mode = Mode.DIM
        }
        return level()
    }

    fun setLevels(bright: Int, dim: Int): Int {
        brightLevel = bright.coerceIn(0, 255)
        dimLevel = dim.coerceIn(0, 255)
        return level()
    }

    fun level(): Int {
        return if (mode == Mode.DIM) dimLevel else brightLevel
    }

    fun windowBrightness(): Float {
        val value = level() / 255f
        if (value < 0.01f) {
            return 0.01f
        }
        if (value > 1f) {
            return 1f
        }
        return value
    }
}

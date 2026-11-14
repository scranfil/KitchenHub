package com.kitchenhub.kiosk.logic

/**
 * Same idea as the page's motionHit: a whole-frame exposure change is ignored,
 * and a hand that moves part of the frame is a hit. sensitivity 0 is strict,
 * 100 is eager. 92 matches the kitchen config.
 */
object MotionDiff {
    fun hit(prev: IntArray?, next: IntArray?, sensitivity: Int): Boolean {
        if (prev == null || next == null || prev.isEmpty() || prev.size != next.size) {
            return false
        }
        var sens = sensitivity
        if (sens < 0) {
            sens = 0
        }
        if (sens > 100) {
            sens = 100
        }
        val pixelThreshold = Math.round((100 - sens) * 0.55).toInt() + 10
        val needed = maxOf(1, Math.round(prev.size * 0.015).toInt())
        var sum = 0
        for (i in prev.indices) {
            sum += kotlin.math.abs(prev[i] - next[i])
        }
        val mean = sum.toDouble() / prev.size
        var hits = 0
        for (i in prev.indices) {
            val delta = kotlin.math.abs(prev[i] - next[i])
            if (delta - mean >= pixelThreshold) {
                hits += 1
                if (hits >= needed) {
                    return true
                }
            }
        }
        return false
    }
}

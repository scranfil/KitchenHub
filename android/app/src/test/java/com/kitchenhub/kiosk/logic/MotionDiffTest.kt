package com.kitchenhub.kiosk.logic

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MotionDiffTest {
    @Test
    fun stillFrameAndNoiseAreQuiet() {
        val still = intArrayOf(10, 10, 10, 10, 12, 12, 12, 12)
        val noise = intArrayOf(11, 10, 12, 10, 13, 12, 11, 12)
        assertFalse(MotionDiff.hit(still, still, 92))
        assertFalse(MotionDiff.hit(still, noise, 92))
        assertFalse(MotionDiff.hit(null, still, 92))
        assertFalse(MotionDiff.hit(still, intArrayOf(10, 10), 92))
    }

    @Test
    fun aHandInPartOfTheFrameIsMotion() {
        val still = intArrayOf(10, 10, 10, 10, 12, 12, 12, 12)
        val wave = still.copyOf()
        wave[0] = 80
        wave[1] = 90
        assertTrue(MotionDiff.hit(still, wave, 92))
    }

    @Test
    fun aWholeFrameBrightnessChangeIsNotMotion() {
        val base = IntArray(64) { 40 }
        val lifted = IntArray(64) { 70 }
        assertFalse(MotionDiff.hit(base, lifted, 92))
    }

    @Test
    fun higherSensitivityCatchesASmallerPatch() {
        val base = IntArray(80) { 20 }
        val twitch = base.copyOf()
        twitch[3] = 40
        assertFalse(MotionDiff.hit(base, twitch, 0))
        assertTrue(MotionDiff.hit(base, twitch, 100))
    }
}

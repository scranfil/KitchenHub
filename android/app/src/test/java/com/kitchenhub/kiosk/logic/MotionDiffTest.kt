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
    fun onePixelIsNotAHandAndASmallPatchIs() {
        val base = IntArray(80) { 20 }
        val twitch = base.copyOf()
        twitch[3] = 40
        assertFalse(MotionDiff.hit(base, twitch, 100))
        val patch = base.copyOf()
        patch[10] = 50
        patch[11] = 55
        patch[12] = 48
        assertFalse(MotionDiff.hit(base, patch, 0))
        assertTrue(MotionDiff.hit(base, patch, 100))
    }

    @Test
    fun aLowLightHandOnAnExposureShiftWakesAndSpeckleDoesNot() {
        val cols = 32
        val prev = IntArray(cols * 24) { 20 }
        val wave = IntArray(prev.size) { 28 }
        for (c in 4 until 12) {
            wave[10 * cols + c] = 36
        }
        val read = MotionDiff.read(prev, wave, 92, cols)
        assertTrue(read!!.hit)
        assertTrue(read.blob >= 8)
        assertTrue(read.peak >= 7)

        val speckle = IntArray(prev.size) { index -> if (index % 7 == 0) 30 else 21 }
        val noise = MotionDiff.read(prev, speckle, 92, cols)
        assertFalse(noise!!.hit)
        assertTrue(noise.blob < 6)
    }
}

package com.kitchenhub.kiosk.logic

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LumaSamplerTest {
    @Test
    fun samplesTheYPlaneWithRowPadding() {
        val y = ByteArray(8)
        y[0] = 10
        y[1] = 20
        y[4] = 30
        y[5] = 40
        val sample = LumaSampler.sample(y, width = 2, height = 2, rowStride = 4, cols = 2, rows = 2)
        assertEquals(10, sample!![0])
        assertEquals(20, sample[1])
        assertEquals(30, sample[2])
        assertEquals(40, sample[3])
    }

    @Test
    fun rejectsAShortBuffer() {
        assertNull(LumaSampler.sample(ByteArray(2), 4, 4, 4, 2, 2))
    }

    @Test
    fun honorsPixelStride() {
        val y = byteArrayOf(10, 0, 20, 0, 30, 0, 40, 0)
        val sample = LumaSampler.sample(y, width = 2, height = 2, rowStride = 4, cols = 2, rows = 2, pixelStride = 2)
        assertEquals(10, sample!![0])
        assertEquals(20, sample[1])
        assertEquals(30, sample[2])
        assertEquals(40, sample[3])
    }
}

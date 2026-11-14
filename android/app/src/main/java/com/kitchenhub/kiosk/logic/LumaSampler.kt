package com.kitchenhub.kiosk.logic

/** Downsamples a camera Y plane to a small luma grid for the motion diff. */
object LumaSampler {
    fun sample(
        y: ByteArray,
        width: Int,
        height: Int,
        rowStride: Int,
        cols: Int,
        rows: Int
    ): IntArray? {
        if (width <= 0 || height <= 0 || cols <= 0 || rows <= 0 || rowStride < width) {
            return null
        }
        val need = (height - 1) * rowStride + width
        if (y.size < need) {
            return null
        }
        val out = IntArray(cols * rows)
        val stepX = maxOf(1, width / cols)
        val stepY = maxOf(1, height / rows)
        for (r in 0 until rows) {
            val yy = minOf(height - 1, r * stepY)
            for (c in 0 until cols) {
                val x = minOf(width - 1, c * stepX)
                out[r * cols + c] = y[yy * rowStride + x].toInt() and 0xff
            }
        }
        return out
    }
}

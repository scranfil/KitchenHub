package com.kitchenhub.kiosk.logic

/** Downsamples a camera Y plane to a small luma grid for the motion diff. */
object LumaSampler {
    fun sample(
        y: ByteArray,
        width: Int,
        height: Int,
        rowStride: Int,
        cols: Int,
        rows: Int,
        pixelStride: Int = 1
    ): IntArray? {
        val stride = if (pixelStride < 1) 1 else pixelStride
        if (width <= 0 || height <= 0 || cols <= 0 || rows <= 0 || rowStride < 1) {
            return null
        }
        val out = IntArray(cols * rows)
        val stepX = maxOf(1, width / cols)
        val stepY = maxOf(1, height / rows)
        var readable = 0
        for (r in 0 until rows) {
            val yy = minOf(height - 1, r * stepY)
            for (c in 0 until cols) {
                val x = minOf(width - 1, c * stepX)
                val index = yy * rowStride + x * stride
                if (index < 0 || index >= y.size) {
                    continue
                }
                out[r * cols + c] = y[index].toInt() and 0xff
                readable += 1
            }
        }
        if (readable * 2 < out.size) {
            return null
        }
        return out
    }
}

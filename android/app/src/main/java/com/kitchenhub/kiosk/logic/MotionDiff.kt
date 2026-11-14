package com.kitchenhub.kiosk.logic

/**
 * Decides whether a luma grid is a hand wave.
 *
 * A dim, auto-exposed front camera lifts the whole frame when the screen
 * or the exposure changes. That global shift is removed. What remains has
 * to be a connected patch, so sensor speckle does not wake the panel and a
 * hand still does. sensitivity 0 is strict, 100 is eager. 92 is the kitchen.
 */
object MotionDiff {
    data class Read(val peak: Int, val blob: Int, val hit: Boolean)

    fun hit(prev: IntArray?, next: IntArray?, sensitivity: Int, cols: Int = 0): Boolean {
        val width = if (cols > 0) cols else prev?.size ?: 0
        val read = read(prev, next, sensitivity, width)
        return read != null && read.hit
    }

    fun read(prev: IntArray?, next: IntArray?, sensitivity: Int, cols: Int): Read? {
        if (prev == null || next == null || prev.isEmpty() || prev.size != next.size || cols <= 0) {
            return null
        }
        if (prev.size % cols != 0) {
            return null
        }
        var sens = sensitivity
        if (sens < 0) {
            sens = 0
        }
        if (sens > 100) {
            sens = 100
        }
        // 92 -> 7. A low-light hand is only a few counts above the exposure
        // shift; the old gate wanted 14 and a wave never cleared it.
        val floor = Math.round((100 - sens) * 0.25).toInt() + 5
        val needed = maxOf(2, Math.round(prev.size * 0.008).toInt())
        var sum = 0
        for (i in prev.indices) {
            sum += kotlin.math.abs(prev[i] - next[i])
        }
        val mean = sum.toDouble() / prev.size
        val mask = BooleanArray(prev.size)
        var peak = 0
        for (i in prev.indices) {
            val excess = kotlin.math.abs(prev[i] - next[i]) - mean
            val rounded = if (excess > 0) excess.toInt() else 0
            if (rounded > peak) {
                peak = rounded
            }
            if (excess >= floor) {
                mask[i] = true
            }
        }
        val blob = largestBlob(mask, cols)
        return Read(peak, blob, blob >= needed)
    }

    private fun largestBlob(mask: BooleanArray, cols: Int): Int {
        val rows = mask.size / cols
        val seen = BooleanArray(mask.size)
        val stack = IntArray(mask.size)
        var best = 0
        for (start in mask.indices) {
            if (!mask[start] || seen[start]) {
                continue
            }
            var sp = 0
            stack[sp] = start
            sp += 1
            seen[start] = true
            var count = 0
            while (sp > 0) {
                sp -= 1
                val i = stack[sp]
                count += 1
                val c = i % cols
                val r = i / cols
                if (c > 0) {
                    sp = push(mask, seen, stack, sp, i - 1)
                }
                if (c + 1 < cols) {
                    sp = push(mask, seen, stack, sp, i + 1)
                }
                if (r > 0) {
                    sp = push(mask, seen, stack, sp, i - cols)
                }
                if (r + 1 < rows) {
                    sp = push(mask, seen, stack, sp, i + cols)
                }
            }
            if (count > best) {
                best = count
            }
        }
        return best
    }

    private fun push(mask: BooleanArray, seen: BooleanArray, stack: IntArray, sp: Int, index: Int): Int {
        if (seen[index] || !mask[index]) {
            return sp
        }
        seen[index] = true
        stack[sp] = index
        return sp + 1
    }
}

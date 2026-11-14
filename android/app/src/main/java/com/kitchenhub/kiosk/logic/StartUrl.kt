package com.kitchenhub.kiosk.logic

object StartUrl {
    const val DEFAULT = "http://192.168.86.51:8080"

    fun normalize(raw: String?): String {
        val text = raw?.trim().orEmpty()
        if (text.isEmpty() || text.any { it.isWhitespace() }) {
            return DEFAULT
        }
        val lower = text.lowercase()
        val colon = lower.indexOf(':')
        if (colon > 0) {
            val scheme = lower.substring(0, colon)
            val hostLike = scheme.all { it.isDigit() || it == '.' }
            if (scheme != "http" && scheme != "https" && !hostLike) {
                return DEFAULT
            }
        }
        return if (lower.startsWith("http://") || lower.startsWith("https://")) {
            text
        } else {
            "http://$text"
        }
    }
}

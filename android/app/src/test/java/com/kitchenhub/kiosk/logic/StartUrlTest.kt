package com.kitchenhub.kiosk.logic

import org.junit.Assert.assertEquals
import org.junit.Test

class StartUrlTest {
    @Test
    fun blankAndJunkFallBackToTheKitchenServer() {
        assertEquals(StartUrl.DEFAULT, StartUrl.normalize(null))
        assertEquals(StartUrl.DEFAULT, StartUrl.normalize("  "))
        assertEquals(StartUrl.DEFAULT, StartUrl.normalize("javascript:alert(1)"))
        assertEquals("http://192.168.86.51:8080", StartUrl.normalize("http://192.168.86.51:8080"))
        assertEquals("http://192.168.1.20:8080", StartUrl.normalize("192.168.1.20:8080"))
        assertEquals("https://hub.home", StartUrl.normalize("https://hub.home"))
    }
}

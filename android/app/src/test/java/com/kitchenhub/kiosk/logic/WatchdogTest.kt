package com.kitchenhub.kiosk.logic

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class WatchdogTest {
    private val stale = 3 * 60 * 1000L
    private val gap = 10 * 60 * 1000L

    @Test
    fun aMissedHeartbeatReloadsAtThreeMinutes() {
        val dog = Watchdog(staleMs = stale, minGapMs = gap)
        dog.start(0L)
        assertNull(dog.poll(stale - 1))
        assertEquals(Watchdog.Reason.STALE, dog.poll(stale))
    }

    @Test
    fun aFreshBeatAndTheReloadGapHoldTheNextReload() {
        val dog = Watchdog(staleMs = stale, minGapMs = gap)
        dog.start(0L)
        dog.beat(60_000L)
        assertNull(dog.poll(60_000L + stale - 1))
        assertEquals(Watchdog.Reason.STALE, dog.poll(60_000L + stale))
        dog.markReloaded(60_000L + stale)
        dog.onRendererGone()
        assertNull(dog.poll(60_000L + stale + gap - 1))
        assertEquals(Watchdog.Reason.RENDERER, dog.poll(60_000L + stale + gap))
    }

    @Test
    fun networkReloadOnlyFollowsARealDrop() {
        val dog = Watchdog(staleMs = stale, minGapMs = gap)
        dog.start(0L)
        dog.onNetworkRestored()
        assertNull(dog.poll(1_000L))
        dog.onNetworkLost()
        dog.onNetworkRestored()
        assertEquals(Watchdog.Reason.NETWORK, dog.poll(2_000L))
        dog.markReloaded(2_000L)
        dog.onNetworkLost()
        dog.onNetworkRestored()
        assertNull(dog.poll(2_000L + gap - 1))
        assertEquals(Watchdog.Reason.NETWORK, dog.poll(2_000L + gap))
    }

    @Test
    fun neverStartedDoesNotLookStale() {
        val dog = Watchdog(staleMs = stale, minGapMs = gap)
        assertNull(dog.poll(24 * 60 * 60 * 1000L))
    }
}

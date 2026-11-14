package com.kitchenhub.kiosk.logic

import org.junit.Assert.assertEquals
import org.junit.Test

class BrightnessMachineTest {
    @Test
    fun dimsAfterNinetySecondsAndWakesOnMotionOrANewLevel() {
        val machine = BrightnessMachine(idleMs = 90_000L)
        assertEquals(180, machine.start(1_000L))
        assertEquals(BrightnessMachine.Mode.BRIGHT, machine.mode)
        assertEquals(180, machine.tick(1_000L + 89_999L))
        assertEquals(BrightnessMachine.Mode.BRIGHT, machine.mode)
        assertEquals(12, machine.tick(1_000L + 90_000L))
        assertEquals(BrightnessMachine.Mode.DIM, machine.mode)
        assertEquals(180, machine.activity(1_000L + 120_000L))
        assertEquals(BrightnessMachine.Mode.BRIGHT, machine.mode)
    }

    @Test
    fun nightLevelsApplyToTheCurrentModeWithoutResettingIdle() {
        val machine = BrightnessMachine(idleMs = 90_000L)
        machine.start(0L)
        machine.tick(90_000L)
        assertEquals(4, machine.setLevels(64, 4))
        assertEquals(BrightnessMachine.Mode.DIM, machine.mode)
        assertEquals(64, machine.activity(90_000L))
        assertEquals(0.01f, BrightnessMachine(brightLevel = 0, dimLevel = 0).windowBrightness(), 0.0001f)
    }

    @Test
    fun aTouchBeforeTheDeadlineKeepsThePanelBright() {
        val machine = BrightnessMachine(idleMs = 90_000L)
        machine.start(0L)
        machine.activity(50_000L)
        assertEquals(180, machine.tick(50_000L + 89_000L))
        assertEquals(12, machine.tick(50_000L + 90_000L))
    }
}

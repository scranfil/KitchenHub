const { test } = require('node:test');
const assert = require('node:assert/strict');
const presence = require('../js/presence.js');

function harness(extra) {
  var t = 1000;
  var applied = [];
  var queued = null;
  var opts = {
    idleMs: 5000,
    now: function () { return t; },
    levels: function () { return { bright: 180, dim: 12 }; },
    apply: function (level, mode) { applied.push([level, mode]); },
    shouldHoldBright: function () { return false; },
    setTimer: function (fn, ms) {
      queued = { fn: fn, ms: ms };
      return 1;
    },
    clearTimer: function () { queued = null; }
  };
  if (extra) {
    Object.keys(extra).forEach(function (key) {
      opts[key] = extra[key];
    });
  }
  return {
    controller: presence.createController(opts),
    applied: applied,
    queued: function () { return queued; },
    advance: function (ms) { t += ms; }
  };
}

test('night window wraps past midnight', function () {
  var tz = 'America/New_York';
  assert.equal(presence.isNightAt(new Date('2026-10-22T02:30:00.000Z'), '22:00', '06:00', tz), true);
  assert.equal(presence.isNightAt(new Date('2026-10-22T06:30:00.000Z'), '22:00', '06:00', tz), true);
  assert.equal(presence.isNightAt(new Date('2026-10-22T10:01:00.000Z'), '22:00', '06:00', tz), false);
  assert.equal(presence.isNightAt(new Date('2026-10-21T16:00:00.000Z'), '22:00', '06:00', tz), false);
});

test('night brightness replaces the day levels', function () {
  assert.deepEqual(presence.levelsFor({
    bright: 180,
    dim: 12,
    night: { bright: 64, dim: 4 }
  }, true), { bright: 64, dim: 4 });
  assert.deepEqual(presence.levelsFor({ bright: 180, dim: 12, night: { bright: 64, dim: 4 } }, false), {
    bright: 180,
    dim: 12
  });
  assert.equal(presence.clampLevel(400), 255);
  assert.equal(presence.clampLevel(-3), 0);
});

test('Fully keeps the screen on and reloads the page itself', function () {
  var settings = presence.fullySettings({ sensitivity: 92, frameRate: 5 });
  assert.equal(settings.boolean.motionDetection, true);
  assert.equal(settings.boolean.motionDetectionAcoustic, false);
  assert.equal(settings.boolean.screenOffInDarkness, false);
  assert.equal(settings.boolean.keepScreenOn, true);
  assert.equal(settings.boolean.reloadOnScreenOn, true);
  assert.equal(settings.boolean.loadCurrentPageOnReload, true);
  assert.equal(settings.boolean.skipReloadIfStartUrlShowing, false);
  assert.equal(settings.boolean.pauseWebviewOnPause, false);
  assert.equal(settings.string.motionSensitivity, '92');
  assert.equal(settings.string.motionFps, '5');
  assert.equal(settings.string.timeToScreensaverV2, '0');
  assert.equal(settings.string.timeToScreenOffV2, '0');
  assert.equal(settings.string.reloadEachSeconds, '600');
});

test('camera motion ignores a still frame and catches a wave', function () {
  var still = [10, 10, 10, 10, 12, 12, 12, 12];
  var noise = [11, 10, 12, 10, 13, 12, 11, 12];
  var wave = still.slice();
  wave[0] = 80;
  wave[1] = 90;
  assert.equal(presence.motionHit(still, still, 92), false);
  assert.equal(presence.motionHit(still, noise, 92), false);
  assert.equal(presence.motionHit(still, wave, 92), true);
  assert.equal(presence.motionHit(null, wave, 92), false);
});

test('daily reload waits until 3:00 and never reloads in that minute', function () {
  var tz = 'America/New_York';
  var cap = 26 * 60 * 60 * 1000;
  assert.equal(presence.msUntilReload(new Date('2026-11-04T07:00:00.000Z'), '03:00', tz, cap), 60 * 60 * 1000);
  assert.equal(presence.msUntilReload(new Date('2026-11-04T09:00:00.000Z'), '03:00', tz, cap), 23 * 60 * 60 * 1000);
  assert.equal(presence.msUntilReload(new Date('2026-11-04T08:00:00.000Z'), '03:00', tz, cap), 24 * 60 * 60 * 1000);
  assert.equal(presence.msUntilReload(new Date('2026-11-04T07:00:00.000Z'), '03:00', tz, 30 * 60 * 1000), 30 * 60 * 1000);
  assert.equal(presence.msUntilReload(new Date('2026-11-04T07:00:00.000Z'), 'nope', tz, cap), cap);
});

test('wall clock reload catches a missed 3:00 and a 26 hour freeze', function () {
  var tz = 'America/New_York';
  var loaded = Date.parse('2026-11-07T20:27:00.000Z'); // 3:27 PM local
  assert.equal(presence.shouldReload(loaded, Date.parse('2026-11-08T02:00:00.000Z'), '03:00', tz), false);
  assert.equal(presence.shouldReload(loaded, Date.parse('2026-11-08T08:00:00.000Z'), '03:00', tz), true);
  assert.equal(presence.shouldReload(loaded, loaded + 25 * 60 * 60 * 1000, 'nope', tz), false);
  assert.equal(presence.shouldReload(loaded, loaded + 26 * 60 * 60 * 1000, 'nope', tz), true);
  assert.equal(presence.shouldReload(loaded, loaded + 60 * 60 * 1000, '03:00', tz, 30 * 60 * 1000), true);
});

test('a frozen clock or an overdue feed asks for a reload', function () {
  var stale = 3 * 60 * 1000;
  var painted = Date.parse('2026-11-10T17:01:00.000Z');
  assert.equal(presence.shouldWakeReload(painted, painted + 2 * 60 * 1000, stale), false);
  assert.equal(presence.shouldWakeReload(painted, painted + 3 * 60 * 1000, stale), true);
  assert.equal(presence.shouldWakeReload(painted, painted + 15 * 60 * 1000, stale), true);
  assert.equal(presence.shouldWakeReload(painted, painted - 1000, stale), false);
  assert.equal(presence.shouldWakeReload(null, painted, stale), false);

  var weatherEvery = 15 * 60 * 1000;
  assert.equal(presence.dataIsStale(painted, painted + 16 * 60 * 1000, weatherEvery, stale), false);
  assert.equal(presence.dataIsStale(painted, painted + 18 * 60 * 1000, weatherEvery, stale), true);
  assert.equal(presence.dataIsStale(null, painted + 60 * 60 * 1000, weatherEvery, stale), false);

  var grace = 3 * 60 * 1000;
  assert.equal(presence.pollIsOverdue(painted, painted + 4 * 60 * 1000, 4 * 60 * 1000, grace), false);
  assert.equal(presence.pollIsOverdue(painted, painted + 8 * 60 * 1000, 4 * 60 * 1000, grace), true);
  assert.equal(presence.pollIsOverdue(painted, painted + 2 * 60 * 1000, 20000, grace), false);
  assert.equal(presence.pollIsOverdue(painted, painted + 4 * 60 * 1000, 20000, grace), true);
  assert.equal(presence.pollIsOverdue(0, painted + 10 * 60 * 1000, 20000, grace), false);

  var gap = 10 * 60 * 1000;
  assert.equal(presence.reloadAllowed(0, painted, gap), true);
  assert.equal(presence.reloadAllowed(painted, painted + 5 * 60 * 1000, gap), false);
  assert.equal(presence.reloadAllowed(painted, painted + 10 * 60 * 1000, gap), true);
});

test('a paused camera with a live track should play again', function () {
  assert.equal(presence.cameraAction(true, 'live'), 'play');
  assert.equal(presence.cameraAction(false, 'live'), 'ok');
  assert.equal(presence.cameraAction(true, 'ended'), 'reopen');
  assert.equal(presence.cameraAction(false, 'ended'), 'reopen');
});

test('camera motion ignores a whole-frame brightness change', function () {
  var still = [];
  var shifted = [];
  var wave = [];
  var i;
  for (i = 0; i < 64 * 48; i++) {
    still.push(40);
    shifted.push(90);
    wave.push(40);
  }
  for (i = 0; i < 20 * 16; i++) {
    wave[i] = 140;
  }
  assert.equal(presence.motionHit(still, still, 92), false);
  assert.equal(presence.motionHit(still, shifted, 92), false);
  assert.equal(presence.motionHit(still, wave, 92), true);
});

test('dims after the idle gap and brightens on motion', function () {
  var h = harness();
  h.controller.start();
  assert.deepEqual(h.applied[h.applied.length - 1], [180, 'bright']);
  assert.equal(h.queued().ms, 5000);
  h.advance(5000);
  h.queued().fn();
  assert.deepEqual(h.applied[h.applied.length - 1], [12, 'dim']);
  assert.equal(h.controller.mode(), 'dim');
  h.controller.activity();
  assert.deepEqual(h.applied[h.applied.length - 1], [180, 'bright']);
  assert.equal(h.controller.mode(), 'bright');
});

test('a weather alert holds the bright level', function () {
  var hold = true;
  var h = harness({
    shouldHoldBright: function () { return hold; }
  });
  h.controller.start();
  h.advance(5000);
  h.queued().fn();
  assert.equal(h.controller.mode(), 'bright');
  assert.deepEqual(h.applied[h.applied.length - 1], [180, 'bright']);
  hold = false;
  h.advance(5000);
  h.queued().fn();
  assert.equal(h.controller.mode(), 'dim');
});

test('refreshLevels picks up night brightness without resetting idle', function () {
  var night = false;
  var h = harness({
    levels: function () {
      return night ? { bright: 64, dim: 4 } : { bright: 180, dim: 12 };
    }
  });
  h.controller.start();
  assert.equal(h.queued().ms, 5000);
  h.advance(2000);
  night = true;
  h.controller.refreshLevels();
  assert.deepEqual(h.applied[h.applied.length - 1], [64, 'bright']);
  assert.equal(h.queued().ms, 3000);
});

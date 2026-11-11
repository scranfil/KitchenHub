(function (exports) {
  'use strict';

  var DEFAULT_IDLE_SECONDS = 90;
  var DEFAULT_BRIGHT = 180;
  var DEFAULT_DIM = 12;
  var DEFAULT_SENSITIVITY = 92;
  var DEFAULT_FRAME_RATE = 5;

  function clampLevel(value) {
    var n = Math.round(Number(value));
    if (isNaN(n) || n < 0) {
      return 0;
    }
    if (n > 255) {
      return 255;
    }
    return n;
  }

  function parseClock(text) {
    var match = /^(\d{1,2}):(\d{2})$/.exec(String(text || '').trim());
    if (!match) {
      return null;
    }
    var hour = Number(match[1]);
    var minute = Number(match[2]);
    if (hour > 23 || minute > 59) {
      return null;
    }
    return hour * 60 + minute;
  }

  function clockMinutes(date, timeZone) {
    var parts;
    try {
      parts = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: false,
        timeZone: timeZone || 'UTC'
      }).formatToParts(date);
    } catch (err) {
      return null;
    }
    var hour = 0;
    var minute = 0;
    var i;
    for (i = 0; i < parts.length; i++) {
      if (parts[i].type === 'hour') {
        hour = Number(parts[i].value);
      }
      if (parts[i].type === 'minute') {
        minute = Number(parts[i].value);
      }
    }
    if (hour === 24) {
      hour = 0;
    }
    if (isNaN(hour) || isNaN(minute)) {
      return null;
    }
    return hour * 60 + minute;
  }

  function isNightAt(date, startText, endText, timeZone) {
    var start = parseClock(startText);
    var end = parseClock(endText);
    var nowMin = clockMinutes(date, timeZone);
    if (start == null || end == null || nowMin == null || start === end) {
      return false;
    }
    if (start < end) {
      return nowMin >= start && nowMin < end;
    }
    return nowMin >= start || nowMin < end;
  }

  function levelsFor(presence, night) {
    var src = night && presence && presence.night ? presence.night : (presence || {});
    var bright = src.bright == null ? DEFAULT_BRIGHT : src.bright;
    var dim = src.dim == null ? DEFAULT_DIM : src.dim;
    return {
      bright: clampLevel(bright),
      dim: clampLevel(dim)
    };
  }

  function fullySettings(presence) {
    presence = presence || {};
    var sensitivity = presence.sensitivity == null ? DEFAULT_SENSITIVITY : presence.sensitivity;
    var frameRate = presence.frameRate == null ? DEFAULT_FRAME_RATE : presence.frameRate;
    sensitivity = Math.round(Number(sensitivity));
    frameRate = Math.round(Number(frameRate));
    if (isNaN(sensitivity) || sensitivity < 0) {
      sensitivity = DEFAULT_SENSITIVITY;
    }
    if (sensitivity > 100) {
      sensitivity = 100;
    }
    if (isNaN(frameRate) || frameRate < 1) {
      frameRate = DEFAULT_FRAME_RATE;
    }
    if (frameRate > 25) {
      frameRate = 25;
    }
    return {
      boolean: {
        motionDetection: true,
        screenOnOnMotion: true,
        stopScreensaverOnMotion: true,
        motionDetectionAcoustic: false,
        screenOffInDarkness: false,
        showCamPreview: false,
        keepScreenOn: true,
        // Fully's own timer. The page cannot reload itself once the WebView
        // has stopped running script, and this still fires then.
        reloadOnScreenOn: true,
        loadCurrentPageOnReload: true,
        skipReloadIfStartUrlShowing: false,
        pauseWebviewOnPause: false
      },
      string: {
        motionSensitivity: String(sensitivity),
        motionFps: String(frameRate),
        motionCameraId: '',
        timeToScreensaverV2: '0',
        timeToScreenOffV2: '0',
        reloadEachSeconds: '600'
      }
    };
  }

  function createController(opts) {
    var idleMs = opts.idleMs;
    var now = opts.now;
    var apply = opts.apply;
    var levels = opts.levels;
    var shouldHoldBright = opts.shouldHoldBright || function () { return false; };
    var setTimer = opts.setTimer;
    var clearTimerFn = opts.clearTimer;
    var mode = 'bright';
    var timer = null;
    var lastActivity = now();

    function dropTimer() {
      if (timer != null) {
        clearTimerFn(timer);
        timer = null;
      }
    }

    function paint() {
      var lv = levels();
      apply(mode === 'dim' ? lv.dim : lv.bright, mode);
    }

    function arm() {
      dropTimer();
      var remain = idleMs - (now() - lastActivity);
      if (remain < 0) {
        remain = 0;
      }
      timer = setTimer(function () {
        timer = null;
        if (shouldHoldBright()) {
          lastActivity = now();
          mode = 'bright';
          paint();
          arm();
          return;
        }
        mode = 'dim';
        paint();
      }, remain);
    }

    function activity() {
      lastActivity = now();
      mode = 'bright';
      paint();
      arm();
    }

    function refreshLevels() {
      paint();
      if (mode === 'bright') {
        arm();
      }
    }

    return {
      start: activity,
      activity: activity,
      refreshLevels: refreshLevels,
      mode: function () { return mode; },
      stop: dropTimer
    };
  }

  exports.clampLevel = clampLevel;
  exports.isNightAt = isNightAt;
  exports.levelsFor = levelsFor;
  function motionHit(prev, next, sensitivity) {
    if (!prev || !next || !prev.length || prev.length !== next.length) {
      return false;
    }
    var sens = Math.round(Number(sensitivity));
    if (isNaN(sens)) {
      sens = DEFAULT_SENSITIVITY;
    }
    if (sens < 0) {
      sens = 0;
    }
    if (sens > 100) {
      sens = 100;
    }
    var pixelThreshold = Math.round((100 - sens) * 0.55) + 10;
    var needed = Math.max(1, Math.round(prev.length * 0.015));
    var sum = 0;
    var hits = 0;
    var i;
    var delta;
    for (i = 0; i < prev.length; i++) {
      delta = prev[i] - next[i];
      if (delta < 0) {
        delta = -delta;
      }
      sum += delta;
    }
    // A backlight or exposure change moves the whole frame. A hand does not.
    var mean = sum / prev.length;
    for (i = 0; i < prev.length; i++) {
      delta = prev[i] - next[i];
      if (delta < 0) {
        delta = -delta;
      }
      if (delta - mean >= pixelThreshold) {
        hits++;
        if (hits >= needed) {
          return true;
        }
      }
    }
    return false;
  }

  function cameraAction(paused, trackState) {
    if (trackState !== 'live') {
      return 'reopen';
    }
    if (paused) {
      return 'play';
    }
    return 'ok';
  }

  var RELOAD_CAP_MS = 26 * 60 * 60 * 1000;

  function msUntilReload(date, clockText, timeZone, capMs) {
    var cap = Number(capMs);
    if (isNaN(cap) || cap < 60000) {
      cap = RELOAD_CAP_MS;
    }
    var target = parseClock(clockText);
    var nowMin = clockMinutes(date, timeZone);
    if (target == null || nowMin == null) {
      return cap;
    }
    var delta = target - nowMin;
    if (delta <= 0) {
      delta += 1440;
    }
    var wait = delta * 60000;
    if (wait < 60000) {
      wait = 60000;
    }
    if (wait > cap) {
      return cap;
    }
    return wait;
  }

  // Wall-clock check so a frozen setTimeout cannot skip the nightly reload.
  function shouldReload(loadedAtMs, nowMs, clockText, timeZone, maxAgeMs) {
    var loaded = Number(loadedAtMs);
    var now = Number(nowMs);
    var cap = Number(maxAgeMs);
    if (isNaN(loaded) || isNaN(now) || now < loaded) {
      return false;
    }
    if (isNaN(cap) || cap < 60000) {
      cap = RELOAD_CAP_MS;
    }
    if (now - loaded >= cap) {
      return true;
    }
    var target = parseClock(clockText);
    var loadMin = clockMinutes(new Date(loaded), timeZone);
    if (target == null || loadMin == null) {
      return false;
    }
    var delta = target - loadMin;
    if (delta <= 0) {
      delta += 1440;
    }
    return now >= loaded + delta * 60000;
  }

  exports.fullySettings = fullySettings;
  exports.createController = createController;
  exports.motionHit = motionHit;
  exports.cameraAction = cameraAction;
  exports.msUntilReload = msUntilReload;
  exports.shouldReload = shouldReload;

  // True when a painted clock or a finished poll is older than the limit.
  // The limit is a few minutes, so a normal refresh interval does not trip it.
  function shouldWakeReload(lastTickMs, nowMs, staleMs) {
    var last = Number(lastTickMs);
    var now = Number(nowMs);
    var stale = Number(staleMs);
    if (!isFinite(last) || !isFinite(now) || !isFinite(stale) || stale < 1000 || last <= 0) {
      return false;
    }
    if (now < last) {
      return false;
    }
    return now - last >= stale;
  }

  // Data is stale once it is older than its refresh interval plus a grace period.
  function dataIsStale(savedAtMs, nowMs, intervalMs, graceMs) {
    var saved = Number(savedAtMs);
    var now = Number(nowMs);
    if (!isFinite(saved) || !isFinite(now) || saved <= 0 || now < saved) {
      return false;
    }
    var interval = Number(intervalMs);
    var grace = Number(graceMs);
    if (isNaN(interval) || interval < 0) {
      interval = 0;
    }
    if (isNaN(grace) || grace < 0) {
      grace = 0;
    }
    return now - saved >= interval + grace;
  }

  // A door poll is overdue only after its own scheduled wait, plus grace.
  // Backoff during an outage is that wait, so it is not a missed timer.
  function pollIsOverdue(lastPollMs, nowMs, scheduledDelayMs, graceMs) {
    var last = Number(lastPollMs);
    var now = Number(nowMs);
    var delay = Number(scheduledDelayMs);
    var grace = Number(graceMs);
    if (!isFinite(last) || last <= 0 || !isFinite(now) || now < last) {
      return false;
    }
    if (!isFinite(delay) || delay < 0) {
      delay = 0;
    }
    if (!isFinite(grace) || grace < 0) {
      grace = 0;
    }
    return now - last >= delay + grace;
  }

  function reloadAllowed(lastReloadMs, nowMs, gapMs) {
    var last = Number(lastReloadMs);
    var now = Number(nowMs);
    var gap = Number(gapMs);
    if (!isFinite(now) || !isFinite(gap) || gap < 0) {
      return false;
    }
    if (!isFinite(last) || last <= 0) {
      return true;
    }
    return now - last >= gap;
  }

  exports.shouldWakeReload = shouldWakeReload;
  exports.dataIsStale = dataIsStale;
  exports.pollIsOverdue = pollIsOverdue;
  exports.reloadAllowed = reloadAllowed;
  exports.DEFAULT_IDLE_SECONDS = DEFAULT_IDLE_SECONDS;

  function attachBrowserApi() {
    if (typeof window === 'undefined' || !window.KH || !window.KH.util) {
      return;
    }

    var util = window.KH.util;
    var controller = null;
    var started = false;
    var frameGeneration = 0;
    var veilHoldUntil = 0;
    var lastVeil = null;

    function presenceCfg() {
      return util.cfg.presence || {};
    }

    function idleMs() {
      var q = util.query.presenceIdle;
      var seconds = Number(q);
      if (q == null || q === true || isNaN(seconds)) {
        seconds = Number(presenceCfg().idleSeconds);
      }
      if (isNaN(seconds)) {
        seconds = DEFAULT_IDLE_SECONDS;
      }
      if (seconds < 0) {
        seconds = 0;
      }
      return seconds * 1000;
    }

    function currentLevels() {
      var cfg = util.cfg;
      var nightCfg = cfg.night || {};
      var night = isNightAt(util.now(), nightCfg.start, nightCfg.end, util.timezone());
      if (util.query.night) {
        night = true;
      }
      return levelsFor(presenceCfg(), night);
    }

    function alertHolding() {
      var el = util.$('alerts');
      if (!el || el.hidden) {
        return false;
      }
      return el.className.indexOf('is-empty') === -1;
    }

    function stopStream(stream) {
      var tracks = stream && stream.getTracks ? stream.getTracks() : [];
      var i;
      for (i = 0; i < tracks.length; i++) {
        tracks[i].stop();
      }
    }

    function openCamera() {
      var tries = [
        { audio: false, video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } } },
        { audio: false, video: true }
      ];
      function attempt(index) {
        return navigator.mediaDevices.getUserMedia(tries[index]).catch(function (err) {
          if (index + 1 < tries.length) {
            return attempt(index + 1);
          }
          throw err;
        });
      }
      return attempt(0);
    }

    function trackState(stream) {
      var tracks = stream && stream.getVideoTracks ? stream.getVideoTracks() : [];
      var i;
      for (i = 0; i < tracks.length; i++) {
        if (tracks[i].readyState === 'live') {
          return 'live';
        }
      }
      if (!tracks.length) {
        return 'ended';
      }
      return tracks[0].readyState || 'ended';
    }

    function startBrowserMotion(onMotion) {
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        return;
      }
      var video = document.createElement('video');
      video.setAttribute('playsinline', '');
      video.setAttribute('muted', '');
      video.setAttribute('width', '64');
      video.setAttribute('height', '48');
      video.muted = true;
      video.autoplay = true;
      video.className = 'presence-camera';
      document.body.appendChild(video);
      var canvas = document.createElement('canvas');
      var width = 64;
      var height = 48;
      canvas.width = width;
      canvas.height = height;
      var ctx = canvas.getContext('2d');
      var prev = null;
      var seenGeneration = frameGeneration;
      var opening = false;
      var resumePending = false;
      var resumeAt = 0;
      var playingSince = 0;

      function resumePlayback() {
        if (resumePending || Date.now() < resumeAt || video.paused !== true) {
          return;
        }
        if (cameraAction(true, trackState(video.srcObject)) !== 'play') {
          return;
        }
        resumePending = true;
        prev = null;
        var played = video.play();
        if (played && typeof played.then === 'function') {
          played.then(function () {
            resumePending = false;
          }, function (err) {
            resumePending = false;
            resumeAt = Date.now() + 2000;
            console.error('[presence] play', err);
          });
          return;
        }
        resumePending = false;
      }

      function ensureCamera() {
        var action = cameraAction(video.paused, trackState(video.srcObject));
        if (action === 'ok') {
          return;
        }
        if (action === 'play') {
          resumePlayback();
          return;
        }
        if (opening || Date.now() < resumeAt) {
          return;
        }
        opening = true;
        stopStream(video.srcObject);
        video.srcObject = null;
        prev = null;
        openCamera().then(function (stream) {
          opening = false;
          video.srcObject = stream;
          var tracks = stream.getVideoTracks ? stream.getVideoTracks() : [];
          var i;
          for (i = 0; i < tracks.length; i++) {
            tracks[i].addEventListener('ended', ensureCamera);
            tracks[i].addEventListener('unmute', resumePlayback);
          }
          resumePlayback();
        }).catch(function (err) {
          opening = false;
          resumeAt = Date.now() + 5000;
          console.error('[presence] camera', err);
        });
      }

      function sample() {
        var rate = Number(presenceCfg().frameRate);
        if (isNaN(rate) || rate < 1) {
          rate = DEFAULT_FRAME_RATE;
        }
        setTimeout(sample, Math.round(1000 / rate));
        ensureCamera();
        if (!ctx || video.readyState < 2 || video.paused) {
          return;
        }
        try {
          ctx.drawImage(video, 0, 0, width, height);
          var data = ctx.getImageData(0, 0, width, height).data;
          var gray = new Uint8Array(width * height);
          var i;
          var p;
          for (i = 0, p = 0; i < gray.length; i++, p += 4) {
            gray[i] = (data[p] * 54 + data[p + 1] * 183 + data[p + 2] * 19) >> 8;
          }
          if (seenGeneration !== frameGeneration) {
            prev = null;
            seenGeneration = frameGeneration;
          }
          if (Date.now() >= veilHoldUntil && motionHit(prev, gray, presenceCfg().sensitivity)) {
            onMotion();
          }
          prev = gray;
        } catch (err) {
          console.error('[presence]', err);
        }
      }

      video.addEventListener('playing', function () {
        playingSince = Date.now();
      });
      video.addEventListener('pause', function () {
        if (playingSince && Date.now() - playingSince < 1000) {
          resumeAt = Date.now() + 2000;
        }
        ensureCamera();
      });
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') {
          ensureCamera();
        }
      });
      sample();
    }

    function keepAwake() {
      if (!navigator.wakeLock || typeof navigator.wakeLock.request !== 'function') {
        return;
      }
      var held = null;
      function request() {
        if (held) {
          return;
        }
        if (document.visibilityState && document.visibilityState !== 'visible') {
          return;
        }
        navigator.wakeLock.request('screen').then(function (lock) {
          held = lock;
          lock.addEventListener('release', function () {
            held = null;
            setTimeout(request, 1000);
          });
        }, function (err) {
          console.error('[presence] wake lock', err);
          setTimeout(request, 5000);
        });
      }
      request();
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') {
          request();
        }
      });
    }

    function hardware() {
      var f = window.fully;
      if (!f || typeof f.setScreenBrightness !== 'function') {
        return null;
      }
      return f;
    }

    function applyFully(f) {
      var settings = fullySettings(presenceCfg());
      var keys;
      var i;
      if (typeof f.setBooleanSetting === 'function') {
        keys = Object.keys(settings.boolean);
        for (i = 0; i < keys.length; i++) {
          try {
            f.setBooleanSetting(keys[i], settings.boolean[keys[i]]);
          } catch (err) {
            console.error('[presence]', keys[i], err);
          }
        }
      }
      if (typeof f.setStringSetting === 'function') {
        keys = Object.keys(settings.string);
        for (i = 0; i < keys.length; i++) {
          try {
            f.setStringSetting(keys[i], settings.string[keys[i]]);
          } catch (err) {
            console.error('[presence]', keys[i], err);
          }
        }
      }
      try {
        if (typeof f.startMotionDetection === 'function') {
          f.startMotionDetection();
        }
      } catch (err) {
        console.error('[presence]', err);
      }
      try {
        if (typeof f.bind === 'function') {
          f.bind('onMotion', 'if (window.KH && KH.presence && KH.presence.onMotion) { KH.presence.onMotion(); }');
          f.bind('screenOn', 'window.location.reload();');
        }
      } catch (err) {
        console.error('[presence]', err);
      }
    }

    function panelCap() {
      var cfg = presenceCfg();
      var cap = clampLevel(cfg.bright == null ? DEFAULT_BRIGHT : cfg.bright);
      if (cap < 1) {
        return 1;
      }
      return cap;
    }

    function veilFor(level) {
      var opacity = 1 - (clampLevel(level) / panelCap());
      if (opacity < 0) {
        opacity = 0;
      }
      if (opacity > 0.97) {
        opacity = 0.97;
      }
      return String(Math.round(opacity * 1000) / 1000);
    }

    function apply(level, mode) {
      document.body.classList.toggle('presence-dim', mode === 'dim');
      document.body.classList.toggle('presence-bright', mode !== 'dim');
      var f = hardware();
      var veil = f ? '0' : veilFor(level);
      if (veil !== lastVeil) {
        lastVeil = veil;
        frameGeneration += 1;
        veilHoldUntil = Date.now() + 1500;
      }
      document.documentElement.style.setProperty('--presence-veil', veil);
      if (!f) {
        document.body.classList.remove('presence-device');
        return;
      }
      document.body.classList.add('presence-device');
      try {
        if (mode !== 'dim') {
          if (typeof f.getScreenOn === 'function' && !f.getScreenOn() && typeof f.turnScreenOn === 'function') {
            f.turnScreenOn();
          }
          if (typeof f.stopScreensaver === 'function') {
            f.stopScreensaver();
          }
        }
        f.setScreenBrightness(level);
      } catch (err) {
        console.error('[presence]', err);
      }
    }

    function disabled() {
      return presenceCfg().enabled === false || util.query.presence === 'off';
    }

    function init() {
      if (started) {
        return;
      }
      started = true;
      if (disabled()) {
        document.body.classList.remove('presence-dim', 'presence-bright', 'presence-device');
        document.documentElement.style.setProperty('--presence-veil', '0');
        return;
      }

      var lock = util.query.presence;
      if (lock === 'dim' || lock === 'bright') {
        apply(lock === 'dim' ? currentLevels().dim : currentLevels().bright, lock);
        var fLock = hardware();
        if (fLock) {
          applyFully(fLock);
        }
        return;
      }

      var f = hardware();
      if (f) {
        applyFully(f);
      }

      controller = createController({
        idleMs: idleMs(),
        now: function () { return Date.now(); },
        apply: apply,
        levels: currentLevels,
        shouldHoldBright: alertHolding,
        setTimer: function (fn, ms) { return setTimeout(fn, ms); },
        clearTimer: function (id) { clearTimeout(id); }
      });
      controller.start();
      if (!hardware()) {
        keepAwake();
        startBrowserMotion(function () {
          if (Date.now() < veilHoldUntil) {
            return;
          }
          if (controller) {
            controller.activity();
          }
        });
      }

      document.addEventListener('pointerdown', function () {
        if (controller) {
          controller.activity();
        }
      }, true);

      var alerts = util.$('alerts');
      if (alerts && typeof MutationObserver === 'function') {
        var observer = new MutationObserver(function () {
          if (controller && alertHolding()) {
            controller.activity();
          }
        });
        observer.observe(alerts, { attributes: true, attributeFilter: ['class', 'hidden'] });
      }

      function tickLevels() {
        if (controller) {
          controller.refreshLevels();
        }
        util.schedule('presence-levels', tickLevels, 60000);
      }
      util.schedule('presence-levels', tickLevels, 60000);
      util.onReschedule(function () {
        util.schedule('presence-levels', tickLevels, 60000);
      });
    }

    exports.init = init;
    exports.onMotion = function () {
      if (controller) {
        controller.activity();
      }
    };
    exports.mode = function () {
      if (!started || disabled()) {
        return 'off';
      }
      if (!controller) {
        return util.query.presence === 'dim' ? 'dim' : 'bright';
      }
      return controller.mode();
    };

    if (window.KH) {
      window.KH.presence = exports;
    }
  }

  if (typeof window !== 'undefined') {
    attachBrowserApi();
  }
})(typeof module !== 'undefined' && module.exports
  ? module.exports
  : ((window.KH = window.KH || {}).presence = (window.KH && window.KH.presence) || {}));

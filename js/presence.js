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
        keepScreenOn: true
      },
      string: {
        motionSensitivity: String(sensitivity),
        motionFps: String(frameRate),
        motionCameraId: '',
        timeToScreensaverV2: '0',
        timeToScreenOffV2: '0'
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
    var hits = 0;
    var i;
    var delta;
    for (i = 0; i < prev.length; i++) {
      delta = prev[i] - next[i];
      if (delta < 0) {
        delta = -delta;
      }
      if (delta >= pixelThreshold) {
        hits++;
        if (hits >= needed) {
          return true;
        }
      }
    }
    return false;
  }

  exports.fullySettings = fullySettings;
  exports.createController = createController;
  exports.motionHit = motionHit;
  exports.DEFAULT_IDLE_SECONDS = DEFAULT_IDLE_SECONDS;

  function attachBrowserApi() {
    if (typeof window === 'undefined' || !window.KH || !window.KH.util) {
      return;
    }

    var util = window.KH.util;
    var controller = null;
    var started = false;

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

    function startBrowserMotion(onMotion) {
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        return;
      }
      var video = document.createElement('video');
      video.setAttribute('playsinline', '');
      video.setAttribute('muted', '');
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

      function sample() {
        var rate = Number(presenceCfg().frameRate);
        if (isNaN(rate) || rate < 1) {
          rate = DEFAULT_FRAME_RATE;
        }
        setTimeout(sample, Math.round(1000 / rate));
        if (!ctx || video.readyState < 2) {
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
          if (motionHit(prev, gray, presenceCfg().sensitivity)) {
            onMotion();
          }
          prev = gray;
        } catch (err) {
          console.error('[presence]', err);
        }
      }

      openCamera().then(function (stream) {
        video.srcObject = stream;
        var played = video.play();
        if (played && typeof played.then === 'function') {
          return played.then(function () {
            sample();
          });
        }
        sample();
      }).catch(function (err) {
        stopStream(video.srcObject);
        console.error('[presence] camera', err);
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
        }
      } catch (err) {
        console.error('[presence]', err);
      }
    }

    function apply(level, mode) {
      document.body.classList.toggle('presence-dim', mode === 'dim');
      document.body.classList.toggle('presence-bright', mode !== 'dim');
      var f = hardware();
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
        startBrowserMotion(function () {
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

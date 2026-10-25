(function (global) {
  'use strict';

  var KH = global.KH || {};
  global.KH = KH;

  var CACHE_PREFIX = 'kh:v1:';
  var FETCH_TIMEOUT_MS = 15000;
  var CLOCK_JUMP_MS = 5 * 60 * 1000;

  var timers = {};
  var inflight = {};
  var restarts = [];
  var lastNowMs = Date.now();
  var recentResults = [];

  function parseQuery() {
    var out = {};
    var search = '';
    if (typeof location !== 'undefined' && location.search) {
      search = location.search;
    }
    if (search.charAt(0) === '?') {
      search = search.slice(1);
    }
    if (!search) {
      return out;
    }
    var parts = search.split('&');
    var i;
    for (i = 0; i < parts.length; i++) {
      if (!parts[i]) {
        continue;
      }
      var eq = parts[i].indexOf('=');
      var key;
      var val;
      if (eq === -1) {
        key = decodeURIComponent(parts[i]);
        val = true;
      } else {
        key = decodeURIComponent(parts[i].slice(0, eq));
        val = decodeURIComponent(parts[i].slice(eq + 1).replace(/\+/g, ' '));
        if (val === '' || val === '1' || val === 'true') {
          val = true;
        }
      }
      out[key] = val;
    }
    return out;
  }

  var query = parseQuery();
  var cfg = global.KH_CONFIG || {};
  var debugEnabled = !!(cfg.debug || query.debug);

  function nowMs() {
    if (typeof query.now === 'string' && query.now) {
      var frozen = Date.parse(query.now);
      if (!isNaN(frozen)) {
        return frozen;
      }
    }
    return Date.now();
  }

  function now() {
    return new Date(nowMs());
  }

  function timezone() {
    return cfg.timezone || 'America/New_York';
  }

  function detectClockJump() {
    var real = Date.now();
    if (Math.abs(real - lastNowMs) > CLOCK_JUMP_MS) {
      lastNowMs = real;
      rescheduleAll();
      return true;
    }
    lastNowMs = real;
    return false;
  }

  function cacheGet(panel) {
    try {
      if (typeof localStorage === 'undefined') {
        return null;
      }
      var raw = localStorage.getItem(CACHE_PREFIX + panel);
      if (!raw) {
        return null;
      }
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }
      return parsed;
    } catch (err) {
      console.error('[cache]', err);
      return null;
    }
  }

  function cacheSet(panel, data) {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }
      localStorage.setItem(CACHE_PREFIX + panel, JSON.stringify({
        savedAt: Date.now(),
        data: data
      }));
    } catch (err) {
      console.error('[cache]', err);
    }
  }

  function clearTimer(name) {
    if (timers[name]) {
      clearTimeout(timers[name]);
      timers[name] = null;
    }
  }

  function schedule(name, fn, delayMs) {
    clearTimer(name);
    timers[name] = setTimeout(function () {
      timers[name] = null;
      fn();
    }, delayMs);
  }

  function onReschedule(fn) {
    restarts.push(fn);
  }

  function rescheduleAll() {
    var names = Object.keys(timers);
    var i;
    for (i = 0; i < names.length; i++) {
      clearTimer(names[i]);
    }
    for (i = 0; i < restarts.length; i++) {
      try {
        restarts[i]();
      } catch (err) {
        console.error('[scheduler]', err);
      }
    }
  }

  function jitterMs(minutes) {
    var base = minutes * 60 * 1000;
    var factor = 0.9 + Math.random() * 0.2;
    return Math.round(base * factor);
  }

  function backoffMs(failCount) {
    var exp = Math.pow(2, Math.max(0, failCount - 1));
    var minutes = Math.min(30, exp);
    return jitterMs(minutes);
  }

  function abortInflight(name) {
    if (inflight[name]) {
      try {
        inflight[name].abort();
      } catch (err) {
        console.error('[fetch]', err);
      }
      inflight[name] = null;
    }
  }

  function recordFetch(ok) {
    recentResults.push(ok);
    if (recentResults.length > 2) {
      recentResults = recentResults.slice(recentResults.length - 2);
    }
  }

  function lastTwoFailed() {
    return recentResults.length >= 2 && !recentResults[0] && !recentResults[1];
  }

  function isOffline() {
    if (query.offline) {
      return true;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return true;
    }
    return lastTwoFailed();
  }

  function fetchParsed(name, url, options, parse) {
    options = options || {};
    if (query.offline) {
      recordFetch(false);
      return Promise.reject(new Error('offline'));
    }

    abortInflight(name);
    var controller = new AbortController();
    inflight[name] = controller;
    var timeout = options.timeout || FETCH_TIMEOUT_MS;
    var timer = setTimeout(function () {
      controller.abort();
    }, timeout);

    var headers = options.headers || {};
    var track = options.record !== false;
    var init = {
      method: 'GET',
      headers: headers,
      signal: controller.signal
    };

    return fetch(url, init).then(function (res) {
      if (!res.ok) {
        throw new Error('HTTP ' + res.status);
      }
      return parse(res);
    }).then(function (data) {
      clearTimeout(timer);
      if (inflight[name] === controller) {
        inflight[name] = null;
      }
      if (track) {
        recordFetch(true);
      }
      return data;
    }).catch(function (err) {
      clearTimeout(timer);
      if (inflight[name] === controller) {
        inflight[name] = null;
      }
      if (track) {
        recordFetch(false);
      }
      throw err;
    });
  }

  function fetchJson(name, url, options) {
    return fetchParsed(name, url, options, function (res) {
      return res.json();
    });
  }

  function fetchText(name, url, options) {
    return fetchParsed(name, url, options, function (res) {
      return res.text();
    });
  }

  function formatTime(date, opts) {
    opts = opts || {};
    var parts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: opts.seconds ? '2-digit' : undefined,
      hour12: opts.hour12 !== false,
      timeZone: timezone()
    }).formatToParts(date);
    var map = {};
    var i;
    for (i = 0; i < parts.length; i++) {
      map[parts[i].type] = parts[i].value;
    }
    return {
      hour: map.hour,
      minute: map.minute,
      second: map.second || '',
      dayPeriod: map.dayPeriod || '',
      text: (map.hour || '') + ':' + (map.minute || '') + (opts.seconds && map.second ? ':' + map.second : '') + (map.dayPeriod ? ' ' + map.dayPeriod : '')
    };
  }

  function formatDate(date) {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: timezone()
    }).format(date);
  }

  function formatHourLabel(date) {
    var parts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: true,
      timeZone: timezone()
    }).formatToParts(date);
    var hour = '';
    var period = '';
    var i;
    for (i = 0; i < parts.length; i++) {
      if (parts[i].type === 'hour') {
        hour = parts[i].value;
      }
      if (parts[i].type === 'dayPeriod') {
        period = parts[i].value;
      }
    }
    var letter = period ? period.charAt(0).toLowerCase() : '';
    return hour + letter;
  }

  function formatUpdatedClock(ms) {
    var parts = formatTime(new Date(ms), { hour12: true });
    return parts.hour + ':' + parts.minute + ' ' + parts.dayPeriod;
  }

  function formatAge(savedAt, atMs) {
    var mins = Math.round(((atMs || Date.now()) - savedAt) / 60000);
    if (mins < 1) {
      return 'now';
    }
    if (mins < 60) {
      return mins + 'm';
    }
    var hours = Math.round(mins / 60);
    if (hours < 48) {
      return hours + 'h';
    }
    return Math.round(hours / 24) + 'd';
  }

  function msUntilNextMinute(date) {
    return 60000 - (date.getSeconds() * 1000 + date.getMilliseconds());
  }

  function msUntilNextSecond(date) {
    return 1000 - date.getMilliseconds();
  }

  function safeRender(panel, fn) {
    try {
      fn();
    } catch (err) {
      console.error('[' + panel + ']', err);
    }
  }

  function emptyEl(el) {
    while (el && el.firstChild) {
      el.removeChild(el.firstChild);
    }
  }

  function setText(el, text) {
    if (el) {
      el.textContent = text == null ? '' : String(text);
    }
  }

  function $(id) {
    return document.getElementById(id);
  }

  function debug() {
    return debugEnabled;
  }

  KH.util = {
    query: query,
    cfg: cfg,
    now: now,
    nowMs: nowMs,
    timezone: timezone,
    detectClockJump: detectClockJump,
    cacheGet: cacheGet,
    cacheSet: cacheSet,
    schedule: schedule,
    clearTimer: clearTimer,
    onReschedule: onReschedule,
    rescheduleAll: rescheduleAll,
    jitterMs: jitterMs,
    backoffMs: backoffMs,
    fetchJson: fetchJson,
    fetchText: fetchText,
    abortInflight: abortInflight,
    isOffline: isOffline,
    lastTwoFailed: lastTwoFailed,
    formatTime: formatTime,
    formatDate: formatDate,
    formatHourLabel: formatHourLabel,
    formatUpdatedClock: formatUpdatedClock,
    formatAge: formatAge,
    msUntilNextMinute: msUntilNextMinute,
    msUntilNextSecond: msUntilNextSecond,
    safeRender: safeRender,
    emptyEl: emptyEl,
    setText: setText,
    $: $,
    debug: debug,
    timers: timers
  };
})(typeof window !== 'undefined' ? window : global);

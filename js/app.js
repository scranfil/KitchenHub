(function () {
  'use strict';

  var KH = window.KH || (window.KH = {});
  var util = KH.util;
  var TAP_DEBOUNCE_MS = 30000;
  var STALE_MS = 3 * 60 * 1000;
  var RELOAD_GAP_MS = 10 * 60 * 1000;
  var STALE_RELOAD_KEY = 'kh:stale-reload';
  var lastTap = 0;
  var bootAt = Date.now();
  var lastPaintMs = Date.now();
  var lastNudgeMs = 0;
  var statusTimes = { weather: null, news: null };

  KH.status = {
    set: function (panel, savedAt) {
      statusTimes[panel] = savedAt || Date.now();
      renderStatus();
    }
  };

  function applyTheme() {
    var night = !!util.query.night;
    document.body.classList.remove('theme-night', 'theme-day');
    document.body.classList.add(night ? 'theme-night' : 'theme-day');
    var theme = document.querySelector('meta[name="theme-color"]');
    if (theme) {
      theme.setAttribute('content', night ? '#000000' : '#f3efe6');
    }
  }

  function hardReload() {
    window.location.reload();
  }

  function reloadDue() {
    if (!KH.presence || typeof KH.presence.shouldReload !== 'function') {
      return false;
    }
    return KH.presence.shouldReload(
      bootAt,
      Date.now(),
      util.cfg.dailyReload,
      util.timezone(),
      26 * 60 * 60 * 1000
    );
  }

  function notePaint() {
    lastPaintMs = Date.now();
  }

  function panelIsStale(name, minutes) {
    var saved = statusTimes[name];
    if (!saved || !KH.presence || typeof KH.presence.dataIsStale !== 'function') {
      return false;
    }
    return KH.presence.dataIsStale(saved, Date.now(), (Number(minutes) || 0) * 60000, STALE_MS);
  }

  function updatesAreStale() {
    if (KH.presence && typeof KH.presence.shouldWakeReload === 'function') {
      if (KH.presence.shouldWakeReload(lastPaintMs, Date.now(), STALE_MS)) {
        return true;
      }
      if (KH.doors && typeof KH.doors.lastPoll === 'function' && typeof KH.doors.scheduledDelay === 'function' && typeof KH.presence.pollIsOverdue === 'function') {
        var polled = KH.doors.lastPoll();
        if (KH.presence.pollIsOverdue(polled, Date.now(), KH.doors.scheduledDelay(), STALE_MS)) {
          return true;
        }
      }
    }
    var mins = util.cfg.refreshMinutes || {};
    return panelIsStale('weather', mins.observation || 15) || panelIsStale('news', mins.news || 15);
  }

  function refreshLiveData() {
    if (KH.weather && KH.weather.refresh) {
      KH.weather.refresh();
    }
    if (KH.alerts && KH.alerts.refresh) {
      KH.alerts.refresh();
    }
    if (KH.news && KH.news.refresh) {
      KH.news.refresh();
    }
    if (KH.scores && KH.scores.refresh) {
      KH.scores.refresh();
    }
    if (KH.nest && KH.nest.refresh) {
      KH.nest.refresh();
    }
    if (KH.hue && KH.hue.refresh) {
      KH.hue.refresh();
    }
    if (KH.smartthings && KH.smartthings.refresh) {
      KH.smartthings.refresh();
    }
    if (KH.doors && KH.doors.refresh) {
      KH.doors.refresh();
    }
  }

  function lastStaleReload() {
    try {
      return Number(sessionStorage.getItem(STALE_RELOAD_KEY)) || 0;
    } catch (err) {
      return 0;
    }
  }

  function reloadBecauseStale() {
    var now = Date.now();
    if (KH.presence && typeof KH.presence.reloadAllowed === 'function' && !KH.presence.reloadAllowed(lastStaleReload(), now, RELOAD_GAP_MS)) {
      return;
    }
    try {
      sessionStorage.setItem(STALE_RELOAD_KEY, String(now));
    } catch (err) {
      console.error('[wake]', err);
    }
    hardReload();
  }

  // The page's setTimeout queue is what froze. A worker timer is a different
  // queue: its postMessage still arrives if the page can run tasks at all.
  function startHeartbeat() {
    function onTick() {
      if (updatesAreStale()) {
        reloadBecauseStale();
      }
    }
    try {
      var blob = new Blob([
        'setInterval(function(){postMessage(1)},30000);'
      ], { type: 'application/javascript' });
      var worker = new Worker(URL.createObjectURL(blob));
      worker.onmessage = onTick;
    } catch (err) {
      console.error('[wake]', err);
      setInterval(onTick, 30000);
    }
  }

  // Chrome on this tablet can drop its timer queue. The clock, the feeds, and
  // the door poll are all setTimeout chains, so once the queue is gone nothing
  // inside it can notice. The worker heartbeat can. A tab focus or freeze
  // resume can too.
  function wake(nudge) {
    if (updatesAreStale()) {
      reloadBecauseStale();
      return;
    }
    if (!nudge || Date.now() - bootAt < 20000) {
      return;
    }
    renderClock();
    if (Date.now() - lastNudgeMs < 30000) {
      return;
    }
    lastNudgeMs = Date.now();
    refreshLiveData();
  }

  function renderClock() {
    // Chrome on this tablet can freeze timers for hours while the panel stays
    // dim on stale data. A wall-clock gap means the page must start over.
    var reloading = false;
    var delay = 60000;
    try {
      if (util.detectClockJump()) {
        reloading = true;
        hardReload();
        return;
      }
      if (reloadDue()) {
        reloading = true;
        hardReload();
        return;
      }
      var n = util.now();
      var cfg = util.cfg.clock || {};
      var parts = util.formatTime(n, { hour12: cfg.hour12 !== false, seconds: !!cfg.showSeconds });
      util.setText(util.$('clock-hhmm'), parts.hour + ':' + parts.minute + (cfg.showSeconds ? ':' + parts.second : ''));
      util.setText(util.$('clock-ampm'), parts.dayPeriod);
      util.setText(util.$('clock-date'), util.formatDate(n));
      notePaint();
      delay = cfg.showSeconds ? util.msUntilNextSecond(new Date()) : util.msUntilNextMinute(new Date());
      if (delay < 20) {
        delay += cfg.showSeconds ? 1000 : 60000;
      }
    } catch (err) {
      console.error('[clock]', err);
    } finally {
      if (!reloading) {
        util.schedule('clock', renderClock, delay);
      }
    }
  }

  function renderStatus() {
    util.safeRender('status', function () {
      var bits = [];
      var weatherBit = 'Weather ' + labelFor('weather', util.cfg.refreshMinutes.observation);
      var place = (util.cfg.location && util.cfg.location.name) || '';
      if (place) {
        weatherBit += ' · ' + place;
      }
      bits.push(weatherBit);
      bits.push('News ' + labelFor('news', util.cfg.refreshMinutes.news));
      if (KH.scores && KH.scores.hasGame && KH.scores.hasGame()) {
        bits.push('Scores ' + labelFor('scores', util.cfg.refreshMinutes.scores || 5));
      }
      util.setText(util.$('status-times'), bits.join(' · '));

      var pill = util.$('offline-pill');
      if (pill) {
        if (util.isOffline()) {
          pill.hidden = false;
        } else {
          pill.hidden = true;
        }
      }
    });
    renderDebug();
  }

  function labelFor(panel, intervalMin) {
    var ts = statusTimes[panel];
    if (!ts) {
      var cached = util.cacheGet(panel);
      if (cached) {
        ts = cached.savedAt;
        statusTimes[panel] = ts;
      }
    }
    if (!ts) {
      return '—';
    }
    var clock = util.formatUpdatedClock(ts);
    var age = util.formatAge(ts);
    var stale = (Date.now() - ts) > intervalMin * 2 * 60 * 1000;
    if (stale || util.isOffline()) {
      return clock + ' (' + age + ')';
    }
    return clock;
  }

  function renderDebug() {
    var el = util.$('debug');
    if (!el) {
      return;
    }
    if (!util.debug()) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    var names = Object.keys(util.timers);
    var lines = ['debug on'];
    var i;
    for (i = 0; i < names.length; i++) {
      lines.push('timer ' + names[i] + ': ' + (util.timers[names[i]] ? 'armed' : 'idle'));
    }
    var panels = ['weather', 'alerts', 'sun', 'news', 'scores', 'nest-doorbell', 'nest-thermostat', 'hue'];
    for (i = 0; i < panels.length; i++) {
      var c = util.cacheGet(panels[i]);
      if (c) {
        lines.push(panels[i] + ' cache ' + util.formatAge(c.savedAt));
      } else {
        lines.push(panels[i] + ' cache —');
      }
    }
    if (KH.presence && KH.presence.mode) {
      lines.push('presence ' + KH.presence.mode());
    }
    el.textContent = lines.join(' · ');
  }

  function skipsRefresh(node) {
    while (node) {
      if (node.id === 'news-list' || node.id === 'news-detail' || node.id === 'daily' || node.id === 'day-detail' || node.id === 'map-detail' || node.id === 'home' || node.id === 'hero-tools' || node.id === 'live-view' || node.id === 'nest-setup') {
        return true;
      }
      node = node.parentNode;
    }
    return false;
  }

  function onTap(ev) {
    if (skipsRefresh(ev && ev.target)) {
      return;
    }
    var t = Date.now();
    if (t - lastTap < TAP_DEBOUNCE_MS) {
      return;
    }
    lastTap = t;
    if (KH.weather && KH.weather.refresh) {
      KH.weather.refresh();
    }
    if (KH.alerts && KH.alerts.refresh) {
      KH.alerts.refresh();
    }
    if (KH.scores && KH.scores.refresh) {
      KH.scores.refresh();
    }
  }

  function onOnline() {
    renderStatus();
    if (KH.weather && KH.weather.refresh) {
      KH.weather.refresh();
    }
    if (KH.alerts && KH.alerts.refresh) {
      KH.alerts.refresh();
    }
    if (KH.news && KH.news.refresh) {
      KH.news.refresh();
    }
    if (KH.scores && KH.scores.refresh) {
      KH.scores.refresh();
    }
    if (KH.nest && KH.nest.refresh) {
      KH.nest.refresh();
    }
    if (KH.hue && KH.hue.refresh) {
      KH.hue.refresh();
    }
    if (KH.smartthings && KH.smartthings.refresh) {
      KH.smartthings.refresh();
    }
    if (KH.doors && KH.doors.refresh) {
      KH.doors.refresh();
    }
  }

  function boot() {
    applyTheme();
    renderClock();
    renderStatus();
    if (KH.weather && KH.weather.init) {
      KH.weather.init();
    }
    if (KH.alerts && KH.alerts.init) {
      KH.alerts.init();
    }
    if (KH.news && KH.news.init) {
      KH.news.init();
    }
    if (KH.scores && KH.scores.init) {
      KH.scores.init();
    }
    if (KH.nest && KH.nest.init) {
      KH.nest.init();
    }
    if (KH.hue && KH.hue.init) {
      KH.hue.init();
    }
    if (KH.smartthings && KH.smartthings.init) {
      KH.smartthings.init();
    }
    if (KH.doors && KH.doors.init) {
      KH.doors.init();
    }
    if (KH.presence && KH.presence.init) {
      KH.presence.init();
    }

    document.addEventListener('click', onTap);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', renderStatus);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        wake(true);
      }
    });
    window.addEventListener('focus', function () {
      wake(true);
    });
    window.addEventListener('pageshow', function () {
      wake(true);
    });
    document.addEventListener('resume', function () {
      wake(true);
    });
    startHeartbeat();

    util.onReschedule(function () {
      renderClock();
      armDailyReload();
    });
    armDailyReload();

    util.schedule('status', function tickStatus() {
      renderStatus();
      util.schedule('status', tickStatus, 30000);
    }, 30000);

    registerApp();
  }

  function armDailyReload() {
    var cap = 26 * 60 * 60 * 1000;
    if (typeof performance !== 'undefined' && performance.now) {
      cap -= performance.now();
    }
    if (cap < 60000) {
      cap = 60000;
    }
    var delay = cap;
    if (KH.presence && typeof KH.presence.msUntilReload === 'function') {
      delay = KH.presence.msUntilReload(util.now(), util.cfg.dailyReload, util.timezone(), cap);
    }
    util.schedule('daily-reload', hardReload, delay);
    // Cheap wall-clock safety net while setTimeout is frozen or delayed.
    util.schedule('reload-watch', function tickReloadWatch() {
      if (reloadDue()) {
        hardReload();
        return;
      }
      util.schedule('reload-watch', tickReloadWatch, 60000);
    }, 60000);
  }

  function registerApp() {
    if (!('serviceWorker' in navigator)) {
      return;
    }
    var reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (reloading) {
        return;
      }
      reloading = true;
      window.location.reload();
    });
    navigator.serviceWorker.register('sw.js').catch(function (err) {
      console.warn('service worker', err);
    });
  }

  function loadLocalConfig(done) {
    var script = document.createElement('script');
    script.src = 'config.local.js?v=' + Date.now();
    script.onload = function () {
      done();
    };
    script.onerror = function () {
      done();
    };
    document.head.appendChild(script);
  }

  function start() {
    loadLocalConfig(boot);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();

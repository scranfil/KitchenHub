(function () {
  'use strict';

  var KH = window.KH || (window.KH = {});
  var util = KH.util;
  var TAP_DEBOUNCE_MS = 30000;
  var lastTap = 0;
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

  function renderClock() {
    util.detectClockJump();
    var n = util.now();
    var cfg = util.cfg.clock || {};
    var parts = util.formatTime(n, { hour12: cfg.hour12 !== false, seconds: !!cfg.showSeconds });
    util.setText(util.$('clock-hhmm'), parts.hour + ':' + parts.minute + (cfg.showSeconds ? ':' + parts.second : ''));
    util.setText(util.$('clock-ampm'), parts.dayPeriod);
    util.setText(util.$('clock-date'), util.formatDate(n));
    var delay = cfg.showSeconds ? util.msUntilNextSecond(new Date()) : util.msUntilNextMinute(new Date());
    if (delay < 20) {
      delay += cfg.showSeconds ? 1000 : 60000;
    }
    util.schedule('clock', renderClock, delay);
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
    var panels = ['weather', 'alerts', 'sun', 'news'];
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

  function isNewsTarget(node) {
    while (node) {
      if (node.id === 'news' || node.id === 'news-detail') {
        return true;
      }
      node = node.parentNode;
    }
    return false;
  }

  function onTap(ev) {
    if (isNewsTarget(ev && ev.target)) {
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
    if (KH.presence && KH.presence.init) {
      KH.presence.init();
    }

    document.addEventListener('click', onTap);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', renderStatus);

    util.onReschedule(function () {
      renderClock();
    });

    util.schedule('status', function tickStatus() {
      renderStatus();
      util.schedule('status', tickStatus, 30000);
    }, 30000);

    registerApp();
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

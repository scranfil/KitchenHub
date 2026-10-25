(function (exports) {
  'use strict';

  function alertRank(props) {
    var event = String((props && props.event) || '').toLowerCase();
    if (event.indexOf('warning') !== -1) {
      return 0;
    }
    if (event.indexOf('watch') !== -1) {
      return 1;
    }
    if (event.indexOf('advisory') !== -1) {
      return 2;
    }
    return 3;
  }

  function severityClass(severity) {
    var s = String(severity || 'Unknown').toLowerCase();
    if (s === 'extreme' || s === 'severe') {
      return s;
    }
    if (s === 'moderate') {
      return 'moderate';
    }
    return 'minor';
  }

  function normalizeAlerts(geojson) {
    var features = (geojson && geojson.features) ? geojson.features : [];
    var out = [];
    var i;
    for (i = 0; i < features.length; i++) {
      var props = features[i] && features[i].properties ? features[i].properties : {};
      out.push({
        event: props.event || 'Alert',
        headline: props.headline || props.event || '',
        severity: props.severity || 'Unknown',
        urgency: props.urgency || '',
        effective: props.effective || '',
        expires: props.expires || '',
        description: props.description || ''
      });
    }
    out.sort(function (a, b) {
      var ra = alertRank(a);
      var rb = alertRank(b);
      if (ra !== rb) {
        return ra - rb;
      }
      return String(b.severity).localeCompare(String(a.severity));
    });
    return out;
  }

  function formatExpiry(expires, util) {
    if (!expires) {
      return '';
    }
    var d = new Date(expires);
    if (isNaN(d.getTime())) {
      return '';
    }
    var parts = util.formatTime(d, { hour12: true });
    return 'until ' + parts.hour + ':' + parts.minute + ' ' + parts.dayPeriod;
  }

  function escapeText(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  exports.alertRank = alertRank;
  exports.severityClass = severityClass;
  exports.normalizeAlerts = normalizeAlerts;

  function attachBrowserApi() {
    if (typeof window === 'undefined' || !window.KH || !window.KH.util) {
      return;
    }
    var util = window.KH.util;
    var cfg = util.cfg;
    var loc = cfg.location || {};
    var url = 'https://api.weather.gov/alerts/active?point=' + loc.lat + ',' + loc.lon;
    var nwsHeaders = {
      Accept: 'application/geo+json',
      'User-Agent': 'WeatherPWA/1.0 (https://github.com/scranfil/weather; contact: weather-app@users.noreply.github.com)'
    };
    var rotateIndex = 0;
    var currentList = [];
    var failCount = 0;

    function hideBanner() {
      var el = util.$('alerts');
      if (!el) {
        return;
      }
      el.hidden = true;
      el.className = 'alerts is-empty';
      util.emptyEl(el);
      el.removeAttribute('data-severity');
    }

    function showAlert(item) {
      var el = util.$('alerts');
      if (!el || !item) {
        hideBanner();
        return;
      }
      var sev = severityClass(item.severity);
      el.hidden = false;
      el.className = 'alerts severity-' + sev;
      el.setAttribute('data-severity', item.severity || 'Unknown');
      var expiry = formatExpiry(item.expires, util);
      var html = '<div class="alert-event">' + escapeText(item.event) + '</div>';
      html += '<div class="alert-headline">' + escapeText(item.headline);
      var headline = String(item.headline || '').toLowerCase();
      if (expiry && headline.indexOf('until') === -1) {
        html += ' ' + escapeText(expiry);
      }
      html += '</div>';
      el.innerHTML = html;
    }

    function rotate() {
      if (!currentList.length) {
        hideBanner();
        util.clearTimer('alerts-rotate');
        return;
      }
      if (rotateIndex >= currentList.length) {
        rotateIndex = 0;
      }
      util.safeRender('alerts', function () {
        showAlert(currentList[rotateIndex]);
      });
      rotateIndex += 1;
      if (currentList.length > 1) {
        util.schedule('alerts-rotate', rotate, 10000);
      } else {
        util.clearTimer('alerts-rotate');
      }
    }

    function applyList(list, savedAt) {
      currentList = list || [];
      rotateIndex = 0;
      if (!currentList.length) {
        hideBanner();
      } else {
        rotate();
      }
      var el = util.$('alerts');
      if (el && savedAt) {
        var stale = (Date.now() - savedAt) > (cfg.refreshMinutes.alerts * 2 * 60 * 1000);
        if (stale || util.isOffline()) {
          el.classList.add('is-stale');
        } else {
          el.classList.remove('is-stale');
        }
      }
    }

    function fetchAlerts() {
      if (util.query.alertsFixture && util.debug()) {
        return util.fetchJson('alerts-fixture', 'tests/fixtures/alerts-severe.json');
      }
      return util.fetchJson('alerts', url, { headers: nwsHeaders }).then(function (data) {
        if (!data || typeof data !== 'object') {
          throw new Error('malformed JSON');
        }
        return data;
      }).catch(function () {
        return util.fetchJson('alerts-retry', url, { headers: nwsHeaders });
      });
    }

    function refresh() {
      fetchAlerts().then(function (data) {
        failCount = 0;
        var list = normalizeAlerts(data);
        if (!(util.query.alertsFixture && util.debug())) {
          util.cacheSet('alerts', list);
        }
        applyList(list, Date.now());
        util.schedule('alerts', refresh, util.jitterMs(cfg.refreshMinutes.alerts));
      }).catch(function (err) {
        console.error('[alerts]', err);
        failCount += 1;
        var cached = util.cacheGet('alerts');
        if (cached && cached.data) {
          applyList(cached.data, cached.savedAt);
        } else {
          hideBanner();
        }
        util.schedule('alerts', refresh, util.backoffMs(failCount));
      });
    }

    function renderCache() {
      var cached = util.cacheGet('alerts');
      if (cached && cached.data && cached.data.length) {
        applyList(cached.data, cached.savedAt);
      } else {
        hideBanner();
      }
    }

    exports.init = function () {
      renderCache();
      refresh();
      util.onReschedule(refresh);
    };

    exports.refresh = refresh;
    exports.hideBanner = hideBanner;
  }

  if (typeof window !== 'undefined') {
    attachBrowserApi();
    if (window.KH) {
      window.KH.alerts = exports;
    }
  }
})(typeof module !== 'undefined' && module.exports
  ? module.exports
  : ((window.KH = window.KH || {}).alerts = (window.KH && window.KH.alerts) || {}));

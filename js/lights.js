(function (exports) {
  'use strict';

  // Home Assistant light status. The URL and token stay on the home server.
  // This only maps the small reading that server already returned.

  function trim(value) {
    return String(value == null ? '' : value).replace(/^\s+|\s+$/g, '');
  }

  function entityIdOk(value) {
    return /^[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/.test(trim(value));
  }

  function lightIds(cfg) {
    var block = cfg && cfg.lights ? cfg.lights : {};
    var list = block.entityIds || [];
    var out = [];
    var seen = {};
    var i;
    for (i = 0; i < list.length; i++) {
      var id = trim(list[i]);
      if (!entityIdOk(id) || seen[id]) {
        continue;
      }
      seen[id] = true;
      out.push(id);
    }
    return out;
  }

  function nameFromId(entityId) {
    var slug = trim(entityId).split('.')[1] || 'Light';
    var parts = slug.split('_');
    var words = [];
    var i;
    for (i = 0; i < parts.length; i++) {
      if (!parts[i]) {
        continue;
      }
      words.push(parts[i].charAt(0).toUpperCase() + parts[i].slice(1));
    }
    return words.join(' ') || 'Light';
  }

  function brightnessPercent(value) {
    if (value == null || value === '' || isNaN(Number(value))) {
      return null;
    }
    var n = Math.round(Number(value));
    if (n < 0) {
      n = 0;
    }
    if (n > 255) {
      n = 255;
    }
    return Math.round(n * 100 / 255);
  }

  function haLightExtras(entity, body) {
    if (trim(entity).toLowerCase().indexOf('light.') !== 0) {
      return null;
    }
    var attrs = body && body.attributes && typeof body.attributes === 'object' ? body.attributes : {};
    var name = trim(attrs.friendly_name).slice(0, 40);
    return {
      brightness: brightnessPercent(attrs.brightness) == null ? null : Math.round(Number(attrs.brightness)),
      name: name
    };
  }

  function lightView(entityId, payload) {
    var name = trim(payload && payload.name) || nameFromId(entityId);
    if (!payload || payload.connected === false) {
      return { id: entityId, name: name, label: 'Not connected', known: false, on: false, percent: null };
    }
    if (!payload.known) {
      return { id: entityId, name: name, label: 'Unknown', known: false, on: false, percent: null };
    }
    var state = trim(payload.state).toLowerCase();
    var percent = brightnessPercent(payload.brightness);
    if (state === 'on' || state === 'off') {
      return {
        id: entityId,
        name: name,
        label: state === 'on' ? 'On' : 'Off',
        known: true,
        on: state === 'on',
        percent: percent
      };
    }
    return { id: entityId, name: name, label: 'Unknown', known: false, on: false, percent: null };
  }

  exports.trim = trim;
  exports.entityIdOk = entityIdOk;
  exports.lightIds = lightIds;
  exports.nameFromId = nameFromId;
  exports.brightnessPercent = brightnessPercent;
  exports.haLightExtras = haLightExtras;
  exports.lightView = lightView;

  if (typeof window !== 'undefined') {
    var KH = window.KH || (window.KH = {});
    KH.lights = exports;
  }
})(typeof module !== 'undefined' && module.exports
  ? module.exports
  : ((window.KH = window.KH || {}).lights = (window.KH && window.KH.lights) || {}));

(function (exports) {
  'use strict';

  // Each door is a name, a kind (lock, garage, or contact), and a source. The source
  // only has to produce a small reading: connected, known, and a value.
  // Home Assistant's URL and token never belong in this file.

  var DEFAULT_DOORS = [
    { id: 'front', name: 'Front Door', kind: 'lock', source: 'homeassistant', entityId: 'lock.entryway_entryway_lock' },
    { id: 'garage', name: 'Garage door (main)', kind: 'garage', source: 'homeassistant', entityId: '' },
    { id: 'kitchen', name: 'Kitchen Door', kind: 'contact', source: 'homeassistant', entityId: 'binary_sensor.kitchen_sliding_door' },
    { id: 'basement', name: 'Basement Door', kind: 'contact', source: 'homeassistant', entityId: 'binary_sensor.basement_door' }
  ];

  // Home Assistant lock states. Red is reserved for a door that is not
  // secure (unlocked, open) or a lock that failed (jammed). Moving states
  // keep their own words so the row never claims Locked or Unlocked early.
  var LOCK_LABELS = {
    locked: 'Locked',
    unlocked: 'Unlocked',
    locking: 'Locking',
    unlocking: 'Unlocking',
    jammed: 'Jammed',
    open: 'Open',
    opening: 'Opening'
  };

  function trim(value) {
    return String(value == null ? '' : value).replace(/^\s+|\s+$/g, '');
  }

  function entityIdOk(value) {
    return /^[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/.test(trim(value));
  }

  function normalizeDoor(door, index) {
    var src = door || {};
    var kind = trim(src.kind).toLowerCase();
    var entityId = trim(src.entityId);
    if (kind !== 'lock' && kind !== 'garage' && kind !== 'contact') {
      kind = '';
    }
    if (!entityIdOk(entityId)) {
      entityId = '';
    }
    return {
      id: trim(src.id) || ('door-' + index),
      name: trim(src.name) || 'Door',
      kind: kind,
      source: trim(src.source).toLowerCase(),
      entityId: entityId
    };
  }

  function doorList(cfg) {
    var configured = cfg && cfg.doors;
    var source = configured && configured.length ? configured : DEFAULT_DOORS;
    var out = [];
    var i;
    for (i = 0; i < source.length; i++) {
      out.push(normalizeDoor(source[i], i));
    }
    return out;
  }

  function blank(door, label) {
    return {
      id: door.id,
      name: door.name,
      kind: door.kind,
      source: door.source,
      label: label,
      attention: false,
      known: false,
      value: ''
    };
  }

  function resolveDoor(door, reading) {
    var item = normalizeDoor(door, 0);
    var preview = !!(reading && reading.preview);
    if (!preview) {
      if (!item.source || (item.source === 'homeassistant' && !item.entityId)) {
        return blank(item, 'Not connected');
      }
      if (reading && reading.connected === false) {
        return blank(item, 'Not connected');
      }
      if (!reading || !reading.known) {
        return blank(item, 'Unknown');
      }
    } else if (!reading.known) {
      return blank(item, 'Unknown');
    }
    var value = trim(reading.value).toLowerCase();
    var label = '';
    var attention = false;
    if (item.kind === 'lock' && LOCK_LABELS[value]) {
      label = LOCK_LABELS[value];
      attention = value === 'unlocked' || value === 'open' || value === 'jammed';
    } else if (item.kind === 'garage' && value === 'closed') {
      label = 'Closed';
    } else if (item.kind === 'garage' && value === 'open') {
      label = 'Open';
      attention = true;
    } else if (item.kind === 'contact' && value === 'off') {
      label = 'Closed';
    } else if (item.kind === 'contact' && value === 'on') {
      label = 'Open';
      attention = true;
    }
    if (!label) {
      return blank(item, 'Unknown');
    }
    return {
      id: item.id,
      name: item.name,
      kind: item.kind,
      source: item.source,
      label: label,
      attention: attention,
      known: true,
      value: value
    };
  }

  var TAB_SPECS = [
    { id: 'front', label: 'Front' },
    { id: 'kitchen', label: 'Kitchen' },
    { id: 'basement', label: 'Basement' },
    { id: 'garage', label: 'Garage 1' }
  ];

  function doorTabs(list) {
    var byId = {};
    var doors = list || [];
    var i;
    for (i = 0; i < doors.length; i++) {
      if (doors[i] && doors[i].id) {
        byId[doors[i].id] = doors[i];
      }
    }
    var out = [];
    for (i = 0; i < TAB_SPECS.length; i++) {
      if (byId[TAB_SPECS[i].id]) {
        out.push({
          id: TAB_SPECS[i].id,
          label: TAB_SPECS[i].label,
          door: byId[TAB_SPECS[i].id]
        });
      }
    }
    return out;
  }

  function defaultDoorTab(tabs) {
    var list = tabs || [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].id === 'front') {
        return 'front';
      }
    }
    return list.length ? list[0].id : '';
  }

  function rowClass(view) {
    if (view && view.attention) {
      return 'door-row is-attention';
    }
    if (!view || !view.known) {
      return 'door-row is-neutral';
    }
    return 'door-row';
  }

  function haReading(body) {
    var state = '';
    if (body && body.state != null) {
      state = trim(body.state).toLowerCase();
    }
    if (!state || state === 'unavailable' || state === 'unknown' || state === 'none' || state === 'null') {
      return { known: false, value: '' };
    }
    return { known: true, value: state };
  }

  function haStateUrl(base, entity) {
    if (!entityIdOk(entity)) {
      return '';
    }
    var match = String(base || '').match(/^(https?):\/\/([^/?#]+)\/?/i);
    if (!match) {
      return '';
    }
    var host = match[2];
    if (host.indexOf('@') !== -1) {
      return '';
    }
    return match[1].toLowerCase() + '://' + host + '/api/states/' + trim(entity);
  }

  function climateNumber(value) {
    if (value == null || value === '' || isNaN(Number(value))) {
      return null;
    }
    return Math.round(Number(value) * 10) / 10;
  }

  function haClimateExtras(entity, body) {
    if (trim(entity).toLowerCase().indexOf('climate.') !== 0) {
      return null;
    }
    var attrs = body && body.attributes && typeof body.attributes === 'object' ? body.attributes : {};
    function text(key, max) {
      var value = trim(attrs[key]);
      if (!value) {
        return '';
      }
      return value.slice(0, max);
    }
    return {
      current_temperature: climateNumber(attrs.current_temperature),
      temperature: climateNumber(attrs.temperature),
      target_temp_high: climateNumber(attrs.target_temp_high),
      target_temp_low: climateNumber(attrs.target_temp_low),
      hvac_action: text('hvac_action', 24).toLowerCase(),
      temperature_unit: text('temperature_unit', 8),
      name: text('friendly_name', 40)
    };
  }

  function lockReadingToState(parsed) {
    if (!parsed || !parsed.known) {
      return { connected: true, known: false, value: '' };
    }
    return {
      connected: true,
      known: true,
      value: parsed.unlocked ? 'unlocked' : 'locked'
    };
  }

  exports.trim = trim;
  exports.entityIdOk = entityIdOk;
  exports.doorList = doorList;
  exports.resolveDoor = resolveDoor;
  exports.doorTabs = doorTabs;
  exports.defaultDoorTab = defaultDoorTab;
  exports.rowClass = rowClass;
  exports.haReading = haReading;
  exports.haClimateExtras = haClimateExtras;
  exports.haStateUrl = haStateUrl;
  exports.lockReadingToState = lockReadingToState;

  function attachBrowserApi() {
    var KH = window.KH || (window.KH = {});
    var util = KH.util;
    var readings = {};

    function query() {
      return util && util.query ? util.query : {};
    }

    function sampleOn() {
      return !!query().sample;
    }

    function previewReading(door) {
      var q = query();
      if (door.kind === 'lock' && q.unlocked) {
        return { preview: true, connected: true, known: true, value: 'unlocked' };
      }
      if (door.kind === 'garage' && (q.garage === 'open' || q.garage === 'closed')) {
        return { preview: true, connected: true, known: true, value: q.garage };
      }
      if (door.kind === 'garage' && q.garage === 'unknown') {
        return { preview: true, connected: true, known: false, value: '' };
      }
      if (sampleOn()) {
        if (door.kind === 'lock') {
          return { preview: true, connected: true, known: true, value: 'locked' };
        }
        if (door.kind === 'garage') {
          return { preview: true, connected: true, known: true, value: 'closed' };
        }
      }
      return null;
    }

    function smartthingsReading(door) {
      if (door.kind !== 'lock') {
        return { connected: true, known: false, value: '' };
      }
      var hub = KH.smartthings;
      if (!hub || typeof hub.configured !== 'function' || !hub.configured()) {
        return { connected: false };
      }
      var state = typeof hub.currentLock === 'function' ? hub.currentLock() : null;
      if (!state) {
        return { connected: true, known: false, value: '' };
      }
      return lockReadingToState(state);
    }

    function readingFor(door) {
      var item = normalizeDoor(door, 0);
      var preview = previewReading(item);
      if (preview) {
        return preview;
      }
      if (!item.source) {
        return { connected: false };
      }
      if (item.source === 'homeassistant' && !item.entityId) {
        return { connected: false };
      }
      if (item.source === 'smartthings') {
        return smartthingsReading(item);
      }
      if (item.source === 'homeassistant') {
        return readings[item.id] || { connected: false };
      }
      return { connected: false };
    }

    function tell() {
      if (KH.nest && typeof KH.nest.repaint === 'function') {
        KH.nest.repaint();
      }
    }

    function haDoors() {
      var all = doorList(util && util.cfg);
      var out = [];
      var i;
      for (i = 0; i < all.length; i++) {
        if (all[i].source === 'homeassistant' && all[i].entityId && !previewReading(all[i])) {
          out.push(all[i]);
        }
      }
      return out;
    }

    function fetchOne(door) {
      return fetch('homeassistant/state?entity=' + encodeURIComponent(door.entityId), {
        cache: 'no-store'
      }).then(function (res) {
        var type = (res.headers.get('content-type') || '').toLowerCase();
        if (!res.ok || type.indexOf('json') === -1) {
          return { connected: false };
        }
        return res.json();
      }).then(function (data) {
        if (!data || data.connected === false) {
          return { connected: false };
        }
        if (!data.known || data.state == null || data.state === '') {
          return { connected: true, known: false, value: '' };
        }
        return { connected: true, known: true, value: String(data.state).toLowerCase() };
      }).catch(function () {
        return { connected: false };
      });
    }

    function schedule(failCount) {
      var delay = failCount > 0 && util ? util.backoffMs(failCount) : 20000;
      if (util) {
        util.schedule('doors', refresh, delay);
      }
    }

    function refresh() {
      var jobs = haDoors();
      if (!jobs.length) {
        return;
      }
      var pending = jobs.length;
      var failed = false;
      function done() {
        pending -= 1;
        if (pending > 0) {
          return;
        }
        tell();
        schedule(failed ? 1 : 0);
      }
      var i;
      for (i = 0; i < jobs.length; i++) {
        (function (door) {
          fetchOne(door).then(function (reading) {
            readings[door.id] = reading;
            if (reading && reading.connected === false) {
              failed = true;
            }
            done();
          });
        })(jobs[i]);
      }
    }

    exports.readingFor = readingFor;
    exports.refresh = refresh;
    exports.init = function () {
      refresh();
    };
    KH.doors = exports;
  }

  if (typeof window !== 'undefined' && window.document) {
    attachBrowserApi();
  }
})(typeof module !== 'undefined' && module.exports
  ? module.exports
  : ((window.KH = window.KH || {}).doors = (window.KH && window.KH.doors) || {}));

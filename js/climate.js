(function (exports) {
  'use strict';

  // Home Assistant climate status for the thermostat tile.
  // The URL and token stay on the home server. This only maps the
  // small reading that server already returned.

  var MODES = {
    heat: 'Heat',
    cool: 'Cool',
    heat_cool: 'Heat · Cool',
    auto: 'Auto',
    off: 'Off',
    dry: 'Dry',
    fan_only: 'Fan'
  };

  var ACTIONS = {
    heating: 'Heating',
    cooling: 'Cooling',
    idle: 'Idle',
    off: 'Off',
    drying: 'Drying',
    fan: 'Fan',
    preheating: 'Heating',
    defrosting: 'Defrosting'
  };

  function trim(value) {
    return String(value == null ? '' : value).replace(/^\s+|\s+$/g, '');
  }

  function toF(value, unit) {
    if (value == null || value === '' || isNaN(Number(value))) {
      return null;
    }
    var n = Number(value);
    var mark = String(unit || '');
    if (mark.indexOf('C') !== -1 || mark.indexOf('c') !== -1) {
      n = n * 9 / 5 + 32;
    }
    return Math.round(n);
  }

  function tempText(value) {
    if (value == null || isNaN(Number(value))) {
      return '\u2014';
    }
    return Math.round(Number(value)) + '\u00b0';
  }

  function climateView(payload) {
    if (!payload || payload.connected === false) {
      return { known: false, label: 'Not connected' };
    }
    if (!payload.known) {
      return { known: false, label: 'Unknown' };
    }
    var mode = trim(payload.state).toLowerCase();
    var modeLabel = MODES[mode] || '';
    var action = trim(payload.hvac_action).toLowerCase();
    var actionLabel = ACTIONS[action] || '';
    var unit = payload.temperature_unit;
    var ambient = toF(payload.current_temperature, unit);
    var target = toF(payload.temperature, unit);
    var low = toF(payload.target_temp_low, unit);
    var high = toF(payload.target_temp_high, unit);
    var name = trim(payload.name) || 'Thermostat';
    if (!modeLabel) {
      return {
        known: true,
        name: name,
        ambient: ambient,
        ambientText: tempText(ambient),
        line: 'Unknown',
        setpoint: 'Unknown'
      };
    }
    var line = modeLabel;
    if (mode !== 'off' && actionLabel) {
      line = modeLabel + ' \u00b7 ' + actionLabel;
    }
    var setpoint = 'Off';
    if (mode === 'heat_cool' || (mode !== 'heat' && mode !== 'cool' && mode !== 'off' && low != null && high != null)) {
      setpoint = tempText(low) + ' \u2013 ' + tempText(high);
    } else if (mode !== 'off' && target != null) {
      setpoint = modeLabel + ' to ' + tempText(target);
    } else if (mode !== 'off') {
      setpoint = modeLabel;
    }
    return {
      known: true,
      name: name,
      ambient: ambient,
      ambientText: tempText(ambient),
      mode: mode,
      modeLabel: modeLabel,
      actionLabel: actionLabel,
      line: line,
      setpoint: setpoint
    };
  }

  exports.trim = trim;
  exports.toF = toF;
  exports.climateView = climateView;

  if (typeof window !== 'undefined') {
    var KH = window.KH || (window.KH = {});
    KH.climate = exports;
  }
})(typeof module !== 'undefined' && module.exports
  ? module.exports
  : ((window.KH = window.KH || {}).climate = (window.KH && window.KH.climate) || {}));

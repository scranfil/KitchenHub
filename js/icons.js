(function (exports) {
  'use strict';

  var SVG = {
    sunny: '<svg class="wx-icon" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="12" fill="currentColor"/><g stroke="currentColor" stroke-width="4" stroke-linecap="round"><path d="M32 6v8M32 50v8M6 32h8M50 32h8M12 12l6 6M46 46l6 6M12 52l6-6M46 18l6-6"/></g></svg>',
    clearNight: '<svg class="wx-icon" viewBox="0 0 64 64" aria-hidden="true"><path fill="currentColor" d="M40 8a22 22 0 1 0 14 38A24 24 0 0 1 40 8z"/></svg>',
    partly: '<svg class="wx-icon" viewBox="0 0 64 64" aria-hidden="true"><circle cx="22" cy="22" r="9" fill="currentColor"/><g stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M22 6v5M6 22h5M11 11l4 4"/></g><path fill="currentColor" d="M24 36a14 14 0 0 1 26-6 12 12 0 1 1 2 22H28a12 12 0 0 1-4-16z"/></svg>',
    cloudy: '<svg class="wx-icon" viewBox="0 0 64 64" aria-hidden="true"><path fill="currentColor" d="M20 30a14 14 0 0 1 26-7 13 13 0 1 1 2 25H24a12 12 0 0 1-4-18z"/></svg>',
    rain: '<svg class="wx-icon" viewBox="0 0 64 64" aria-hidden="true"><path fill="currentColor" d="M20 22a13 13 0 0 1 24-6 12 12 0 1 1 2 22H24a11 11 0 0 1-4-16z"/><g stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M24 46l-3 8M34 46l-3 8M44 46l-3 8"/></g></svg>',
    showers: '<svg class="wx-icon" viewBox="0 0 64 64" aria-hidden="true"><path fill="currentColor" d="M20 20a13 13 0 0 1 24-6 12 12 0 1 1 2 22H24a11 11 0 0 1-4-16z"/><g stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M26 44l-2 6M36 44l-2 6M46 44l-2 6"/></g></svg>',
    thunder: '<svg class="wx-icon" viewBox="0 0 64 64" aria-hidden="true"><path fill="currentColor" d="M20 18a13 13 0 0 1 24-6 12 12 0 1 1 2 20H24a11 11 0 0 1-4-14z"/><path fill="currentColor" d="M36 34l-10 14h8l-4 12 16-16h-8z"/></svg>',
    snow: '<svg class="wx-icon" viewBox="0 0 64 64" aria-hidden="true"><path fill="currentColor" d="M20 20a13 13 0 0 1 24-6 12 12 0 1 1 2 22H24a11 11 0 0 1-4-16z"/><g fill="currentColor"><circle cx="24" cy="50" r="3"/><circle cx="34" cy="46" r="3"/><circle cx="44" cy="51" r="3"/></g></svg>',
    fog: '<svg class="wx-icon" viewBox="0 0 64 64" aria-hidden="true"><g stroke="currentColor" stroke-width="4" stroke-linecap="round"><path d="M10 24h44M8 34h48M12 44h40"/></g></svg>',
    wind: '<svg class="wx-icon" viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"><path d="M8 24h36a8 8 0 1 0-8-8"/><path d="M8 36h42a7 7 0 1 1-7 7"/><path d="M8 48h28"/></g></svg>'
  };

  var WMO_MAP = {
    0: 'sunny',
    1: 'sunny',
    2: 'partly',
    3: 'cloudy',
    45: 'fog',
    48: 'fog',
    51: 'showers',
    53: 'showers',
    55: 'showers',
    56: 'showers',
    57: 'showers',
    61: 'rain',
    63: 'rain',
    65: 'rain',
    66: 'rain',
    67: 'rain',
    71: 'snow',
    73: 'snow',
    75: 'snow',
    77: 'snow',
    80: 'showers',
    81: 'showers',
    82: 'showers',
    85: 'snow',
    86: 'snow',
    95: 'thunder',
    96: 'thunder',
    99: 'thunder'
  };

  function keywordFromForecast(text) {
    var s = String(text || '').toLowerCase();
    if (!s) {
      return 'cloudy';
    }
    if (s.indexOf('thunder') !== -1) {
      return 'thunder';
    }
    if (s.indexOf('snow') !== -1 || s.indexOf('sleet') !== -1 || s.indexOf('ice') !== -1) {
      return 'snow';
    }
    if (s.indexOf('shower') !== -1) {
      return 'showers';
    }
    if (s.indexOf('rain') !== -1 || s.indexOf('drizzle') !== -1) {
      return 'rain';
    }
    if (s.indexOf('fog') !== -1 || s.indexOf('mist') !== -1 || s.indexOf('haze') !== -1) {
      return 'fog';
    }
    if (s.indexOf('wind') !== -1 || s.indexOf('breez') !== -1) {
      return 'wind';
    }
    if (s.indexOf('partly') !== -1) {
      return 'partly';
    }
    if (s.indexOf('mostly sunny') !== -1 || s.indexOf('mostly clear') !== -1) {
      return 'partly';
    }
    if (s.indexOf('cloud') !== -1 || s.indexOf('overcast') !== -1) {
      return 'cloudy';
    }
    if (s.indexOf('sunny') !== -1 || s.indexOf('clear') !== -1 || s.indexOf('fair') !== -1) {
      return 'sunny';
    }
    return 'cloudy';
  }

  function wmoToKeyword(code) {
    var n = Number(code);
    if (WMO_MAP[n]) {
      return WMO_MAP[n];
    }
    return 'cloudy';
  }

  function iconId(keyword, isDaytime) {
    if (keyword === 'sunny' && isDaytime === false) {
      return 'clearNight';
    }
    if (SVG[keyword]) {
      return keyword;
    }
    return 'cloudy';
  }

  function svgFor(keyword, isDaytime) {
    return SVG[iconId(keyword, isDaytime)] || SVG.cloudy;
  }

  function svgFromForecast(text, isDaytime) {
    return svgFor(keywordFromForecast(text), isDaytime);
  }

  function svgFromWmo(code, isDaytime) {
    return svgFor(wmoToKeyword(code), isDaytime);
  }

  exports.keywordFromForecast = keywordFromForecast;
  exports.wmoToKeyword = wmoToKeyword;
  exports.iconId = iconId;
  exports.svgFor = svgFor;
  exports.svgFromForecast = svgFromForecast;
  exports.svgFromWmo = svgFromWmo;
  exports.WMO_MAP = WMO_MAP;
})(typeof module !== 'undefined' && module.exports
  ? module.exports
  : ((window.KH = window.KH || {}).icons = {}));

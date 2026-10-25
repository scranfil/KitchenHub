const { test } = require('node:test');
const assert = require('node:assert/strict');
const icons = require('../js/icons.js');

test('maps WMO codes onto the NWS keyword set', function () {
  assert.equal(icons.wmoToKeyword(0), 'sunny');
  assert.equal(icons.wmoToKeyword(2), 'partly');
  assert.equal(icons.wmoToKeyword(3), 'cloudy');
  assert.equal(icons.wmoToKeyword(45), 'fog');
  assert.equal(icons.wmoToKeyword(61), 'rain');
  assert.equal(icons.wmoToKeyword(80), 'showers');
  assert.equal(icons.wmoToKeyword(71), 'snow');
  assert.equal(icons.wmoToKeyword(95), 'thunder');
  assert.equal(icons.wmoToKeyword(999), 'cloudy');
});

test('maps NWS shortForecast keywords', function () {
  assert.equal(icons.keywordFromForecast('Sunny'), 'sunny');
  assert.equal(icons.keywordFromForecast('Clear'), 'sunny');
  assert.equal(icons.keywordFromForecast('Partly Cloudy'), 'partly');
  assert.equal(icons.keywordFromForecast('Mostly Cloudy'), 'cloudy');
  assert.equal(icons.keywordFromForecast('Light Rain'), 'rain');
  assert.equal(icons.keywordFromForecast('Scattered Showers'), 'showers');
  assert.equal(icons.keywordFromForecast('Thunderstorms'), 'thunder');
  assert.equal(icons.keywordFromForecast('Snow Showers'), 'snow');
  assert.equal(icons.keywordFromForecast('Patchy Fog'), 'fog');
  assert.equal(icons.keywordFromForecast('Windy'), 'wind');
});

test('uses a moon icon for clear night', function () {
  assert.equal(icons.iconId('sunny', false), 'clearNight');
  assert.equal(icons.iconId('sunny', true), 'sunny');
  assert.ok(icons.svgFromWmo(0, false).indexOf('<svg') !== -1);
  assert.ok(icons.svgFromForecast('Sunny', true).indexOf('<svg') !== -1);
});

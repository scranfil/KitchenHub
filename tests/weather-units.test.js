const { test } = require('node:test');
const assert = require('node:assert/strict');
const weather = require('../js/weather.js');
const obs = require('./fixtures/nws-observation.json');
const hourly = require('./fixtures/nws-hourly.json');

test('converts Celsius to Fahrenheit', function () {
  assert.equal(weather.celsiusToFahrenheit(0), 32);
  assert.equal(weather.celsiusToFahrenheit(100), 212);
  assert.equal(Math.round(weather.celsiusToFahrenheit(16)), 61);
  assert.equal(weather.celsiusToFahrenheit(null), null);
});

test('converts km/h to mph', function () {
  assert.ok(Math.abs(weather.kmhToMph(1.609344) - 1) < 0.001);
  assert.equal(Math.round(weather.kmhToMph(5.4)), 3);
  assert.equal(weather.kmhToMph(null), null);
});

test('maps degrees to 16-point compass', function () {
  assert.equal(weather.degreesToCompass(0), 'N');
  assert.equal(weather.degreesToCompass(140), 'SE');
  assert.equal(weather.degreesToCompass(180), 'S');
  assert.equal(weather.degreesToCompass(null), '');
});

test('normalizes a live-shaped observation', function () {
  var now = new Date('2026-10-21T15:00:00+00:00');
  var hour = hourly.properties.periods[0];
  var current = weather.normalizeObservation(obs, hour, now);
  assert.equal(Math.round(current.temperature), 61);
  assert.equal(current.windDir, 'SE');
  assert.equal(Math.round(current.windMph), 3);
  assert.equal(Math.round(current.humidity), 61);
  assert.equal(current.condition, 'Sunny');
  assert.equal(current.fromHourly, false);
});

test('falls back to hourly when observation temperature is null', function () {
  var now = new Date('2026-10-21T15:00:00+00:00');
  var broken = { properties: { timestamp: obs.properties.timestamp, temperature: { value: null } } };
  var hour = hourly.properties.periods[2];
  var current = weather.normalizeObservation(broken, hour, now);
  assert.equal(current.fromHourly, true);
  assert.equal(current.temperature, 65);
  assert.equal(current.condition, 'Sunny');
});

test('falls back to hourly when observation is older than 90 minutes', function () {
  var now = new Date('2026-10-21T17:00:00+00:00');
  var hour = hourly.properties.periods[4];
  var current = weather.normalizeObservation(obs, hour, now);
  assert.equal(current.fromHourly, true);
  assert.equal(current.temperature, 70);
});

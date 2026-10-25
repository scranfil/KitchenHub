const { test } = require('node:test');
const assert = require('node:assert/strict');
const weather = require('../js/weather.js');
const forecast = require('./fixtures/nws-forecast.json');
const hourly = require('./fixtures/nws-hourly.json');
const om = require('./fixtures/open-meteo.json');
const alerts = require('../js/alerts.js');
const severe = require('./fixtures/alerts-severe.json');
const empty = require('./fixtures/alerts-empty.json');

test('pairs day and night forecast periods into 5 cards', function () {
  var cards = weather.pairForecastPeriods(forecast.properties.periods);
  assert.equal(cards.length, 5);
  assert.equal(cards[0].name, 'Today');
  assert.equal(cards[0].high, 70);
  assert.equal(cards[0].low, 44);
  assert.equal(cards[1].name, 'Thursday');
  assert.equal(cards[1].high, 71);
  assert.equal(cards[1].low, 45);
  assert.equal(cards[2].precip, 10);
});

test('uses Tonight as today when the day period has passed', function () {
  var periods = forecast.properties.periods.slice(1);
  var cards = weather.pairForecastPeriods(periods);
  assert.equal(cards[0].name, 'Tonight');
  assert.equal(cards[0].high, null);
  assert.equal(cards[0].low, 44);
  assert.equal(cards[0].tonightOnly, true);
  assert.equal(cards[1].name, 'Thursday');
  assert.equal(cards.length, 5);
});

test('selects the current and next 12 hourly periods', function () {
  var now = new Date('2026-10-21T13:20:00-04:00');
  var hours = weather.nextHourlyPeriods(hourly.properties.periods, now, 12);
  assert.equal(hours[0].temperature, 65);
  assert.equal(hours.length, 11);
  var current = weather.currentHourPeriod(hourly.properties.periods, now);
  assert.equal(current.temperature, 65);
});

test('maps Open-Meteo current, hourly, daily, and sunrise', function () {
  var now = new Date('2026-10-21T11:30:00-04:00');
  var mapped = weather.mapOpenMeteo(om, now);
  assert.equal(mapped.current.temperature, 58);
  assert.equal(mapped.current.feelsLike, 56.5);
  assert.equal(mapped.hourly.length > 0, true);
  assert.equal(mapped.daily.length, 5);
  assert.equal(mapped.sun.sunriseLabel, '8:00 AM');
  assert.equal(mapped.sun.sunsetLabel, '6:55 PM');
});

test('sorts warnings above watches above advisories', function () {
  var list = alerts.normalizeAlerts(severe);
  assert.equal(list[0].event, 'Severe Thunderstorm Warning');
  assert.equal(list[1].event, 'Flood Watch');
  assert.equal(list[2].event, 'Wind Advisory');
  assert.equal(alerts.severityClass('Severe'), 'severe');
  assert.equal(alerts.normalizeAlerts(empty).length, 0);
});

test('tolerates missing forecast fields', function () {
  var cards = weather.pairForecastPeriods([{}, null, { isDaytime: true }]);
  assert.ok(Array.isArray(cards));
  assert.equal(weather.precipValue(undefined), null);
  assert.equal(weather.parseMph('2 mph'), 2);
  assert.equal(weather.parseMph('0 to 6 mph'), 0);
});

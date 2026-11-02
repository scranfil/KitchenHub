const { test } = require('node:test');
const assert = require('node:assert/strict');
const weather = require('../js/weather.js');

const cfg = {
  location: { lat: 39.8947, lon: -85.9786 },
  timezone: 'America/New_York'
};

test('keeps the point under a finger when the radar zooms', function () {
  var lat = cfg.location.lat;
  var lon = cfg.location.lon;
  var zoom = weather.RADAR_DEFAULT_ZOOM;
  var width = 800;
  var height = 600;
  var same = weather.centerForAnchor(lat, lon, width, height, lat, lon, width / 2, height / 2, zoom + 2);
  assert.ok(Math.abs(same.lat - lat) < 0.000001);
  assert.ok(Math.abs(same.lon - lon) < 0.000001);
  var ax = weather.mercatorX(lon, zoom) - width / 2;
  var ay = weather.mercatorY(lat, zoom) - height / 2;
  var anchorLon = weather.lonFromMercatorX(ax, zoom);
  var anchorLat = weather.latFromMercatorY(ay, zoom);
  var shifted = weather.centerForAnchor(lat, lon, width, height, anchorLat, anchorLon, 0, 0, zoom + 1);
  var left = weather.mercatorX(shifted.lon, zoom + 1) - width / 2;
  var top = weather.mercatorY(shifted.lat, zoom + 1) - height / 2;
  assert.ok(Math.abs(left - weather.mercatorX(anchorLon, zoom + 1)) < 0.01);
  assert.ok(Math.abs(top - weather.mercatorY(anchorLat, zoom + 1)) < 0.01);
  assert.equal(weather.RADAR_LOCAL_ZOOM, 10);
});

test('points and sun URLs match the weather app', function () {
  assert.equal(weather.pointsUrl(cfg), 'https://api.weather.gov/points/39.8947,-85.9786');
  assert.equal(
    weather.sunApiUrl(cfg),
    'https://api.sunrise-sunset.org/json?lat=39.8947&lng=-85.9786&formatted=0'
  );
  assert.equal(
    weather.NWS_USER_AGENT,
    'WeatherPWA/1.0 (https://github.com/scranfil/weather; contact: weather-app@users.noreply.github.com)'
  );
});

test('reads forecast URLs from an NWS points response', function () {
  var urls = weather.urlsFromPoints({
    properties: {
      forecast: 'https://api.weather.gov/gridpoints/IND/64,75/forecast',
      forecastHourly: 'https://api.weather.gov/gridpoints/IND/64,75/forecast/hourly',
      observationStations: 'https://api.weather.gov/gridpoints/IND/64,75/stations'
    }
  }, cfg);
  assert.equal(urls.forecast, 'https://api.weather.gov/gridpoints/IND/64,75/forecast');
  assert.equal(urls.hourly, 'https://api.weather.gov/gridpoints/IND/64,75/forecast/hourly');
  assert.equal(urls.observationStations, 'https://api.weather.gov/gridpoints/IND/64,75/stations');
  assert.equal(urls.alerts, 'https://api.weather.gov/alerts/active?point=39.8947,-85.9786');
  assert.equal(weather.urlsFromPoints({ properties: {} }, cfg), null);
});

test('picks the nearest fresh station that has a temperature', function () {
  var now = new Date('2026-10-21T15:30:00Z');
  var far = weather.scoreObservation({
    id: 'https://api.weather.gov/stations/KFA',
    properties: { distance: { value: 20000 } }
  }, {
    properties: {
      timestamp: '2026-10-21T15:20:00Z',
      temperature: { value: 10 }
    }
  }, 39.89, -85.97, now);
  var near = weather.scoreObservation({
    id: 'https://api.weather.gov/stations/KMQJ',
    properties: { distance: { value: 4000 } }
  }, {
    properties: {
      timestamp: '2026-10-21T15:10:00Z',
      temperature: { value: 16 }
    }
  }, 39.89, -85.97, now);
  var best = weather.pickBestObservation([far, null, near]);
  assert.equal(best.stationId, 'KMQJ');
  assert.equal(best.hasTemp, true);
  assert.equal(best.isFresh, true);
});

test('prefers a nearby station reporting precipitation', function () {
  var dry = { dist: 1000, precip: 0, hasTemp: true, isFresh: true, stationId: 'KDRY' };
  var wet = { dist: 2000, precip: 1.2, hasTemp: true, isFresh: true, stationId: 'KWET' };
  var best = weather.pickBestObservation([dry, wet]);
  assert.equal(best.stationId, 'KWET');
});

test('formats sunrise-sunset.org times in America/New_York', function () {
  var now = new Date('2026-10-21T15:30:00Z');
  var sun = weather.sunFromSunriseSunset({
    status: 'OK',
    results: {
      sunrise: '2026-10-21T12:00:00+00:00',
      sunset: '2026-10-21T22:55:00+00:00'
    }
  }, now, 'America/New_York');
  assert.equal(sun.sunriseLabel, '8:00 AM');
  assert.equal(sun.sunsetLabel, '6:55 PM');
  assert.equal(sun.isDay, true);
  assert.equal(sun.localDate, '2026-10-21');
  assert.equal(weather.sunFromSunriseSunset({ status: 'INVALID_REQUEST' }, now, 'America/New_York'), null);
});

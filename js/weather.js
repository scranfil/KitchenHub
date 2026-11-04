(function (exports) {
  'use strict';

  function celsiusToFahrenheit(c) {
    if (c == null || isNaN(Number(c))) {
      return null;
    }
    return Number(c) * 9 / 5 + 32;
  }

  function kmhToMph(kmh) {
    if (kmh == null || isNaN(Number(kmh))) {
      return null;
    }
    return Number(kmh) * 0.621371;
  }

  function degreesToCompass(deg) {
    if (deg == null || isNaN(Number(deg))) {
      return '';
    }
    var dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
      'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    var i = Math.round(Number(deg) / 22.5) % 16;
    if (i < 0) {
      i += 16;
    }
    return dirs[i];
  }

  function precipValue(period) {
    if (!period) {
      return null;
    }
    var pop = period.probabilityOfPrecipitation;
    if (pop && pop.value != null && !isNaN(Number(pop.value))) {
      return Number(pop.value);
    }
    return null;
  }

  function humidityValue(period) {
    if (!period || !period.relativeHumidity) {
      return null;
    }
    if (period.relativeHumidity.value == null || isNaN(Number(period.relativeHumidity.value))) {
      return null;
    }
    return Number(period.relativeHumidity.value);
  }

  function textOrEmpty(value) {
    return value ? String(value) : '';
  }

  function forecastBits(period) {
    return {
      precip: precipValue(period),
      shortForecast: textOrEmpty(period && period.shortForecast),
      detailedForecast: textOrEmpty(period && period.detailedForecast),
      windSpeed: textOrEmpty(period && period.windSpeed),
      windDirection: textOrEmpty(period && period.windDirection),
      humidity: humidityValue(period)
    };
  }

  function parseMph(str) {
    if (typeof str === 'number' && !isNaN(str)) {
      return str;
    }
    if (!str) {
      return null;
    }
    var m = String(str).match(/(\d+(?:\.\d+)?)/);
    if (!m) {
      return null;
    }
    return Number(m[1]);
  }

  function qty(obj) {
    if (!obj || obj.value == null || isNaN(Number(obj.value))) {
      return null;
    }
    return Number(obj.value);
  }

  function isObservationStale(timestamp, now, tempF) {
    if (tempF == null || isNaN(Number(tempF))) {
      return true;
    }
    if (!timestamp) {
      return true;
    }
    var t = new Date(timestamp).getTime();
    if (isNaN(t)) {
      return true;
    }
    return (now.getTime() - t) > 90 * 60 * 1000;
  }

  function pairForecastPeriods(periods) {
    var list = periods || [];
    var cards = [];
    var i = 0;

    function dayName(period, index) {
      var name = period && period.name ? String(period.name) : '';
      if (index === 0) {
        if (period && period.isDaytime === false) {
          return name || 'Tonight';
        }
        return name || 'Today';
      }
      return name.replace(/\s+Night$/i, '') || name;
    }

    if (list.length && list[0].isDaytime === false) {
      var tonight = forecastBits(list[0]);
      cards.push({
        name: dayName(list[0], 0),
        high: null,
        low: list[0].temperature,
        precip: tonight.precip,
        dayPrecip: tonight.precip,
        shortForecast: tonight.shortForecast,
        detailedForecast: tonight.detailedForecast,
        windSpeed: tonight.windSpeed,
        windDirection: tonight.windDirection,
        humidity: tonight.humidity,
        isDaytime: false,
        tonightOnly: true,
        night: null
      });
      i = 1;
    }

    while (i < list.length && cards.length < 5) {
      var day = list[i];
      if (!day) {
        break;
      }
      if (day.isDaytime === false) {
        i += 1;
        continue;
      }
      var night = list[i + 1];
      var low = null;
      var dayBits = forecastBits(day);
      var precip = dayBits.precip;
      var nightCard = null;
      if (night && night.isDaytime === false) {
        var nightBits = forecastBits(night);
        low = night.temperature;
        if (precip == null) {
          precip = nightBits.precip;
        } else if (nightBits.precip != null) {
          precip = Math.max(precip, nightBits.precip);
        }
        nightCard = {
          name: night.name || 'Night',
          precip: nightBits.precip,
          shortForecast: nightBits.shortForecast,
          detailedForecast: nightBits.detailedForecast,
          windSpeed: nightBits.windSpeed,
          windDirection: nightBits.windDirection,
          humidity: nightBits.humidity
        };
        i += 2;
      } else {
        i += 1;
      }
      cards.push({
        name: dayName(day, cards.length),
        high: day.temperature,
        low: low,
        precip: precip,
        dayPrecip: dayBits.precip,
        shortForecast: dayBits.shortForecast,
        detailedForecast: dayBits.detailedForecast,
        windSpeed: dayBits.windSpeed,
        windDirection: dayBits.windDirection,
        humidity: dayBits.humidity,
        isDaytime: true,
        tonightOnly: false,
        night: nightCard
      });
    }

    return cards.slice(0, 5);
  }

  function nextHourlyPeriods(periods, now, count) {
    var list = periods || [];
    var out = [];
    var nowMs = now.getTime();
    var i;
    for (i = 0; i < list.length && out.length < count; i++) {
      var p = list[i];
      if (!p || !p.startTime) {
        continue;
      }
      var start = new Date(p.startTime).getTime();
      if (isNaN(start)) {
        continue;
      }
      if (start + 60 * 60 * 1000 <= nowMs) {
        continue;
      }
      out.push(p);
    }
    return out;
  }

  function currentHourPeriod(periods, now) {
    var hours = nextHourlyPeriods(periods, now, 1);
    return hours.length ? hours[0] : (periods && periods[0] ? periods[0] : null);
  }

  function feelsFromObs(props, tempF) {
    var heat = celsiusToFahrenheit(qty(props.heatIndex));
    if (heat != null) {
      return heat;
    }
    var chill = celsiusToFahrenheit(qty(props.windChill));
    if (chill != null) {
      return chill;
    }
    return tempF;
  }

  function normalizeObservation(obs, hourlyPeriod, now) {
    var props = (obs && obs.properties) ? obs.properties : {};
    var tempF = celsiusToFahrenheit(qty(props.temperature));
    var stale = isObservationStale(props.timestamp, now, tempF);
    var hour = hourlyPeriod || null;

    if (stale && hour) {
      return {
        temperature: hour.temperature,
        feelsLike: hour.temperature,
        condition: hour.shortForecast || props.textDescription || '',
        windMph: parseMph(hour.windSpeed),
        windDir: hour.windDirection || '',
        humidity: hour.relativeHumidity && hour.relativeHumidity.value != null
          ? Number(hour.relativeHumidity.value)
          : null,
        isDaytime: hour.isDaytime !== false,
        fromHourly: true,
        timestamp: hour.startTime || props.timestamp || null
      };
    }

    return {
      temperature: tempF,
      feelsLike: feelsFromObs(props, tempF),
      condition: (hour && hour.shortForecast) || props.textDescription || '',
      windMph: kmhToMph(qty(props.windSpeed)),
      windDir: degreesToCompass(qty(props.windDirection)),
      humidity: qty(props.relativeHumidity),
      isDaytime: hour ? hour.isDaytime !== false : true,
      fromHourly: false,
      timestamp: props.timestamp || null
    };
  }

  function mapOpenMeteo(om, now) {
    var current = (om && om.current) || {};
    var hourly = (om && om.hourly) || {};
    var daily = (om && om.daily) || {};
    var times = hourly.time || [];
    var nowMs = now.getTime();
    var startIdx = 0;
    var i;
    for (i = 0; i < times.length; i++) {
      var t = Date.parse(times[i]);
      if (!isNaN(t) && t + 60 * 60 * 1000 > nowMs) {
        startIdx = i;
        break;
      }
    }

    var hours = [];
    for (i = startIdx; i < times.length && hours.length < 12; i++) {
      hours.push({
        startTime: times[i],
        temperature: hourly.temperature_2m ? hourly.temperature_2m[i] : null,
        probabilityOfPrecipitation: {
          value: hourly.precipitation_probability ? hourly.precipitation_probability[i] : null
        },
        shortForecast: '',
        weatherCode: hourly.weather_code ? hourly.weather_code[i] : current.weather_code,
        isDaytime: isDaytimeAt(times[i], daily, now)
      });
    }

    var days = [];
    var dayTimes = daily.time || [];
    for (i = 0; i < dayTimes.length && days.length < 5; i++) {
      days.push({
        name: i === 0 ? 'Today' : weekdayFromIso(dayTimes[i]),
        high: daily.temperature_2m_max ? daily.temperature_2m_max[i] : null,
        low: daily.temperature_2m_min ? daily.temperature_2m_min[i] : null,
        precip: daily.precipitation_probability_max ? daily.precipitation_probability_max[i] : null,
        dayPrecip: daily.precipitation_probability_max ? daily.precipitation_probability_max[i] : null,
        shortForecast: '',
        detailedForecast: '',
        windSpeed: '',
        windDirection: '',
        humidity: null,
        weatherCode: daily.weather_code ? daily.weather_code[i] : null,
        isDaytime: true,
        tonightOnly: false,
        night: null,
        sunriseLabel: omClock(daily.sunrise ? daily.sunrise[i] : ''),
        sunsetLabel: omClock(daily.sunset ? daily.sunset[i] : '')
      });
    }

    var sun = sunFromDaily(daily, now);

    return {
      current: {
        temperature: current.temperature_2m,
        feelsLike: current.apparent_temperature,
        condition: '',
        weatherCode: current.weather_code,
        windMph: current.wind_speed_10m,
        windDir: degreesToCompass(current.wind_direction_10m),
        humidity: current.relative_humidity_2m,
        isDaytime: sun.isDay,
        fromHourly: false,
        timestamp: current.time || null
      },
      hourly: hours,
      daily: days,
      sun: sun
    };
  }

  function weekdayFromIso(iso) {
    var d = new Date(iso + 'T12:00:00');
    if (isNaN(d.getTime())) {
      return iso;
    }
    return new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(d);
  }

  function sunFromDaily(daily, now) {
    var times = (daily && daily.time) || [];
    var sunrises = (daily && daily.sunrise) || [];
    var sunsets = (daily && daily.sunset) || [];
    var today = isoDateInZone(now);
    var idx = 0;
    var i;
    for (i = 0; i < times.length; i++) {
      if (times[i] === today) {
        idx = i;
        break;
      }
    }
    var rise = sunrises[idx] || sunrises[0] || '';
    var set = sunsets[idx] || sunsets[0] || '';
    var nowMs = now.getTime();
    var riseMs = parseLocalIso(rise);
    var setMs = parseLocalIso(set);
    var isDay = true;
    if (riseMs != null && setMs != null) {
      isDay = nowMs >= riseMs && nowMs < setMs;
    }
    return {
      sunrise: rise,
      sunset: set,
      sunriseLabel: formatOmLocal(rise),
      sunsetLabel: formatOmLocal(set),
      isDay: isDay
    };
  }

  function isoDateInZone(now) {
    try {
      var fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: (typeof window !== 'undefined' && window.KH_CONFIG && window.KH_CONFIG.timezone) || 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      return fmt.format(now);
    } catch (err) {
      var y = now.getFullYear();
      var m = now.getMonth() + 1;
      var d = now.getDate();
      return y + '-' + pad2(m) + '-' + pad2(d);
    }
  }

  function parseLocalIso(value) {
    if (!value) {
      return null;
    }
    var t = Date.parse(value);
    return isNaN(t) ? null : t;
  }

  function omClock(isoLocal) {
    var label = formatOmLocal(isoLocal);
    return label === '—' ? '' : label;
  }

  function formatOmLocal(isoLocal) {
    if (!isoLocal) {
      return '—';
    }
    var hm = String(isoLocal).split('T')[1];
    if (!hm) {
      return '—';
    }
    var bits = hm.split(':');
    var h = parseInt(bits[0], 10);
    var m = bits[1] || '00';
    if (isNaN(h)) {
      return '—';
    }
    var ap = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12;
    if (h12 === 0) {
      h12 = 12;
    }
    return h12 + ':' + m + ' ' + ap;
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function isDaytimeAt(isoLocal, daily, now) {
    var sun = sunFromDaily(daily, isoLocal ? new Date(isoLocal) : now);
    var t = parseLocalIso(isoLocal);
    var rise = parseLocalIso(sun.sunrise);
    var set = parseLocalIso(sun.sunset);
    if (t == null || rise == null || set == null) {
      return true;
    }
    return t >= rise && t < set;
  }

  function fmtTemp(n) {
    if (n == null || isNaN(Number(n))) {
      return '—';
    }
    return Math.round(Number(n)) + '°';
  }

  function fmtTempPlain(n) {
    if (n == null || isNaN(Number(n))) {
      return '—';
    }
    return String(Math.round(Number(n)));
  }

  function fmtPrecip(n) {
    if (n == null || isNaN(Number(n))) {
      return '—';
    }
    return Math.round(Number(n)) + '%';
  }

  function fmtWind(dir, mph) {
    var d = dir || '';
    if (mph == null || isNaN(Number(mph))) {
      return d || '—';
    }
    return (d ? d + ' ' : '') + Math.round(Number(mph)) + ' mph';
  }

  function fmtHumidity(n) {
    if (n == null || isNaN(Number(n))) {
      return '—';
    }
    return Math.round(Number(n)) + '%';
  }

  exports.celsiusToFahrenheit = celsiusToFahrenheit;
  exports.kmhToMph = kmhToMph;
  exports.degreesToCompass = degreesToCompass;
  exports.precipValue = precipValue;
  exports.parseMph = parseMph;
  exports.isObservationStale = isObservationStale;
  exports.pairForecastPeriods = pairForecastPeriods;
  exports.nextHourlyPeriods = nextHourlyPeriods;
  exports.currentHourPeriod = currentHourPeriod;
  exports.normalizeObservation = normalizeObservation;
  exports.mapOpenMeteo = mapOpenMeteo;
  exports.sunFromDaily = sunFromDaily;
  exports.formatOmLocal = formatOmLocal;
  exports.fmtTemp = fmtTemp;

  var NWS_ORIGIN = 'https://api.weather.gov';
  var NWS_USER_AGENT = 'WeatherPWA/1.0 (https://github.com/scranfil/weather; contact: weather-app@users.noreply.github.com)';
  var MAX_OBS_AGE_MIN = 90;
  var POINTS_CACHE_MS = 30 * 60 * 1000;

  function isNum(n) {
    return typeof n === 'number' && isFinite(n);
  }

  function haversineKm(lat1, lon1, lat2, lon2) {
    var radius = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.pow(Math.sin(dLat / 2), 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.pow(Math.sin(dLon / 2), 2);
    return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function observationPrecipMm(props) {
    var lastHour = props && props.precipitationLastHour ? props.precipitationLastHour.value : null;
    var last3 = props && props.precipitationLast3Hours ? props.precipitationLast3Hours.value : null;
    if (isNum(lastHour) && lastHour > 0) {
      return lastHour;
    }
    if (isNum(last3) && last3 > 0) {
      return last3 / 3;
    }
    return 0;
  }

  function stationIdFromFeature(feature) {
    var id = feature && feature.id ? String(feature.id) : '';
    var parts = id.split('/');
    return parts.length ? parts[parts.length - 1] : '';
  }

  function scoreObservation(feature, data, lat, lon, now) {
    var props = data && data.properties ? data.properties : {};
    var dist = null;
    if (feature && feature.properties && feature.properties.distance &&
        feature.properties.distance.value != null && !isNaN(Number(feature.properties.distance.value))) {
      dist = Number(feature.properties.distance.value);
    }
    if ((dist == null || isNaN(dist)) && feature && feature.geometry &&
        feature.geometry.coordinates && feature.geometry.coordinates.length >= 2) {
      dist = haversineKm(lat, lon, feature.geometry.coordinates[1], feature.geometry.coordinates[0]) * 1000;
    }
    if (dist == null || isNaN(dist)) {
      dist = Infinity;
    }
    var ts = props.timestamp ? new Date(props.timestamp).getTime() : 0;
    var ageMin = ts && !isNaN(ts) ? (now.getTime() - ts) / 60000 : 9999;
    var temp = props.temperature ? props.temperature.value : null;
    return {
      props: props,
      obs: data,
      dist: dist,
      precip: observationPrecipMm(props),
      ageMin: ageMin,
      hasTemp: isNum(temp),
      stationId: stationIdFromFeature(feature),
      isFresh: ageMin <= MAX_OBS_AGE_MIN
    };
  }

  function pickBestObservation(candidates) {
    var valid = [];
    var withTemp = [];
    var fresh = [];
    var list = candidates || [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i]) {
        valid.push(list[i]);
      }
    }
    if (!valid.length) {
      return null;
    }
    valid.sort(function (a, b) {
      return a.dist - b.dist;
    });
    for (i = 0; i < valid.length; i++) {
      if (valid[i].hasTemp) {
        withTemp.push(valid[i]);
      }
    }
    if (!withTemp.length) {
      return valid[0];
    }
    for (i = 0; i < withTemp.length; i++) {
      if (withTemp[i].isFresh) {
        fresh.push(withTemp[i]);
      }
    }
    var pool = fresh.length ? fresh : withTemp;
    var closest = pool[0];
    var precipCandidate = null;
    for (i = 0; i < pool.length; i++) {
      if (pool[i].precip > 0 && pool[i].dist <= closest.dist * 2.5) {
        precipCandidate = pool[i];
        break;
      }
    }
    if (precipCandidate && closest.precip === 0 && precipCandidate.dist > closest.dist) {
      return precipCandidate;
    }
    return closest;
  }

  function urlsFromPoints(pointsData, cfg) {
    var props = pointsData && pointsData.properties ? pointsData.properties : null;
    var loc = (cfg && cfg.location) || {};
    if (!props || !props.forecast || !props.forecastHourly) {
      return null;
    }
    return {
      observationStations: props.observationStations || null,
      hourly: props.forecastHourly,
      forecast: props.forecast,
      alerts: NWS_ORIGIN + '/alerts/active?point=' + loc.lat + ',' + loc.lon
    };
  }

  function pointsUrl(cfg) {
    var loc = (cfg && cfg.location) || {};
    return NWS_ORIGIN + '/points/' + loc.lat + ',' + loc.lon;
  }

  function sunApiUrl(cfg) {
    var loc = (cfg && cfg.location) || {};
    return 'https://api.sunrise-sunset.org/json?lat=' + loc.lat + '&lng=' + loc.lon + '&formatted=0';
  }

  function formatClock(date, timeZone) {
    var parts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timeZone || 'America/New_York'
    }).formatToParts(date);
    var map = {};
    var i;
    for (i = 0; i < parts.length; i++) {
      map[parts[i].type] = parts[i].value;
    }
    return map.hour + ':' + map.minute + ' ' + map.dayPeriod;
  }

  function sunFromSunriseSunset(data, now, timeZone) {
    var results = data && data.results ? data.results : null;
    if (!results || data.status !== 'OK' || !results.sunrise || !results.sunset) {
      return null;
    }
    var rise = new Date(results.sunrise);
    var set = new Date(results.sunset);
    if (isNaN(rise.getTime()) || isNaN(set.getTime())) {
      return null;
    }
    var nowMs = now.getTime();
    return {
      sunrise: results.sunrise,
      sunset: results.sunset,
      sunriseLabel: formatClock(rise, timeZone),
      sunsetLabel: formatClock(set, timeZone),
      isDay: nowMs >= rise.getTime() && nowMs < set.getTime(),
      localDate: isoDateInZone(now)
    };
  }

  exports.pickBestObservation = pickBestObservation;
  exports.scoreObservation = scoreObservation;
  exports.urlsFromPoints = urlsFromPoints;
  exports.pointsUrl = pointsUrl;
  exports.sunApiUrl = sunApiUrl;
  exports.sunFromSunriseSunset = sunFromSunriseSunset;
  exports.NWS_USER_AGENT = NWS_USER_AGENT;

  function nwsUrls(cfg) {
    var loc = cfg.location || {};
    var office = loc.nwsOffice || 'IND';
    var x = loc.nwsGridX;
    var y = loc.nwsGridY;
    var station = loc.nwsStation || 'KMQJ';
    var lat = loc.lat;
    var lon = loc.lon;
    var grid = 'https://api.weather.gov/gridpoints/' + office + '/' + x + ',' + y;
    return {
      observation: 'https://api.weather.gov/stations/' + station + '/observations/latest',
      hourly: grid + '/forecast/hourly',
      forecast: grid + '/forecast',
      alerts: 'https://api.weather.gov/alerts/active?point=' + lat + ',' + lon
    };
  }

  var RADAR_MIN_ZOOM = 4;
  var RADAR_MAX_ZOOM = 13;
  var RADAR_DEFAULT_ZOOM = 9;
  var RADAR_LOCAL_ZOOM = 10;
  var RADAR_NATIVE_ZOOM = 8;

  function mercatorX(lon, zoom) {
    return ((lon + 180) / 360) * Math.pow(2, zoom) * 256;
  }

  function mercatorY(lat, zoom) {
    var s = Math.sin(lat * Math.PI / 180);
    var y = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
    return y * Math.pow(2, zoom) * 256;
  }

  function lonFromMercatorX(x, zoom) {
    return x / (Math.pow(2, zoom) * 256) * 360 - 180;
  }

  function latFromMercatorY(y, zoom) {
    var n = Math.PI - (2 * Math.PI * y) / (Math.pow(2, zoom) * 256);
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }

  function clampRadarZoom(zoom) {
    if (zoom < RADAR_MIN_ZOOM) {
      return RADAR_MIN_ZOOM;
    }
    if (zoom > RADAR_MAX_ZOOM) {
      return RADAR_MAX_ZOOM;
    }
    return zoom;
  }

  function centerForAnchor(lat, lon, width, height, anchorLat, anchorLon, viewX, viewY, zoom) {
    var ax = mercatorX(anchorLon, zoom);
    var ay = mercatorY(anchorLat, zoom);
    var cx = ax + width / 2 - viewX;
    var cy = ay + height / 2 - viewY;
    var nextLat = latFromMercatorY(cy, zoom);
    if (nextLat > 85) {
      nextLat = 85;
    }
    if (nextLat < -85) {
      nextLat = -85;
    }
    return {
      lat: nextLat,
      lon: lonFromMercatorX(cx, zoom),
      zoom: zoom
    };
  }

  function openMeteoUrl(cfg, mode) {
    var loc = cfg.location || {};
    var base = 'https://api.open-meteo.com/v1/forecast?latitude=' + loc.lat +
      '&longitude=' + loc.lon +
      '&timezone=America%2FNew_York&forecast_days=6';
    if (mode === 'sun') {
      return base + '&daily=sunrise,sunset';
    }
    return base +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m' +
      '&hourly=temperature_2m,precipitation_probability,weather_code' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset' +
      '&temperature_unit=fahrenheit&wind_speed_unit=mph';
  }

  var NWS_HEADERS = {
    Accept: 'application/geo+json',
    'User-Agent': NWS_USER_AGENT
  };
  var fails = { observation: 0, hourly: 0, forecast: 0 };
  var usingOm = { current: false, hourly: false, daily: false };

  function icons() {
    return (typeof window !== 'undefined' && window.KH && window.KH.icons) ? window.KH.icons : exports.icons;
  }

  function markFail(key) {
    fails[key] = (fails[key] || 0) + 1;
  }

  function markOk(key) {
    fails[key] = 0;
    if (key === 'observation') {
      usingOm.current = false;
    }
    if (key === 'hourly') {
      usingOm.hourly = false;
    }
    if (key === 'forecast') {
      usingOm.daily = false;
    }
  }

  function fetchNws(util, name, url, options) {
    options = options || {};
    var fetchOpts = { headers: NWS_HEADERS, record: options.record };
    return util.fetchJson(name, url, fetchOpts).then(function (data) {
      if (!data || typeof data !== 'object') {
        throw new Error('malformed JSON');
      }
      markOk(name);
      return data;
    }).catch(function () {
      markFail(name);
      return util.fetchJson(name + '-retry', url, fetchOpts).then(function (data) {
        if (!data || typeof data !== 'object') {
          throw new Error('malformed JSON');
        }
        markOk(name);
        return data;
      }).catch(function (err) {
        markFail(name);
        throw err;
      });
    });
  }

  function currentIcon(iconsApi, current) {
    if (current.weatherCode != null) {
      return iconsApi.svgFromWmo(current.weatherCode, current.isDaytime);
    }
    return iconsApi.svgFromForecast(current.condition, current.isDaytime);
  }

  function hourIcon(iconsApi, hour) {
    if (hour.weatherCode != null) {
      return iconsApi.svgFromWmo(hour.weatherCode, hour.isDaytime);
    }
    return iconsApi.svgFromForecast(hour.shortForecast, hour.isDaytime);
  }

  function dayIcon(iconsApi, day) {
    if (day.weatherCode != null) {
      return iconsApi.svgFromWmo(day.weatherCode, day.isDaytime !== false);
    }
    return iconsApi.svgFromForecast(day.shortForecast, day.isDaytime !== false);
  }

  function keywordLabel(key, isDaytime) {
    if (key === 'sunny') {
      return isDaytime === false ? 'Clear' : 'Sunny';
    }
    if (key === 'partly') {
      return 'Partly cloudy';
    }
    if (key === 'cloudy') {
      return 'Cloudy';
    }
    if (key === 'rain') {
      return 'Rain';
    }
    if (key === 'showers') {
      return 'Showers';
    }
    if (key === 'thunder') {
      return 'Thunderstorms';
    }
    if (key === 'snow') {
      return 'Snow';
    }
    if (key === 'fog') {
      return 'Fog';
    }
    if (key === 'wind') {
      return 'Windy';
    }
    return '';
  }

  function conditionLabel(current) {
    if (current.condition) {
      return current.condition;
    }
    var iconsApi = icons();
    if (iconsApi && current.weatherCode != null) {
      return keywordLabel(iconsApi.wmoToKeyword(current.weatherCode), current.isDaytime) || '—';
    }
    return '—';
  }

  function dayCondition(day) {
    if (day && day.shortForecast) {
      return day.shortForecast;
    }
    var iconsApi = icons();
    if (iconsApi && day && day.weatherCode != null) {
      return keywordLabel(iconsApi.wmoToKeyword(day.weatherCode), day.isDaytime !== false) || '—';
    }
    return '—';
  }

  function applyStaleClass(el, savedAt, intervalMin, forced) {
    if (!el) {
      return;
    }
    var stale = !!forced;
    if (savedAt && intervalMin) {
      stale = stale || (Date.now() - savedAt) > intervalMin * 2 * 60 * 1000;
    }
    if (stale) {
      el.classList.add('is-stale');
    } else {
      el.classList.remove('is-stale');
    }
  }

  function renderCurrent(util, model, meta) {
    var iconsApi = icons();
    var el = util.$('current-body') || util.$('current');
    if (!el) {
      return;
    }
    var html = '';
    html += '<div class="current-row">';
    html += '<div class="current-icon">' + currentIcon(iconsApi, model.current) + '</div>';
    html += '<div class="current-temp" id="current-temp">' + fmtTemp(model.current.temperature) + 'F</div>';
    html += '<div class="current-cond">' + escapeText(conditionLabel(model.current)) + '</div>';
    html += '</div>';
    html += '<div class="current-meta">';
    html += 'Feels ' + fmtTemp(model.current.feelsLike);
    html += '<span class="dot">·</span>Wind ' + escapeText(fmtWind(model.current.windDir, model.current.windMph));
    html += '<span class="dot">·</span>Hum ' + fmtHumidity(model.current.humidity);
    html += '</div>';
    html += '<div class="current-hilo">';
    var today = model.daily && model.daily[0] ? model.daily[0] : null;
    if (today) {
      html += 'High ' + fmtTemp(today.high) + ' / Low ' + fmtTemp(today.low);
      html += '<span class="dot">·</span>Rain ' + fmtPrecip(today.precip);
    }
    html += '</div>';
    html += '<div class="current-sun">';
    if (model.sun) {
      html += 'Sunrise ' + escapeText(model.sun.sunriseLabel);
      html += '<span class="dot">·</span>Sunset ' + escapeText(model.sun.sunsetLabel);
    }
    html += '</div>';
    if (meta.viaOpenMeteo) {
      html += '<div class="source-tag">via Open-Meteo</div>';
    }
    el.innerHTML = html;
    applyStaleClass(el, meta.savedAt, util.cfg.refreshMinutes.observation, meta.offline);
  }

  function renderHourly(util, hours, meta) {
    var iconsApi = icons();
    var el = util.$('hourly');
    var html = '<div class="panel-kicker">Next 12 hours</div><div class="hourly-strip">';
    var i;
    var list = hours || [];
    for (i = 0; i < list.length && i < 12; i++) {
      var h = list[i];
      var when = h.startTime ? new Date(h.startTime) : null;
      var label = when && !isNaN(when.getTime()) ? util.formatHourLabel(when) : '—';
      var precip = precipValue(h);
      html += '<div class="hour-slot">';
      html += '<div class="hour-label">' + escapeText(label) + '</div>';
      html += '<div class="hour-icon">' + hourIcon(iconsApi, h) + '</div>';
      html += '<div class="hour-temp">' + fmtTempPlain(h.temperature) + '°</div>';
      html += '<div class="hour-precip">' + fmtPrecip(precip) + '</div>';
      html += '</div>';
    }
    html += '</div>';
    el.innerHTML = html;
    applyStaleClass(el, meta.savedAt, util.cfg.refreshMinutes.hourly, meta.offline);
  }

  var MAP_ICON = '<svg class="map-icon" viewBox="0 0 64 64" aria-hidden="true">' +
    '<path fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round" d="M8 18l16-8 16 8 16-8v36l-16 8-16-8-16 8z"/>' +
    '<path fill="none" stroke="currentColor" stroke-width="4" d="M24 10v36M40 18v36"/>' +
    '<circle cx="40" cy="28" r="4" fill="currentColor"/>' +
    '</svg>';

  var latestDays = [];
  var openDayIndex = -1;
  var dayUtil = null;
  var dayDetailBound = false;
  var mapOpen = false;
  var radarView = null;
  var radarFrame = null;
  var radarPointers = {};
  var radarGesture = null;
  var radarLastTap = 0;

  function dayNode(tag, className, text) {
    var node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text != null) {
      node.textContent = text;
    }
    return node;
  }

  function windPhrase(dir, speed) {
    var d = dir ? String(dir).trim() : '';
    var s = speed ? String(speed).trim() : '';
    if (d && s) {
      return d + ' ' + s;
    }
    return d || s;
  }

  function factLine(period) {
    var parts = [];
    if (!period) {
      return '';
    }
    if (period.precip != null && !isNaN(Number(period.precip))) {
      parts.push('Rain ' + fmtPrecip(period.precip));
    }
    var wind = windPhrase(period.windDirection, period.windSpeed);
    if (wind) {
      parts.push('Wind ' + wind);
    }
    if (period.humidity != null && !isNaN(Number(period.humidity))) {
      parts.push('Humidity ' + fmtHumidity(period.humidity));
    }
    return parts.join(' · ');
  }

  function hiloLine(day) {
    var parts = [];
    if (!day.tonightOnly && day.high != null && !isNaN(Number(day.high))) {
      parts.push('High ' + fmtTemp(day.high));
    }
    if (day.low != null && !isNaN(Number(day.low))) {
      parts.push('Low ' + fmtTemp(day.low));
    }
    return parts.join(' · ') || '—';
  }

  function appendFacts(parent, period) {
    var line = factLine(period);
    if (line) {
      parent.appendChild(dayNode('div', 'day-detail-facts', line));
    }
  }

  function appendNarrative(parent, text) {
    if (!text) {
      return;
    }
    var body = dayNode('div', 'day-detail-body');
    body.appendChild(dayNode('p', null, text));
    parent.appendChild(body);
  }

  function renderDayDetail() {
    if (!dayUtil) {
      return;
    }
    var panel = dayUtil.$('day-detail');
    var day = latestDays[openDayIndex];
    if (!panel || !day) {
      if (openDayIndex >= 0) {
        closeDayDetail();
      }
      return;
    }
    var iconsApi = icons();
    var scrollerPrev = panel.querySelector('.day-modal-scroll');
    var keepScroll = scrollerPrev ? scrollerPrev.scrollTop : 0;
    dayUtil.emptyEl(panel);
    var backdrop = dayNode('div', 'day-modal-backdrop');
    var card = dayNode('div', 'day-modal-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', (day.name || 'Day') + ' forecast');
    var closeBtn = dayNode('button', 'day-close', '\u00d7');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close');
    var scroller = dayNode('div', 'day-modal-scroll');
    var head = dayNode('div', 'day-detail-head');
    var iconWrap = dayNode('div', 'day-detail-icon');
    iconWrap.innerHTML = dayIcon(iconsApi, day);
    var titles = dayNode('div', 'day-detail-titles');
    titles.appendChild(dayNode('h2', 'day-detail-title', day.name || 'Day'));
    titles.appendChild(dayNode('div', 'day-detail-cond', dayCondition(day)));
    head.appendChild(iconWrap);
    head.appendChild(titles);
    scroller.appendChild(head);
    scroller.appendChild(dayNode('div', 'day-detail-hilo', hiloLine(day)));
    appendFacts(scroller, {
      precip: day.dayPrecip != null ? day.dayPrecip : day.precip,
      windDirection: day.windDirection,
      windSpeed: day.windSpeed,
      humidity: day.humidity
    });
    if (day.sunriseLabel && day.sunsetLabel) {
      scroller.appendChild(dayNode('div', 'day-detail-facts', 'Sunrise ' + day.sunriseLabel + ' · Sunset ' + day.sunsetLabel));
    }
    appendNarrative(scroller, day.detailedForecast);
    if (day.night && !day.tonightOnly) {
      var night = dayNode('div', 'day-detail-night');
      night.appendChild(dayNode('div', 'day-detail-kicker', day.night.name || 'Night'));
      if (day.night.shortForecast) {
        night.appendChild(dayNode('div', 'day-detail-cond', day.night.shortForecast));
      }
      appendFacts(night, day.night);
      appendNarrative(night, day.night.detailedForecast);
      scroller.appendChild(night);
    }
    card.appendChild(closeBtn);
    card.appendChild(scroller);
    panel.appendChild(backdrop);
    panel.appendChild(card);
    panel.hidden = false;
    scroller.scrollTop = keepScroll;
  }

  function openDayDetail(index) {
    if (!latestDays[index]) {
      return;
    }
    var already = openDayIndex === index && dayUtil && dayUtil.$('day-detail') && !dayUtil.$('day-detail').hidden;
    openDayIndex = index;
    renderDayDetail();
    if (!already && dayUtil) {
      var panel = dayUtil.$('day-detail');
      var closeBtn = panel ? panel.querySelector('.day-close') : null;
      if (closeBtn && closeBtn.focus) {
        closeBtn.focus();
      }
    }
  }

  function closeDayDetail() {
    var index = openDayIndex;
    openDayIndex = -1;
    if (!dayUtil) {
      return;
    }
    var panel = dayUtil.$('day-detail');
    if (panel) {
      panel.hidden = true;
      dayUtil.emptyEl(panel);
    }
    if (index < 0) {
      return;
    }
    var daily = dayUtil.$('daily');
    var btn = daily ? daily.querySelector('[data-day-index="' + index + '"]') : null;
    if (btn && btn.focus) {
      btn.focus();
    }
  }

  function syncDayDetail() {
    if (openDayIndex < 0) {
      return;
    }
    if (!latestDays[openDayIndex]) {
      closeDayDetail();
      return;
    }
    renderDayDetail();
  }

  function onDailyClick(ev) {
    var node = ev.target;
    var root = dayUtil ? dayUtil.$('daily') : null;
    while (node && node !== root) {
      if (node.getAttribute && node.getAttribute('data-day-index') != null) {
        ev.preventDefault();
        ev.stopPropagation();
        openDayDetail(Number(node.getAttribute('data-day-index')));
        return;
      }
      node = node.parentNode;
    }
  }

  function onDayDetailClick(ev) {
    ev.stopPropagation();
    var node = ev.target;
    var panel = dayUtil ? dayUtil.$('day-detail') : null;
    while (node && node !== panel) {
      if (node.classList && node.classList.contains('day-close')) {
        ev.preventDefault();
        closeDayDetail();
        return;
      }
      if (node.classList && node.classList.contains('day-modal-card')) {
        return;
      }
      node = node.parentNode;
    }
    ev.preventDefault();
    closeDayDetail();
  }

  function onDayKeydown(ev) {
    if (openDayIndex < 0) {
      return;
    }
    if (ev.key === 'Escape' || ev.key === 'Esc') {
      ev.preventDefault();
      closeDayDetail();
    }
  }

  function mapLocation() {
    var cfg = dayUtil && dayUtil.cfg ? dayUtil.cfg : {};
    var loc = cfg.location || {};
    var lat = Number(loc.lat);
    var lon = Number(loc.lon);
    if (isNaN(lat)) {
      lat = 39.8947;
    }
    if (isNaN(lon)) {
      lon = -85.9786;
    }
    return { lat: lat, lon: lon, name: loc.name || 'home' };
  }

  function radarViewEl() {
    var panel = dayUtil ? dayUtil.$('map-detail') : null;
    return panel ? panel.querySelector('.radar-view') : null;
  }

  function wrapTileX(x, zoom) {
    var n = Math.pow(2, zoom);
    var wrapped = x % n;
    if (wrapped < 0) {
      wrapped += n;
    }
    return wrapped;
  }

  function syncTileLayer(layer, specs) {
    var keep = {};
    var nodes = layer.children;
    var i;
    for (i = nodes.length - 1; i >= 0; i--) {
      var key = nodes[i].getAttribute('data-key');
      if (!specs[key]) {
        layer.removeChild(nodes[i]);
      } else {
        keep[key] = nodes[i];
      }
    }
    var id;
    for (id in specs) {
      if (!Object.prototype.hasOwnProperty.call(specs, id)) {
        continue;
      }
      var spec = specs[id];
      var img = keep[id];
      if (!img) {
        img = document.createElement('img');
        img.className = 'radar-tile' + (spec.precip ? ' is-precip' : '');
        img.alt = '';
        img.draggable = false;
        img.setAttribute('data-key', id);
        img.src = spec.src;
        layer.appendChild(img);
      }
      img.style.left = spec.left + 'px';
      img.style.top = spec.top + 'px';
      img.style.width = spec.size + 'px';
      img.style.height = spec.size + 'px';
    }
  }

  function tileSpecs(urlZoom, urlFor, precip, keySuffix) {
    var view = radarViewEl();
    var specs = {};
    if (!view || !radarView) {
      return specs;
    }
    var width = view.clientWidth;
    var height = view.clientHeight;
    if (!width || !height) {
      return specs;
    }
    var zoom = radarView.zoom;
    var centerX = mercatorX(radarView.lon, zoom);
    var centerY = mercatorY(radarView.lat, zoom);
    var scale = Math.pow(2, zoom - urlZoom);
    var size = 256 * scale;
    var left = centerX - width / 2;
    var top = centerY - height / 2;
    var x0 = Math.floor(left / size);
    var y0 = Math.floor(top / size);
    var x1 = Math.floor((left + width) / size);
    var y1 = Math.floor((top + height) / size);
    var n = Math.pow(2, urlZoom);
    var tx;
    var ty;
    for (ty = y0; ty <= y1; ty++) {
      if (ty < 0 || ty >= n) {
        continue;
      }
      for (tx = x0; tx <= x1; tx++) {
        var wrapped = wrapTileX(tx, urlZoom);
        var key = (precip ? 'r' : 'b') + urlZoom + '/' + wrapped + '/' + ty + (keySuffix || '');
        specs[key] = {
          src: urlFor(urlZoom, wrapped, ty),
          left: tx * size - left,
          top: ty * size - top,
          size: size,
          precip: precip
        };
      }
    }
    return specs;
  }

  function paintRadar() {
    var view = radarViewEl();
    if (!view || !radarView) {
      return;
    }
    var base = view.querySelector('.radar-base');
    var precip = view.querySelector('.radar-precip');
    var home = view.querySelector('.radar-home');
    var zoom = radarView.zoom;
    var tileZ = Math.round(zoom);
    if (tileZ < RADAR_MIN_ZOOM) {
      tileZ = RADAR_MIN_ZOOM;
    }
    if (tileZ > RADAR_MAX_ZOOM) {
      tileZ = RADAR_MAX_ZOOM;
    }
    syncTileLayer(base, tileSpecs(tileZ, function (z, x, y) {
      return 'https://tile.openstreetmap.org/' + z + '/' + x + '/' + y + '.png';
    }, false, ''));
    var radarZ = tileZ < RADAR_NATIVE_ZOOM ? tileZ : RADAR_NATIVE_ZOOM;
    var urlZ = radarZ - 1;
    if (radarFrame) {
      syncTileLayer(precip, tileSpecs(urlZ, function (z, x, y) {
        return radarFrame.host + radarFrame.path + '/256/' + z + '/' + x + '/' + y + '/2/1_0.png';
      }, true, radarFrame.path));
    } else {
      syncTileLayer(precip, {});
    }
    var width = view.clientWidth;
    var height = view.clientHeight;
    var dx = mercatorX(radarView.homeLon, zoom) - mercatorX(radarView.lon, zoom);
    var dy = mercatorY(radarView.homeLat, zoom) - mercatorY(radarView.lat, zoom);
    home.style.left = (width / 2 + dx) + 'px';
    home.style.top = (height / 2 + dy) + 'px';
    var zoomIn = view.querySelector('.radar-zoom-in');
    var zoomOut = view.querySelector('.radar-zoom-out');
    if (zoomIn) {
      zoomIn.disabled = zoom >= RADAR_MAX_ZOOM - 0.01;
    }
    if (zoomOut) {
      zoomOut.disabled = zoom <= RADAR_MIN_ZOOM + 0.01;
    }
  }

  function zoomMapAt(delta, clientX, clientY) {
    var view = radarViewEl();
    if (!view || !radarView) {
      return;
    }
    var rect = view.getBoundingClientRect();
    var viewX = clientX - rect.left;
    var viewY = clientY - rect.top;
    var zoom = clampRadarZoom(radarView.zoom + delta);
    var anchorX = mercatorX(radarView.lon, radarView.zoom) - rect.width / 2 + viewX;
    var anchorY = mercatorY(radarView.lat, radarView.zoom) - rect.height / 2 + viewY;
    var anchorLon = lonFromMercatorX(anchorX, radarView.zoom);
    var anchorLat = latFromMercatorY(anchorY, radarView.zoom);
    var next = centerForAnchor(
      radarView.lat, radarView.lon, rect.width, rect.height,
      anchorLat, anchorLon, viewX, viewY, zoom
    );
    radarView.lat = next.lat;
    radarView.lon = next.lon;
    radarView.zoom = zoom;
    paintRadar();
  }

  function zoomMapBy(delta) {
    var view = radarViewEl();
    if (!view) {
      return;
    }
    var rect = view.getBoundingClientRect();
    zoomMapAt(delta, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  function recenterRadar(zoom) {
    if (!radarView) {
      return;
    }
    radarView.lat = radarView.homeLat;
    radarView.lon = radarView.homeLon;
    radarView.zoom = zoom;
    paintRadar();
  }

  function loadRadarFrame() {
    if (!dayUtil) {
      return Promise.resolve();
    }
    return dayUtil.fetchJson('rainviewer', 'https://api.rainviewer.com/public/weather-maps.json', {
      timeout: 8000
    }).then(function (data) {
      var past = data && data.radar && data.radar.past ? data.radar.past : [];
      var last = past.length ? past[past.length - 1] : null;
      if (!last || !data.host) {
        throw new Error('no radar frame');
      }
      radarFrame = { host: data.host, path: last.path };
      paintRadar();
      var view = radarViewEl();
      var status = view ? view.querySelector('.radar-status') : null;
      if (status) {
        status.hidden = true;
      }
    }).catch(function (err) {
      console.error('[radar]', err);
      var view = radarViewEl();
      var status = view ? view.querySelector('.radar-status') : null;
      if (status) {
        status.hidden = false;
        status.textContent = 'Radar unavailable';
      }
    });
  }

  function radarPointerList() {
    var out = [];
    var id;
    for (id in radarPointers) {
      if (Object.prototype.hasOwnProperty.call(radarPointers, id)) {
        out.push(radarPointers[id]);
      }
    }
    return out;
  }

  function inZoomControl(node) {
    while (node) {
      if (node.classList && node.classList.contains('radar-zoom')) {
        return true;
      }
      node = node.parentNode;
    }
    return false;
  }

  function onRadarPointerDown(ev) {
    if (inZoomControl(ev.target)) {
      return;
    }
    if (ev.pointerType === 'mouse' && ev.button !== 0) {
      return;
    }
    radarPointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY, downX: ev.clientX, downY: ev.clientY };
    if (ev.currentTarget.setPointerCapture) {
      ev.currentTarget.setPointerCapture(ev.pointerId);
    }
    var pts = radarPointerList();
    if (pts.length === 1) {
      radarGesture = { mode: 'pan', x: ev.clientX, y: ev.clientY, lat: radarView.lat, lon: radarView.lon };
    } else if (pts.length >= 2) {
      var dx = pts[1].x - pts[0].x;
      var dy = pts[1].y - pts[0].y;
      radarGesture = {
        mode: 'pinch',
        dist: Math.sqrt(dx * dx + dy * dy) || 1,
        zoom: radarView.zoom,
        lat: radarView.lat,
        lon: radarView.lon,
        midX: (pts[0].x + pts[1].x) / 2,
        midY: (pts[0].y + pts[1].y) / 2
      };
    }
    ev.preventDefault();
  }

  function onRadarPointerMove(ev) {
    if (!radarPointers[ev.pointerId] || !radarGesture || !radarView) {
      return;
    }
    radarPointers[ev.pointerId].x = ev.clientX;
    radarPointers[ev.pointerId].y = ev.clientY;
    var view = ev.currentTarget;
    var rect = view.getBoundingClientRect();
    if (radarGesture.mode === 'pan') {
      var dx = ev.clientX - radarGesture.x;
      var dy = ev.clientY - radarGesture.y;
      var cx = mercatorX(radarGesture.lon, radarView.zoom) - dx;
      var cy = mercatorY(radarGesture.lat, radarView.zoom) - dy;
      radarView.lon = lonFromMercatorX(cx, radarView.zoom);
      radarView.lat = latFromMercatorY(cy, radarView.zoom);
      if (radarView.lat > 85) {
        radarView.lat = 85;
      }
      if (radarView.lat < -85) {
        radarView.lat = -85;
      }
      paintRadar();
      return;
    }
    var pts = radarPointerList();
    if (pts.length < 2) {
      return;
    }
    var sepX = pts[1].x - pts[0].x;
    var sepY = pts[1].y - pts[0].y;
    var dist = Math.sqrt(sepX * sepX + sepY * sepY) || 1;
    var zoom = clampRadarZoom(radarGesture.zoom + Math.log(dist / radarGesture.dist) / Math.LN2);
    var midX = (pts[0].x + pts[1].x) / 2;
    var midY = (pts[0].y + pts[1].y) / 2;
    var anchorX = mercatorX(radarGesture.lon, radarGesture.zoom) - rect.width / 2 + (radarGesture.midX - rect.left);
    var anchorY = mercatorY(radarGesture.lat, radarGesture.zoom) - rect.height / 2 + (radarGesture.midY - rect.top);
    var next = centerForAnchor(
      radarGesture.lat, radarGesture.lon, rect.width, rect.height,
      latFromMercatorY(anchorY, radarGesture.zoom),
      lonFromMercatorX(anchorX, radarGesture.zoom),
      midX - rect.left, midY - rect.top, zoom
    );
    radarView.lat = next.lat;
    radarView.lon = next.lon;
    radarView.zoom = zoom;
    paintRadar();
  }

  function onRadarPointerUp(ev) {
    var start = radarPointers[ev.pointerId];
    delete radarPointers[ev.pointerId];
    var pts = radarPointerList();
    if (!pts.length) {
      var moved = start && (Math.abs(ev.clientX - start.downX) > 8 || Math.abs(ev.clientY - start.downY) > 8);
      if (!moved && start) {
        var now = Date.now();
        if (now - radarLastTap < 320) {
          zoomMapAt(1, ev.clientX, ev.clientY);
          radarLastTap = 0;
        } else {
          radarLastTap = now;
        }
      }
      radarGesture = null;
      return;
    }
    radarGesture = { mode: 'pan', x: pts[0].x, y: pts[0].y, lat: radarView.lat, lon: radarView.lon };
  }

  function onRadarWheel(ev) {
    ev.preventDefault();
    var step = ev.deltaMode === 1 ? (ev.deltaY > 0 ? -1 : 1) : (-ev.deltaY / 280);
    if (!step) {
      return;
    }
    zoomMapAt(step, ev.clientX, ev.clientY);
  }

  function radarButton(className, label, text) {
    var btn = dayNode('button', 'radar-zoom-btn ' + className, text);
    btn.type = 'button';
    btn.setAttribute('aria-label', label);
    btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      if (className === 'radar-zoom-in') {
        zoomMapBy(1);
      } else if (className === 'radar-zoom-out') {
        zoomMapBy(-1);
      } else {
        recenterRadar(RADAR_LOCAL_ZOOM);
      }
    });
    return btn;
  }

  function renderRadarMap() {
    if (!dayUtil) {
      return;
    }
    var panel = dayUtil.$('map-detail');
    if (!panel) {
      return;
    }
    if (panel.querySelector('.radar-view') && radarView) {
      paintRadar();
      loadRadarFrame();
      return;
    }
    var loc = mapLocation();
    radarPointers = {};
    radarGesture = null;
    radarView = {
      lat: loc.lat,
      lon: loc.lon,
      homeLat: loc.lat,
      homeLon: loc.lon,
      zoom: RADAR_DEFAULT_ZOOM
    };
    dayUtil.emptyEl(panel);
    var backdrop = dayNode('div', 'day-modal-backdrop');
    var card = dayNode('div', 'day-modal-card map-modal-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', 'Weather map');
    var closeBtn = dayNode('button', 'map-close', '\u00d7');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close');
    var scroller = dayNode('div', 'day-modal-scroll');
    scroller.appendChild(dayNode('h2', 'map-title', 'Radar'));
    var view = dayNode('div', 'radar-view');
    view.setAttribute('aria-label', 'Radar centered on ' + loc.name);
    view.appendChild(dayNode('div', 'radar-base'));
    view.appendChild(dayNode('div', 'radar-precip'));
    var home = dayNode('span', 'radar-home');
    home.setAttribute('aria-hidden', 'true');
    view.appendChild(home);
    view.appendChild(dayNode('p', 'radar-status', 'Loading radar\u2026'));
    var controls = dayNode('div', 'radar-zoom');
    controls.appendChild(radarButton('radar-zoom-in', 'Zoom in', '+'));
    controls.appendChild(radarButton('radar-zoom-out', 'Zoom out', '\u2212'));
    controls.appendChild(radarButton('radar-zoom-home', 'Zoom to home', '\u25CE'));
    view.appendChild(controls);
    view.addEventListener('pointerdown', onRadarPointerDown);
    view.addEventListener('pointermove', onRadarPointerMove);
    view.addEventListener('pointerup', onRadarPointerUp);
    view.addEventListener('pointercancel', onRadarPointerUp);
    view.addEventListener('wheel', onRadarWheel, { passive: false });
    scroller.appendChild(view);
    scroller.appendChild(dayNode('p', 'radar-caption', 'Pinch or use + and \u2212 \u00b7 \u00a9 OpenStreetMap \u00b7 RainViewer'));
    card.appendChild(closeBtn);
    card.appendChild(scroller);
    panel.appendChild(backdrop);
    panel.appendChild(card);
    panel.hidden = false;
    paintRadar();
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(paintRadar);
    }
    loadRadarFrame();
  }

  function openRadarMap() {
    mapOpen = true;
    renderRadarMap();
    armRadarRefresh();
    if (!dayUtil) {
      return;
    }
    var panel = dayUtil.$('map-detail');
    var closeBtn = panel ? panel.querySelector('.map-close') : null;
    if (closeBtn && closeBtn.focus) {
      closeBtn.focus();
    }
  }

  function closeRadarMap() {
    mapOpen = false;
    radarView = null;
    radarFrame = null;
    radarPointers = {};
    radarGesture = null;
    if (dayUtil) {
      dayUtil.clearTimer('radar-map');
      var panel = dayUtil.$('map-detail');
      if (panel) {
        panel.hidden = true;
        dayUtil.emptyEl(panel);
      }
      var btn = dayUtil.$('current') ? dayUtil.$('current').querySelector('.map-open') : null;
      if (btn && btn.focus) {
        btn.focus();
      }
    }
  }

  function armRadarRefresh() {
    if (!dayUtil) {
      return;
    }
    dayUtil.schedule('radar-map', function () {
      if (!mapOpen) {
        return;
      }
      renderRadarMap();
      armRadarRefresh();
    }, 5 * 60 * 1000);
  }

  function onCurrentClick(ev) {
    var node = ev.target;
    var root = dayUtil ? dayUtil.$('current') : null;
    while (node && node !== root) {
      if (node.classList && node.classList.contains('map-open')) {
        ev.preventDefault();
        ev.stopPropagation();
        openRadarMap();
        return;
      }
      node = node.parentNode;
    }
  }

  function onMapClick(ev) {
    ev.stopPropagation();
    var node = ev.target;
    var panel = dayUtil ? dayUtil.$('map-detail') : null;
    while (node && node !== panel) {
      if (node.classList && node.classList.contains('map-close')) {
        ev.preventDefault();
        closeRadarMap();
        return;
      }
      if (node.classList && node.classList.contains('day-modal-card')) {
        return;
      }
      node = node.parentNode;
    }
    ev.preventDefault();
    closeRadarMap();
  }

  function onMapKeydown(ev) {
    if (!mapOpen) {
      return;
    }
    if (ev.key === 'Escape' || ev.key === 'Esc') {
      ev.preventDefault();
      closeRadarMap();
    }
  }

  function bindDayDetail(util) {
    dayUtil = util;
    if (dayDetailBound || typeof document === 'undefined') {
      return;
    }
    dayDetailBound = true;
    var dailyEl = util.$('daily');
    var panel = util.$('day-detail');
    var currentEl = util.$('current');
    var mapPanel = util.$('map-detail');
    if (dailyEl) {
      dailyEl.addEventListener('click', onDailyClick);
    }
    if (panel) {
      panel.addEventListener('click', onDayDetailClick);
    }
    if (currentEl) {
      currentEl.addEventListener('click', onCurrentClick);
    }
    if (mapPanel) {
      mapPanel.addEventListener('click', onMapClick);
    }
    document.addEventListener('keydown', onDayKeydown);
    document.addEventListener('keydown', onMapKeydown);
  }

  function renderDaily(util, days, meta) {
    var iconsApi = icons();
    var el = util.$('daily');
    var html = '<div class="panel-kicker">Next 5 days</div><div class="daily-strip">';
    var i;
    var list = days || [];
    latestDays = [];
    for (i = 0; i < list.length && i < 5; i++) {
      var d = list[i];
      latestDays.push(d);
      var label = (d.name || 'Day') + ', high ' + fmtTempPlain(d.high) + ', low ' + fmtTempPlain(d.low);
      html += '<button type="button" class="day-card" data-day-index="' + i + '" aria-label="' + escapeText(label) + '">';
      html += '<div class="day-name">' + escapeText(d.name || '') + '</div>';
      html += '<div class="day-icon">' + dayIcon(iconsApi, d) + '</div>';
      html += '<div class="day-hilo">' + fmtTempPlain(d.high) + '/' + fmtTempPlain(d.low) + '</div>';
      html += '<div class="day-precip">' + fmtPrecip(d.precip) + '</div>';
      html += '</button>';
    }
    html += '</div>';
    el.innerHTML = html;
    applyStaleClass(el, meta.savedAt, util.cfg.refreshMinutes.forecast, meta.offline);
    syncDayDetail();
  }

  function escapeText(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function modelFromCache(entry) {
    return entry && entry.data ? entry.data : null;
  }

  function paint(util, model, meta) {
    if (!model) {
      return;
    }
    util.safeRender('weather', function () {
      renderCurrent(util, model, meta);
    });
    util.safeRender('hourly', function () {
      renderHourly(util, model.hourly, meta);
    });
    util.safeRender('daily', function () {
      renderDaily(util, model.daily, meta);
    });
    if (window.KH && window.KH.status) {
      window.KH.status.set('weather', meta.savedAt || Date.now());
    }
  }

  function scheduleNext(util, key, minutes, failCount, fn) {
    var delay = failCount > 0 ? util.backoffMs(failCount) : util.jitterMs(minutes);
    util.schedule(key, fn, delay);
  }

  function msUntil005(util) {
    var n = util.now();
    var next = new Date(n.getTime());
    next.setHours(0, 5, 0, 0);
    if (next.getTime() <= n.getTime()) {
      next.setDate(next.getDate() + 1);
    }
    return next.getTime() - n.getTime();
  }

  function sunCacheIsToday(util, entry) {
    if (!entry || !entry.data || !entry.data.localDate || !entry.data.sunrise) {
      return false;
    }
    return entry.data.localDate === isoDateInZone(util.now());
  }

  function attachBrowserApi() {
    if (typeof window === 'undefined' || !window.KH || !window.KH.util) {
      return;
    }
    var util = window.KH.util;
    var cfg = util.cfg;
    var pointsCache = null;

    function failCountMax() {
      return Math.max(fails.observation || 0, fails.hourly || 0, fails.forecast || 0);
    }

    function viaOm() {
      return !!(usingOm.current || usingOm.hourly || usingOm.daily);
    }

    function mergeSun(model, sun) {
      if (sun) {
        model.sun = sun;
      }
      return model;
    }

    function loadSun(force) {
      var cached = util.cacheGet('sun');
      if (!force && sunCacheIsToday(util, cached)) {
        return Promise.resolve(cached.data);
      }
      return util.fetchJson('sun', sunApiUrl(cfg)).then(function (data) {
        var sun = sunFromSunriseSunset(data, util.now(), cfg.timezone);
        if (!sun) {
          throw new Error('No sun results');
        }
        util.cacheSet('sun', sun);
        return sun;
      }).catch(function (err) {
        console.error('[weather]', err);
        return cached && cached.data ? cached.data : null;
      });
    }

    function fallbackOpenMeteo() {
      return util.fetchJson('open-meteo', openMeteoUrl(cfg, 'full')).then(function (data) {
        var mapped = mapOpenMeteo(data, util.now());
        usingOm.current = true;
        usingOm.hourly = true;
        usingOm.daily = true;
        var cachedSun = util.cacheGet('sun');
        if (!cachedSun || !cachedSun.data || !cachedSun.data.localDate) {
          util.cacheSet('sun', mapped.sun);
        }
        return mapped;
      });
    }

    function buildFromNws(obs, hourlyJson, forecastJson, sun) {
      var now = util.now();
      var hourlyPeriods = hourlyJson && hourlyJson.properties ? hourlyJson.properties.periods : [];
      var forecastPeriods = forecastJson && forecastJson.properties ? forecastJson.properties.periods : [];
      var hour0 = currentHourPeriod(hourlyPeriods, now);
      var current = normalizeObservation(obs, hour0, now);
      var hourly = nextHourlyPeriods(hourlyPeriods, now, 12);
      var daily = pairForecastPeriods(forecastPeriods);
      return {
        current: current,
        hourly: hourly,
        daily: daily,
        sun: sun
      };
    }

    function loadPoints() {
      var loc = cfg.location || {};
      var key = Number(loc.lat).toFixed(3) + ',' + Number(loc.lon).toFixed(3);
      if (pointsCache && pointsCache.key === key && (Date.now() - pointsCache.at) < POINTS_CACHE_MS) {
        return Promise.resolve(pointsCache.data);
      }
      return fetchNws(util, 'points', pointsUrl(cfg)).then(function (data) {
        pointsCache = { key: key, at: Date.now(), data: data };
        return data;
      });
    }

    function resolveSources() {
      return loadPoints().then(function (pointsData) {
        var discovered = urlsFromPoints(pointsData, cfg);
        if (!discovered) {
          throw new Error('points missing forecast');
        }
        return discovered;
      }).catch(function () {
        var fallback = nwsUrls(cfg);
        fallback.observationStations = null;
        return fallback;
      });
    }

    function fetchBestObservation(stationsUrl) {
      var loc = cfg.location || {};
      return fetchNws(util, 'stations', stationsUrl, { record: false }).then(function (stationsData) {
        var features = ((stationsData && stationsData.features) || []).slice(0, 5);
        if (!features.length) {
          return null;
        }
        return Promise.all(features.map(function (feature) {
          var id = stationIdFromFeature(feature);
          var url = NWS_ORIGIN + '/stations/' + id + '/observations/latest';
          return util.fetchJson('obs-' + id, url, {
            headers: NWS_HEADERS,
            record: false
          }).then(function (data) {
            if (!data || typeof data !== 'object') {
              return null;
            }
            return scoreObservation(feature, data, Number(loc.lat), Number(loc.lon), util.now());
          }).catch(function () {
            return null;
          });
        })).then(function (rows) {
          var best = pickBestObservation(rows);
          if (!best || !best.obs) {
            markFail('observation');
            return null;
          }
          markOk('observation');
          return best.obs;
        });
      });
    }

    function loadObservation(resolved) {
      var fallbackUrl = nwsUrls(cfg).observation;
      if (!resolved.observationStations) {
        return fetchNws(util, 'observation', resolved.observation || fallbackUrl).catch(function () {
          return null;
        });
      }
      return fetchBestObservation(resolved.observationStations).then(function (obs) {
        if (obs) {
          return obs;
        }
        return fetchNws(util, 'observation', fallbackUrl).catch(function () {
          return null;
        });
      }).catch(function () {
        return fetchNws(util, 'observation', fallbackUrl).catch(function () {
          return null;
        });
      });
    }

    function refresh() {
      var cached = util.cacheGet('weather');
      var sunP = loadSun(false);
      resolveSources().then(function (resolved) {
        var obsP = loadObservation(resolved);
        var hourlyP = fetchNws(util, 'hourly', resolved.hourly).catch(function () { return null; });
        var forecastP = fetchNws(util, 'forecast', resolved.forecast).catch(function () { return null; });
        return Promise.all([obsP, hourlyP, forecastP, sunP]);
      }).then(function (parts) {
        var obs = parts[0];
        var hourlyJson = parts[1];
        var forecastJson = parts[2];
        var sun = parts[3];
        var needOm = !hourlyJson || !forecastJson || !obs;
        var p = Promise.resolve(null);
        if (needOm && (fails.observation >= 2 || fails.hourly >= 2 || fails.forecast >= 2)) {
          p = fallbackOpenMeteo().catch(function (err) {
            console.error('[weather]', err);
            return null;
          });
        }
        return p.then(function (omModel) {
          var model;
          if (omModel && needOm) {
            model = omModel;
            if (obs && hourlyJson) {
              model.current = normalizeObservation(obs, currentHourPeriod(hourlyJson.properties.periods, util.now()), util.now());
              usingOm.current = false;
            }
            if (hourlyJson && hourlyJson.properties) {
              model.hourly = nextHourlyPeriods(hourlyJson.properties.periods, util.now(), 12);
              usingOm.hourly = false;
            }
            if (forecastJson && forecastJson.properties) {
              model.daily = pairForecastPeriods(forecastJson.properties.periods);
              usingOm.daily = false;
            }
            if (sun) {
              model.sun = sun;
            }
          } else if (obs || hourlyJson || forecastJson) {
            model = buildFromNws(obs, hourlyJson, forecastJson, sun);
          } else if (omModel) {
            model = omModel;
          } else if (cached) {
            model = cached.data;
          }
          if (!model) {
            return;
          }
          mergeSun(model, model.sun || sun);
          util.cacheSet('weather', model);
          paint(util, model, {
            savedAt: Date.now(),
            viaOpenMeteo: viaOm(),
            offline: util.isOffline()
          });
          var failsN = failCountMax();
          scheduleNext(util, 'weather', Math.min(cfg.refreshMinutes.observation, cfg.refreshMinutes.hourly), failsN, refresh);
          scheduleNext(util, 'forecast', cfg.refreshMinutes.forecast, fails.forecast, refresh);
        });
      }).catch(function (err) {
        console.error('[weather]', err);
        if (cached) {
          paint(util, cached.data, {
            savedAt: cached.savedAt,
            viaOpenMeteo: !!(cached.data && cached.data._viaOm),
            offline: true
          });
        }
        scheduleNext(util, 'weather', cfg.refreshMinutes.observation, failCountMax() || 1, refresh);
      });

      util.schedule('sun', function () {
        loadSun(true);
      }, msUntil005(util));
    }

    function renderCache() {
      var cached = util.cacheGet('weather');
      if (cached && cached.data) {
        paint(util, cached.data, {
          savedAt: cached.savedAt,
          viaOpenMeteo: false,
          offline: util.isOffline()
        });
      }
    }

    exports.init = function () {
      bindDayDetail(util);
      renderCache();
      refresh();
      util.onReschedule(function () {
        refresh();
        if (mapOpen) {
          armRadarRefresh();
        }
      });
    };

    exports.refresh = refresh;
  }

  exports.nwsUrls = nwsUrls;
  exports.openMeteoUrl = openMeteoUrl;
  exports.mercatorX = mercatorX;
  exports.mercatorY = mercatorY;
  exports.lonFromMercatorX = lonFromMercatorX;
  exports.latFromMercatorY = latFromMercatorY;
  exports.centerForAnchor = centerForAnchor;
  exports.RADAR_DEFAULT_ZOOM = RADAR_DEFAULT_ZOOM;
  exports.RADAR_LOCAL_ZOOM = RADAR_LOCAL_ZOOM;

  if (typeof window !== 'undefined') {
    attachBrowserApi();
    if (window.KH) {
      window.KH.weather = exports;
    }
  }
})(typeof module !== 'undefined' && module.exports
  ? module.exports
  : ((window.KH = window.KH || {}).weather = (window.KH && window.KH.weather) || {}));

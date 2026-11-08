(function (exports) {
  'use strict';

  var TRAIT_INFO = 'sdm.devices.traits.Info';
  var TRAIT_CONNECTIVITY = 'sdm.devices.traits.Connectivity';
  var TRAIT_TEMP = 'sdm.devices.traits.Temperature';
  var TRAIT_MODE = 'sdm.devices.traits.ThermostatMode';
  var TRAIT_ECO = 'sdm.devices.traits.ThermostatEco';
  var TRAIT_HVAC = 'sdm.devices.traits.ThermostatHvac';
  var TRAIT_SETPOINT = 'sdm.devices.traits.ThermostatTemperatureSetpoint';
  var TRAIT_CAMERA = 'sdm.devices.traits.CameraLiveStream';
  var TRAIT_EVENT_IMAGE = 'sdm.devices.traits.CameraEventImage';
  var CMD_HEAT = 'sdm.devices.commands.ThermostatTemperatureSetpoint.SetHeat';
  var CMD_COOL = 'sdm.devices.commands.ThermostatTemperatureSetpoint.SetCool';
  var CMD_RANGE = 'sdm.devices.commands.ThermostatTemperatureSetpoint.SetRange';
  var CMD_IMAGE = 'sdm.devices.commands.CameraEventImage.GenerateImage';
  var CMD_WEBRTC = 'sdm.devices.commands.CameraLiveStream.GenerateWebRtcStream';
  var CMD_EXTEND = 'sdm.devices.commands.CameraLiveStream.ExtendWebRtcStream';
  var CMD_STOP = 'sdm.devices.commands.CameraLiveStream.StopWebRtcStream';
  var STORE_KEY = 'kh:nest:auth';
  var REQUIRED = ['projectId', 'clientId', 'clientSecret', 'refreshToken'];
  var FIELD_LABEL = {
    projectId: 'Device Access project id',
    clientId: 'OAuth client id',
    clientSecret: 'OAuth client secret',
    refreshToken: 'refresh token'
  };

  function trim(value) {
    return String(value == null ? '' : value).replace(/^\s+|\s+$/g, '');
  }

  function nestConfigured(cfg) {
    var missing = missingNestFields(cfg);
    return missing.length === 0;
  }

  function missingNestFields(cfg) {
    var src = cfg || {};
    var missing = [];
    var i;
    for (i = 0; i < REQUIRED.length; i++) {
      if (!trim(src[REQUIRED[i]])) {
        missing.push(REQUIRED[i]);
      }
    }
    return missing;
  }

  function missingLabels(cfg) {
    var missing = missingNestFields(cfg);
    var labels = [];
    var i;
    for (i = 0; i < missing.length; i++) {
      labels.push(FIELD_LABEL[missing[i]] || missing[i]);
    }
    return labels;
  }

  function cToF(value) {
    var n = Number(value);
    if (isNaN(n)) {
      return null;
    }
    return Math.round(n * 9 / 5 + 32);
  }

  function fToC(value) {
    var n = Number(value);
    if (isNaN(n)) {
      return null;
    }
    return Math.round(((n - 32) * 5 / 9) * 10) / 10;
  }

  function clampF(value) {
    var n = Math.round(Number(value));
    if (isNaN(n)) {
      return 70;
    }
    if (n < 50) {
      return 50;
    }
    if (n > 90) {
      return 90;
    }
    return n;
  }

  function deviceLabel(device) {
    var traits = device && device.traits ? device.traits : {};
    var info = traits[TRAIT_INFO] || {};
    if (trim(info.customName)) {
      return trim(info.customName);
    }
    var rels = device && device.parentRelations ? device.parentRelations : [];
    if (rels[0] && trim(rels[0].displayName)) {
      return trim(rels[0].displayName);
    }
    return 'Nest';
  }

  function isDoorbell(device) {
    return !!(device && device.type === 'sdm.devices.types.DOORBELL');
  }

  function isThermostat(device) {
    return !!(device && device.type === 'sdm.devices.types.THERMOSTAT');
  }

  function pickDevice(list, wanted) {
    var items = list || [];
    var needle = trim(wanted);
    var i;
    if (!items.length) {
      return null;
    }
    if (needle) {
      for (i = 0; i < items.length; i++) {
        var name = items[i] && items[i].name ? String(items[i].name) : '';
        if (name === needle || deviceLabel(items[i]) === needle) {
          return items[i];
        }
        if (needle.length > 4 && name.slice(-needle.length) === needle) {
          return items[i];
        }
      }
    }
    return items[0];
  }

  function splitDevices(payload) {
    var list = payload && payload.devices ? payload.devices : (payload || []);
    var doorbells = [];
    var thermostats = [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (isDoorbell(list[i])) {
        doorbells.push(list[i]);
      } else if (isThermostat(list[i])) {
        thermostats.push(list[i]);
      }
    }
    return { doorbells: doorbells, thermostats: thermostats };
  }

  function protocolsOf(camera) {
    var list = camera && camera.supportedProtocols ? camera.supportedProtocols : [];
    var found = false;
    var i;
    for (i = 0; i < list.length; i++) {
      if (String(list[i]).toUpperCase() === 'WEB_RTC') {
        found = true;
      }
    }
    return found;
  }

  function doorbellModel(device) {
    var traits = device && device.traits ? device.traits : {};
    var connectivity = traits[TRAIT_CONNECTIVITY] || {};
    return {
      name: deviceLabel(device),
      deviceName: device && device.name ? device.name : '',
      online: connectivity.status === 'ONLINE',
      webRtc: protocolsOf(traits[TRAIT_CAMERA]),
      eventImage: !!traits[TRAIT_EVENT_IMAGE]
    };
  }

  function modeLabel(mode) {
    if (mode === 'HEAT') {
      return 'Heat';
    }
    if (mode === 'COOL') {
      return 'Cool';
    }
    if (mode === 'HEATCOOL') {
      return 'Heat · Cool';
    }
    if (mode === 'ECO') {
      return 'Eco';
    }
    return 'Off';
  }

  function activeLabel(status) {
    if (status === 'HEATING') {
      return 'Heating';
    }
    if (status === 'COOLING') {
      return 'Cooling';
    }
    return 'Idle';
  }

  function thermostatModel(device) {
    var traits = device && device.traits ? device.traits : {};
    var connectivity = traits[TRAIT_CONNECTIVITY] || {};
    var modeTrait = traits[TRAIT_MODE] || {};
    var eco = traits[TRAIT_ECO] || {};
    var setpoint = traits[TRAIT_SETPOINT] || {};
    var hvac = (traits[TRAIT_HVAC] || {}).status || 'OFF';
    var mode = modeTrait.mode || 'OFF';
    var heat = cToF(setpoint.heatCelsius);
    var cool = cToF(setpoint.coolCelsius);
    if (eco.mode === 'MANUAL_ECO') {
      mode = 'ECO';
      heat = cToF(eco.heatCelsius);
      cool = cToF(eco.coolCelsius);
    }
    return {
      name: deviceLabel(device),
      deviceName: device && device.name ? device.name : '',
      online: connectivity.status !== 'OFFLINE',
      ambient: cToF((traits[TRAIT_TEMP] || {}).ambientTemperatureCelsius),
      mode: mode,
      modeLabel: modeLabel(mode),
      heat: heat,
      cool: cool,
      hvac: hvac,
      activeLabel: mode === 'OFF' ? 'Off' : activeLabel(hvac),
      canAdjust: mode === 'HEAT' || mode === 'COOL' || mode === 'HEATCOOL'
    };
  }

  function setpointCommand(model, deltaF) {
    var delta = Number(deltaF);
    if (!model || !model.canAdjust || !delta) {
      return null;
    }
    var heat = model.heat;
    var cool = model.cool;
    if (model.mode === 'HEAT') {
      heat = clampF((heat == null ? (model.ambient || 68) : heat) + delta);
      return {
        command: CMD_HEAT,
        params: { heatCelsius: fToC(heat) },
        heat: heat,
        cool: cool
      };
    }
    if (model.mode === 'COOL') {
      cool = clampF((cool == null ? (model.ambient || 74) : cool) + delta);
      return {
        command: CMD_COOL,
        params: { coolCelsius: fToC(cool) },
        heat: heat,
        cool: cool
      };
    }
    heat = clampF((heat == null ? 68 : heat) + delta);
    cool = clampF((cool == null ? 74 : cool) + delta);
    if (cool < heat + 3) {
      if (delta > 0) {
        cool = clampF(heat + 3);
      } else {
        heat = clampF(cool - 3);
      }
    }
    return {
      command: CMD_RANGE,
      params: { heatCelsius: fToC(heat), coolCelsius: fToC(cool) },
      heat: heat,
      cool: cool
    };
  }

  function decodeBase64(value) {
    var raw = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    var pad = raw.length % 4;
    if (pad) {
      raw += '===='.slice(0, 4 - pad);
    }
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(raw, 'base64').toString('utf8');
    }
    return atob(raw);
  }

  function eventKind(name) {
    var key = String(name || '');
    if (key.indexOf('DoorbellChime') !== -1) {
      return 'chime';
    }
    if (key.indexOf('CameraPerson') !== -1) {
      return 'person';
    }
    if (key.indexOf('CameraMotion') !== -1) {
      return 'motion';
    }
    return '';
  }

  function eventMs(ev) {
    var t = Date.parse(ev && ev.time ? ev.time : '');
    if (isNaN(t)) {
      return 0;
    }
    return t;
  }

  function extractEvents(payload) {
    var body = payload || {};
    var update = body.resourceUpdate || body;
    var events = update.events || {};
    var keys = Object.keys(events);
    var out = [];
    var i;
    for (i = 0; i < keys.length; i++) {
      var kind = eventKind(keys[i]);
      if (!kind) {
        continue;
      }
      var row = events[keys[i]] || {};
      out.push({
        kind: kind,
        time: body.timestamp || row.timestamp || '',
        eventId: row.eventId || body.eventId || '',
        device: update.name || ''
      });
    }
    return out;
  }

  function parsePubSubPull(body) {
    var received = body && body.receivedMessages ? body.receivedMessages : [];
    var events = [];
    var ackIds = [];
    var i;
    for (i = 0; i < received.length; i++) {
      var msg = received[i] || {};
      if (msg.ackId) {
        ackIds.push(msg.ackId);
      }
      var data = msg.message && msg.message.data;
      if (!data) {
        continue;
      }
      try {
        var parsed = JSON.parse(decodeBase64(data));
        events = events.concat(extractEvents(parsed));
      } catch (err) {
        continue;
      }
    }
    return { events: events, ackIds: ackIds };
  }

  function preferMotion(current, incoming) {
    if (!incoming) {
      return current || null;
    }
    if (!current) {
      return incoming;
    }
    var nextMs = eventMs(incoming);
    var prevMs = eventMs(current);
    if (nextMs > prevMs) {
      return incoming;
    }
    if (nextMs === prevMs && incoming.kind === 'person' && current.kind !== 'person') {
      return incoming;
    }
    return current;
  }

  function mergeEvents(prev, incoming) {
    var state = {
      chime: prev && prev.chime ? prev.chime : null,
      motion: prev && prev.motion ? prev.motion : null
    };
    var list = incoming || [];
    var i;
    for (i = 0; i < list.length; i++) {
      var ev = list[i];
      if (!ev) {
        continue;
      }
      if (ev.kind === 'chime' && eventMs(ev) >= eventMs(state.chime)) {
        state.chime = ev;
      } else if (ev.kind === 'motion' || ev.kind === 'person') {
        state.motion = preferMotion(state.motion, ev);
      }
    }
    return state;
  }

  function subscriptionResource(cfg) {
    var sub = trim(cfg && cfg.pubsubSubscription);
    if (!sub) {
      return '';
    }
    if (sub.indexOf('projects/') === 0) {
      return sub;
    }
    var project = trim(cfg && cfg.pubsubProjectId);
    if (!project) {
      return '';
    }
    return 'projects/' + project + '/subscriptions/' + sub;
  }

  function tempText(value) {
    if (value == null || isNaN(Number(value))) {
      return '\u2014';
    }
    return Math.round(Number(value)) + '\u00b0';
  }

  function setpointLine(model) {
    if (!model || model.mode === 'OFF') {
      return 'Setpoint off';
    }
    if (model.mode === 'HEAT') {
      return 'Heat to ' + tempText(model.heat);
    }
    if (model.mode === 'COOL') {
      return 'Cool to ' + tempText(model.cool);
    }
    return tempText(model.heat) + ' \u2013 ' + tempText(model.cool);
  }

  exports.trim = trim;
  exports.nestConfigured = nestConfigured;
  exports.missingNestFields = missingNestFields;
  exports.missingLabels = missingLabels;
  exports.cToF = cToF;
  exports.fToC = fToC;
  exports.clampF = clampF;
  exports.deviceLabel = deviceLabel;
  exports.pickDevice = pickDevice;
  exports.splitDevices = splitDevices;
  exports.doorbellModel = doorbellModel;
  exports.thermostatModel = thermostatModel;
  exports.modeLabel = modeLabel;
  exports.setpointCommand = setpointCommand;
  exports.setpointLine = setpointLine;
  exports.tempText = tempText;
  exports.decodeBase64 = decodeBase64;
  exports.parsePubSubPull = parsePubSubPull;
  exports.mergeEvents = mergeEvents;
  exports.subscriptionResource = subscriptionResource;
  exports.CMD_HEAT = CMD_HEAT;
  exports.CMD_COOL = CMD_COOL;
  exports.CMD_RANGE = CMD_RANGE;

  function attachBrowserApi() {
    var KH = window.KH || (window.KH = {});
    var util = KH.util;
    var tokenCache = { access: '', expiresAt: 0 };
    var doorbell = null;
    var thermostat = null;
    var events = { chime: null, motion: null };
    var snapshotUrl = '';
    var warning = '';
    var eventNote = '';
    var live = null;
    var adjusting = false;
    var bound = false;
    var phase = 'loading';

    function el(tag, className, text) {
      var node = document.createElement(tag);
      if (className) {
        node.className = className;
      }
      if (text != null) {
        node.textContent = text;
      }
      return node;
    }

    function readStore() {
      try {
        var raw = localStorage.getItem(STORE_KEY);
        if (!raw) {
          return {};
        }
        var parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch (err) {
        return {};
      }
    }

    function writeStore(data) {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(data || {}));
      } catch (err) {
        console.error('[nest]', err);
      }
    }

    function settings() {
      var cfg = util.cfg && util.cfg.nest ? util.cfg.nest : {};
      var stored = readStore();
      function pick(key) {
        return trim(cfg[key]) || trim(stored[key]);
      }
      return {
        projectId: pick('projectId'),
        clientId: pick('clientId'),
        clientSecret: pick('clientSecret'),
        refreshToken: pick('refreshToken'),
        pubsubProjectId: pick('pubsubProjectId'),
        pubsubSubscription: pick('pubsubSubscription'),
        doorbellId: pick('doorbellId'),
        thermostatId: pick('thermostatId')
      };
    }

    function sampleOn() {
      return !!(util.query && util.query.sample);
    }

    function requestJson(url, options) {
      options = options || {};
      var controller = new AbortController();
      var timer = setTimeout(function () {
        controller.abort();
      }, options.timeout || 15000);
      var headers = options.headers || {};
      var init = {
        method: options.method || 'GET',
        headers: headers,
        signal: controller.signal
      };
      if (options.body != null) {
        init.body = options.body;
      }
      return fetch(url, init).then(function (res) {
        return res.text().then(function (text) {
          clearTimeout(timer);
          var data = null;
          if (text) {
            try {
              data = JSON.parse(text);
            } catch (err) {
              data = { raw: text };
            }
          }
          if (!res.ok) {
            var error = new Error('HTTP ' + res.status);
            error.status = res.status;
            error.body = data;
            throw error;
          }
          return data;
        });
      }).catch(function (err) {
        clearTimeout(timer);
        throw err;
      });
    }

    function googleMessage(err) {
      var body = err && err.body;
      if (body && body.error_description) {
        return String(body.error_description);
      }
      if (body && body.error && body.error.message) {
        return String(body.error.message);
      }
      if (body && body.error && body.error.status) {
        return String(body.error.status);
      }
      if (err && err.status) {
        return 'Google returned ' + err.status;
      }
      return "Can't reach Google";
    }

    function accessToken(cfg) {
      if (tokenCache.access && Date.now() < tokenCache.expiresAt - 60000) {
        return Promise.resolve(tokenCache.access);
      }
      var body = 'client_id=' + encodeURIComponent(cfg.clientId) +
        '&client_secret=' + encodeURIComponent(cfg.clientSecret) +
        '&refresh_token=' + encodeURIComponent(cfg.refreshToken) +
        '&grant_type=refresh_token';
      return requestJson('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body
      }).then(function (data) {
        tokenCache.access = data && data.access_token ? data.access_token : '';
        var seconds = data && data.expires_in ? Number(data.expires_in) : 3600;
        tokenCache.expiresAt = Date.now() + seconds * 1000;
        if (!tokenCache.access) {
          throw new Error('No access token');
        }
        return tokenCache.access;
      });
    }

    function authHeaders(token) {
      return {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json'
      };
    }

    function listDevices(cfg, token, pageToken, acc) {
      var url = 'https://smartdevicemanagement.googleapis.com/v1/enterprises/' +
        encodeURIComponent(cfg.projectId) + '/devices';
      if (pageToken) {
        url += '?pageToken=' + encodeURIComponent(pageToken);
      }
      return requestJson(url, { headers: authHeaders(token) }).then(function (data) {
        var devices = data && data.devices ? data.devices : [];
        var next = (acc || []).concat(devices);
        if (data && data.nextPageToken && next.length < 40) {
          return listDevices(cfg, token, data.nextPageToken, next);
        }
        return next;
      });
    }

    function execute(token, deviceName, command, params) {
      return requestJson('https://smartdevicemanagement.googleapis.com/v1/' + deviceName + ':executeCommand', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ command: command, params: params || {} })
      });
    }

    function pullEvents(cfg, token) {
      var name = subscriptionResource(cfg);
      if (!name) {
        return Promise.resolve(null);
      }
      return requestJson('https://pubsub.googleapis.com/v1/' + name + ':pull', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ maxMessages: 20 })
      }).then(function (data) {
        var parsed = parsePubSubPull(data);
        events = mergeEvents(events, parsed.events);
        util.cacheSet('nest-events', events);
        if (!parsed.ackIds.length) {
          return parsed;
        }
        return requestJson('https://pubsub.googleapis.com/v1/' + name + ':acknowledge', {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({ ackIds: parsed.ackIds })
        }).then(function () {
          return parsed;
        }).catch(function (err) {
          console.error('[nest]', err);
          return parsed;
        });
      });
    }

    function newestEvent() {
      var chime = events && events.chime;
      var motion = events && events.motion;
      if (eventMs(motion) >= eventMs(chime)) {
        return motion || chime;
      }
      return chime || motion;
    }

    function revokeSnapshot() {
      if (snapshotUrl && snapshotUrl.indexOf('blob:') === 0) {
        try {
          URL.revokeObjectURL(snapshotUrl);
        } catch (err) {
          console.error('[nest]', err);
        }
      }
      snapshotUrl = '';
    }

    function loadSnapshot(cfg) {
      var shot = newestEvent();
      if (!doorbell || !doorbell.eventImage || !shot || !shot.eventId || !doorbell.deviceName) {
        return Promise.resolve();
      }
      return accessToken(cfg).then(function (token) {
        return execute(token, doorbell.deviceName, CMD_IMAGE, { eventId: shot.eventId });
      }).then(function (data) {
        var results = data && data.results ? data.results : {};
        if (!results.url) {
          return null;
        }
        return fetch(results.url, {
          headers: { Authorization: 'Basic ' + (results.token || '') }
        }).then(function (res) {
          if (!res.ok) {
            throw new Error('HTTP ' + res.status);
          }
          return res.blob();
        });
      }).then(function (blob) {
        if (!blob) {
          return;
        }
        revokeSnapshot();
        snapshotUrl = URL.createObjectURL(blob);
      }).catch(function (err) {
        console.error('[nest]', err);
      });
    }

    function clockLine(prefix, ev) {
      if (!ev || !ev.time) {
        return prefix + ' \u2014';
      }
      var ms = Date.parse(ev.time);
      if (isNaN(ms)) {
        return prefix + ' \u2014';
      }
      return prefix + ' ' + util.formatUpdatedClock(ms) + ' \u00b7 ' + util.formatAge(ms);
    }

    function motionLine(ev) {
      if (!ev || !ev.time) {
        return 'Motion \u2014';
      }
      var label = ev.kind === 'person' ? 'Person' : 'Motion';
      return clockLine(label, ev);
    }

    function appendHelp(parent, lines) {
      var i;
      for (i = 0; i < lines.length; i++) {
        parent.appendChild(el('p', 'tile-help', lines[i]));
      }
    }

    function notConnected(root, title, cfg) {
      util.emptyEl(root);
      root.appendChild(el('div', 'panel-kicker', title));
      root.appendChild(el('div', 'tile-status', 'Not connected'));
      var labels = missingLabels(cfg);
      var button = el('button', 'tile-action', 'Setup');
      button.type = 'button';
      button.setAttribute('data-nest-setup', '1');
      root.appendChild(button);
      if (labels.length && labels.length < REQUIRED.length) {
        appendHelp(root, ['Still needed: ' + labels.join(', ') + '.']);
      } else {
        appendHelp(root, [
          'Device Access ($5 once), an OAuth client, and a refresh token. Steps are in the README.'
        ]);
      }
    }

    function fillDoorbell(root) {
      util.emptyEl(root);
      root.appendChild(el('div', 'panel-kicker', 'Doorbell'));
      if (!doorbell) {
        if (phase === 'ready') {
          root.appendChild(el('div', 'tile-status', 'No doorbell'));
          root.appendChild(el('p', 'tile-help', 'This Nest account has no doorbell.'));
        } else if (phase === 'error') {
          root.appendChild(el('div', 'tile-status', "Can't reach Nest"));
          if (warning) {
            root.appendChild(el('p', 'tile-help', warning));
          }
        } else {
          root.appendChild(el('div', 'tile-status', 'Loading\u2026'));
        }
        return;
      }
      var head = el('div', 'tile-line');
      head.appendChild(el('span', 'tile-name', doorbell.name));
      head.appendChild(el('span', doorbell.online ? 'tile-ok' : 'tile-bad', doorbell.online ? 'Online' : 'Offline'));
      root.appendChild(head);
      root.appendChild(el('div', 'tile-meta', clockLine('Last ring', events.chime)));
      root.appendChild(el('div', 'tile-meta', motionLine(events.motion)));
      if (snapshotUrl) {
        var img = el('img', 'door-shot');
        img.alt = 'Latest doorbell snapshot';
        img.src = snapshotUrl;
        root.appendChild(img);
      } else if (doorbell.sample) {
        root.appendChild(sampleShot());
      } else {
        root.appendChild(el('div', 'door-shot door-empty', 'No snapshot yet'));
      }
      if (eventNote) {
        root.appendChild(el('p', 'tile-help', eventNote));
      }
      if (doorbell.webRtc || doorbell.sample) {
        var liveBtn = el('button', 'tile-action', 'Live view');
        liveBtn.type = 'button';
        liveBtn.setAttribute('data-nest-live', '1');
        root.appendChild(liveBtn);
      }
      if (warning && !thermostat) {
        root.appendChild(el('p', 'tile-help', warning));
      }
    }

    function sampleShot() {
      var frame = el('div', 'door-shot door-sample');
      frame.setAttribute('aria-hidden', 'true');
      frame.innerHTML = '<svg viewBox="0 0 160 90" class="door-svg"><rect width="160" height="90" fill="#d7d0c4"/><rect x="62" y="16" width="36" height="58" fill="#8d6748"/><circle cx="90" cy="48" r="2.5" fill="#f3efe6"/><rect x="18" y="28" width="28" height="22" fill="#9bb7c9"/></svg>';
      return frame;
    }

    function fillThermostat(root) {
      util.emptyEl(root);
      root.appendChild(el('div', 'panel-kicker', 'Thermostat'));
      if (!thermostat) {
        if (phase === 'ready') {
          root.appendChild(el('div', 'tile-status', 'No thermostat'));
          root.appendChild(el('p', 'tile-help', 'This Nest account has no thermostat.'));
        } else if (phase === 'error') {
          root.appendChild(el('div', 'tile-status', "Can't reach Nest"));
          if (warning) {
            root.appendChild(el('p', 'tile-help', warning));
          }
        } else {
          root.appendChild(el('div', 'tile-status', 'Loading\u2026'));
        }
        return;
      }
      var head = el('div', 'tile-line');
      head.appendChild(el('span', 'tile-name', thermostat.name));
      head.appendChild(el('span', thermostat.online ? 'tile-ok' : 'tile-bad', thermostat.online ? 'Online' : 'Offline'));
      root.appendChild(head);
      root.appendChild(el('div', 'tile-temp', tempText(thermostat.ambient)));
      root.appendChild(el('div', 'tile-meta', thermostat.modeLabel + ' \u00b7 ' + thermostat.activeLabel));
      var row = el('div', 'set-row');
      if (thermostat.canAdjust && thermostat.online) {
        var down = el('button', 'set-btn', '\u2212');
        down.type = 'button';
        down.setAttribute('aria-label', 'Decrease setpoint');
        down.setAttribute('data-nest-delta', '-1');
        if (adjusting) {
          down.disabled = true;
        }
        row.appendChild(down);
      }
      row.appendChild(el('span', 'set-label', setpointLine(thermostat)));
      if (thermostat.canAdjust && thermostat.online) {
        var up = el('button', 'set-btn', '+');
        up.type = 'button';
        up.setAttribute('aria-label', 'Increase setpoint');
        up.setAttribute('data-nest-delta', '1');
        if (adjusting) {
          up.disabled = true;
        }
        row.appendChild(up);
      }
      root.appendChild(row);
      if (warning) {
        root.appendChild(el('p', 'tile-help', warning));
      }
    }

    function lockNow() {
      if (util.query && util.query.unlocked) {
        return { name: 'Front door', unlocked: true, known: true, label: 'Unlocked' };
      }
      if (sampleOn()) {
        return { name: 'Front door', unlocked: false, known: true, label: 'Locked' };
      }
      var hub = window.KH && window.KH.smartthings;
      if (hub && hub.currentLock) {
        return hub.currentLock();
      }
      return null;
    }

    function paintLock(root) {
      var state = lockNow();
      if (!state || !state.known) {
        root.classList.remove('is-unlocked');
        return;
      }
      if (state.unlocked) {
        root.classList.add('is-unlocked');
      } else {
        root.classList.remove('is-unlocked');
      }
      var label = (state.name || 'Front door') + (state.unlocked ? ' unlocked' : ' locked');
      root.appendChild(el('div', 'tile-lock', label));
    }

    function render() {
      util.safeRender('nest', function () {
        var door = util.$('nest-doorbell');
        var thermo = util.$('nest-thermostat');
        var cfg = settings();
        if (door) {
          if (!sampleOn() && !nestConfigured(cfg)) {
            notConnected(door, 'Doorbell', cfg);
          } else {
            fillDoorbell(door);
          }
          paintLock(door);
        }
        if (thermo) {
          if (!sampleOn() && !nestConfigured(cfg)) {
            notConnected(thermo, 'Thermostat', cfg);
          } else {
            fillThermostat(thermo);
          }
        }
      });
    }

    function applySample() {
      doorbell = {
        name: 'Front door',
        deviceName: 'sample-doorbell',
        online: true,
        webRtc: true,
        eventImage: false,
        sample: true
      };
      thermostat = {
        name: 'Hallway',
        deviceName: 'sample-thermostat',
        online: true,
        ambient: 70,
        mode: 'HEAT',
        modeLabel: 'Heat',
        heat: 68,
        cool: 74,
        hvac: 'HEATING',
        activeLabel: 'Heating',
        canAdjust: true,
        sample: true
      };
      var now = Date.now();
      events = {
        chime: { kind: 'chime', time: new Date(now - 25 * 60000).toISOString(), eventId: '' },
        motion: { kind: 'person', time: new Date(now - 8 * 60000).toISOString(), eventId: '' }
      };
      warning = '';
      eventNote = '';
      render();
    }

    function loadCache() {
      var door = util.cacheGet('nest-doorbell');
      var thermo = util.cacheGet('nest-thermostat');
      var savedEvents = util.cacheGet('nest-events');
      if (door && door.data) {
        doorbell = door.data;
      }
      if (thermo && thermo.data) {
        thermostat = thermo.data;
      }
      if (savedEvents && savedEvents.data) {
        events = mergeEvents(savedEvents.data, []);
      }
    }

    function eventHint(cfg) {
      if (subscriptionResource(cfg)) {
        eventNote = '';
        return;
      }
      eventNote = 'Rings and motion need a Pub/Sub subscription. See the README.';
    }

    function refresh() {
      if (sampleOn()) {
        phase = 'ready';
        applySample();
        return;
      }
      var cfg = settings();
      if (!nestConfigured(cfg)) {
        warning = '';
        doorbell = null;
        thermostat = null;
        phase = 'setup';
        render();
        return;
      }
      if (util.query && util.query.offline) {
        warning = "Can't reach Google";
        phase = 'error';
        render();
        schedule(1);
        return;
      }
      eventHint(cfg);
      accessToken(cfg).then(function (token) {
        return listDevices(cfg, token).then(function (devices) {
          var split = splitDevices(devices);
          var doorDevice = pickDevice(split.doorbells, cfg.doorbellId);
          var thermoDevice = pickDevice(split.thermostats, cfg.thermostatId);
          doorbell = doorDevice ? doorbellModel(doorDevice) : null;
          thermostat = thermoDevice ? thermostatModel(thermoDevice) : null;
          phase = 'ready';
          if (doorbell) {
            util.cacheSet('nest-doorbell', doorbell);
          }
          if (thermostat) {
            util.cacheSet('nest-thermostat', thermostat);
          }
          warning = '';
          if (window.KH && window.KH.status) {
            window.KH.status.set('nest', Date.now());
          }
          return pullEvents(cfg, token).catch(function (err) {
            console.error('[nest]', err);
            if (err && err.status === 403) {
              eventNote = 'Pub/Sub denied the refresh token. Add the Pub/Sub scope and try again.';
            } else if (subscriptionResource(cfg)) {
              eventNote = 'Events did not load. The device status above is still current.';
            }
          }).then(function () {
            return loadSnapshot(cfg);
          });
        });
      }).then(function () {
        render();
        schedule(0);
      }).catch(function (err) {
        console.error('[nest]', err);
        warning = friendly(err);
        phase = 'error';
        if (!doorbell && !thermostat) {
          loadCache();
        }
        render();
        schedule(1);
      });
    }

    function friendly(err) {
      var text = googleMessage(err);
      if (err && err.status === 400) {
        return 'Nest refused the sign-in. Check the client id, secret, and refresh token.';
      }
      if (err && err.status === 403) {
        return 'Device Access denied this project. Confirm the $5 registration and that this account authorized it.';
      }
      if (text && text.length < 140) {
        return text;
      }
      return "Can't reach Nest";
    }

    function schedule(fails) {
      var minutes = (util.cfg.refreshMinutes && util.cfg.refreshMinutes.nest) || 2;
      var delay = fails > 0 ? util.backoffMs(fails) : util.jitterMs(minutes);
      util.schedule('nest', refresh, delay);
    }

    function closeSetup() {
      var panel = util.$('nest-setup');
      if (!panel) {
        return;
      }
      panel.hidden = true;
      util.emptyEl(panel);
    }

    function field(label, name, value, secret) {
      var wrap = el('label', 'setup-field');
      wrap.appendChild(el('span', 'setup-label', label));
      var input = el('input', 'setup-input');
      input.name = name;
      input.value = value || '';
      input.autocomplete = 'off';
      input.spellcheck = false;
      if (secret) {
        input.type = 'password';
      } else {
        input.type = 'text';
      }
      wrap.appendChild(input);
      return wrap;
    }

    function openSetup() {
      var panel = util.$('nest-setup');
      if (!panel) {
        return;
      }
      var cfg = settings();
      util.emptyEl(panel);
      var backdrop = el('div', 'day-modal-backdrop');
      var card = el('div', 'day-modal-card setup-card');
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'true');
      card.setAttribute('aria-label', 'Nest setup');
      var closeBtn = el('button', 'news-list-close', 'Close');
      closeBtn.type = 'button';
      closeBtn.setAttribute('data-setup-close', '1');
      var scroller = el('div', 'day-modal-scroll');
      var head = el('div', 'news-list-head');
      head.appendChild(el('h2', 'news-list-title', 'Connect Nest'));
      head.appendChild(closeBtn);
      scroller.appendChild(head);
      appendHelp(scroller, [
        '1. Pay the $5 fee at the Device Access console and copy the project id.',
        '2. In Google Cloud, enable Smart Device Management and create an OAuth client.',
        '3. Authorize with the SDM scope, plus Pub/Sub if you want doorbell events.',
        '4. Paste the refresh token here, or into gitignored config.local.js. Nothing typed here is committed.'
      ]);
      var form = el('form', 'setup-form');
      form.appendChild(field('Project id', 'projectId', cfg.projectId, false));
      form.appendChild(field('OAuth client id', 'clientId', cfg.clientId, false));
      form.appendChild(field('OAuth client secret', 'clientSecret', cfg.clientSecret, true));
      form.appendChild(field('Refresh token', 'refreshToken', cfg.refreshToken, true));
      form.appendChild(field('Pub/Sub project id (optional)', 'pubsubProjectId', cfg.pubsubProjectId, false));
      form.appendChild(field('Pub/Sub subscription (optional)', 'pubsubSubscription', cfg.pubsubSubscription, false));
      var actions = el('div', 'setup-actions');
      var save = el('button', 'tile-action', 'Save on this tablet');
      save.type = 'submit';
      var forget = el('button', 'tile-action tile-action-quiet', 'Forget');
      forget.type = 'button';
      forget.setAttribute('data-setup-forget', '1');
      actions.appendChild(save);
      actions.appendChild(forget);
      form.appendChild(actions);
      scroller.appendChild(form);
      card.appendChild(scroller);
      panel.appendChild(backdrop);
      panel.appendChild(card);
      panel.hidden = false;
    }

    function saveSetup(form) {
      var data = {
        projectId: form.projectId.value,
        clientId: form.clientId.value,
        clientSecret: form.clientSecret.value,
        refreshToken: form.refreshToken.value,
        pubsubProjectId: form.pubsubProjectId.value,
        pubsubSubscription: form.pubsubSubscription.value
      };
      writeStore(data);
      tokenCache.access = '';
      tokenCache.expiresAt = 0;
      closeSetup();
      refresh();
    }

    function forgetSetup() {
      try {
        localStorage.removeItem(STORE_KEY);
      } catch (err) {
        console.error('[nest]', err);
      }
      tokenCache.access = '';
      tokenCache.expiresAt = 0;
      doorbell = null;
      thermostat = null;
      events = { chime: null, motion: null };
      revokeSnapshot();
      closeSetup();
      render();
    }

    function closeLive() {
      var session = live;
      live = null;
      var panel = util.$('live-view');
      if (panel) {
        panel.hidden = true;
        util.emptyEl(panel);
      }
      if (!session || session.sample) {
        return;
      }
      if (session.timer) {
        clearTimeout(session.timer);
      }
      if (session.pc) {
        try {
          session.pc.close();
        } catch (err) {
          console.error('[nest]', err);
        }
      }
      if (!session.session || !doorbell || !doorbell.deviceName) {
        return;
      }
      var cfg = settings();
      accessToken(cfg).then(function (token) {
        return execute(token, doorbell.deviceName, CMD_STOP, { mediaSessionId: session.session });
      }).catch(function (err) {
        console.error('[nest]', err);
      });
    }

    function showLiveShell(title, node) {
      var panel = util.$('live-view');
      if (!panel) {
        return null;
      }
      util.emptyEl(panel);
      var backdrop = el('div', 'day-modal-backdrop');
      var card = el('div', 'day-modal-card live-card');
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'true');
      card.setAttribute('aria-label', 'Doorbell live view');
      var closeBtn = el('button', 'news-list-close', 'Close');
      closeBtn.type = 'button';
      closeBtn.setAttribute('data-live-close', '1');
      var head = el('div', 'news-list-head');
      head.appendChild(el('h2', 'news-list-title', title));
      head.appendChild(closeBtn);
      card.appendChild(head);
      card.appendChild(node);
      panel.appendChild(backdrop);
      panel.appendChild(card);
      panel.hidden = false;
      return card;
    }

    function waitIce(pc) {
      if (pc.iceGatheringState === 'complete') {
        return Promise.resolve();
      }
      return new Promise(function (resolve) {
        var timer = setTimeout(done, 4000);
        function done() {
          clearTimeout(timer);
          pc.removeEventListener('icegatheringstatechange', onChange);
          resolve();
        }
        function onChange() {
          if (pc.iceGatheringState === 'complete') {
            done();
          }
        }
        pc.addEventListener('icegatheringstatechange', onChange);
      });
    }

    function openLive() {
      if (!doorbell) {
        return;
      }
      if (doorbell.sample || !doorbell.webRtc || typeof RTCPeerConnection !== 'function') {
        var note = el('div', 'live-sample');
        if (doorbell.sample) {
          note.appendChild(sampleShot());
          note.appendChild(el('p', 'tile-help', 'Sample view. A connected doorbell plays the live stream here.'));
        } else if (!doorbell.webRtc) {
          note.appendChild(el('p', 'tile-help', 'This doorbell did not offer a browser live stream.'));
        } else {
          note.appendChild(el('p', 'tile-help', "This browser can't play the live stream."));
        }
        showLiveShell(doorbell.name, note);
        live = { sample: true };
        return;
      }
      var video = el('video', 'live-video');
      video.autoplay = true;
      video.muted = true;
      video.setAttribute('playsinline', 'true');
      var status = el('p', 'tile-help', 'Starting live view\u2026');
      var wrap = el('div', 'live-sample');
      wrap.appendChild(video);
      wrap.appendChild(status);
      showLiveShell(doorbell.name, wrap);
      var pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      live = { pc: pc, session: '', sample: false, timer: null };
      pc.addTransceiver('audio', { direction: 'recvonly' });
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.ontrack = function (ev) {
        if (ev.streams && ev.streams[0]) {
          video.srcObject = ev.streams[0];
        }
      };
      var cfg = settings();
      pc.createOffer().then(function (offer) {
        return pc.setLocalDescription(offer);
      }).then(function () {
        return waitIce(pc);
      }).then(function () {
        return accessToken(cfg);
      }).then(function (token) {
        return execute(token, doorbell.deviceName, CMD_WEBRTC, {
          offerSdp: pc.localDescription.sdp
        });
      }).then(function (data) {
        var results = data && data.results ? data.results : {};
        if (!results.answerSdp) {
          throw new Error('No answer');
        }
        live.session = results.mediaSessionId || '';
        return pc.setRemoteDescription({ type: 'answer', sdp: results.answerSdp });
      }).then(function () {
        status.textContent = 'Live';
        if (live && live.session) {
          live.timer = setTimeout(function extend() {
            if (!live || !live.session) {
              return;
            }
            accessToken(cfg).then(function (token) {
              return execute(token, doorbell.deviceName, CMD_EXTEND, { mediaSessionId: live.session });
            }).catch(function (err) {
              console.error('[nest]', err);
            });
            if (live) {
              live.timer = setTimeout(extend, 4 * 60 * 1000);
            }
          }, 4 * 60 * 1000);
        }
      }).catch(function (err) {
        console.error('[nest]', err);
        status.textContent = "Live view didn't start. " + friendly(err);
      });
    }

    function changeSetpoint(delta) {
      if (!thermostat || adjusting) {
        return;
      }
      var change = setpointCommand(thermostat, delta);
      if (!change) {
        return;
      }
      thermostat.heat = change.heat;
      thermostat.cool = change.cool;
      render();
      if (thermostat.sample || sampleOn()) {
        return;
      }
      adjusting = true;
      render();
      var cfg = settings();
      accessToken(cfg).then(function (token) {
        return execute(token, thermostat.deviceName, change.command, change.params);
      }).then(function () {
        adjusting = false;
        refresh();
      }).catch(function (err) {
        console.error('[nest]', err);
        adjusting = false;
        warning = "The setpoint didn't change. " + friendly(err);
        render();
      });
    }

    function onHomeClick(ev) {
      var node = ev.target;
      while (node && node.id !== 'home') {
        if (node.getAttribute && node.getAttribute('data-nest-setup')) {
          ev.preventDefault();
          ev.stopPropagation();
          openSetup();
          return;
        }
        if (node.getAttribute && node.getAttribute('data-nest-live')) {
          ev.preventDefault();
          ev.stopPropagation();
          openLive();
          return;
        }
        if (node.getAttribute && node.getAttribute('data-nest-delta')) {
          ev.preventDefault();
          ev.stopPropagation();
          changeSetpoint(Number(node.getAttribute('data-nest-delta')));
          return;
        }
        node = node.parentNode;
      }
    }

    function onSetupClick(ev) {
      ev.stopPropagation();
      var node = ev.target;
      var panel = util.$('nest-setup');
      while (node && node !== panel) {
        if (node.getAttribute && node.getAttribute('data-setup-close')) {
          ev.preventDefault();
          closeSetup();
          return;
        }
        if (node.getAttribute && node.getAttribute('data-setup-forget')) {
          ev.preventDefault();
          forgetSetup();
          return;
        }
        if (node.classList && node.classList.contains('day-modal-card')) {
          return;
        }
        node = node.parentNode;
      }
      closeSetup();
    }

    function onSetupSubmit(ev) {
      ev.preventDefault();
      ev.stopPropagation();
      saveSetup(ev.target);
    }

    function onLiveClick(ev) {
      ev.stopPropagation();
      var node = ev.target;
      var panel = util.$('live-view');
      while (node && node !== panel) {
        if (node.getAttribute && node.getAttribute('data-live-close')) {
          ev.preventDefault();
          closeLive();
          return;
        }
        if (node.classList && node.classList.contains('day-modal-card')) {
          return;
        }
        node = node.parentNode;
      }
      closeLive();
    }

    function onKey(ev) {
      if (ev.key !== 'Escape' && ev.key !== 'Esc') {
        return;
      }
      var setup = util.$('nest-setup');
      var panel = util.$('live-view');
      if (panel && !panel.hidden) {
        closeLive();
      } else if (setup && !setup.hidden) {
        closeSetup();
      }
    }

    exports.repaint = render;

    exports.init = function () {
      if (!bound) {
        var home = util.$('home');
        var setup = util.$('nest-setup');
        var panel = util.$('live-view');
        if (home) {
          home.addEventListener('click', onHomeClick);
        }
        if (setup) {
          setup.addEventListener('click', onSetupClick);
          setup.addEventListener('submit', onSetupSubmit);
        }
        if (panel) {
          panel.addEventListener('click', onLiveClick);
        }
        document.addEventListener('keydown', onKey);
        bound = true;
      }
      if (sampleOn()) {
        phase = 'ready';
        applySample();
        return;
      }
      var cfg = settings();
      if (!nestConfigured(cfg)) {
        phase = 'setup';
        render();
        return;
      }
      loadCache();
      eventHint(cfg);
      if (doorbell || thermostat) {
        phase = 'ready';
      }
      render();
      refresh();
    };

    exports.refresh = refresh;
    KH.nest = exports;
  }

  if (typeof window !== 'undefined' && window.document) {
    attachBrowserApi();
  }
})(typeof module !== 'undefined' && module.exports
  ? module.exports
  : ((window.KH = window.KH || {}).nest = (window.KH && window.KH.nest) || {}));

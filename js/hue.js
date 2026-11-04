(function (exports) {
  'use strict';

  var STORE_IP = 'kh:hue:bridgeIp';
  var STORE_KEY = 'kh:hue:appKey';
  var DEVICE_TYPE = 'kitchenhub#tablet';

  function trim(value) {
    return String(value == null ? '' : value).replace(/^\s+|\s+$/g, '');
  }

  function isIPv4(ip) {
    var parts = String(ip || '').split('.');
    if (parts.length !== 4) {
      return false;
    }
    var i;
    for (i = 0; i < 4; i++) {
      if (!/^\d{1,3}$/.test(parts[i])) {
        return false;
      }
      if (parts[i].length > 1 && parts[i].charAt(0) === '0') {
        return false;
      }
      var n = Number(parts[i]);
      if (n > 255) {
        return false;
      }
    }
    return true;
  }

  function octets(ip) {
    var parts = String(ip || '').split('.');
    var nums = [];
    var i;
    for (i = 0; i < parts.length; i++) {
      nums.push(Number(parts[i]));
    }
    return nums;
  }

  function isPrivateIPv4(ip) {
    if (!isIPv4(ip)) {
      return false;
    }
    var n = octets(ip);
    if (n[0] === 10 || n[0] === 127) {
      return true;
    }
    if (n[0] === 192 && n[1] === 168) {
      return true;
    }
    if (n[0] === 172 && n[1] >= 16 && n[1] <= 31) {
      return true;
    }
    return false;
  }

  function lightPercent(bri) {
    var n = Number(bri);
    if (isNaN(n)) {
      return 0;
    }
    if (n < 1) {
      n = 1;
    }
    if (n > 254) {
      n = 254;
    }
    return Math.round(n / 254 * 100);
  }

  function briFromPercent(percent) {
    var n = Math.round(Number(percent) / 100 * 254);
    if (isNaN(n) || n < 1) {
      return 1;
    }
    if (n > 254) {
      return 254;
    }
    return n;
  }

  function parsePairResponse(body) {
    var row = body && body[0] ? body[0] : null;
    if (row && row.success && row.success.username) {
      return { ok: true, appKey: String(row.success.username) };
    }
    var error = row && row.error ? row.error : {};
    return {
      ok: false,
      type: error.type || 0,
      description: error.description || 'Unexpected bridge response'
    };
  }

  function lightRecord(id, raw) {
    var state = raw && raw.state ? raw.state : {};
    var on = !!state.on;
    var hasBri = state.bri != null && !isNaN(Number(state.bri));
    return {
      id: String(id),
      name: raw && raw.name ? String(raw.name) : ('Light ' + id),
      on: on,
      bri: hasBri ? Number(state.bri) : null,
      percent: hasBri ? lightPercent(state.bri) : (on ? 100 : 0),
      reachable: state.reachable !== false
    };
  }

  function groupLights(lightsObj, groupsObj) {
    var lights = lightsObj || {};
    var groups = groupsObj || {};
    var used = {};
    var rooms = [];
    var groupIds = Object.keys(groups);
    var passes = ['Room', 'Zone'];
    var p;
    var i;
    var j;
    for (p = 0; p < passes.length; p++) {
      for (i = 0; i < groupIds.length; i++) {
        var group = groups[groupIds[i]];
        if (!group || group.type !== passes[p]) {
          continue;
        }
        var members = [];
        var lids = group.lights || [];
        for (j = 0; j < lids.length; j++) {
          var lid = String(lids[j]);
          if (!lights[lid] || used[lid]) {
            continue;
          }
          used[lid] = true;
          members.push(lightRecord(lid, lights[lid]));
        }
        if (members.length) {
          rooms.push({ name: group.name || 'Room', lights: members });
        }
      }
    }
    var leftover = [];
    var lightIds = Object.keys(lights);
    for (i = 0; i < lightIds.length; i++) {
      if (used[lightIds[i]]) {
        continue;
      }
      leftover.push(lightRecord(lightIds[i], lights[lightIds[i]]));
    }
    if (leftover.length) {
      rooms.push({ name: rooms.length ? 'Other' : 'Lights', lights: leftover });
    }
    return rooms;
  }

  function discoveryIps(list) {
    var out = [];
    var rows = list || [];
    var i;
    for (i = 0; i < rows.length; i++) {
      var ip = rows[i] && (rows[i].internalipaddress || rows[i].internalIpAddress);
      ip = trim(ip);
      if (isPrivateIPv4(ip)) {
        out.push(ip);
      }
    }
    return out;
  }

  function proxyTarget(hostToken, tail) {
    var token = trim(hostToken);
    var path = tail || '/';
    if (path.charAt(0) !== '/') {
      path = '/' + path;
    }
    if (path.indexOf('/api') !== 0) {
      return null;
    }
    var host = token;
    var port = 80;
    var colon = token.lastIndexOf(':');
    if (colon !== -1) {
      host = token.slice(0, colon);
      port = Number(token.slice(colon + 1));
      if (!isIPv4(host) || host !== '127.0.0.1' || !port || port < 1 || port > 65535) {
        return null;
      }
    }
    if (!isPrivateIPv4(host)) {
      return null;
    }
    return { host: host, port: port, path: path };
  }

  exports.trim = trim;
  exports.isIPv4 = isIPv4;
  exports.isPrivateIPv4 = isPrivateIPv4;
  exports.lightPercent = lightPercent;
  exports.briFromPercent = briFromPercent;
  exports.parsePairResponse = parsePairResponse;
  exports.groupLights = groupLights;
  exports.discoveryIps = discoveryIps;
  exports.proxyTarget = proxyTarget;
  exports.DEVICE_TYPE = DEVICE_TYPE;

  function attachBrowserApi() {
    var KH = window.KH || (window.KH = {});
    var util = KH.util;
    var rooms = [];
    var bridgeIp = '';
    var appKey = '';
    var proxyOn = false;
    var note = '';
    var warning = '';
    var paired = false;
    var interacting = false;
    var pending = null;
    var bound = false;
    var briTimer = null;

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

    function readItem(key) {
      try {
        return localStorage.getItem(key) || '';
      } catch (err) {
        return '';
      }
    }

    function writeItem(key, value) {
      try {
        if (value) {
          localStorage.setItem(key, value);
        } else {
          localStorage.removeItem(key);
        }
      } catch (err) {
        console.error('[hue]', err);
      }
    }

    function cfgHue() {
      return util.cfg && util.cfg.hue ? util.cfg.hue : {};
    }

    function sampleOn() {
      return !!(util.query && util.query.sample);
    }

    function useHub() {
      var hub = window.KH && window.KH.smartthings;
      return !!(hub && hub.configured && hub.configured());
    }

    function resolveSecrets() {
      var cfg = cfgHue();
      bridgeIp = trim(cfg.bridgeIp) || trim(readItem(STORE_IP));
      appKey = trim(cfg.appKey) || trim(readItem(STORE_KEY));
      if (!isIPv4(bridgeIp)) {
        bridgeIp = '';
      }
    }

    function bridgeUrl(apiPath) {
      var path = apiPath || '/api';
      if (path.charAt(0) !== '/') {
        path = '/' + path;
      }
      if (proxyOn) {
        return 'hue-proxy/' + bridgeIp + path;
      }
      return 'http://' + bridgeIp + path;
    }

    function request(apiPath, options) {
      options = options || {};
      var controller = new AbortController();
      var timer = setTimeout(function () {
        controller.abort();
      }, options.timeout || 8000);
      var headers = options.headers || {};
      var init = {
        method: options.method || 'GET',
        headers: headers,
        signal: controller.signal
      };
      if (options.body != null) {
        init.body = options.body;
        if (!headers['Content-Type'] && !headers['content-type']) {
          init.headers = { 'Content-Type': 'application/json' };
        }
      }
      return fetch(bridgeUrl(apiPath), init).then(function (res) {
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
            throw error;
          }
          return data;
        });
      }).catch(function (err) {
        clearTimeout(timer);
        throw err;
      });
    }

    function reachHint(err) {
      if (err && err.name === 'TypeError' && !proxyOn) {
        return "The browser blocked the bridge. Run the home server in the README, then open that address on the tablet.";
      }
      if (err && err.status === 403) {
        return "That address isn't a home-network bridge.";
      }
      return "Can't reach the bridge" + (bridgeIp ? ' at ' + bridgeIp : '') + '.';
    }

    function sampleRooms() {
      return [
        {
          name: 'Kitchen',
          lights: [
            { id: '1', name: 'Island', on: true, percent: 80, reachable: true },
            { id: '2', name: 'Under cabinet', on: true, percent: 45, reachable: true }
          ]
        },
        {
          name: 'Living room',
          lights: [
            { id: '3', name: 'Ceiling', on: false, percent: 0, reachable: true },
            { id: '4', name: 'Lamp', on: true, percent: 55, reachable: true }
          ]
        }
      ];
    }

    function render() {
      if (interacting) {
        pending = true;
        return;
      }
      pending = null;
      util.safeRender('hue', function () {
        var root = util.$('hue');
        if (!root) {
          return;
        }
        util.emptyEl(root);
        root.appendChild(el('div', 'panel-kicker', 'Lights'));
        if (sampleOn()) {
          rooms = rooms.length ? rooms : sampleRooms();
          renderRooms(root);
          return;
        }
        if (useHub()) {
          if (!rooms.length && !warning) {
            root.appendChild(el('p', 'tile-help', 'Loading lights from SmartThings\u2026'));
          } else if (!rooms.length) {
            root.appendChild(el('p', 'tile-help', warning));
            var forget = el('button', 'tile-action tile-action-quiet', 'Forget hub');
            forget.type = 'button';
            forget.setAttribute('data-st-forget', '1');
            root.appendChild(forget);
          } else {
            renderRooms(root);
            if (warning) {
              root.appendChild(el('p', 'tile-help', warning));
            }
          }
          return;
        }
        if (!appKey) {
          renderSetup(root);
          return;
        }
        if (!rooms.length && warning) {
          root.appendChild(el('p', 'tile-help', warning));
          renderSetup(root, true);
          return;
        }
        renderRooms(root);
        if (warning) {
          root.appendChild(el('p', 'tile-help', warning));
        }
      });
    }

    function renderRooms(root) {
      var scroller = el('div', 'tile-scroll');
      var r;
      var i;
      if (!rooms.length) {
        scroller.appendChild(el('p', 'tile-help', 'No lights reported by the bridge.'));
      }
      for (r = 0; r < rooms.length; r++) {
        scroller.appendChild(el('div', 'hue-room', rooms[r].name));
        var lights = rooms[r].lights || [];
        for (i = 0; i < lights.length; i++) {
          scroller.appendChild(lightRow(lights[i]));
        }
      }
      root.appendChild(scroller);
    }

    function lightRow(light) {
      var row = el('div', 'hue-row');
      if (!light.reachable) {
        row.className += ' is-unreachable';
      }
      var toggle = el('button', 'hue-toggle' + (light.on ? ' is-on' : ''), light.on ? 'On' : 'Off');
      toggle.type = 'button';
      toggle.setAttribute('aria-pressed', light.on ? 'true' : 'false');
      toggle.setAttribute('data-hue-id', light.id);
      toggle.setAttribute('data-hue-on', light.on ? '0' : '1');
      if (!light.reachable) {
        toggle.disabled = true;
      }
      var name = el('div', 'hue-name', light.name);
      var briWrap = el('label', 'hue-bri-wrap');
      var pct = el('span', 'hue-pct', light.percent + '%');
      var range = document.createElement('input');
      range.className = 'hue-bri';
      range.type = 'range';
      range.min = '1';
      range.max = '100';
      range.value = String(light.percent || 1);
      range.setAttribute('aria-label', light.name + ' brightness');
      range.setAttribute('data-hue-bri', light.id);
      if (!light.reachable) {
        range.disabled = true;
      }
      briWrap.appendChild(pct);
      briWrap.appendChild(range);
      row.appendChild(toggle);
      row.appendChild(name);
      row.appendChild(briWrap);
      return row;
    }

    function renderSetup(root, compact) {
      if (!compact) {
        root.appendChild(el('div', 'tile-status', 'Not connected'));
      }
      if (note) {
        root.appendChild(el('p', 'tile-help', note));
      }
      var form = el('form', 'hue-setup');
      var ip = document.createElement('input');
      ip.className = 'setup-input hue-ip';
      ip.name = 'bridgeIp';
      ip.value = bridgeIp;
      ip.placeholder = 'Bridge IP';
      ip.setAttribute('aria-label', 'Bridge IP');
      ip.inputMode = 'decimal';
      ip.autocomplete = 'off';
      var find = el('button', 'tile-action tile-action-quiet', 'Find');
      find.type = 'button';
      find.setAttribute('data-hue-find', '1');
      var pair = el('button', 'tile-action', 'Pair');
      pair.type = 'button';
      pair.setAttribute('data-hue-pair', '1');
      var row = el('div', 'hue-setup-row');
      row.appendChild(ip);
      row.appendChild(find);
      form.appendChild(row);
      form.appendChild(pair);
      root.appendChild(form);
      if (!compact) {
        root.appendChild(el('p', 'tile-help', 'Same Wi-Fi as the bridge. Press the link button, then Pair. See the README.'));
        root.appendChild(el('p', 'tile-help', 'Or save a SmartThings token. The hub can run these lights and turn the doorbell tile red when the front door is unlocked.'));
        var tokenRow = el('div', 'hue-setup-row');
        var tokenInput = document.createElement('input');
        tokenInput.className = 'setup-input st-token';
        tokenInput.type = 'password';
        tokenInput.autocomplete = 'off';
        tokenInput.placeholder = 'SmartThings token';
        tokenInput.setAttribute('aria-label', 'SmartThings token');
        var save = el('button', 'tile-action', 'Save');
        save.type = 'button';
        save.setAttribute('data-st-save', '1');
        tokenRow.appendChild(tokenInput);
        tokenRow.appendChild(save);
        root.appendChild(tokenRow);
      }
    }

    function applyDiscovery(list) {
      var ips = discoveryIps(list);
      if (!ips.length) {
        return false;
      }
      if (!trim(cfgHue().bridgeIp)) {
        bridgeIp = ips[0];
        writeItem(STORE_IP, bridgeIp);
      }
      note = 'Bridge found at ' + bridgeIp + '. Press the link button, then Pair.';
      warning = '';
      return true;
    }

    function probeProxy() {
      return fetch('hue-discovery', { cache: 'no-store' }).then(function (res) {
        var type = (res.headers.get('content-type') || '').toLowerCase();
        if (!res.ok || type.indexOf('json') === -1) {
          proxyOn = false;
          return [];
        }
        proxyOn = true;
        return res.json();
      }).catch(function () {
        proxyOn = false;
        return [];
      });
    }

    function discoverDirect() {
      return fetch('https://discovery.meethue.com/', { cache: 'no-store' }).then(function (res) {
        if (!res.ok) {
          return [];
        }
        return res.json();
      }).catch(function () {
        return [];
      });
    }

    function findBridge() {
      note = 'Looking for the bridge\u2026';
      warning = '';
      render();
      return probeProxy().then(function (list) {
        if (applyDiscovery(list)) {
          render();
          return null;
        }
        return discoverDirect();
      }).then(function (list) {
        if (!list) {
          return;
        }
        if (applyDiscovery(list)) {
          render();
          return;
        }
        note = '';
        warning = 'No bridge found. Enter the IP from the Hue app (Settings, Bridges).';
        if (!proxyOn) {
          warning += ' Discovery from this website is often blocked; the home server in the README can see the bridge.';
        }
        render();
      });
    }

    function currentIpFromForm() {
      var input = document.querySelector('.hue-ip');
      var typed = input ? trim(input.value) : '';
      if (typed) {
        return typed;
      }
      return bridgeIp;
    }

    function rememberIp(ip) {
      bridgeIp = ip;
      if (!trim(cfgHue().bridgeIp)) {
        writeItem(STORE_IP, ip);
      }
    }

    function pair() {
      var ip = currentIpFromForm();
      if (!isIPv4(ip)) {
        warning = 'Enter the bridge IP address first.';
        note = '';
        render();
        return;
      }
      rememberIp(ip);
      warning = '';
      note = 'Press the round link button, then wait\u2026';
      render();
      request('/api', {
        method: 'POST',
        body: JSON.stringify({ devicetype: DEVICE_TYPE })
      }).then(function (data) {
        var parsed = parsePairResponse(data);
        if (!parsed.ok) {
          if (parsed.type === 101) {
            warning = 'Press the link button on the bridge, then tap Pair again.';
          } else {
            warning = parsed.description || 'The bridge refused pairing.';
          }
          note = '';
          render();
          return;
        }
        appKey = parsed.appKey;
        if (!trim(cfgHue().appKey)) {
          writeItem(STORE_KEY, appKey);
        }
        paired = true;
        note = 'Paired. The app key is saved on this tablet.';
        warning = '';
        loadLights();
      }).catch(function (err) {
        console.error('[hue]', err);
        warning = reachHint(err);
        note = '';
        render();
      });
    }

    function loadLights() {
      if (sampleOn()) {
        rooms = sampleRooms();
        render();
        return;
      }
      resolveSecrets();
      if (!appKey || !bridgeIp) {
        rooms = [];
        render();
        schedule(0);
        return;
      }
      if (util.query && util.query.offline) {
        warning = "Can't reach the bridge";
        render();
        schedule(1);
        return;
      }
      var key = encodeURIComponent(appKey);
      request('/api/' + key + '/lights').then(function (lights) {
        if (lights && lights[0] && lights[0].error) {
          var denied = new Error(lights[0].error.description || 'Bridge error');
          denied.status = lights[0].error.type || 0;
          throw denied;
        }
        return request('/api/' + key + '/groups').catch(function () {
          return {};
        }).then(function (groups) {
          if (groups && groups[0] && groups[0].error) {
            return { lights: lights, groups: {} };
          }
          return { lights: lights, groups: groups };
        });
      }).then(function (data) {
        rooms = groupLights(data.lights, data.groups);
        warning = '';
        paired = true;
        util.cacheSet('hue', rooms);
        if (window.KH && window.KH.status) {
          window.KH.status.set('hue', Date.now());
        }
        render();
        schedule(0);
      }).catch(function (err) {
        console.error('[hue]', err);
        warning = reachHint(err);
        if (!rooms.length) {
          var cached = util.cacheGet('hue');
          if (cached && cached.data) {
            rooms = cached.data;
          }
        }
        render();
        schedule(1);
      });
    }

    function schedule(fails) {
      if (!appKey || useHub()) {
        return;
      }
      var minutes = (util.cfg.refreshMinutes && util.cfg.refreshMinutes.hue) || 1;
      var delay = fails > 0 ? util.backoffMs(fails) : util.jitterMs(minutes);
      util.schedule('hue', loadLights, delay);
    }

    function findLight(id) {
      var r;
      var i;
      for (r = 0; r < rooms.length; r++) {
        var lights = rooms[r].lights || [];
        for (i = 0; i < lights.length; i++) {
          if (String(lights[i].id) === String(id)) {
            return lights[i];
          }
        }
      }
      return null;
    }

    function sendState(id, body) {
      if (sampleOn()) {
        return;
      }
      var light = findLight(id);
      if (light && light.via === 'smartthings' && window.KH && window.KH.smartthings && window.KH.smartthings.setLight) {
        window.KH.smartthings.setLight(id, body.on, light.percent).catch(function (err) {
          console.error('[hue]', err && err.status ? err.status : err);
          warning = "The hub didn't change that light.";
          render();
        });
        return;
      }
      var key = encodeURIComponent(appKey);
      request('/api/' + key + '/lights/' + encodeURIComponent(id) + '/state', {
        method: 'PUT',
        body: JSON.stringify(body)
      }).catch(function (err) {
        console.error('[hue]', err);
        warning = reachHint(err);
        render();
      });
    }

    function toggleLight(id, turnOn) {
      var light = findLight(id);
      if (!light) {
        return;
      }
      light.on = !!turnOn;
      if (light.on && !light.percent) {
        light.percent = 100;
      }
      render();
      var body = { on: light.on };
      if (light.on && light.percent) {
        body.bri = briFromPercent(light.percent);
      }
      sendState(id, body);
    }

    function setBrightness(id, percent) {
      var light = findLight(id);
      if (!light) {
        return;
      }
      light.percent = Math.max(1, Math.min(100, Math.round(Number(percent) || 1)));
      light.on = true;
      var pct = document.querySelector('[data-hue-bri="' + id + '"]');
      var wrap = pct && pct.parentNode;
      var label = wrap ? wrap.querySelector('.hue-pct') : null;
      if (label) {
        label.textContent = light.percent + '%';
      }
      var toggle = document.querySelector('[data-hue-id="' + id + '"]');
      if (toggle) {
        toggle.textContent = 'On';
        toggle.className = 'hue-toggle is-on';
        toggle.setAttribute('aria-pressed', 'true');
        toggle.setAttribute('data-hue-on', '0');
      }
      if (briTimer) {
        clearTimeout(briTimer);
      }
      briTimer = setTimeout(function () {
        briTimer = null;
        sendState(id, { on: true, bri: briFromPercent(light.percent) });
      }, 250);
    }

    function onClick(ev) {
      var node = ev.target;
      if (!node || !node.getAttribute) {
        return;
      }
      if (node.getAttribute('data-st-save')) {
        ev.preventDefault();
        ev.stopPropagation();
        var input = document.querySelector('.st-token');
        if (window.KH && window.KH.smartthings && input) {
          window.KH.smartthings.saveToken(input.value);
        }
        return;
      }
      if (node.getAttribute('data-st-forget')) {
        ev.preventDefault();
        ev.stopPropagation();
        if (window.KH && window.KH.smartthings) {
          window.KH.smartthings.forgetToken();
        }
        warning = '';
        rooms = [];
        render();
        return;
      }
      if (node.getAttribute('data-hue-find')) {
        ev.preventDefault();
        ev.stopPropagation();
        findBridge();
        return;
      }
      if (node.getAttribute('data-hue-pair')) {
        ev.preventDefault();
        ev.stopPropagation();
        pair();
        return;
      }
      if (node.getAttribute('data-hue-id')) {
        ev.preventDefault();
        ev.stopPropagation();
        toggleLight(node.getAttribute('data-hue-id'), node.getAttribute('data-hue-on') === '1');
      }
    }

    function onInput(ev) {
      var node = ev.target;
      if (!node || !node.getAttribute || !node.getAttribute('data-hue-bri')) {
        return;
      }
      setBrightness(node.getAttribute('data-hue-bri'), node.value);
    }

    function onSubmit(ev) {
      if (ev.target && ev.target.classList && ev.target.classList.contains('hue-setup')) {
        ev.preventDefault();
        pair();
      }
    }

    function onPointerDown(ev) {
      var node = ev.target;
      if (node && node.getAttribute && node.getAttribute('data-hue-bri')) {
        interacting = true;
      }
    }

    function onPointerUp() {
      if (!interacting) {
        return;
      }
      interacting = false;
      if (pending) {
        render();
      }
    }

    exports.init = function () {
      if (!bound) {
        var root = util.$('hue');
        if (root) {
          root.addEventListener('click', onClick);
          root.addEventListener('input', onInput);
          root.addEventListener('submit', onSubmit);
          root.addEventListener('pointerdown', onPointerDown);
          root.addEventListener('pointerup', onPointerUp);
          root.addEventListener('pointercancel', onPointerUp);
        }
        bound = true;
      }
      if (sampleOn()) {
        rooms = sampleRooms();
        render();
        return;
      }
      if (useHub()) {
        render();
        return;
      }
      resolveSecrets();
      var cached = util.cacheGet('hue');
      if (appKey && cached && cached.data) {
        rooms = cached.data;
      }
      render();
      probeProxy().then(function (list) {
        if (!bridgeIp) {
          applyDiscovery(list);
        }
        if (appKey && bridgeIp) {
          loadLights();
        } else {
          render();
        }
      });
    };

    exports.applyHubRooms = function (next, errMsg) {
      if (sampleOn()) {
        return;
      }
      if (errMsg) {
        warning = errMsg;
      } else {
        warning = '';
        rooms = next || [];
      }
      render();
    };

    exports.refresh = function () {
      if (sampleOn()) {
        render();
        return;
      }
      if (useHub()) {
        if (window.KH && window.KH.smartthings && window.KH.smartthings.refresh) {
          window.KH.smartthings.refresh();
        }
        return;
      }
      if (appKey && bridgeIp) {
        loadLights();
      } else {
        findBridge();
      }
    };

    KH.hue = exports;
  }

  if (typeof window !== 'undefined' && window.document) {
    attachBrowserApi();
  }
})(typeof module !== 'undefined' && module.exports
  ? module.exports
  : ((window.KH = window.KH || {}).hue = (window.KH && window.KH.hue) || {}));

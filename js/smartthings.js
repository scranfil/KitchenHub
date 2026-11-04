(function (exports) {
  'use strict';

  var API = 'https://api.smartthings.com/v1';
  var STORE_KEY = 'kh:smartthings:token';

  function trim(value) {
    return String(value == null ? '' : value).replace(/^\s+|\s+$/g, '');
  }

  function deviceName(device) {
    return trim(device && (device.label || device.name));
  }

  function capabilityIds(device) {
    var found = [];
    var components = device && device.components ? device.components : [];
    var i;
    var j;
    for (i = 0; i < components.length; i++) {
      var caps = components[i] && components[i].capabilities ? components[i].capabilities : [];
      for (j = 0; j < caps.length; j++) {
        if (caps[j] && caps[j].id) {
          found.push(caps[j].id);
        }
      }
    }
    return found;
  }

  function hasCapability(device, id) {
    var caps = capabilityIds(device);
    var i;
    for (i = 0; i < caps.length; i++) {
      if (caps[i] === id) {
        return true;
      }
    }
    return false;
  }

  function isLock(device) {
    return hasCapability(device, 'lock');
  }

  function isHubLight(device) {
    if (!hasCapability(device, 'switch') || isLock(device)) {
      return false;
    }
    return hasCapability(device, 'switchLevel') || hasCapability(device, 'colorControl') || hasCapability(device, 'colorTemperature');
  }

  function pickFrontLock(devices, wanted) {
    var list = devices || [];
    var locks = [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (isLock(list[i])) {
        locks.push(list[i]);
      }
    }
    var needle = trim(wanted || 'front').toLowerCase();
    var matched = [];
    for (i = 0; i < locks.length; i++) {
      if (deviceName(locks[i]).toLowerCase().indexOf(needle) !== -1) {
        matched.push(locks[i]);
      }
    }
    if (matched.length === 1) {
      return matched[0];
    }
    if (matched.length > 1) {
      for (i = 0; i < matched.length; i++) {
        if (deviceName(matched[i]).toLowerCase().indexOf('door') !== -1) {
          return matched[i];
        }
      }
      return matched[0];
    }
    if (locks.length === 1) {
      return locks[0];
    }
    return null;
  }

  function componentMain(status) {
    if (status && status.components && status.components.main) {
      return status.components.main;
    }
    return status || {};
  }

  function attr(status, capability, name) {
    var block = componentMain(status)[capability] || {};
    var row = block[name] || {};
    if (row.value == null) {
      return '';
    }
    return String(row.value);
  }

  function lockReading(status) {
    var value = attr(status, 'lock', 'lock').toLowerCase();
    if (value === 'locked') {
      return { unlocked: false, known: true, label: 'Locked' };
    }
    if (value.indexOf('unlock') === 0) {
      return { unlocked: true, known: true, label: 'Unlocked' };
    }
    return { unlocked: false, known: false, label: value || 'Unknown' };
  }

  function lightReading(device, status) {
    var sw = attr(status, 'switch', 'switch').toLowerCase();
    var levelRaw = attr(status, 'switchLevel', 'level');
    var level = Number(levelRaw);
    var on = sw === 'on';
    var percent = levelRaw === '' || isNaN(level) ? (on ? 100 : 0) : Math.round(level);
    if (percent < 0) {
      percent = 0;
    }
    if (percent > 100) {
      percent = 100;
    }
    return {
      id: device.deviceId,
      name: deviceName(device) || 'Light',
      on: on,
      percent: percent,
      reachable: true,
      via: 'smartthings',
      roomId: device.roomId || ''
    };
  }

  function groupHubLights(lights, rooms) {
    var names = {};
    var list = rooms || [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i] && list[i].roomId) {
        names[list[i].roomId] = list[i].name || 'Room';
      }
    }
    var buckets = {};
    var order = [];
    var rows = lights || [];
    for (i = 0; i < rows.length; i++) {
      var roomName = names[rows[i].roomId] || 'Lights';
      if (!buckets[roomName]) {
        buckets[roomName] = [];
        order.push(roomName);
      }
      buckets[roomName].push(rows[i]);
    }
    var out = [];
    for (i = 0; i < order.length; i++) {
      out.push({ name: order[i], lights: buckets[order[i]] });
    }
    return out;
  }

  function lightCommands(on, percent) {
    var commands = [];
    if (on != null) {
      commands.push({
        component: 'main',
        capability: 'switch',
        command: on ? 'on' : 'off'
      });
    }
    if (on !== false && percent != null && !isNaN(Number(percent))) {
      var level = Math.round(Number(percent));
      if (level < 0) {
        level = 0;
      }
      if (level > 100) {
        level = 100;
      }
      commands.push({
        component: 'main',
        capability: 'switchLevel',
        command: 'setLevel',
        arguments: [level]
      });
    }
    return commands;
  }

  function configured(token) {
    return !!trim(token);
  }

  exports.trim = trim;
  exports.deviceName = deviceName;
  exports.isLock = isLock;
  exports.isHubLight = isHubLight;
  exports.pickFrontLock = pickFrontLock;
  exports.lockReading = lockReading;
  exports.lightReading = lightReading;
  exports.groupHubLights = groupHubLights;
  exports.lightCommands = lightCommands;
  exports.configured = configured;

  function attachBrowserApi() {
    var KH = window.KH || (window.KH = {});
    var util = KH.util;
    var lock = null;
    var fails = 0;

    function elToken() {
      return document.querySelector('.st-token');
    }

    function readStore() {
      try {
        return localStorage.getItem(STORE_KEY) || '';
      } catch (err) {
        return '';
      }
    }

    function cfgToken() {
      var cfg = util.cfg && util.cfg.smartthings ? util.cfg.smartthings : {};
      return trim(cfg.token);
    }

    function token() {
      return cfgToken() || trim(readStore());
    }

    function lockName() {
      var cfg = util.cfg && util.cfg.smartthings ? util.cfg.smartthings : {};
      return trim(cfg.lockName) || 'front';
    }

    function sampleOn() {
      return !!(util.query && util.query.sample);
    }

    function request(path, options) {
      options = options || {};
      var controller = new AbortController();
      var timer = setTimeout(function () {
        controller.abort();
      }, options.timeout || 15000);
      var headers = {
        Authorization: 'Bearer ' + token(),
        Accept: 'application/json'
      };
      if (options.body != null) {
        headers['Content-Type'] = 'application/json';
      }
      return fetch(path.indexOf('http') === 0 ? path : API + path, {
        method: options.method || 'GET',
        headers: headers,
        body: options.body == null ? undefined : options.body,
        signal: controller.signal
      }).then(function (res) {
        return res.text().then(function (text) {
          clearTimeout(timer);
          var data = null;
          if (text) {
            try {
              data = JSON.parse(text);
            } catch (err) {
              data = null;
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

    function follow(path, acc) {
      return request(path).then(function (data) {
        var items = data && data.items ? data.items : [];
        var next = (acc || []).concat(items);
        var link = data && data._links && data._links.next && data._links.next.href;
        if (link && next.length < 80) {
          return follow(link, next);
        }
        return next;
      });
    }

    function pool(items, limit, worker) {
      var cursor = 0;
      var running = 0;
      return new Promise(function (resolve) {
        function launch() {
          if (cursor >= items.length && running === 0) {
            resolve();
            return;
          }
          while (running < limit && cursor < items.length) {
            (function (item) {
              running += 1;
              Promise.resolve(worker(item)).then(function () {
                running -= 1;
                launch();
              }, function () {
                running -= 1;
                launch();
              });
            })(items[cursor]);
            cursor += 1;
          }
        }
        launch();
      });
    }

    function tellHue(rooms, warning) {
      if (KH.hue && KH.hue.applyHubRooms) {
        KH.hue.applyHubRooms(rooms, warning);
      }
    }

    function tellDoor() {
      if (KH.nest && KH.nest.repaint) {
        KH.nest.repaint();
      }
    }

    function friendly(err) {
      if (err && err.status === 401) {
        return 'SmartThings refused that token. Create a new one and save it again.';
      }
      if (err && err.status === 403) {
        return 'That token cannot read devices. Include device read and control when you create it.';
      }
      return "Can't reach SmartThings.";
    }

    function refresh() {
      if (sampleOn() || !configured(token())) {
        return;
      }
      var rooms = [];
      var devices = [];
      follow('/devices').then(function (list) {
        devices = list || [];
        return follow('/locations').then(function (locations) {
          var jobs = [];
          var i;
          for (i = 0; i < locations.length; i++) {
            jobs.push(follow('/locations/' + encodeURIComponent(locations[i].locationId) + '/rooms'));
          }
          return Promise.all(jobs);
        }).then(function (groups) {
          var i;
          var j;
          for (i = 0; i < groups.length; i++) {
            for (j = 0; j < groups[i].length; j++) {
              rooms.push(groups[i][j]);
            }
          }
        }).catch(function () {
          rooms = [];
        });
      }).then(function () {
        var door = pickFrontLock(devices, lockName());
        var lights = [];
        var i;
        for (i = 0; i < devices.length; i++) {
          if (isHubLight(devices[i])) {
            lights.push(devices[i]);
          }
        }
        var readings = [];
        var tasks = [];
        if (door) {
          tasks.push(door);
        }
        tasks = tasks.concat(lights);
        return pool(tasks, 4, function (device) {
          return request('/devices/' + encodeURIComponent(device.deviceId) + '/status').then(function (status) {
            if (door && device.deviceId === door.deviceId) {
              var parsed = lockReading(status);
              lock = {
                name: deviceName(door) || 'Front door',
                unlocked: parsed.unlocked,
                known: parsed.known,
                label: parsed.label
              };
            } else {
              readings.push(lightReading(device, status));
            }
          });
        }).then(function () {
          if (!door) {
            lock = null;
          }
          fails = 0;
          tellHue(groupHubLights(readings, rooms), '');
          tellDoor();
          schedule(0);
        });
      }).catch(function (err) {
        console.error('[smartthings]', err && err.status ? err.status : err);
        fails += 1;
        tellHue(null, friendly(err));
        tellDoor();
        schedule(fails);
      });
    }

    function schedule(failCount) {
      var delay = failCount > 0 ? util.backoffMs(failCount) : 20000 + Math.round(Math.random() * 10000);
      util.schedule('smartthings', refresh, delay);
    }

    function postCommands(id, commands) {
      if (!commands.length) {
        return Promise.resolve();
      }
      return request('/devices/' + encodeURIComponent(id) + '/commands', {
        method: 'POST',
        body: JSON.stringify({ commands: commands })
      });
    }

    exports.configured = function () {
      return configured(token());
    };

    exports.currentLock = function () {
      return lock;
    };

    exports.saveToken = function (value) {
      var next = trim(value);
      if (!next || cfgToken()) {
        return;
      }
      try {
        localStorage.setItem(STORE_KEY, next);
      } catch (err) {
        console.error('[smartthings]', err);
      }
      fails = 0;
      refresh();
    };

    exports.forgetToken = function () {
      try {
        localStorage.removeItem(STORE_KEY);
      } catch (err) {
        console.error('[smartthings]', err);
      }
      lock = null;
      tellHue(null, '');
      tellDoor();
    };

    exports.setLight = function (id, on, percent) {
      return postCommands(id, lightCommands(on, percent));
    };

    exports.refresh = refresh;

    exports.init = function () {
      if (sampleOn() || !configured(token())) {
        return;
      }
      refresh();
    };

    KH.smartthings = exports;
  }

  if (typeof window !== 'undefined' && window.document) {
    attachBrowserApi();
  }
})(typeof module !== 'undefined' && module.exports
  ? module.exports
  : ((window.KH = window.KH || {}).smartthings = (window.KH && window.KH.smartthings) || {}));

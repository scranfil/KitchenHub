const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const doors = require('../js/doors.js');
const climate = require('../js/climate.js');
const lights = require('../js/lights.js');
const { createServer } = require('../tools/kitchen-server.js');

const TOKEN = 'ha-test-token-not-real';
const ROOT = path.join(__dirname, '..');

function listen(server) {
  return new Promise(function (resolve) {
    server.listen(0, '127.0.0.1', function () {
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise(function (resolve) {
    server.close(function () {
      resolve();
    });
  });
}

function request(port, method, reqPath) {
  return new Promise(function (resolve, reject) {
    var req = http.request({
      host: '127.0.0.1',
      port: port,
      method: method,
      path: reqPath
    }, function (res) {
      var chunks = [];
      res.on('data', function (chunk) {
        chunks.push(chunk);
      });
      res.on('end', function () {
        resolve({
          status: res.statusCode,
          body: Buffer.concat(chunks).toString('utf8')
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

test('home assistant state is read server-side and the token stays there', async function () {
  var seen = [];
  var ha = http.createServer(function (req, res) {
    var chunks = [];
    req.on('data', function (chunk) {
      chunks.push(chunk);
    });
    req.on('end', function () {
      seen.push({
        method: req.method,
        url: req.url,
        authorization: req.headers.authorization || '',
        body: Buffer.concat(chunks).toString('utf8')
      });
      var state = 'open';
      if (req.url.indexOf('cover.garage_door') === -1) {
        state = 'closed';
      }
      if (req.url.indexOf('cover.missing') !== -1) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ state: 'unavailable', attributes: { token: TOKEN } }));
        return;
      }
      if (req.url.indexOf('cover.denied') !== -1) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: TOKEN }));
        return;
      }
      if (req.url.indexOf('climate.hallway') !== -1) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          state: 'heat',
          attributes: {
            current_temperature: 70.4,
            temperature: 68,
            hvac_action: 'heating',
            temperature_unit: '°F',
            friendly_name: 'Hallway',
            token: TOKEN
          }
        }));
        return;
      }
      if (req.url.indexOf('light.kitchen_kitchen') !== -1) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          state: 'on',
          attributes: {
            friendly_name: 'Kitchen',
            brightness: 255,
            is_hue_group: true,
            token: TOKEN
          }
        }));
        return;
      }
      if (req.url.indexOf('light.office_office') !== -1) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          state: 'unavailable',
          attributes: { friendly_name: 'Office', token: TOKEN }
        }));
        return;
      }
      if (req.url.indexOf('binary_sensor.kitchen_sliding_door') !== -1) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          state: 'on',
          attributes: {
            device_class: 'opening',
            friendly_name: 'Kitchen Sliding Door',
            token: TOKEN
          }
        }));
        return;
      }
      if (req.url.indexOf('binary_sensor.basement_door') !== -1) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          state: 'unavailable',
          attributes: { device_class: 'opening', friendly_name: 'Basement Door', token: TOKEN }
        }));
        return;
      }
      if (req.url.indexOf('lock.entryway_entryway_lock') !== -1) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          state: 'locked',
          attributes: { friendly_name: 'Entryway Lock', token: TOKEN }
        }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        state: state,
        attributes: { friendly_name: 'Garage', token: TOKEN }
      }));
    });
  });
  var haPort = await listen(ha);
  var haPath = path.join(os.tmpdir(), 'kh-ha-' + process.pid + '.json');
  fs.writeFileSync(haPath, JSON.stringify({
    url: 'http://127.0.0.1:' + haPort,
    token: TOKEN
  }));
  var secretFile = path.join(ROOT, 'homeassistant.json');
  fs.writeFileSync(secretFile, JSON.stringify({ url: 'http://127.0.0.1', token: TOKEN }));
  var site = createServer({ haPath: haPath });
  var sitePort = await listen(site);
  try {
    var missingCfg = createServer({ haPath: path.join(os.tmpdir(), 'kh-ha-missing-' + process.pid + '.json') });
    var missingPort = await listen(missingCfg);
    var absent = await request(missingPort, 'GET', '/homeassistant/state?entity=cover.garage_door');
    assert.equal(absent.status, 200);
    assert.deepEqual(JSON.parse(absent.body), { connected: false });
    assert.equal(absent.body.indexOf(TOKEN), -1);
    await close(missingCfg);

    var bad = await request(sitePort, 'GET', '/homeassistant/state?entity=cover/../../etc');
    assert.equal(bad.status, 400);
    assert.equal(seen.length, 0);

    var open = await request(sitePort, 'GET', '/homeassistant/state?entity=cover.garage_door&token=leaked');
    assert.equal(open.status, 200);
    var openBody = JSON.parse(open.body);
    assert.deepEqual(openBody, { connected: true, known: true, state: 'open' });
    assert.equal(open.body.indexOf(TOKEN), -1);
    assert.equal(open.body.indexOf('leaked'), -1);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].method, 'GET');
    assert.equal(seen[0].url, '/api/states/cover.garage_door');
    assert.equal(seen[0].authorization, 'Bearer ' + TOKEN);
    assert.equal(seen[0].body, '');
    var openView = doors.resolveDoor({
      name: 'Garage door (main)',
      kind: 'garage',
      source: 'homeassistant',
      entityId: 'cover.garage_door'
    }, { connected: true, known: true, value: openBody.state });
    assert.equal(openView.label, 'Open');
    assert.equal(openView.attention, true);

    var thermo = await request(sitePort, 'GET', '/homeassistant/state?entity=climate.hallway');
    var thermoBody = JSON.parse(thermo.body);
    assert.equal(thermoBody.state, 'heat');
    assert.equal(thermoBody.current_temperature, 70.4);
    assert.equal(thermoBody.temperature, 68);
    assert.equal(thermoBody.hvac_action, 'heating');
    assert.equal(thermoBody.name, 'Hallway');
    assert.equal(thermo.body.indexOf(TOKEN), -1);
    var thermoView = climate.climateView(thermoBody);
    assert.equal(thermoView.ambient, 70);
    assert.equal(thermoView.line, 'Heat · Heating');
    assert.equal(thermoView.setpoint, 'Heat to 68°');

    var kitchen = await request(sitePort, 'GET', '/homeassistant/state?entity=light.kitchen_kitchen');
    var kitchenBody = JSON.parse(kitchen.body);
    assert.deepEqual(kitchenBody, {
      connected: true,
      known: true,
      state: 'on',
      brightness: 255,
      name: 'Kitchen'
    });
    assert.equal(kitchen.body.indexOf(TOKEN), -1);
    assert.equal(kitchen.body.indexOf('is_hue_group'), -1);
    var kitchenView = lights.lightView('light.kitchen_kitchen', kitchenBody);
    assert.equal(kitchenView.label, 'On');
    assert.equal(kitchenView.percent, 100);
    assert.equal(kitchenView.name, 'Kitchen');

    var office = await request(sitePort, 'GET', '/homeassistant/state?entity=light.office_office');
    assert.deepEqual(JSON.parse(office.body), { connected: true, known: false, name: 'Office' });
    assert.equal(office.body.indexOf(TOKEN), -1);
    var officeView = lights.lightView('light.office_office', JSON.parse(office.body));
    assert.equal(officeView.label, 'Unknown');
    assert.equal(officeView.name, 'Office');
    assert.equal(officeView.on, false);

    var lock = await request(sitePort, 'GET', '/homeassistant/state?entity=lock.entryway_entryway_lock');
    assert.deepEqual(JSON.parse(lock.body), { connected: true, known: true, state: 'locked' });
    assert.equal(lock.body.indexOf(TOKEN), -1);
    assert.equal(lock.body.indexOf('Entryway'), -1);
    var lockView = doors.resolveDoor({
      name: 'Front Door',
      kind: 'lock',
      source: 'homeassistant',
      entityId: 'lock.entryway_entryway_lock'
    }, { connected: true, known: true, value: JSON.parse(lock.body).state });
    assert.equal(lockView.label, 'Locked');
    assert.equal(lockView.attention, false);

    var sliding = await request(sitePort, 'GET', '/homeassistant/state?entity=binary_sensor.kitchen_sliding_door');
    var slidingBody = JSON.parse(sliding.body);
    assert.deepEqual(slidingBody, { connected: true, known: true, state: 'on' });
    assert.equal(sliding.body.indexOf(TOKEN), -1);
    assert.equal(sliding.body.indexOf('Kitchen Sliding Door'), -1);
    assert.equal(sliding.body.indexOf('device_class'), -1);
    var slidingView = doors.resolveDoor({
      name: 'Kitchen Door',
      kind: 'contact',
      source: 'homeassistant',
      entityId: 'binary_sensor.kitchen_sliding_door'
    }, { connected: true, known: true, value: slidingBody.state });
    assert.equal(slidingView.label, 'Open');
    assert.equal(slidingView.attention, true);

    var basement = await request(sitePort, 'GET', '/homeassistant/state?entity=binary_sensor.basement_door');
    assert.deepEqual(JSON.parse(basement.body), { connected: true, known: false });
    assert.equal(basement.body.indexOf(TOKEN), -1);
    assert.equal(basement.body.indexOf('Basement Door'), -1);
    var basementView = doors.resolveDoor({
      name: 'Basement Door',
      kind: 'contact',
      source: 'homeassistant',
      entityId: 'binary_sensor.basement_door'
    }, JSON.parse(basement.body));
    assert.equal(basementView.label, 'Unknown');
    assert.equal(basementView.attention, false);

    var unavailable = await request(sitePort, 'GET', '/homeassistant/state?entity=cover.missing');
    assert.deepEqual(JSON.parse(unavailable.body), { connected: true, known: false });
    assert.equal(unavailable.body.indexOf(TOKEN), -1);

    var denied = await request(sitePort, 'GET', '/homeassistant/state?entity=cover.denied');
    assert.deepEqual(JSON.parse(denied.body), { connected: true, known: false });
    assert.equal(denied.body.indexOf(TOKEN), -1);

    var hidden = await request(sitePort, 'GET', '/homeassistant.json');
    assert.equal(hidden.status, 404);
    assert.equal(hidden.body.indexOf(TOKEN), -1);
  } finally {
    await close(site);
    await close(ha);
    fs.unlinkSync(haPath);
    fs.unlinkSync(secretFile);
  }
});

test('a configured home assistant that cannot be reached is unknown', async function () {
  var haPath = path.join(os.tmpdir(), 'kh-ha-down-' + process.pid + '.json');
  fs.writeFileSync(haPath, JSON.stringify({
    url: 'http://127.0.0.1:9',
    token: TOKEN
  }));
  var site = createServer({ haPath: haPath });
  var port = await listen(site);
  try {
    var res = await request(port, 'GET', '/homeassistant/state?entity=cover.garage_door');
    assert.equal(res.status, 200);
    assert.deepEqual(JSON.parse(res.body), { connected: true, known: false });
    assert.equal(res.body.indexOf(TOKEN), -1);
    var view = doors.resolveDoor({
      name: 'Garage door (main)',
      kind: 'garage',
      source: 'homeassistant',
      entityId: 'cover.garage_door'
    }, JSON.parse(res.body));
    assert.equal(view.label, 'Unknown');
    assert.equal(view.attention, false);
  } finally {
    await close(site);
    fs.unlinkSync(haPath);
  }
});

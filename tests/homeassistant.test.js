const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const doors = require('../js/doors.js');
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

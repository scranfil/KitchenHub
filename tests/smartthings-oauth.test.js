const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const oauth = require('../tools/smartthings-oauth.js');
const { createServer } = require('../tools/kitchen-server.js');

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

function request(port, method, reqPath, body, headers) {
  return new Promise(function (resolve, reject) {
    var req = http.request({
      host: '127.0.0.1',
      port: port,
      method: method,
      path: reqPath,
      headers: headers || {}
    }, function (res) {
      var chunks = [];
      res.on('data', function (chunk) {
        chunks.push(chunk);
      });
      res.on('end', function () {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8')
        });
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

test('refresh runs only when the access token is missing or near expiry', function () {
  var now = 1_700_000_000_000;
  var base = {
    clientId: 'id',
    clientSecret: 'secret',
    refreshToken: 'refresh-old',
    accessToken: 'access-old',
    expiresAt: now + 10 * 60 * 1000
  };
  assert.equal(oauth.needsRefresh(base, now, 60_000), false);
  assert.equal(oauth.needsRefresh(base, base.expiresAt - 30_000, 60_000), true);
  assert.equal(oauth.needsRefresh({
    clientId: 'id',
    clientSecret: 'secret',
    refreshToken: 'refresh-old',
    accessToken: '',
    expiresAt: 0
  }, now, 60_000), true);
  assert.equal(oauth.needsRefresh({
    clientId: 'id',
    clientSecret: 'secret',
    refreshToken: '',
    accessToken: '',
    expiresAt: 0
  }, now, 60_000), false);
});

test('a rotated refresh token replaces the stored one', function () {
  var now = 1_700_000_000_000;
  var next = oauth.applyTokenResponse({
    clientId: 'id',
    clientSecret: 'secret',
    redirectUri: 'http://127.0.0.1:8080/smartthings/callback',
    refreshToken: 'refresh-old',
    accessToken: 'access-old',
    expiresAt: now
  }, {
    access_token: 'access-new',
    refresh_token: 'refresh-new',
    expires_in: 3600
  }, now);
  assert.equal(next.accessToken, 'access-new');
  assert.equal(next.refreshToken, 'refresh-new');
  assert.equal(next.expiresAt, now + 3600 * 1000);
  assert.equal(next.clientSecret, 'secret');
  var kept = oauth.applyTokenResponse(next, { access_token: 'access-2', expires_in: 10 }, now);
  assert.equal(kept.refreshToken, 'refresh-new');
});

test('the connect page and authorize URL do not carry the client secret', function () {
  var page = oauth.connectPage({
    message: 'Ready',
    redirectUri: 'http://127.0.0.1:8080/smartthings/callback',
    hasClient: true,
    hasSecret: true,
    connected: false,
    clientId: 'client-id'
  });
  assert.match(page, /Connect SmartThings/);
  assert.match(page, /http:\/\/127\.0\.0\.1:8080\/smartthings\/callback/);
  assert.equal(page.indexOf('client-secret'), -1);
  var location = oauth.authorizeUrl({
    clientId: 'client-id',
    redirectUri: 'http://127.0.0.1:8080/smartthings/callback',
    state: 'abc'
  });
  assert.match(location, /client_id=client-id/);
  assert.match(location, /scope=r%3Adevices%3A\*/);
  assert.equal(location.indexOf('secret'), -1);
  assert.equal(oauth.isAllowedApiPath('devices/abc/commands'), true);
  assert.equal(oauth.isAllowedApiPath('oauth/token'), false);
  assert.equal(oauth.isAllowedApiPath('../smartthings/connect'), false);
});

test('the proxy refreshes an expired token and hides the secret', async function () {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-st-'));
  var oauthPath = path.join(dir, 'smartthings.oauth.json');
  var seen = [];
  var fake = http.createServer(function (req, res) {
    var chunks = [];
    req.on('data', function (chunk) {
      chunks.push(chunk);
    });
    req.on('end', function () {
      var body = Buffer.concat(chunks).toString('utf8');
      seen.push({ method: req.method, url: req.url, auth: req.headers.authorization || '', body: body });
      res.setHeader('Content-Type', 'application/json');
      if (req.url.indexOf('/v1/oauth/token') === 0) {
        res.end(JSON.stringify({
          access_token: 'access-live',
          refresh_token: 'refresh-live',
          expires_in: 3600
        }));
        return;
      }
      res.end(JSON.stringify({ items: [{ deviceId: 'hue-1', label: 'Island' }] }));
    });
  });
  var fakePort = await listen(fake);
  fs.writeFileSync(oauthPath, JSON.stringify({
    clientId: 'client-id',
    clientSecret: 'do-not-leak',
    redirectUri: 'http://127.0.0.1:8080/smartthings/callback',
    refreshToken: 'refresh-old',
    accessToken: 'access-old',
    expiresAt: Date.now() - 1000
  }));
  var site = createServer({
    oauthPath: oauthPath,
    apiOrigin: 'http://127.0.0.1:' + fakePort
  });
  var sitePort = await listen(site);
  try {
    var status = await request(sitePort, 'GET', '/smartthings/status');
    assert.equal(status.status, 200);
    assert.equal(JSON.parse(status.body).connected, true);
    assert.equal(status.body.indexOf('do-not-leak'), -1);

    var page = await request(sitePort, 'GET', '/smartthings/connect');
    assert.equal(page.status, 200);
    assert.match(page.body, /Connect SmartThings/);
    assert.match(page.body, /smartthings\/callback/);
    assert.equal(page.body.indexOf('do-not-leak'), -1);
    assert.equal(page.body.indexOf('refresh-old'), -1);

    var devices = await request(sitePort, 'GET', '/smartthings/api/devices');
    assert.equal(devices.status, 200);
    assert.match(devices.body, /Island/);
    assert.equal(devices.body.indexOf('do-not-leak'), -1);
    assert.equal(seen[0].url.indexOf('/v1/oauth/token'), 0);
    assert.match(seen[0].auth, /^Basic /);
    assert.match(seen[0].body, /grant_type=refresh_token/);
    assert.match(seen[0].body, /refresh-old/);
    assert.equal(seen[0].body.indexOf('do-not-leak'), -1);
    assert.equal(seen[1].method, 'GET');
    assert.equal(seen[1].auth, 'Bearer access-live');

    var stored = JSON.parse(fs.readFileSync(oauthPath, 'utf8'));
    assert.equal(stored.refreshToken, 'refresh-live');
    assert.equal(stored.accessToken, 'access-live');
    assert.equal(stored.clientSecret, 'do-not-leak');

    var blocked = await request(sitePort, 'GET', '/smartthings/api/oauth/token');
    assert.equal(blocked.status, 403);
  } finally {
    await close(site);
    await close(fake);
  }
});

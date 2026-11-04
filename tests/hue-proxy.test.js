const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
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

function request(port, method, path, body) {
  return new Promise(function (resolve, reject) {
    var req = http.request({
      host: '127.0.0.1',
      port: port,
      method: method,
      path: path,
      headers: body ? { 'Content-Type': 'application/json' } : {}
    }, function (res) {
      var chunks = [];
      res.on('data', function (chunk) {
        chunks.push(chunk);
      });
      res.on('end', function () {
        resolve({
          status: res.statusCode,
          type: res.headers['content-type'] || '',
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

test('home server serves the dashboard and proxies only private bridges', async function () {
  var bridgeHits = [];
  var bridge = http.createServer(function (req, res) {
    var chunks = [];
    req.on('data', function (chunk) {
      chunks.push(chunk);
    });
    req.on('end', function () {
      bridgeHits.push({ method: req.method, url: req.url, body: Buffer.concat(chunks).toString('utf8') });
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'POST' && req.url === '/api') {
        res.end(JSON.stringify([{ success: { username: 'paired-key' } }]));
        return;
      }
      res.end(JSON.stringify({ '1': { name: 'Island', state: { on: true, bri: 127, reachable: true } } }));
    });
  });
  var site = createServer();
  var bridgePort = await listen(bridge);
  var sitePort = await listen(site);
  try {
    var home = await request(sitePort, 'GET', '/', null);
    assert.equal(home.status, 200);
    assert.match(home.body, /Kitchen Hub/);

    var paired = await request(
      sitePort,
      'POST',
      '/hue-proxy/127.0.0.1:' + bridgePort + '/api',
      JSON.stringify({ devicetype: 'kitchenhub#tablet' })
    );
    assert.equal(paired.status, 200);
    assert.match(paired.body, /paired-key/);
    assert.equal(bridgeHits[0].method, 'POST');
    assert.equal(bridgeHits[0].url, '/api');

    var blocked = await request(sitePort, 'GET', '/hue-proxy/8.8.8.8/api', null);
    assert.equal(blocked.status, 403);

    var outside = await request(sitePort, 'GET', '/hue-proxy/192.168.1.20/debug/clip.html', null);
    assert.equal(outside.status, 403);

    var found = await request(sitePort, 'GET', '/hue-discovery', null);
    assert.equal(found.status, 200);
    assert.match(found.type, /json/);
    assert.equal(Array.isArray(JSON.parse(found.body)), true);
  } finally {
    await close(site);
    await close(bridge);
  }
});

'use strict';

// Static host for Kitchen Hub plus a same-LAN door to the Hue bridge.
// The bridge does not send CORS headers, and a public site cannot call a
// private address, so the tablet reaches it through this process instead.

var http = require('http');
var https = require('https');
var fs = require('fs');
var path = require('path');
var url = require('url');
var hue = require('../js/hue.js');

var PORT = Number(process.env.PORT) || 8080;
var ROOT = path.join(__dirname, '..');
var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function safeFile(requestPath) {
  var decoded;
  try {
    decoded = decodeURIComponent(requestPath.split('?')[0]);
  } catch (err) {
    return null;
  }
  if (!decoded || decoded.indexOf('\0') !== -1) {
    return null;
  }
  var full = path.normalize(path.join(ROOT, decoded));
  var rootWithSep = ROOT.charAt(ROOT.length - 1) === path.sep ? ROOT : ROOT + path.sep;
  if (full !== ROOT && full.indexOf(rootWithSep) !== 0) {
    return null;
  }
  return full;
}

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  if (body == null) {
    res.end();
    return;
  }
  res.end(body);
}

function readBody(req, limit) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    var size = 0;
    req.on('data', function (chunk) {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('too big'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', function () {
      resolve(Buffer.concat(chunks));
    });
    req.on('error', reject);
  });
}

function discoverBridges() {
  return new Promise(function (resolve) {
    var req = https.get('https://discovery.meethue.com/', { timeout: 8000 }, function (res) {
      var chunks = [];
      res.on('data', function (chunk) {
        chunks.push(chunk);
      });
      res.on('end', function () {
        try {
          var data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve(Array.isArray(data) ? data : []);
        } catch (err) {
          resolve([]);
        }
      });
    });
    req.on('timeout', function () {
      req.destroy();
      resolve([]);
    });
    req.on('error', function () {
      resolve([]);
    });
  });
}

function forward(req, res, target, body) {
  var headers = { Host: target.host, Accept: 'application/json' };
  if (req.headers['content-type']) {
    headers['Content-Type'] = req.headers['content-type'];
  }
  var outbound = http.request({
    host: target.host,
    port: target.port,
    path: target.path,
    method: req.method,
    headers: headers,
    timeout: 8000
  }, function (upstream) {
    var chunks = [];
    upstream.on('data', function (chunk) {
      chunks.push(chunk);
    });
    upstream.on('end', function () {
      var payload = Buffer.concat(chunks);
      var type = upstream.headers['content-type'] || 'application/json; charset=utf-8';
      send(res, upstream.statusCode || 502, {
        'Content-Type': type,
        'Cache-Control': 'no-store',
        'Content-Length': payload.length
      }, payload);
    });
  });
  outbound.on('timeout', function () {
    outbound.destroy();
    send(res, 504, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Bridge timed out');
  });
  outbound.on('error', function () {
    send(res, 502, { 'Content-Type': 'text/plain; charset=utf-8' }, "Can't reach the bridge");
  });
  if (body && body.length) {
    outbound.write(body);
  }
  outbound.end();
}

function serveStatic(req, res, pathname) {
  var rel = pathname === '/' ? '/index.html' : pathname;
  var file = safeFile(rel);
  if (!file) {
    send(res, 403, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Forbidden');
    return;
  }
  fs.stat(file, function (err, stat) {
    if (err || !stat.isFile()) {
      send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Not found');
      return;
    }
    var ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(file).pipe(res);
  });
}

function onRequest(req, res) {
  var parsed = url.parse(req.url || '/');
  var pathname = parsed.pathname || '/';
  try {
    pathname = decodeURIComponent(pathname);
  } catch (err) {
    send(res, 400, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Bad path');
    return;
  }
  if (pathname === '/hue-discovery') {
    discoverBridges().then(function (list) {
      var body = JSON.stringify(list);
      send(res, 200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Length': Buffer.byteLength(body)
      }, body);
    });
    return;
  }
  if (pathname.indexOf('/hue-proxy/') === 0) {
    if (req.method === 'OPTIONS') {
      send(res, 204, { 'Cache-Control': 'no-store' }, null);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'PUT') {
      send(res, 405, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Method not allowed');
      return;
    }
    var rest = pathname.slice('/hue-proxy/'.length);
    var slash = rest.indexOf('/');
    var hostToken = slash === -1 ? rest : rest.slice(0, slash);
    var tail = slash === -1 ? '/' : rest.slice(slash);
    var target = hue.proxyTarget(hostToken, tail);
    if (!target) {
      send(res, 403, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Bridge address not allowed');
      return;
    }
    readBody(req, 1000000).then(function (body) {
      forward(req, res, target, body);
    }).catch(function () {
      send(res, 413, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Body too large');
    });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Method not allowed');
    return;
  }
  serveStatic(req, res, pathname);
}

function createServer() {
  return http.createServer(onRequest);
}

if (require.main === module) {
  createServer().listen(PORT, function () {
    console.log('Kitchen Hub at http://localhost:' + PORT);
  });
}

module.exports = {
  createServer: createServer,
  safeFile: safeFile
};

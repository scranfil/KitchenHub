'use strict';

// Static host for Kitchen Hub, a same-LAN door to the Hue bridge, and a
// Home Assistant state read. The bridge does not send CORS headers, and a
// public site cannot call a private address, so the tablet reaches it
// through this process instead. The Home Assistant URL and token stay in
// gitignored homeassistant.json and are never sent to the browser.

var http = require('http');
var https = require('https');
var fs = require('fs');
var path = require('path');
var url = require('url');
var crypto = require('crypto');
var hue = require('../js/hue.js');
var doorState = require('../js/doors.js');
var oauth = require('./smartthings-oauth.js');

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
  if (path.basename(file) === 'homeassistant.json') {
    send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Not found');
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

function emptyOauth() {
  return {
    clientId: '',
    clientSecret: '',
    redirectUri: '',
    refreshToken: '',
    accessToken: '',
    expiresAt: 0
  };
}

function readOauth(file) {
  try {
    var parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object') {
      return emptyOauth();
    }
    var record = emptyOauth();
    var keys = Object.keys(record);
    var i;
    for (i = 0; i < keys.length; i++) {
      if (parsed[keys[i]] != null) {
        record[keys[i]] = parsed[keys[i]];
      }
    }
    return record;
  } catch (err) {
    return emptyOauth();
  }
}

function writeOauth(file, record) {
  var dir = path.dirname(file);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + '\n', { mode: 0o600 });
}

function redirectUriFor(req) {
  var host = req.headers.host || '127.0.0.1:8080';
  return 'http://' + host + '/smartthings/callback';
}

function formFields(body) {
  var out = {};
  var text = body ? body.toString('utf8') : '';
  var parts = text.split('&');
  var i;
  for (i = 0; i < parts.length; i++) {
    if (!parts[i]) {
      continue;
    }
    var eq = parts[i].indexOf('=');
    var key = decodeURIComponent(eq === -1 ? parts[i] : parts[i].slice(0, eq));
    var val = decodeURIComponent((eq === -1 ? '' : parts[i].slice(eq + 1)).replace(/\+/g, ' '));
    out[key] = val;
  }
  return out;
}

function jsonSend(res, status, data) {
  var body = JSON.stringify(data);
  send(res, status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  }, body);
}

function postToken(apiOrigin, record, fields) {
  return oauth.apiRequest(apiOrigin, {
    method: 'POST',
    path: '/v1/oauth/token',
    body: oauth.tokenForm(fields),
    headers: {
      Authorization: oauth.basicHeader(record.clientId, record.clientSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    }
  }).then(function (result) {
    var data = {};
    try {
      data = JSON.parse(result.body.toString('utf8'));
    } catch (err) {
      data = {};
    }
    if (result.status < 200 || result.status >= 300 || !data.access_token) {
      var error = new Error('token HTTP ' + result.status);
      error.status = result.status;
      throw error;
    }
    return data;
  });
}

function ensureAccess(ctx) {
  var record = readOauth(ctx.oauthPath);
  if (!oauth.needsRefresh(record, Date.now(), oauth.REFRESH_SKEW_MS)) {
    if (!record.accessToken || !record.refreshToken) {
      return Promise.reject(new Error('not connected'));
    }
    return Promise.resolve(record);
  }
  if (ctx.refreshing) {
    return ctx.refreshing;
  }
  ctx.refreshing = postToken(ctx.apiOrigin, record, {
    grant_type: 'refresh_token',
    refresh_token: record.refreshToken,
    client_id: record.clientId
  }).then(function (data) {
    var next = oauth.applyTokenResponse(record, data, Date.now());
    writeOauth(ctx.oauthPath, next);
    ctx.refreshing = null;
    return next;
  }, function (err) {
    ctx.refreshing = null;
    throw err;
  });
  return ctx.refreshing;
}

function handleSmartThings(req, res, ctx, pathname, parsed) {
  if (pathname === '/smartthings/status' && req.method === 'GET') {
    var record = readOauth(ctx.oauthPath);
    jsonSend(res, 200, {
      connected: !!(record.refreshToken && record.clientId && record.clientSecret)
    });
    return true;
  }
  if (pathname === '/smartthings/connect' && req.method === 'GET') {
    var saved = readOauth(ctx.oauthPath);
    var message = parsed.query && parsed.query.connected ? 'SmartThings is connected.' : '';
    var html = oauth.connectPage({
      message: message,
      redirectUri: redirectUriFor(req),
      hasClient: !!saved.clientId,
      hasSecret: !!saved.clientSecret,
      connected: !!(saved.refreshToken && saved.clientId),
      clientId: saved.clientId
    });
    send(res, 200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store'
    }, html);
    return true;
  }
  if (pathname === '/smartthings/connect' && req.method === 'POST') {
    readBody(req, 100000).then(function (body) {
      var fields = formFields(body);
      var current = readOauth(ctx.oauthPath);
      var clientId = String(fields.clientId || '').replace(/^\s+|\s+$/g, '');
      var clientSecret = String(fields.clientSecret || '').replace(/^\s+|\s+$/g, '');
      if (!clientId || (!clientSecret && !current.clientSecret)) {
        var html = oauth.connectPage({
          message: 'Enter the OAuth client id and secret from the SmartThings app.',
          redirectUri: redirectUriFor(req),
          hasClient: !!current.clientId,
          hasSecret: !!current.clientSecret,
          connected: false,
          clientId: clientId || current.clientId
        });
        send(res, 400, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }, html);
        return;
      }
      current.clientId = clientId;
      if (clientSecret) {
        current.clientSecret = clientSecret;
      }
      current.redirectUri = redirectUriFor(req);
      writeOauth(ctx.oauthPath, current);
      var state = crypto.randomBytes(16).toString('hex');
      ctx.states[state] = Date.now();
      res.writeHead(302, {
        Location: oauth.authorizeUrl({
          clientId: current.clientId,
          redirectUri: current.redirectUri,
          state: state
        }),
        'Cache-Control': 'no-store'
      });
      res.end();
    }).catch(function () {
      send(res, 400, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Bad form');
    });
    return true;
  }
  if (pathname === '/smartthings/callback' && req.method === 'GET') {
    var query = parsed.query || {};
    var pending = ctx.states[query.state];
    delete ctx.states[query.state];
    if (!query.code || !pending || Date.now() - pending > 10 * 60 * 1000) {
      send(res, 400, { 'Content-Type': 'text/plain; charset=utf-8' }, 'SmartThings did not connect. Start again from /smartthings/connect.');
      return true;
    }
    var saved = readOauth(ctx.oauthPath);
    postToken(ctx.apiOrigin, saved, {
      grant_type: 'authorization_code',
      code: query.code,
      client_id: saved.clientId,
      redirect_uri: saved.redirectUri || redirectUriFor(req)
    }).then(function (data) {
      writeOauth(ctx.oauthPath, oauth.applyTokenResponse(saved, data, Date.now()));
      res.writeHead(302, { Location: '/smartthings/connect?connected=1', 'Cache-Control': 'no-store' });
      res.end();
    }).catch(function () {
      send(res, 502, { 'Content-Type': 'text/plain; charset=utf-8' }, 'SmartThings did not return a token. Check the client id, secret, and redirect URI.');
    });
    return true;
  }
  if (pathname.indexOf('/smartthings/api/') === 0) {
    var subpath = pathname.slice('/smartthings/api/'.length) + (parsed.search || '');
    if (!oauth.isAllowedApiPath(subpath)) {
      send(res, 403, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Path not allowed');
      return true;
    }
    if (req.method !== 'GET' && req.method !== 'POST') {
      send(res, 405, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Method not allowed');
      return true;
    }
    readBody(req, 1000000).then(function (body) {
      return ensureAccess(ctx).then(function (record) {
        var headers = {
          Authorization: 'Bearer ' + record.accessToken,
          Accept: 'application/json'
        };
        if (req.method === 'POST') {
          headers['Content-Type'] = req.headers['content-type'] || 'application/json';
        }
        return oauth.apiRequest(ctx.apiOrigin, {
          method: req.method,
          path: '/v1/' + subpath,
          body: req.method === 'POST' ? body.toString('utf8') : null,
          headers: headers
        });
      });
    }).then(function (result) {
      send(res, result.status, {
        'Content-Type': result.type,
        'Cache-Control': 'no-store'
      }, result.body);
    }).catch(function () {
      jsonSend(res, 401, { error: 'SmartThings is not connected. Open /smartthings/connect.' });
    });
    return true;
  }
  return false;
}

function readHaFile(file) {
  try {
    var parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object') {
      return { url: '', token: '' };
    }
    return {
      url: String(parsed.url || '').replace(/^\s+|\s+$/g, ''),
      token: String(parsed.token || '').replace(/^\s+|\s+$/g, '')
    };
  } catch (err) {
    return { url: '', token: '' };
  }
}

function requestAbsolute(targetUrl, headers) {
  return new Promise(function (resolve, reject) {
    var parsed = url.parse(targetUrl);
    var lib = parsed.protocol === 'https:' ? https : http;
    var req = lib.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.path,
      method: 'GET',
      headers: headers,
      timeout: 8000
    }, function (upstream) {
      var chunks = [];
      upstream.on('data', function (chunk) {
        chunks.push(chunk);
      });
      upstream.on('end', function () {
        resolve({ status: upstream.statusCode || 0, body: Buffer.concat(chunks) });
      });
    });
    req.on('timeout', function () {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.on('error', reject);
    req.end();
  });
}

function handleHomeAssistant(req, res, ctx, pathname, parsed) {
  if (pathname !== '/homeassistant/state') {
    return false;
  }
  if (req.method !== 'GET') {
    send(res, 405, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Method not allowed');
    return true;
  }
  var entity = parsed.query && typeof parsed.query.entity === 'string' ? parsed.query.entity : '';
  if (!doorState.entityIdOk(entity)) {
    jsonSend(res, 400, { connected: false });
    return true;
  }
  var cfg = readHaFile(ctx.haPath);
  var target = cfg.url && cfg.token ? doorState.haStateUrl(cfg.url, entity) : '';
  if (!target) {
    jsonSend(res, 200, { connected: false });
    return true;
  }
  requestAbsolute(target, {
    Authorization: 'Bearer ' + cfg.token,
    Accept: 'application/json'
  }).then(function (result) {
    var data = null;
    try {
      data = JSON.parse(result.body.toString('utf8'));
    } catch (err) {
      data = null;
    }
    if (result.status < 200 || result.status >= 300) {
      jsonSend(res, 200, { connected: true, known: false });
      return;
    }
    var reading = doorState.haReading(data);
    if (!reading.known) {
      jsonSend(res, 200, { connected: true, known: false });
      return;
    }
    var payload = { connected: true, known: true, state: reading.value };
    var extras = doorState.haClimateExtras(entity, data);
    if (extras) {
      var extraKeys = Object.keys(extras);
      var index;
      for (index = 0; index < extraKeys.length; index++) {
        if (extras[extraKeys[index]] != null && extras[extraKeys[index]] !== '') {
          payload[extraKeys[index]] = extras[extraKeys[index]];
        }
      }
    }
    jsonSend(res, 200, payload);
  }).catch(function () {
    jsonSend(res, 200, { connected: true, known: false });
  });
  return true;
}

function onRequest(req, res, ctx) {
  var parsed = url.parse(req.url || '/', true);
  var pathname = parsed.pathname || '/';
  try {
    pathname = decodeURIComponent(pathname);
  } catch (err) {
    send(res, 400, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Bad path');
    return;
  }
  if (handleSmartThings(req, res, ctx, pathname, parsed)) {
    return;
  }
  if (handleHomeAssistant(req, res, ctx, pathname, parsed)) {
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

function createServer(options) {
  options = options || {};
  var ctx = {
    oauthPath: options.oauthPath || process.env.ST_OAUTH_PATH || path.join(ROOT, 'smartthings.oauth.json'),
    haPath: options.haPath || process.env.HA_CONFIG_PATH || path.join(ROOT, 'homeassistant.json'),
    apiOrigin: options.apiOrigin || process.env.ST_API_ORIGIN || 'https://api.smartthings.com',
    states: {},
    refreshing: null
  };
  return http.createServer(function (req, res) {
    onRequest(req, res, ctx);
  });
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

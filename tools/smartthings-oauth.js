'use strict';

var http = require('http');
var https = require('https');
var url = require('url');

var SCOPES = 'r:devices:* x:devices:* r:locations:*';
var AUTHORIZE = 'https://api.smartthings.com/v1/oauth/authorize';
var REFRESH_SKEW_MS = 60000;

function trim(value) {
  return String(value == null ? '' : value).replace(/^\s+|\s+$/g, '');
}

function needsRefresh(record, nowMs, skewMs) {
  if (!record || !trim(record.refreshToken) || !trim(record.clientId) || !trim(record.clientSecret)) {
    return false;
  }
  if (!trim(record.accessToken)) {
    return true;
  }
  var exp = Number(record.expiresAt);
  if (!exp) {
    return true;
  }
  var skew = skewMs == null ? REFRESH_SKEW_MS : skewMs;
  return nowMs >= exp - skew;
}

function applyTokenResponse(record, body, nowMs) {
  var next = {
    clientId: record && record.clientId || '',
    clientSecret: record && record.clientSecret || '',
    redirectUri: record && record.redirectUri || '',
    refreshToken: record && record.refreshToken || '',
    accessToken: '',
    expiresAt: 0
  };
  if (body && body.access_token) {
    next.accessToken = String(body.access_token);
  }
  if (body && body.refresh_token) {
    next.refreshToken = String(body.refresh_token);
  }
  var seconds = body && Number(body.expires_in);
  if (!seconds || isNaN(seconds)) {
    seconds = 86400;
  }
  next.expiresAt = nowMs + seconds * 1000;
  return next;
}

function authorizeUrl(opts) {
  opts = opts || {};
  return AUTHORIZE +
    '?client_id=' + encodeURIComponent(opts.clientId || '') +
    '&response_type=code' +
    '&redirect_uri=' + encodeURIComponent(opts.redirectUri || '') +
    '&scope=' + encodeURIComponent(SCOPES) +
    '&state=' + encodeURIComponent(opts.state || '');
}

function tokenForm(fields) {
  var keys = Object.keys(fields || {});
  var parts = [];
  var i;
  for (i = 0; i < keys.length; i++) {
    parts.push(encodeURIComponent(keys[i]) + '=' + encodeURIComponent(fields[keys[i]] == null ? '' : fields[keys[i]]));
  }
  return parts.join('&');
}

function basicHeader(clientId, clientSecret) {
  return 'Basic ' + Buffer.from(String(clientId || '') + ':' + String(clientSecret || '')).toString('base64');
}

function isAllowedApiPath(subpath) {
  var pathOnly = String(subpath || '').split('?')[0];
  if (!pathOnly || pathOnly.indexOf('..') !== -1 || pathOnly.indexOf('\\') !== -1) {
    return false;
  }
  if (pathOnly.charAt(0) === '/') {
    pathOnly = pathOnly.slice(1);
  }
  return pathOnly === 'devices' ||
    /^devices\/[A-Za-z0-9-]+$/.test(pathOnly) ||
    /^devices\/[A-Za-z0-9-]+\/status$/.test(pathOnly) ||
    /^devices\/[A-Za-z0-9-]+\/commands$/.test(pathOnly) ||
    pathOnly === 'locations' ||
    /^locations\/[A-Za-z0-9-]+\/rooms$/.test(pathOnly);
}

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function connectPage(opts) {
  opts = opts || {};
  var message = opts.message ? '<p>' + esc(opts.message) + '</p>' : '';
  var status = opts.connected ? 'Connected. The tablet can use this login. You can close this page.' : 'Not connected yet.';
  var clientLine = opts.hasClient ? '<p>A client id is saved on this computer. Leave the secret blank to keep the one already stored.</p>' : '';
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Connect SmartThings</title>' +
    '<style>body{font-family:system-ui,sans-serif;background:#f3efe6;color:#161616;margin:4vh auto;max-width:40rem;padding:0 1rem;font-size:1.15rem;line-height:1.4}input,button{font:inherit;padding:0.4rem 0.6rem}label{display:block;margin:0.8rem 0}button{font-weight:700}</style>' +
    '</head><body><h1>Connect SmartThings</h1><p>' + esc(status) + '</p>' + message + clientLine +
    '<p>Redirect URI to register on the app:</p><p><code>' + esc(opts.redirectUri || '') + '</code></p>' +
    '<form method="post" action="/smartthings/connect"><label>OAuth client id<br><input name="clientId" autocomplete="off" value="' + esc(opts.clientId || '') + '"></label>' +
    '<label>OAuth client secret<br><input name="clientSecret" type="password" autocomplete="off" value=""></label>' +
    '<button type="submit">Save and connect</button></form></body></html>';
}

function apiRequest(origin, options) {
  options = options || {};
  var target = String(origin || '').replace(/\/$/, '') + (options.path || '/');
  var parsed = url.parse(target);
  var lib = parsed.protocol === 'https:' ? https : http;
  var headers = options.headers || {};
  var body = options.body == null ? null : Buffer.from(String(options.body));
  if (body) {
    headers['Content-Length'] = body.length;
  }
  return new Promise(function (resolve, reject) {
    var req = lib.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.path,
      method: options.method || 'GET',
      headers: headers,
      timeout: options.timeout || 15000
    }, function (res) {
      var chunks = [];
      res.on('data', function (chunk) {
        chunks.push(chunk);
      });
      res.on('end', function () {
        resolve({
          status: res.statusCode || 500,
          type: res.headers['content-type'] || 'application/json; charset=utf-8',
          body: Buffer.concat(chunks)
        });
      });
    });
    req.on('timeout', function () {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

module.exports = {
  SCOPES: SCOPES,
  REFRESH_SKEW_MS: REFRESH_SKEW_MS,
  needsRefresh: needsRefresh,
  applyTokenResponse: applyTokenResponse,
  authorizeUrl: authorizeUrl,
  tokenForm: tokenForm,
  basicHeader: basicHeader,
  isAllowedApiPath: isAllowedApiPath,
  connectPage: connectPage,
  apiRequest: apiRequest
};

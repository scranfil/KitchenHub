const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const jsDir = path.join(root, 'js');
const cssPath = path.join(root, 'style.css');

function siteJsFiles() {
  return fs.readdirSync(jsDir)
    .filter(function (name) { return name.slice(-3) === '.js'; })
    .map(function (name) { return path.join(jsDir, name); })
    .concat([path.join(root, 'config.js'), path.join(root, 'sw.js')]);
}

test('site JavaScript parses as ES2017', function () {
  var files = siteJsFiles();
  var i;
  for (i = 0; i < files.length; i++) {
    var cmd = 'npx --yes acorn --ecma2017 --silent "' + files[i] + '"';
    var result = spawnSync(cmd, { encoding: 'utf8', shell: true });
    var out = String(result.stdout || '') + String(result.stderr || '');
    assert.equal(/SyntaxError|Unexpected token/.test(out), false, files[i] + '\n' + out);
    assert.ok(result.status === 0 || result.status === null, files[i] + ' status=' + result.status + '\n' + out);
  }
});

test('site JavaScript avoids post-ES2017 syntax', function () {
  var files = siteJsFiles();
  var forbidden = [/\?\./, /\?\?/, /\bstructuredClone\b/, /\.at\s*\(/];
  var i;
  var j;
  for (i = 0; i < files.length; i++) {
    var src = fs.readFileSync(files[i], 'utf8');
    for (j = 0; j < forbidden.length; j++) {
      assert.equal(forbidden[j].test(src), false, files[i] + ' matched ' + forbidden[j]);
    }
  }
});

test('style.css avoids forbidden modern CSS', function () {
  var css = fs.readFileSync(cssPath, 'utf8');
  assert.equal(css.indexOf(':has(') === -1, true);
  assert.equal(css.indexOf('@container') === -1, true);
  assert.equal(css.indexOf('@layer') === -1, true);
  assert.equal(/\bdvh\b/.test(css), false);
  assert.equal(/\bsvh\b/.test(css), false);
  assert.equal(/aspect-ratio/.test(css), false);
});

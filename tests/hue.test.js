const { test } = require('node:test');
const assert = require('node:assert/strict');
const hue = require('../js/hue.js');

test('brightness converts between Hue and percent', function () {
  assert.equal(hue.lightPercent(254), 100);
  assert.equal(hue.lightPercent(1), 0);
  assert.equal(hue.briFromPercent(100), 254);
  assert.equal(hue.briFromPercent(0), 1);
  assert.equal(hue.lightPercent(hue.briFromPercent(50)) >= 49, true);
});

test('pairing response recognizes success and a missed link button', function () {
  assert.deepEqual(hue.parsePairResponse([{ success: { username: 'abc123' } }]), {
    ok: true,
    appKey: 'abc123'
  });
  var missed = hue.parsePairResponse([{ error: { type: 101, description: 'link button not pressed' } }]);
  assert.equal(missed.ok, false);
  assert.equal(missed.type, 101);
});

test('rooms collect their lights and leftovers stay visible', function () {
  var rooms = hue.groupLights({
    '1': { name: 'Island', state: { on: true, bri: 200, reachable: true } },
    '2': { name: 'Lamp', state: { on: false, bri: 10, reachable: true } },
    '3': { name: 'Porch', state: { on: true, reachable: false } }
  }, {
    '10': { name: 'Kitchen', type: 'Room', lights: ['1'] },
    '11': { name: 'Zone', type: 'Zone', lights: ['2', '1'] },
    '12': { name: 'Entertainment', type: 'Entertainment', lights: ['3'] }
  });
  assert.equal(rooms[0].name, 'Kitchen');
  assert.equal(rooms[0].lights[0].name, 'Island');
  assert.equal(rooms[0].lights[0].on, true);
  assert.equal(rooms[0].lights[0].percent, hue.lightPercent(200));
  assert.equal(rooms[1].name, 'Zone');
  assert.equal(rooms[1].lights[0].id, '2');
  assert.equal(rooms[2].name, 'Other');
  assert.equal(rooms[2].lights[0].reachable, false);
});

test('discovery keeps private bridge addresses only', function () {
  assert.deepEqual(hue.discoveryIps([
    { internalipaddress: '192.168.1.20' },
    { internalipaddress: '8.8.8.8' },
    { internalipaddress: 'not-an-ip' }
  ]), ['192.168.1.20']);
  assert.equal(hue.isPrivateIPv4('10.0.0.2'), true);
  assert.equal(hue.isPrivateIPv4('172.16.0.1'), true);
  assert.equal(hue.isPrivateIPv4('172.32.0.1'), false);
  assert.equal(hue.isIPv4('192.168.001.2'), false);
});

test('proxy target allows the bridge API on a private address', function () {
  assert.deepEqual(hue.proxyTarget('192.168.1.20', '/api/key/lights'), {
    host: '192.168.1.20',
    port: 80,
    path: '/api/key/lights'
  });
  assert.equal(hue.proxyTarget('8.8.8.8', '/api'), null);
  assert.equal(hue.proxyTarget('192.168.1.20', '/debug/clip.html'), null);
  assert.equal(hue.proxyTarget('10.0.0.1:8080', '/api'), null);
  var loop = hue.proxyTarget('127.0.0.1:9999', '/api');
  assert.equal(loop.host, '127.0.0.1');
  assert.equal(loop.port, 9999);
});

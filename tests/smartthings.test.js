const { test } = require('node:test');
const assert = require('node:assert/strict');
const st = require('../js/smartthings.js');

function device(name, caps, extra) {
  var row = {
    deviceId: extra && extra.deviceId || name,
    label: name,
    roomId: extra && extra.roomId || '',
    components: [{ id: 'main', capabilities: caps.map(function (id) { return { id: id }; }) }]
  };
  return row;
}

const LOCK_STATUS = {
  components: {
    main: {
      lock: { lock: { value: 'unlocked' } }
    }
  }
};

test('no lock on the account leaves the door alone', function () {
  assert.equal(st.pickFrontLock([], 'front'), null);
  assert.equal(st.pickFrontLock([
    device('Island', ['switch', 'switchLevel'], { deviceId: '1' })
  ], 'front'), null);
});

test('front door lock is preferred over other locks', function () {
  var garage = device('Garage lock', ['lock', 'battery'], { deviceId: 'g' });
  var front = device('Front Door Lock', ['lock', 'battery'], { deviceId: 'f' });
  var picked = st.pickFrontLock([garage, front], 'front');
  assert.equal(picked.deviceId, 'f');
  assert.equal(st.pickFrontLock([garage], 'front').deviceId, 'g');
  assert.equal(st.pickFrontLock([garage, device('Back door', ['lock'], { deviceId: 'b' })], 'front'), null);
});

test('an unlocked lock is the only state that marks the door open', function () {
  assert.deepEqual(st.lockReading(LOCK_STATUS), { unlocked: true, known: true, label: 'Unlocked' });
  assert.equal(st.lockReading({
    components: { main: { lock: { lock: { value: 'locked' } } } }
  }).unlocked, false);
  assert.equal(st.lockReading({
    components: { main: { lock: { lock: { value: 'unlocked with timeout' } } } }
  }).unlocked, true);
  assert.equal(st.lockReading({
    components: { main: { lock: { lock: { value: 'unknown' } } } }
  }).known, false);
});

test('hub lights group by room and ignore the lock', function () {
  var lights = [
    st.lightReading(device('Island', ['switch', 'switchLevel', 'colorControl'], { deviceId: '1', roomId: 'kitchen' }), {
      components: { main: { switch: { switch: { value: 'on' } }, switchLevel: { level: { value: 80 } } } }
    }),
    st.lightReading(device('Lamp', ['switch', 'switchLevel'], { deviceId: '2', roomId: 'living' }), {
      components: { main: { switch: { switch: { value: 'off' } }, switchLevel: { level: { value: 10 } } } }
    })
  ];
  assert.equal(st.isHubLight(device('Front Door Lock', ['lock', 'battery'])), false);
  assert.equal(st.isHubLight(device('Island', ['switch', 'switchLevel'])), true);
  var rooms = st.groupHubLights(lights, [
    { roomId: 'kitchen', name: 'Kitchen' },
    { roomId: 'living', name: 'Living room' }
  ]);
  assert.equal(rooms[0].name, 'Kitchen');
  assert.equal(rooms[0].lights[0].on, true);
  assert.equal(rooms[0].lights[0].percent, 80);
  assert.equal(rooms[0].lights[0].via, 'smartthings');
  assert.equal(rooms[1].lights[0].name, 'Lamp');
  assert.equal(rooms[1].lights[0].on, false);
});

test('duplicate Hue labels keep the Hue integration device', function () {
  var cloud = device('Island', ['switch', 'switchLevel'], { deviceId: 'cloud' });
  cloud.manufacturerName = 'SmartThings';
  cloud.name = 'Generic bulb';
  var hue = device('Island', ['switch', 'switchLevel', 'colorControl'], { deviceId: 'hue' });
  hue.manufacturerName = 'Philips';
  hue.name = 'Hue color lamp 1';
  var kept = st.dedupeHubDevices([cloud, hue]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].deviceId, 'hue');
  assert.equal(st.hueRank(hue) > st.hueRank(cloud), true);
});

test('brightness commands turn a hub light on and set the level', function () {
  assert.deepEqual(st.lightCommands(false, 40), [
    { component: 'main', capability: 'switch', command: 'off' }
  ]);
  assert.deepEqual(st.lightCommands(true, 40), [
    { component: 'main', capability: 'switch', command: 'on' },
    { component: 'main', capability: 'switchLevel', command: 'setLevel', arguments: [40] }
  ]);
  assert.equal(st.configured(''), false);
  assert.equal(st.configured('token'), true);
});

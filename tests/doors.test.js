const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const doors = require('../js/doors.js');

const FRONT = {
  id: 'front',
  name: 'Front Door',
  kind: 'lock',
  source: 'homeassistant',
  entityId: 'lock.entryway_entryway_lock'
};
const GARAGE = {
  id: 'garage',
  name: 'Garage door (main)',
  kind: 'garage',
  source: 'homeassistant',
  entityId: 'cover.garage_door'
};

function view(door, reading) {
  return doors.resolveDoor(door, reading);
}

test('lock and garage map to labels and row highlighting', function () {
  var locked = view(FRONT, { connected: true, known: true, value: 'locked' });
  var unlocked = view(FRONT, { connected: true, known: true, value: 'unlocked' });
  var closed = view(GARAGE, { connected: true, known: true, value: 'closed' });
  var open = view(GARAGE, { connected: true, known: true, value: 'OPEN' });

  assert.equal(locked.label, 'Locked');
  assert.equal(locked.attention, false);
  assert.equal(locked.known, true);
  assert.equal(doors.rowClass(locked), 'door-row');

  assert.equal(unlocked.label, 'Unlocked');
  assert.equal(unlocked.attention, true);
  assert.equal(doors.rowClass(unlocked), 'door-row is-attention');

  assert.equal(closed.label, 'Closed');
  assert.equal(closed.attention, false);
  assert.equal(doors.rowClass(closed), 'door-row');

  assert.equal(open.label, 'Open');
  assert.equal(open.attention, true);
  assert.equal(doors.rowClass(open), 'door-row is-attention');
});

test('a missing source or unreadable state stays neutral', function () {
  var noSource = view({ name: 'Side door', kind: 'lock', source: '' }, { connected: true, known: true, value: 'unlocked' });
  assert.equal(noSource.label, 'Not connected');
  assert.equal(noSource.attention, false);
  assert.equal(doors.rowClass(noSource), 'door-row is-neutral');

  var noEntity = view({
    name: 'Garage door (main)',
    kind: 'garage',
    source: 'homeassistant',
    entityId: ''
  }, { connected: true, known: true, value: 'open' });
  assert.equal(noEntity.label, 'Not connected');
  assert.equal(noEntity.attention, false);

  var offline = view(GARAGE, { connected: false, known: true, value: 'open' });
  assert.equal(offline.label, 'Not connected');
  assert.equal(offline.attention, false);

  var unavailable = view(GARAGE, { connected: true, known: false, value: 'open' });
  assert.equal(unavailable.label, 'Unknown');
  assert.equal(unavailable.attention, false);
  assert.equal(doors.rowClass(unavailable), 'door-row is-neutral');

  var missing = view(FRONT, null);
  assert.equal(missing.label, 'Unknown');
  assert.equal(missing.attention, false);
  assert.equal(missing.known, false);
});

test('garage transitional states never look closed', function () {
  var opening = view(GARAGE, { connected: true, known: true, value: 'opening' });
  var closing = view(GARAGE, { connected: true, known: true, value: 'closing' });
  var garageLockWord = view(GARAGE, { connected: true, known: true, value: 'locked' });

  assert.equal(opening.label, 'Unknown');
  assert.equal(opening.attention, false);
  assert.equal(closing.label, 'Unknown');
  assert.equal(closing.attention, false);
  assert.equal(garageLockWord.label, 'Unknown');
  assert.equal(garageLockWord.attention, false);
});

test('home assistant lock states map to labels and highlighting', function () {
  var cases = [
    ['locked', 'Locked', false],
    ['unlocked', 'Unlocked', true],
    ['locking', 'Locking', false],
    ['unlocking', 'Unlocking', false],
    ['jammed', 'Jammed', true],
    ['open', 'Open', true],
    ['opening', 'Opening', false]
  ];
  var i;
  for (i = 0; i < cases.length; i++) {
    var row = view(FRONT, { connected: true, known: true, value: cases[i][0] });
    assert.equal(row.label, cases[i][1], cases[i][0]);
    assert.equal(row.attention, cases[i][2], cases[i][0]);
    assert.equal(row.known, true, cases[i][0]);
    assert.equal(doors.rowClass(row), cases[i][2] ? 'door-row is-attention' : 'door-row', cases[i][0]);
  }

  var unavailable = doors.haReading({ state: 'unavailable', entity_id: 'lock.entryway_entryway_lock' });
  var unknown = doors.haReading({ state: 'unknown' });
  var down = view(FRONT, { connected: true, known: unavailable.known, value: unavailable.value });
  var blank = view(FRONT, { connected: true, known: unknown.known, value: unknown.value });
  assert.equal(down.label, 'Unknown');
  assert.equal(down.attention, false);
  assert.equal(doors.rowClass(down), 'door-row is-neutral');
  assert.equal(blank.label, 'Unknown');
  assert.equal(blank.attention, false);

  var odd = view(FRONT, { connected: true, known: true, value: 'closed' });
  assert.equal(odd.label, 'Unknown');
  assert.equal(odd.attention, false);

  var noEntity = view({
    name: 'Front Door',
    kind: 'lock',
    source: 'homeassistant',
    entityId: ''
  }, { connected: true, known: true, value: 'locked' });
  assert.equal(noEntity.label, 'Not connected');
  assert.equal(noEntity.attention, false);
});

test('home assistant cover payloads normalize to a reading', function () {
  assert.deepEqual(doors.haReading({
    state: 'open',
    attributes: { friendly_name: 'Garage', token: 'should-stay-on-the-server' }
  }), { known: true, value: 'open' });
  assert.deepEqual(doors.haReading({ state: 'closed' }), { known: true, value: 'closed' });
  assert.deepEqual(doors.haReading({ state: 'unavailable' }), { known: false, value: '' });
  assert.deepEqual(doors.haReading({ state: 'unknown' }), { known: false, value: '' });
  assert.deepEqual(doors.haReading(null), { known: false, value: '' });
  assert.deepEqual(doors.haReading({ state: '' }), { known: false, value: '' });
});

test('a smartthings lock reading becomes a door reading', function () {
  assert.deepEqual(doors.lockReadingToState({
    unlocked: true,
    known: true,
    label: 'Unlocked'
  }), { connected: true, known: true, value: 'unlocked' });
  assert.deepEqual(doors.lockReadingToState({
    unlocked: false,
    known: true,
    label: 'Locked'
  }), { connected: true, known: true, value: 'locked' });
  assert.equal(doors.lockReadingToState({ unlocked: false, known: false, label: 'Unknown' }).known, false);
  assert.equal(doors.lockReadingToState(null).known, false);
  var hubDoor = { name: 'Front Door', kind: 'lock', source: 'smartthings' };
  var unlocked = view(hubDoor, doors.lockReadingToState({ unlocked: true, known: true, label: 'Unlocked' }));
  assert.equal(unlocked.label, 'Unlocked');
  assert.equal(unlocked.attention, true);
});

test('a sample preview can show a door before its source is configured', function () {
  var open = view({
    name: 'Garage door (main)',
    kind: 'garage',
    source: 'homeassistant',
    entityId: ''
  }, { preview: true, connected: true, known: true, value: 'open' });
  assert.equal(open.label, 'Open');
  assert.equal(open.attention, true);
  assert.equal(doors.rowClass(open), 'door-row is-attention');
  var locked = view(FRONT, { preview: true, connected: true, known: true, value: 'locked' });
  assert.equal(locked.label, 'Locked');
  assert.equal(locked.attention, false);
  var unknown = view(GARAGE, { preview: true, connected: true, known: false, value: 'open' });
  assert.equal(unknown.label, 'Unknown');
  assert.equal(unknown.attention, false);
});

test('the default front door is the entryway Home Assistant lock', function () {
  var list = doors.doorList({});
  assert.equal(list[0].name, 'Front Door');
  assert.equal(list[0].kind, 'lock');
  assert.equal(list[0].source, 'homeassistant');
  assert.equal(list[0].entityId, 'lock.entryway_entryway_lock');
  assert.equal(list[1].id, 'front-contact');
  assert.equal(list[1].name, 'Front Door');
  assert.equal(list[1].kind, 'contact');
  assert.equal(list[1].entityId, 'binary_sensor.front_door');
  assert.equal(list[2].kind, 'garage');
  assert.equal(list[2].entityId, '');
  assert.equal(list[3].name, 'Kitchen Door');
  assert.equal(list[3].entityId, 'binary_sensor.kitchen_sliding_door');
  assert.equal(list[4].name, 'Basement Door');
  assert.equal(list[4].entityId, 'binary_sensor.basement_door');
  assert.equal(doors.entityIdOk('lock.entryway_entryway_lock'), true);
  assert.equal(doors.entityIdOk('binary_sensor.kitchen_sliding_door'), true);
  assert.equal(
    doors.haStateUrl('http://homeassistant.local:8123', 'lock.entryway_entryway_lock'),
    'http://homeassistant.local:8123/api/states/lock.entryway_entryway_lock'
  );
});

test('a contact sensor maps on and off without guessing', function () {
  var door = {
    name: 'Kitchen Door',
    kind: 'contact',
    source: 'homeassistant',
    entityId: 'binary_sensor.kitchen_sliding_door'
  };
  var open = view(door, { connected: true, known: true, value: 'on' });
  assert.equal(open.label, 'Open');
  assert.equal(open.attention, true);
  assert.equal(open.known, true);
  assert.equal(doors.rowClass(open), 'door-row is-attention');

  var closed = view(door, { connected: true, known: true, value: 'OFF' });
  assert.equal(closed.label, 'Closed');
  assert.equal(closed.attention, false);
  assert.equal(closed.known, true);
  assert.equal(doors.rowClass(closed), 'door-row');

  var unavailable = view(door, { connected: true, known: false, value: 'unavailable' });
  assert.equal(unavailable.label, 'Unknown');
  assert.equal(unavailable.attention, false);
  assert.equal(doors.rowClass(unavailable), 'door-row is-neutral');

  var unknown = view({
    name: 'Basement Door',
    kind: 'contact',
    source: 'homeassistant',
    entityId: 'binary_sensor.basement_door'
  }, { connected: true, known: false, value: 'unknown' });
  assert.equal(unknown.label, 'Unknown');
  assert.equal(unknown.attention, false);

  var offline = view(door, { connected: false, known: true, value: 'on' });
  assert.equal(offline.label, 'Not connected');
  assert.equal(offline.attention, false);

  var word = view(door, { connected: true, known: true, value: 'open' });
  assert.equal(word.label, 'Unknown');
  assert.equal(word.attention, false);
});

test('the Front tab shows the lock and the contact together', function () {
  var list = doors.doorList({});
  var locked = { connected: true, known: true, value: 'locked' };
  var unlocked = { connected: true, known: true, value: 'unlocked' };
  var closed = { connected: true, known: true, value: 'off' };
  var open = { connected: true, known: true, value: 'on' };
  var missing = { connected: true, known: false };

  var quiet = doors.frontTabState(list, { front: locked, contact: closed });
  assert.equal(quiet.lock.label, 'Locked');
  assert.equal(quiet.lock.attention, false);
  assert.equal(quiet.contact.label, 'Closed');
  assert.equal(quiet.contact.name, 'Front Door');
  assert.equal(quiet.contact.attention, false);
  assert.equal(quiet.attention, false);

  var unlatched = doors.frontTabState(list, { front: unlocked, contact: closed });
  assert.equal(unlatched.lock.label, 'Unlocked');
  assert.equal(unlatched.lock.attention, true);
  assert.equal(unlatched.contact.label, 'Closed');
  assert.equal(unlatched.attention, true);

  var ajar = doors.frontTabState(list, { front: locked, contact: open });
  assert.equal(ajar.lock.label, 'Locked');
  assert.equal(ajar.lock.attention, false);
  assert.equal(ajar.contact.label, 'Open');
  assert.equal(ajar.contact.attention, true);
  assert.equal(doors.rowClass(ajar.contact), 'door-row is-attention');
  assert.equal(ajar.attention, true);

  var dark = doors.frontTabState(list, { front: locked, contact: missing });
  assert.equal(dark.lock.label, 'Locked');
  assert.equal(dark.lock.known, true);
  assert.equal(dark.contact.label, 'Unknown');
  assert.equal(dark.contact.attention, false);
  assert.equal(dark.attention, false);
  assert.equal(doors.rowClass(dark.contact), 'door-row is-neutral');
});

test('door tabs stay in Front, Kitchen, Basement, Garage 1 order', function () {
  var tabs = doors.doorTabs(doors.doorList({}));
  assert.deepEqual(tabs.map(function (tab) { return tab.label; }), ['Front', 'Kitchen', 'Basement', 'Garage 1']);
  assert.deepEqual(tabs.map(function (tab) { return tab.id; }), ['front', 'kitchen', 'basement', 'garage']);
  assert.equal(tabs[0].door.entityId, 'lock.entryway_entryway_lock');
  assert.equal(tabs[1].door.entityId, 'binary_sensor.kitchen_sliding_door');
  assert.equal(tabs[2].door.entityId, 'binary_sensor.basement_door');
  assert.equal(tabs[3].door.kind, 'garage');
  assert.equal(doors.defaultDoorTab(tabs), 'front');

  var reversed = doors.doorTabs([
    { id: 'garage', name: 'Garage door (main)', kind: 'garage' },
    { id: 'basement', name: 'Basement Door', kind: 'contact' },
    { id: 'kitchen', name: 'Kitchen Door', kind: 'contact' },
    { id: 'front', name: 'Front Door', kind: 'lock' }
  ]);
  assert.deepEqual(reversed.map(function (tab) { return tab.id; }), ['front', 'kitchen', 'basement', 'garage']);
  assert.equal(doors.defaultDoorTab([{ id: 'kitchen', label: 'Kitchen' }]), 'kitchen');
});

test('the doors tile does not prompt for doorbell setup', function () {
  var src = fs.readFileSync(path.join(__dirname, '../js/nest.js'), 'utf8');
  assert.equal(src.indexOf('Doorbell setup is in the README') === -1, true);
});

test('the door list keeps names and drops a bad entity id', function () {
  var list = doors.doorList({
    doors: [
      { name: 'Front Door', kind: 'Lock', source: 'SmartThings' },
      { name: 'Garage door (main)', kind: 'garage', source: 'homeassistant', entityId: '../secrets' }
    ]
  });
  assert.equal(list[0].kind, 'lock');
  assert.equal(list[0].source, 'smartthings');
  assert.equal(list[0].name, 'Front Door');
  assert.equal(list[1].name, 'Garage door (main)');
  assert.equal(list[1].entityId, '');
  assert.equal(view(list[1], { connected: true, known: true, value: 'open' }).label, 'Not connected');
});

test('home assistant state url stays on the configured host', function () {
  assert.equal(
    doors.haStateUrl('http://homeassistant.local:8123/', 'cover.garage_door'),
    'http://homeassistant.local:8123/api/states/cover.garage_door'
  );
  assert.equal(doors.haStateUrl('http://user:secret@127.0.0.1:8123', 'cover.garage_door'), '');
  assert.equal(doors.haStateUrl('file:///tmp/ha', 'cover.garage_door'), '');
  assert.equal(doors.haStateUrl('http://127.0.0.1:8123', 'cover/../../etc'), '');
  assert.equal(doors.haStateUrl('http://127.0.0.1:8123', ''), '');
  assert.equal(doors.entityIdOk('cover.garage_door'), true);
  assert.equal(doors.entityIdOk('cover.garage door'), false);
});

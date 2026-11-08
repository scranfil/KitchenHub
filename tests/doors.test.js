const { test } = require('node:test');
const assert = require('node:assert/strict');
const doors = require('../js/doors.js');

const FRONT = { id: 'front', name: 'Front Door', kind: 'lock', source: 'smartthings' };
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

test('transitional and crossed states never look locked or closed', function () {
  var opening = view(GARAGE, { connected: true, known: true, value: 'opening' });
  var closing = view(GARAGE, { connected: true, known: true, value: 'closing' });
  var jammed = view(FRONT, { connected: true, known: true, value: 'jammed' });
  var garageLockWord = view(GARAGE, { connected: true, known: true, value: 'locked' });
  var lockOpenWord = view(FRONT, { connected: true, known: true, value: 'open' });

  assert.equal(opening.label, 'Unknown');
  assert.equal(opening.attention, false);
  assert.equal(closing.label, 'Unknown');
  assert.equal(closing.attention, false);
  assert.equal(jammed.label, 'Unknown');
  assert.equal(jammed.attention, false);
  assert.equal(garageLockWord.label, 'Unknown');
  assert.equal(lockOpenWord.label, 'Unknown');
  assert.equal(lockOpenWord.attention, false);
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
  var unlocked = view(FRONT, doors.lockReadingToState({ unlocked: true, known: true, label: 'Unlocked' }));
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

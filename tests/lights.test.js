const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const lights = require('../js/lights.js');

const KITCHEN = 'light.kitchen_kitchen';
const OFFICE = 'light.office_office';
const BACKYARD = 'light.backyard_backyard';

test('the default light list is the three Hue room groups', function () {
  var cfg = fs.readFileSync(path.join(__dirname, '../config.js'), 'utf8');
  assert.equal(cfg.indexOf('light.kitchen_kitchen') !== -1, true);
  assert.equal(cfg.indexOf('light.office_office') !== -1, true);
  assert.equal(cfg.indexOf('light.backyard_backyard') !== -1, true);
  var ids = lights.lightIds({
    lights: { entityIds: [KITCHEN, OFFICE, BACKYARD, 'not an id', KITCHEN, '../secret'] }
  });
  assert.deepEqual(ids, [KITCHEN, OFFICE, BACKYARD]);
  assert.deepEqual(lights.lightIds({}), []);
  assert.deepEqual(lights.lightIds({ lights: { entityIds: [] } }), []);
});

test('an on light keeps its brightness and an off light does not invent one', function () {
  var on = lights.lightView(KITCHEN, {
    connected: true,
    known: true,
    state: 'on',
    brightness: 255,
    name: 'Kitchen'
  });
  assert.equal(on.label, 'On');
  assert.equal(on.on, true);
  assert.equal(on.known, true);
  assert.equal(on.percent, 100);
  assert.equal(on.name, 'Kitchen');

  var mid = lights.lightView(OFFICE, {
    connected: true,
    known: true,
    state: 'on',
    brightness: 128,
    name: 'Office'
  });
  assert.equal(mid.percent, 50);
  assert.equal(mid.label, 'On');

  var off = lights.lightView(BACKYARD, {
    connected: true,
    known: true,
    state: 'off',
    name: 'Backyard'
  });
  assert.equal(off.label, 'Off');
  assert.equal(off.on, false);
  assert.equal(off.percent, null);
});

test('a missing light source or an unavailable light stays neutral', function () {
  var absent = lights.lightView(KITCHEN, null);
  assert.equal(absent.label, 'Not connected');
  assert.equal(absent.known, false);
  assert.equal(absent.on, false);
  assert.equal(absent.percent, null);

  var offline = lights.lightView(KITCHEN, { connected: false, known: true, state: 'on', brightness: 200 });
  assert.equal(offline.label, 'Not connected');
  assert.equal(offline.on, false);

  var unavailable = lights.lightView(OFFICE, { connected: true, known: false, state: 'unavailable', name: 'Office' });
  assert.equal(unavailable.label, 'Unknown');
  assert.equal(unavailable.known, false);
  assert.equal(unavailable.on, false);
  assert.equal(unavailable.percent, null);

  var odd = lights.lightView(BACKYARD, { connected: true, known: true, state: 'opening', brightness: 10 });
  assert.equal(odd.label, 'Unknown');
  assert.equal(odd.on, false);
  assert.equal(odd.percent, null);
});

test('light extras keep brightness and the name and drop everything else', function () {
  var extras = lights.haLightExtras(KITCHEN, {
    state: 'on',
    attributes: {
      friendly_name: 'Kitchen',
      brightness: 203,
      is_hue_group: true,
      token: 'should-stay-on-the-server'
    }
  });
  assert.equal(extras.brightness, 203);
  assert.equal(extras.name, 'Kitchen');
  assert.equal(JSON.stringify(extras).indexOf('should-stay-on-the-server'), -1);
  assert.equal(JSON.stringify(extras).indexOf('is_hue_group'), -1);
  assert.equal(lights.haLightExtras('climate.hallway_hallway_thermostat', {
    attributes: { brightness: 10, friendly_name: 'Nope' }
  }), null);
  var view = lights.lightView(KITCHEN, {
    connected: true,
    known: true,
    state: 'on',
    brightness: extras.brightness,
    name: extras.name
  });
  assert.equal(view.label, 'On');
  assert.equal(view.percent, 80);
});

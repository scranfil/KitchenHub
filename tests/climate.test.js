const { test } = require('node:test');
const assert = require('node:assert/strict');
const climate = require('../js/climate.js');
const doors = require('../js/doors.js');

const HEAT = {
  connected: true,
  known: true,
  state: 'heat',
  current_temperature: 70.4,
  temperature: 68,
  hvac_action: 'heating',
  temperature_unit: '°F',
  name: 'Hallway'
};

test('a heating climate shows the room temperature and the heat setpoint', function () {
  var view = climate.climateView(HEAT);
  assert.equal(view.known, true);
  assert.equal(view.name, 'Hallway');
  assert.equal(view.ambient, 70);
  assert.equal(view.ambientText, '70°');
  assert.equal(view.line, 'Heat · Heating');
  assert.equal(view.setpoint, 'Heat to 68°');
});

test('cooling, a heat-cool range, and off stay literal', function () {
  var cool = climate.climateView({
    connected: true,
    known: true,
    state: 'cool',
    current_temperature: 74,
    temperature: 72,
    hvac_action: 'cooling',
    temperature_unit: '°F',
    name: 'Hallway'
  });
  assert.equal(cool.line, 'Cool · Cooling');
  assert.equal(cool.setpoint, 'Cool to 72°');

  var range = climate.climateView({
    connected: true,
    known: true,
    state: 'heat_cool',
    current_temperature: 70,
    target_temp_low: 68,
    target_temp_high: 74,
    hvac_action: 'idle',
    temperature_unit: '°F'
  });
  assert.equal(range.line, 'Heat · Cool · Idle');
  assert.equal(range.setpoint, '68° – 74°');
  assert.equal(range.name, 'Thermostat');

  var off = climate.climateView({
    connected: true,
    known: true,
    state: 'off',
    current_temperature: 69,
    hvac_action: 'off',
    temperature_unit: '°F',
    name: 'Hallway'
  });
  assert.equal(off.line, 'Off');
  assert.equal(off.setpoint, 'Off');
  assert.equal(off.ambient, 69);
});

test('celsius readings become fahrenheit', function () {
  assert.equal(climate.toF(22, '°C'), 72);
  var view = climate.climateView({
    connected: true,
    known: true,
    state: 'heat',
    current_temperature: 21.1,
    temperature: 20,
    hvac_action: 'idle',
    temperature_unit: '°C',
    name: 'Hallway'
  });
  assert.equal(view.ambient, 70);
  assert.equal(view.setpoint, 'Heat to 68°');
  assert.equal(view.line, 'Heat · Idle');
});

test('a missing climate source or an unavailable entity stays neutral', function () {
  assert.deepEqual(climate.climateView(null), { known: false, label: 'Not connected' });
  assert.deepEqual(climate.climateView({ connected: false }), { known: false, label: 'Not connected' });
  assert.deepEqual(climate.climateView({ connected: true, known: false }), { known: false, label: 'Unknown' });
  var odd = climate.climateView({
    connected: true,
    known: true,
    state: 'something-else',
    current_temperature: 70,
    temperature_unit: '°F',
    name: 'Hallway'
  });
  assert.equal(odd.line, 'Unknown');
  assert.equal(odd.setpoint, 'Unknown');
  assert.equal(odd.ambient, 70);
});

test('climate extras keep temperatures and drop everything else', function () {
  var extras = doors.haClimateExtras('climate.hallway', {
    state: 'heat',
    attributes: {
      current_temperature: 70.4,
      temperature: 68,
      target_temp_high: null,
      hvac_action: 'Heating',
      temperature_unit: '°F',
      friendly_name: 'Hallway',
      hvac_modes: ['heat', 'off'],
      token: 'should-stay-on-the-server'
    }
  });
  assert.equal(extras.current_temperature, 70.4);
  assert.equal(extras.temperature, 68);
  assert.equal(extras.hvac_action, 'heating');
  assert.equal(extras.name, 'Hallway');
  assert.equal(extras.target_temp_high, null);
  assert.equal(JSON.stringify(extras).indexOf('should-stay-on-the-server'), -1);
  assert.equal(JSON.stringify(extras).indexOf('hvac_modes'), -1);
  assert.equal(doors.haClimateExtras('lock.entryway_entryway_lock', {
    state: 'locked',
    attributes: { friendly_name: 'Entryway Lock', token: 'nope' }
  }), null);
});

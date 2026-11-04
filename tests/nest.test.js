const { test } = require('node:test');
const assert = require('node:assert/strict');
const nest = require('../js/nest.js');

const DOORBELL = {
  name: 'enterprises/demo/devices/door-1',
  type: 'sdm.devices.types.DOORBELL',
  traits: {
    'sdm.devices.traits.Info': { customName: 'Front door' },
    'sdm.devices.traits.Connectivity': { status: 'ONLINE' },
    'sdm.devices.traits.CameraLiveStream': { supportedProtocols: ['WEB_RTC'] },
    'sdm.devices.traits.CameraEventImage': {}
  },
  parentRelations: [{ displayName: 'Front' }]
};

const THERMOSTAT = {
  name: 'enterprises/demo/devices/thermo-1',
  type: 'sdm.devices.types.THERMOSTAT',
  traits: {
    'sdm.devices.traits.Info': { customName: '' },
    'sdm.devices.traits.Connectivity': { status: 'ONLINE' },
    'sdm.devices.traits.Temperature': { ambientTemperatureCelsius: 21.2 },
    'sdm.devices.traits.ThermostatMode': { mode: 'HEAT' },
    'sdm.devices.traits.ThermostatEco': { mode: 'OFF', heatCelsius: 10, coolCelsius: 24 },
    'sdm.devices.traits.ThermostatHvac': { status: 'HEATING' },
    'sdm.devices.traits.ThermostatTemperatureSetpoint': { heatCelsius: 20 }
  },
  parentRelations: [{ displayName: 'Hallway' }]
};

test('nest stays disconnected until every credential is present', function () {
  assert.equal(nest.nestConfigured({}), false);
  assert.equal(nest.nestConfigured({
    projectId: 'p',
    clientId: 'c',
    clientSecret: 's',
    refreshToken: ''
  }), false);
  assert.equal(nest.nestConfigured({
    projectId: 'p',
    clientId: 'c',
    clientSecret: 's',
    refreshToken: 'r'
  }), true);
  assert.deepEqual(nest.missingNestFields({ projectId: 'p' }), ['clientId', 'clientSecret', 'refreshToken']);
});

test('splits doorbells and thermostats and prefers a named device', function () {
  var split = nest.splitDevices({ devices: [THERMOSTAT, DOORBELL, { type: 'sdm.devices.types.CAMERA' }] });
  assert.equal(split.doorbells.length, 1);
  assert.equal(split.thermostats.length, 1);
  assert.equal(nest.pickDevice(split.doorbells, 'door-1').name, DOORBELL.name);
  assert.equal(nest.deviceLabel(split.thermostats[0]), 'Hallway');
});

test('maps thermostat traits into a read-only view and a setpoint command', function () {
  var model = nest.thermostatModel(THERMOSTAT);
  assert.equal(model.name, 'Hallway');
  assert.equal(model.online, true);
  assert.equal(model.ambient, 70);
  assert.equal(model.mode, 'HEAT');
  assert.equal(model.modeLabel, 'Heat');
  assert.equal(model.heat, 68);
  assert.equal(model.activeLabel, 'Heating');
  assert.equal(model.canAdjust, true);
  assert.equal(nest.setpointLine(model), 'Heat to 68°');
  var up = nest.setpointCommand(model, 1);
  assert.equal(up.command, nest.CMD_HEAT);
  assert.equal(up.heat, 69);
  assert.equal(up.params.heatCelsius, nest.fToC(69));
  var door = nest.doorbellModel(DOORBELL);
  assert.equal(door.online, true);
  assert.equal(door.webRtc, true);
  assert.equal(door.eventImage, true);
});

test('eco mode replaces the active setpoint and cannot be nudged', function () {
  var device = JSON.parse(JSON.stringify(THERMOSTAT));
  device.traits['sdm.devices.traits.ThermostatEco'] = {
    mode: 'MANUAL_ECO',
    heatCelsius: 10,
    coolCelsius: 25
  };
  device.traits['sdm.devices.traits.ThermostatHvac'].status = 'OFF';
  var model = nest.thermostatModel(device);
  assert.equal(model.mode, 'ECO');
  assert.equal(model.modeLabel, 'Eco');
  assert.equal(model.heat, 50);
  assert.equal(model.cool, 77);
  assert.equal(model.activeLabel, 'Idle');
  assert.equal(model.canAdjust, false);
  assert.equal(nest.setpointCommand(model, 1), null);
});

test('heat-cool nudges keep the two setpoints apart', function () {
  var model = {
    mode: 'HEATCOOL',
    canAdjust: true,
    heat: 70,
    cool: 72,
    ambient: 71
  };
  var down = nest.setpointCommand(model, -1);
  assert.equal(down.command, nest.CMD_RANGE);
  assert.equal(down.cool - down.heat >= 3, true);
  assert.equal(nest.clampF(40), 50);
  assert.equal(nest.clampF(99), 90);
});

test('pubsub pull keeps the newest ring and prefers a person event', function () {
  function encode(payload) {
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  }
  var parsed = nest.parsePubSubPull({
    receivedMessages: [
      {
        ackId: 'a1',
        message: {
          data: encode({
            timestamp: '2026-11-04T18:00:00.000Z',
            resourceUpdate: {
              name: 'enterprises/demo/devices/door-1',
              events: { 'sdm.devices.events.DoorbellChime.Chime': { eventId: 'ring-1' } }
            }
          })
        }
      },
      {
        ackId: 'a2',
        message: {
          data: encode({
            timestamp: '2026-11-04T18:05:00.000Z',
            resourceUpdate: {
              name: 'enterprises/demo/devices/door-1',
              events: { 'sdm.devices.events.CameraMotion.Motion': { eventId: 'mot-1' } }
            }
          })
        }
      },
      {
        ackId: 'a3',
        message: {
          data: encode({
            timestamp: '2026-11-04T18:05:00.000Z',
            resourceUpdate: {
              name: 'enterprises/demo/devices/door-1',
              events: { 'sdm.devices.events.CameraPerson.Person': { eventId: 'person-1' } }
            }
          })
        }
      },
      { ackId: 'a4', message: { data: 'not-json' } }
    ]
  });
  assert.deepEqual(parsed.ackIds, ['a1', 'a2', 'a3', 'a4']);
  var merged = nest.mergeEvents(null, parsed.events);
  assert.equal(merged.chime.eventId, 'ring-1');
  assert.equal(merged.motion.kind, 'person');
  assert.equal(merged.motion.eventId, 'person-1');
  var older = nest.mergeEvents(merged, [{
    kind: 'chime',
    time: '2026-11-04T17:00:00.000Z',
    eventId: 'old'
  }]);
  assert.equal(older.chime.eventId, 'ring-1');
});

test('subscription resource accepts a short name or a full path', function () {
  assert.equal(nest.subscriptionResource({}), '');
  assert.equal(nest.subscriptionResource({
    pubsubProjectId: 'gcp',
    pubsubSubscription: 'nest-events'
  }), 'projects/gcp/subscriptions/nest-events');
  assert.equal(nest.subscriptionResource({
    pubsubSubscription: 'projects/gcp/subscriptions/nest-events'
  }), 'projects/gcp/subscriptions/nest-events');
});

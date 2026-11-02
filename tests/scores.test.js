const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const scores = require('../js/scores.js');

const ZONE = 'America/New_York';
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'scores-gameday.json'), 'utf8'));

const TEAMS = [
  { name: 'Colts', league: 'nfl', sport: 'football', teamId: '11' },
  { name: 'Pacers', league: 'nba', sport: 'basketball', teamId: '11' },
  { name: 'Fever', league: 'wnba', sport: 'basketball', teamId: '5' }
];

function entriesFrom(boards) {
  return TEAMS.map(function (team) {
    var board = { events: [] };
    var i;
    for (i = 0; i < boards.length; i++) {
      if (boards[i].league === team.league) {
        board = boards[i];
      }
    }
    return { name: team.name, teamId: team.teamId, scoreboard: board };
  });
}

test('sunday slate keeps Colts and Pacers and drops other teams', function () {
  var games = scores.collectGames(entriesFrom(fixture.boards), '20261025', ZONE);
  assert.equal(games.length, 2);
  assert.equal(scores.formatGameLine(games[0]), 'Colts at Vikings · 1:00 PM');
  assert.equal(scores.formatGameLine(games[1]), 'Pacers at Nets · 6:00 PM');
});

test('a day with no Indianapolis game yields nothing', function () {
  var games = scores.collectGames(entriesFrom(fixture.boards), '20261024', ZONE);
  assert.deepEqual(games, []);
});

test('final, live, home, and late-night dates', function () {
  var boards = [
    {
      league: 'nfl',
      events: [
        {
          id: 'final-1',
          date: '2026-10-18T17:00Z',
          competitions: [
            {
              competitors: [
                { homeAway: 'home', score: '20', team: { id: '11', shortDisplayName: 'Colts' } },
                { homeAway: 'away', score: '26', team: { id: '10', shortDisplayName: 'Titans' } }
              ],
              status: { type: { state: 'post', shortDetail: 'Final' } }
            }
          ]
        }
      ]
    },
    {
      league: 'nba',
      events: [
        {
          id: 'live-1',
          date: '2026-10-25T23:30Z',
          competitions: [
            {
              competitors: [
                { homeAway: 'away', score: '54', team: { id: '11', shortDisplayName: 'Pacers' } },
                { homeAway: 'home', score: '61', team: { id: '17', shortDisplayName: 'Nets' } }
              ],
              status: { type: { state: 'in', shortDetail: '6:10 - 2nd' } }
            }
          ]
        }
      ]
    },
    {
      league: 'wnba',
      events: [
        {
          id: 'fever-home',
          date: '2026-09-29T22:30Z',
          competitions: [
            {
              competitors: [
                { homeAway: 'home', score: { displayValue: '99' }, team: { id: '5', shortDisplayName: 'Fever' } },
                { homeAway: 'away', score: { value: 89 }, team: { id: '17', shortDisplayName: 'Aces' } }
              ],
              status: { type: { state: 'pre', name: 'STATUS_SCHEDULED', shortDetail: '6:30 PM EDT' } }
            }
          ]
        },
        {
          id: 'fever-late',
          date: '2026-10-02T01:00Z',
          competitions: [
            {
              competitors: [
                { homeAway: 'away', score: '83', team: { id: '5', shortDisplayName: 'Fever' } },
                { homeAway: 'home', score: '94', team: { id: '17', shortDisplayName: 'Aces' } }
              ],
              status: { type: { state: 'post', shortDetail: 'Final' } }
            }
          ]
        },
        {
          id: 'fever-off',
          date: '2026-10-01T17:00Z',
          competitions: [
            {
              competitors: [
                { homeAway: 'home', team: { id: '5' } }
              ],
              status: { type: { state: 'pre' } }
            }
          ]
        }
      ]
    }
  ];
  var finalGames = scores.collectGames(entriesFrom(boards), '20261018', ZONE);
  assert.equal(scores.formatGameLine(finalGames[0]), 'Colts 20, Titans 26 · Final');

  var live = scores.collectGames(entriesFrom(boards), '20261025', ZONE);
  assert.equal(live[0].state, 'in');
  assert.equal(scores.formatGameLine(live[0]), 'Live · Pacers 54, Nets 61 · 6:10 - 2nd');

  var home = scores.collectGames(entriesFrom(boards), '20260929', ZONE);
  assert.equal(scores.formatGameLine(home[0]), 'Fever vs Aces · 6:30 PM');

  var late = scores.collectGames(entriesFrom(boards), '20261001', ZONE);
  assert.equal(late.length, 1);
  assert.equal(scores.formatGameLine(late[0]), 'Fever 83, Aces 94 · Final');
  assert.equal(scores.collectGames(entriesFrom(boards), '20261002', ZONE).length, 0);
});

test('postponed games keep the matchup and drop the old start time', function () {
  var game = scores.gameFromEvent({
    id: 'pp',
    date: '2026-10-25T17:00Z',
    competitions: [
      {
        competitors: [
          { homeAway: 'away', team: { id: '11', shortDisplayName: 'Colts' } },
          { homeAway: 'home', team: { id: '16', shortDisplayName: 'Vikings' } }
        ],
        status: { type: { state: 'pre', name: 'STATUS_POSTPONED', shortDetail: 'Postponed' } }
      }
    ]
  }, TEAMS[0], '20261025', ZONE);
  assert.equal(scores.formatGameLine(game), 'Colts at Vikings · Postponed');
});

test('a live game stays on screen ahead of the other game today', function () {
  var shown = scores.selectDisplayGames([
    { state: 'pre', teamName: 'Colts' },
    { state: 'in', teamName: 'Pacers' },
    { state: 'post', teamName: 'Fever' }
  ]);
  assert.deepEqual(shown.map(function (game) { return game.teamName; }), ['Pacers']);
  var quiet = scores.selectDisplayGames([
    { state: 'pre', teamName: 'Colts' },
    { state: 'pre', teamName: 'Pacers' }
  ]);
  assert.equal(quiet.length, 2);
});

test('live games sort ahead of later pregames', function () {
  var games = scores.sortGames([
    { state: 'pre', startMs: 1, teamName: 'Colts' },
    { state: 'post', startMs: 2, teamName: 'Fever' },
    { state: 'in', startMs: 3, teamName: 'Pacers' }
  ]);
  assert.deepEqual(games.map(function (game) { return game.teamName; }), ['Pacers', 'Colts', 'Fever']);
});

test('refresh is fast only while a game is live or about to start', function () {
  var soon = Date.parse('2026-10-25T16:50:00Z');
  var morning = Date.parse('2026-10-25T14:00:00Z');
  var pre = [{ state: 'pre', startMs: Date.parse('2026-10-25T17:00:00Z'), note: '' }];
  assert.equal(scores.nextRefreshMs(pre, soon), 60000);
  assert.equal(scores.nextRefreshMs(pre, morning), 5 * 60 * 1000);
  assert.equal(scores.nextRefreshMs([{ state: 'in', startMs: soon }], morning), 60000);
  assert.equal(scores.nextRefreshMs([], morning), 15 * 60 * 1000);
  assert.equal(scores.nextRefreshMs([{ state: 'pre', note: 'Postponed', startMs: soon - 60000 }], soon), 5 * 60 * 1000);
});

test('scoreboard url is the public ESPN board for that date', function () {
  assert.equal(
    scores.scoreboardUrl(TEAMS[0], '20261025'),
    'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=20261025'
  );
  assert.equal(
    scores.scoreboardUrl(TEAMS[2], '20260929'),
    'https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard?dates=20260929'
  );
});

test('malformed boards are ignored', function () {
  var games = scores.collectGames([
    { name: 'Colts', teamId: '11', scoreboard: null },
    { name: 'Pacers', teamId: '11', scoreboard: {} },
    { name: 'Fever', teamId: '5', scoreboard: { events: [{ id: 'x' }, null] } }
  ], '20261025', ZONE);
  assert.deepEqual(games, []);
});

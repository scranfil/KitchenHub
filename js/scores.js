(function (exports) {
  'use strict';

  var DEFAULT_TEAMS = [
    { name: 'Colts', league: 'nfl', sport: 'football', teamId: '11' },
    { name: 'Pacers', league: 'nba', sport: 'basketball', teamId: '11' },
    { name: 'Fever', league: 'wnba', sport: 'basketball', teamId: '5' }
  ];

  function localDateKey(date, timeZone) {
    var parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);
    var map = {};
    var i;
    for (i = 0; i < parts.length; i++) {
      map[parts[i].type] = parts[i].value;
    }
    return (map.year || '') + (map.month || '') + (map.day || '');
  }

  function formatStart(date, timeZone) {
    var parts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timeZone || 'America/New_York'
    }).formatToParts(date);
    var map = {};
    var i;
    for (i = 0; i < parts.length; i++) {
      map[parts[i].type] = parts[i].value;
    }
    return (map.hour || '') + ':' + (map.minute || '00') + ' ' + (map.dayPeriod || '');
  }

  function readScore(value) {
    if (value == null || value === '') {
      return '';
    }
    if (typeof value === 'number') {
      return String(value);
    }
    if (typeof value === 'object') {
      if (value.displayValue != null && value.displayValue !== '') {
        return String(value.displayValue);
      }
      if (value.value != null && !isNaN(Number(value.value))) {
        return String(Math.round(Number(value.value)));
      }
      return '';
    }
    return String(value);
  }

  function statusType(event, comp) {
    if (comp && comp.status && comp.status.type) {
      return comp.status.type;
    }
    if (event && event.status && event.status.type) {
      return event.status.type;
    }
    return {};
  }

  function specialLabel(status) {
    var name = String((status && status.name) || '').toUpperCase();
    var detail = String((status && (status.shortDetail || status.detail)) || '');
    var low = detail.toLowerCase();
    if (name.indexOf('POSTPON') !== -1 || low.indexOf('postpon') !== -1) {
      return 'Postponed';
    }
    if (name.indexOf('CANCEL') !== -1 || low.indexOf('cancel') !== -1) {
      return 'Canceled';
    }
    if (name.indexOf('DELAY') !== -1 || low.indexOf('delay') !== -1) {
      return detail || 'Delayed';
    }
    return '';
  }

  function gameFromEvent(event, team, todayKey, timeZone) {
    if (!event || !team) {
      return null;
    }
    var start = new Date(event.date || '');
    if (isNaN(start.getTime())) {
      return null;
    }
    var zone = timeZone || 'America/New_York';
    if (localDateKey(start, zone) !== todayKey) {
      return null;
    }
    var comp = (event.competitions && event.competitions[0]) || null;
    if (!comp) {
      return null;
    }
    var competitors = comp.competitors || [];
    var us = null;
    var them = null;
    var want = String(team.teamId);
    var i;
    for (i = 0; i < competitors.length; i++) {
      var row = competitors[i] || {};
      var club = row.team || {};
      if (String(club.id) === want) {
        us = row;
      } else if (!them) {
        them = row;
      }
    }
    if (!us || !them) {
      return null;
    }
    var status = statusType(event, comp);
    var state = status.state || 'pre';
    if (state !== 'in' && state !== 'post') {
      state = 'pre';
    }
    var themTeam = them.team || {};
    var note = state === 'pre' ? specialLabel(status) : '';
    return {
      id: String(event.id || (event.date + ':' + want)),
      teamName: team.name || 'Team',
      opponent: themTeam.shortDisplayName || themTeam.abbreviation || 'Opponent',
      home: us.homeAway === 'home',
      state: state,
      note: note,
      detail: status.shortDetail || status.detail || (state === 'post' ? 'Final' : 'Live'),
      ourScore: readScore(us.score),
      theirScore: readScore(them.score),
      startMs: start.getTime(),
      startLabel: formatStart(start, zone)
    };
  }

  function sortGames(games) {
    var rank = { in: 0, pre: 1, post: 2 };
    return (games || []).slice().sort(function (a, b) {
      var ra = rank[a.state] != null ? rank[a.state] : 3;
      var rb = rank[b.state] != null ? rank[b.state] : 3;
      if (ra !== rb) {
        return ra - rb;
      }
      return a.startMs - b.startMs;
    });
  }

  function collectGames(entries, todayKey, timeZone) {
    var games = [];
    var seen = {};
    var i;
    var j;
    entries = entries || [];
    for (i = 0; i < entries.length; i++) {
      var entry = entries[i] || {};
      var board = entry.scoreboard || {};
      var events = board.events || [];
      for (j = 0; j < events.length; j++) {
        var game = gameFromEvent(events[j], entry, todayKey, timeZone);
        if (!game || seen[game.id]) {
          continue;
        }
        seen[game.id] = true;
        games.push(game);
      }
    }
    return sortGames(games);
  }

  function formatGameLine(game) {
    if (!game) {
      return '';
    }
    var us = game.teamName || 'Team';
    var them = game.opponent || 'Opponent';
    var where = game.home ? ' vs ' : ' at ';
    if (game.note) {
      return us + where + them + ' · ' + game.note;
    }
    if (game.state === 'pre') {
      return us + where + them + ' · ' + (game.startLabel || 'Today');
    }
    var detail = game.detail || (game.state === 'in' ? 'Live' : 'Final');
    var line = us + ' ' + (game.ourScore || '0') + ', ' + them + ' ' + (game.theirScore || '0');
    if (game.state === 'in') {
      return 'Live · ' + line + ' · ' + detail;
    }
    return line + ' · ' + detail;
  }

  function selectDisplayGames(games) {
    var live = [];
    var i;
    games = games || [];
    for (i = 0; i < games.length; i++) {
      if (games[i] && games[i].state === 'in') {
        live.push(games[i]);
      }
    }
    if (live.length) {
      return live;
    }
    return games;
  }

  function nextRefreshMs(games, nowMs) {
    var i;
    var has = false;
    games = games || [];
    for (i = 0; i < games.length; i++) {
      has = true;
      if (games[i].state === 'in') {
        return 60000;
      }
      if (games[i].state === 'pre' && !games[i].note && (games[i].startMs - nowMs) <= 20 * 60 * 1000) {
        return 60000;
      }
    }
    if (has) {
      return 5 * 60 * 1000;
    }
    return 15 * 60 * 1000;
  }

  function scoreboardUrl(team, dateKey) {
    return 'https://site.api.espn.com/apis/site/v2/sports/' +
      encodeURIComponent(team.sport) + '/' +
      encodeURIComponent(team.league) +
      '/scoreboard?dates=' + encodeURIComponent(dateKey);
  }

  exports.localDateKey = localDateKey;
  exports.formatStart = formatStart;
  exports.gameFromEvent = gameFromEvent;
  exports.collectGames = collectGames;
  exports.formatGameLine = formatGameLine;
  exports.sortGames = sortGames;
  exports.selectDisplayGames = selectDisplayGames;
  exports.nextRefreshMs = nextRefreshMs;
  exports.scoreboardUrl = scoreboardUrl;
  exports.DEFAULT_TEAMS = DEFAULT_TEAMS;

  function attachBrowserApi() {
    if (typeof window === 'undefined' || !window.KH || !window.KH.util) {
      return;
    }
    var util = window.KH.util;
    var cfg = util.cfg || {};
    var scoresCfg = cfg.scores || {};
    var current = [];
    var index = 0;
    var failCount = 0;
    var enabled = scoresCfg.enabled !== false;

    function teams() {
      var list = scoresCfg.teams;
      if (!list || !list.length) {
        return DEFAULT_TEAMS;
      }
      return list;
    }

    function rotateMs() {
      var seconds = Number(scoresCfg.rotateSeconds);
      if (!seconds || seconds < 5) {
        return 12000;
      }
      return seconds * 1000;
    }

    function zone() {
      return util.timezone();
    }

    function todayKey() {
      return localDateKey(util.now(), zone());
    }

    function hide() {
      current = [];
      index = 0;
      util.clearTimer('scores-rotate');
      var el = util.$('scores');
      if (!el) {
        return;
      }
      el.hidden = true;
      el.className = 'scores';
      el.textContent = '';
    }

    function paint(savedAt) {
      util.safeRender('scores', function () {
        var el = util.$('scores');
        if (!el || !current.length) {
          hide();
          return;
        }
        if (index >= current.length) {
          index = 0;
        }
        var game = current[index];
        el.hidden = false;
        el.className = 'scores' + (game.state === 'in' ? ' is-live' : '');
        var intervalMin = (cfg.refreshMinutes && cfg.refreshMinutes.scores) || 5;
        var stale = savedAt && (Date.now() - savedAt) > intervalMin * 2 * 60 * 1000;
        if (stale || util.isOffline()) {
          el.className += ' is-stale';
        }
        el.textContent = formatGameLine(game);
      });
    }

    function armRotate(savedAt) {
      util.clearTimer('scores-rotate');
      if (current.length < 2) {
        return;
      }
      util.schedule('scores-rotate', function tick() {
        index += 1;
        if (index >= current.length) {
          index = 0;
        }
        paint(savedAt);
        util.schedule('scores-rotate', tick, rotateMs());
      }, rotateMs());
    }

    function applyGames(games, savedAt) {
      current = selectDisplayGames(games);
      index = 0;
      if (!current.length) {
        hide();
        return;
      }
      paint(savedAt);
      armRotate(savedAt);
      if (window.KH.status && window.KH.status.set) {
        window.KH.status.set('scores', savedAt || Date.now());
      }
    }

    function scheduleRefresh(games) {
      var base = nextRefreshMs(games, util.nowMs());
      var delay = base >= 5 * 60 * 1000 ? util.jitterMs(base / 60000) : base;
      util.schedule('scores', refresh, delay);
    }

    function loadBoards(dateKey) {
      if (util.query.scoresFixture && util.debug()) {
        return util.fetchJson('scores-fixture', 'tests/fixtures/scores-gameday.json', { record: false }).then(function (data) {
          var boards = (data && data.boards) || [];
          var list = teams();
          var i;
          var out = [];
          for (i = 0; i < list.length; i++) {
            var board = null;
            var j;
            for (j = 0; j < boards.length; j++) {
              if (boards[j] && boards[j].league === list[i].league) {
                board = boards[j];
              }
            }
            out.push({
              name: list[i].name,
              teamId: list[i].teamId,
              scoreboard: board || { events: [] }
            });
          }
          return out;
        });
      }
      return Promise.all(teams().map(function (team) {
        return util.fetchJson('scores-' + team.league, scoreboardUrl(team, dateKey), { record: false }).then(function (data) {
          return {
            name: team.name,
            teamId: team.teamId,
            league: team.league,
            scoreboard: data,
            ok: true
          };
        }).catch(function (err) {
          console.error('[scores]', err);
          return {
            name: team.name,
            teamId: team.teamId,
            league: team.league,
            scoreboard: null,
            ok: false
          };
        });
      })).then(function (results) {
        var ok = 0;
        var i;
        for (i = 0; i < results.length; i++) {
          if (results[i].ok) {
            ok += 1;
          }
        }
        if (!ok) {
          throw new Error('scores unavailable');
        }
        return results;
      });
    }

    function refresh() {
      if (!enabled) {
        hide();
        return;
      }
      var key = todayKey();
      loadBoards(key).then(function (entries) {
        failCount = 0;
        var games = collectGames(entries, key, zone());
        if (!(util.query.scoresFixture && util.debug())) {
          util.cacheSet('scores', { dateKey: key, games: games });
        }
        applyGames(games, Date.now());
        scheduleRefresh(games);
      }).catch(function (err) {
        console.error('[scores]', err);
        failCount += 1;
        var cached = util.cacheGet('scores');
        if (cached && cached.data && cached.data.dateKey === key && cached.data.games) {
          applyGames(cached.data.games, cached.savedAt);
          scheduleRefresh(cached.data.games);
        } else {
          hide();
          util.schedule('scores', refresh, util.backoffMs(failCount));
        }
      });
    }

    function renderCache() {
      if (!enabled) {
        hide();
        return;
      }
      var key = todayKey();
      var cached = util.cacheGet('scores');
      if (cached && cached.data && cached.data.dateKey === key && cached.data.games && cached.data.games.length) {
        applyGames(cached.data.games, cached.savedAt);
      } else {
        hide();
      }
    }

    exports.hasGame = function () {
      return current.length > 0;
    };

    exports.init = function () {
      renderCache();
      refresh();
      util.onReschedule(refresh);
    };

    exports.refresh = refresh;
  }

  if (typeof window !== 'undefined') {
    attachBrowserApi();
    if (window.KH) {
      window.KH.scores = exports;
    }
  }
})(typeof module !== 'undefined' && module.exports
  ? module.exports
  : ((window.KH = window.KH || {}).scores = (window.KH && window.KH.scores) || {}));

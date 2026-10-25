(function (exports) {
  'use strict';

  // Feed hosts do not allow browser CORS. r.jina.ai returns the feed as text
  // and reflects the page origin, so the tablet can read public headlines.
  var READER = 'https://r.jina.ai/';
  var SWIPE_MIN_PX = 48;
  // Same national outlets as the News app (C:\Dev\News src/lib/sources.ts).
  var FEEDS = {
    'ap-top': { name: 'Associated Press', url: 'https://feeds.apnews.com/rss/apf-topnews' },
    reuters: { name: 'Reuters', url: 'https://www.reutersagency.com/feed/?taxonomy=best-topics&post_type=best' },
    npr: { name: 'NPR', url: 'https://feeds.npr.org/1001/rss.xml' },
    pbs: { name: 'PBS NewsHour', url: 'https://www.pbs.org/newshour/feeds/rss/headlines' },
    'bbc-us': { name: 'BBC News', url: 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml' },
    'usa-today': { name: 'USA Today', url: 'https://rssfeeds.usatoday.com/usatoday-NewsTopStories' },
    'the-hill': { name: 'The Hill', url: 'https://thehill.com/feed/' },
    politico: { name: 'Politico', url: 'https://rss.politico.com/politics-news.xml' },
    cbs: { name: 'CBS News', url: 'https://www.cbsnews.com/latest/rss/main' },
    nbc: { name: 'NBC News', url: 'https://feeds.nbcnews.com/nbcnews/public/news' },
    abc: { name: 'ABC News', url: 'https://abcnews.go.com/abcnews/topstories' },
    nyt: { name: 'New York Times', url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml' },
    cnn: { name: 'CNN', url: 'http://rss.cnn.com/rss/edition.rss' },
    'guardian-us': { name: 'The Guardian', url: 'https://www.theguardian.com/us-news/rss' },
    wsj: { name: 'Wall Street Journal', url: 'https://feeds.a.dj.com/rss/RSSWorldNews.xml' },
    fox: { name: 'Fox News', url: 'https://moxie.foxnews.com/google-publisher/latest.xml' },
    'washington-examiner': { name: 'Washington Examiner', url: 'https://www.washingtonexaminer.com/feed' },
    techcrunch: { name: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
    'the-verge': { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },
    ars: { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index' },
    wired: { name: 'Wired', url: 'https://www.wired.com/feed/rss' },
    'espn-top': { name: 'ESPN', url: 'https://www.espn.com/espn/rss/news' },
    'espn-nfl': { name: 'ESPN NFL', url: 'https://www.espn.com/espn/rss/nfl/news' },
    'espn-nba': { name: 'ESPN NBA', url: 'https://www.espn.com/espn/rss/nba/news' },
    si: { name: 'Sports Illustrated', url: 'https://www.si.com/rss/si_topnews.rss' },
    'cbs-sports': { name: 'CBS Sports', url: 'https://www.cbssports.com/rss/headlines/' },
    variety: { name: 'Variety', url: 'https://variety.com/feed/' },
    'hollywood-reporter': { name: 'The Hollywood Reporter', url: 'https://www.hollywoodreporter.com/feed/' },
    'rolling-stone': { name: 'Rolling Stone', url: 'https://www.rollingstone.com/feed/' },
    ign: { name: 'IGN', url: 'https://feeds.feedburner.com/ign/all' }
  };
  var DATE_LINE = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{1,2} [A-Za-z]{3} \d{4}\b/;
  var HEADING = /^### \[(.+)\]\((https?:\/\/[^)\s]+)\)\s*$/;

  function decodeEntities(text) {
    var named = {
      amp: '&',
      lt: '<',
      gt: '>',
      quot: '"',
      apos: "'",
      nbsp: ' '
    };
    return String(text || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (all, body) {
      var key = body.toLowerCase();
      if (named[key]) {
        return named[key];
      }
      if (key.charAt(0) === '#') {
        var hex = key.charAt(1) === 'x';
        var code = hex ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
        if (!isNaN(code) && code > 0 && code < 1114112) {
          return String.fromCharCode(code);
        }
      }
      return all;
    });
  }

  function unwrapCdata(value) {
    var text = String(value || '').trim();
    var match = text.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
    if (match) {
      return match[1];
    }
    return text;
  }

  function stripHtml(value) {
    var text = unwrapCdata(value);
    text = text.replace(/<script[\s\S]*?<\/script>/gi, ' ');
    text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ');
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/p>/gi, '\n\n');
    text = text.replace(/<[^>]+>/g, '');
    text = decodeEntities(text);
    text = text.replace(/\u00a0/g, ' ');
    text = text.replace(/\(Image credit:[^)]*\)/gi, '');
    text = text.replace(/[ \t]+\n/g, '\n');
    text = text.replace(/[ \t]{2,}/g, ' ');
    text = text.replace(/\n{3,}/g, '\n\n');
    return text.trim();
  }

  function oneLine(value) {
    return stripHtml(value).replace(/\s+/g, ' ').trim();
  }

  function normTitle(title) {
    return String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function isPhotoUrl(url) {
    var value = String(url || '').trim();
    if (value.indexOf('http') !== 0) {
      return false;
    }
    var lower = value.toLowerCase();
    if (lower.indexOf('npr-rss-pixel') !== -1 || lower.indexOf('pixel.') !== -1 || lower.indexOf('/pixel') !== -1) {
      return false;
    }
    if (/\.(mp4|m3u8|mp3|webm)(\?|$)/.test(lower)) {
      return false;
    }
    if (/\.(jpe?g|png|webp|gif|avif)(\?|$)/.test(lower)) {
      return true;
    }
    if (lower.indexOf('/image/') !== -1 || lower.indexOf('image/upload') !== -1) {
      return true;
    }
    return false;
  }

  function extractImages(block) {
    var found = [];
    var seen = {};
    function add(url) {
      var clean = decodeEntities(String(url || '')).replace(/\s+/g, '').trim();
      if (!isPhotoUrl(clean) || seen[clean]) {
        return;
      }
      seen[clean] = true;
      found.push(clean);
    }
    var tagRe = /<(?:media:content|media:thumbnail|enclosure)\b[^>]*>/gi;
    var tag;
    while ((tag = tagRe.exec(block))) {
      var chunk = tag[0];
      var type = chunk.match(/\btype=["']([^"']+)["']/i);
      if (type && type[1].toLowerCase().indexOf('image') === -1 && type[1].toLowerCase().indexOf('video') !== -1) {
        continue;
      }
      if (type && type[1].toLowerCase().indexOf('video') === 0) {
        continue;
      }
      var mediaUrl = chunk.match(/\burl=["']([^"']+)["']/i);
      if (mediaUrl) {
        add(mediaUrl[1]);
      }
    }
    var imgRe = /<img\b[^>]*\bsrc=["']([^"']+)["']/gi;
    var img;
    while ((img = imgRe.exec(block))) {
      add(img[1]);
    }
    var mdRe = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g;
    var md;
    while ((md = mdRe.exec(block))) {
      add(md[1]);
    }
    return found.slice(0, 3);
  }

  function innerTag(block, tag) {
    var re = new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)</' + tag + '>', 'i');
    var match = block.match(re);
    if (!match) {
      return '';
    }
    return match[1];
  }

  function parseRss(xml, sourceName) {
    var items = [];
    var re = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
    var match;
    var raw = String(xml || '');
    while ((match = re.exec(raw))) {
      var block = match[1];
      var title = oneLine(innerTag(block, 'title'));
      if (!title) {
        continue;
      }
      var summary = stripHtml(innerTag(block, 'content:encoded'));
      var description = stripHtml(innerTag(block, 'description'));
      if (!summary || summary.length < description.length) {
        summary = description;
      }
      var images = extractImages(block);
      items.push({
        title: title,
        link: oneLine(innerTag(block, 'link')),
        published: oneLine(innerTag(block, 'pubDate')),
        source: sourceName || '',
        summary: summary,
        image: images[0] || '',
        images: images
      });
    }
    return items;
  }

  function parseReader(text, sourceName) {
    var lines = String(text || '').split(/\r?\n/);
    var items = [];
    var i = 0;
    while (i < lines.length) {
      var heading = lines[i].match(HEADING);
      if (!heading) {
        i += 1;
        continue;
      }
      var title = oneLine(heading[1]);
      var link = heading[2];
      var paras = [];
      var images = [];
      var published = '';
      i += 1;
      while (i < lines.length && lines[i].indexOf('### [') !== 0) {
        var line = lines[i].trim();
        i += 1;
        if (!line) {
          continue;
        }
        var picture = line.match(/^!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/);
        if (picture) {
          images = images.concat(extractImages(line));
          continue;
        }
        if (DATE_LINE.test(line)) {
          published = line;
          continue;
        }
        if (line.indexOf('[http') === 0 || line.indexOf('http') === 0) {
          continue;
        }
        paras.push(line);
      }
      if (title) {
        items.push({
          title: title,
          link: link,
          published: published,
          source: sourceName || '',
          summary: paras.join('\n\n'),
          image: images[0] || '',
          images: images.slice(0, 3)
        });
      }
    }
    return items;
  }

  function parseFeed(text, sourceName) {
    var raw = String(text || '');
    if (/<item[\s>]/.test(raw)) {
      var rss = parseRss(raw, sourceName);
      if (rss.length) {
        return rss;
      }
    }
    return parseReader(raw, sourceName);
  }

  function mergeHeadlines(lists, maxItems, nowMs) {
    var cap = maxItems || 10;
    var cutoff = nowMs - 48 * 60 * 60 * 1000;
    var leads = [];
    var i;
    var j;
    for (i = 0; i < lists.length; i++) {
      var list = lists[i] || [];
      var best = null;
      var bestMs = -1;
      var seenInList = 0;
      for (j = 0; j < list.length && seenInList < 10; j++) {
        var item = list[j];
        if (!item || !item.title) {
          continue;
        }
        seenInList += 1;
        var publishedMs = Date.parse(item.published || '');
        if (isNaN(publishedMs)) {
          publishedMs = 0;
        }
        if (publishedMs && publishedMs < cutoff) {
          continue;
        }
        if (publishedMs >= bestMs) {
          best = item;
          bestMs = publishedMs;
        }
      }
      if (best) {
        leads.push(best);
      }
    }
    leads.sort(function (a, b) {
      var ta = Date.parse(a.published || '');
      var tb = Date.parse(b.published || '');
      if (isNaN(ta)) {
        ta = 0;
      }
      if (isNaN(tb)) {
        tb = 0;
      }
      return tb - ta;
    });
    var seen = {};
    var all = [];
    for (i = 0; i < leads.length; i++) {
      var key = normTitle(leads[i].title);
      if (!key || seen[key]) {
        continue;
      }
      seen[key] = true;
      all.push(leads[i]);
      if (all.length >= cap) {
        break;
      }
    }
    return all;
  }

  function summaryParagraphs(item) {
    var parts = String(item && item.summary || '').split(/\n+/);
    var titleKey = normTitle(item && item.title);
    var out = [];
    var i;
    for (i = 0; i < parts.length; i++) {
      var line = parts[i].replace(/\s+/g, ' ').trim();
      if (!line) {
        continue;
      }
      if (/^image credit/i.test(line)) {
        continue;
      }
      if (titleKey && normTitle(line) === titleKey) {
        continue;
      }
      out.push(line);
    }
    return out;
  }

  exports.decodeEntities = decodeEntities;
  exports.stripHtml = stripHtml;
  exports.parseRss = parseRss;
  exports.parseReader = parseReader;
  exports.parseFeed = parseFeed;
  exports.mergeHeadlines = mergeHeadlines;
  function stepIndex(index, length, dir) {
    if (!length) {
      return 0;
    }
    var next = index + dir;
    next = next % length;
    if (next < 0) {
      next += length;
    }
    return next;
  }

  exports.isPhotoUrl = isPhotoUrl;
  exports.extractImages = extractImages;
  exports.summaryParagraphs = summaryParagraphs;
  exports.normTitle = normTitle;
  exports.stepIndex = stepIndex;

  function attachBrowserApi() {
    var KH = window.KH || (window.KH = {});
    var util = KH.util;
    var items = [];
    var index = 0;
    var savedAt = 0;
    var detailOpen = false;
    var failCount = 0;
    var emptyMessage = 'Loading headlines…';
    var bound = false;

    function rotateSeconds() {
      var newsCfg = util.cfg.news || {};
      var sec = newsCfg.rotateSeconds || 20;
      if (sec < 5) {
        sec = 5;
      }
      return sec;
    }

    function newsSources() {
      var newsCfg = util.cfg.news || {};
      if (newsCfg.sources && newsCfg.sources.length) {
        return newsCfg.sources;
      }
      return Object.keys(FEEDS);
    }

    function maxItems() {
      var newsCfg = util.cfg.news || {};
      return newsCfg.maxItems || 10;
    }

    function el(tag, className, text) {
      var node = document.createElement(tag);
      if (className) {
        node.className = className;
      }
      if (text != null) {
        node.textContent = text;
      }
      return node;
    }

    function ageLabel(published) {
      var t = Date.parse(published || '');
      if (isNaN(t)) {
        return '';
      }
      return util.formatAge(t);
    }

    function applyStale(node) {
      if (!node) {
        return;
      }
      var minutes = (util.cfg.refreshMinutes && util.cfg.refreshMinutes.news) || 15;
      var stale = savedAt && (Date.now() - savedAt) > minutes * 2 * 60 * 1000;
      if (stale || util.isOffline()) {
        node.classList.add('is-stale');
      } else {
        node.classList.remove('is-stale');
      }
    }

    function armRotate() {
      util.clearTimer('news-rotate');
      if (detailOpen || items.length < 2) {
        return;
      }
      util.schedule('news-rotate', function () {
        if (detailOpen || !items.length) {
          return;
        }
        index = stepIndex(index, items.length, 1);
        renderHeadline();
        armRotate();
      }, rotateSeconds() * 1000);
    }

    function renderHeadline() {
      util.safeRender('news', function () {
        var root = util.$('news');
        if (!root) {
          return;
        }
        util.emptyEl(root);
        root.appendChild(el('div', 'panel-kicker', 'News'));
        if (!items.length) {
          root.appendChild(el('p', 'placeholder-copy', emptyMessage));
          applyStale(root);
          return;
        }
        var item = items[index] || items[0];
        var hit = el('button', 'news-hit');
        hit.type = 'button';
        hit.appendChild(el('div', 'news-headline', item.title));
        var meta = item.source || 'News';
        var age = ageLabel(item.published);
        if (age) {
          meta += ' · ' + age;
        }
        meta += ' · ' + (index + 1) + '/' + items.length;
        hit.appendChild(el('div', 'news-meta', meta));
        var dots = el('div', 'news-dots');
        var i;
        for (i = 0; i < items.length; i++) {
          dots.appendChild(el('span', 'news-dot' + (i === index ? ' is-on' : '')));
        }
        hit.appendChild(dots);
        hit.appendChild(el('div', 'news-hint', 'Swipe · tap for details'));
        root.appendChild(hit);
        applyStale(root);
      });
    }

    function renderDetail() {
      var panel = util.$('news-detail');
      var item = items[index];
      if (!panel || !item) {
        return;
      }
      util.emptyEl(panel);
      var backdrop = el('div', 'news-modal-backdrop');
      var card = el('div', 'news-modal-card');
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'true');
      card.setAttribute('aria-label', item.title);
      var closeBtn = el('button', 'news-close', '\u00d7');
      closeBtn.type = 'button';
      closeBtn.setAttribute('aria-label', 'Close');
      var scroller = el('div', 'news-modal-scroll');
      var images = item.images && item.images.length ? item.images : [];
      if (!images.length && item.image) {
        images = [item.image];
      }
      var i;
      for (i = 0; i < images.length; i++) {
        var photo = document.createElement('img');
        photo.className = 'news-photo';
        photo.alt = '';
        photo.src = images[i];
        photo.addEventListener('error', function () {
          this.hidden = true;
        });
        photo.addEventListener('load', function () {
          if (this.naturalWidth < 40 || this.naturalHeight < 40) {
            this.hidden = true;
          }
        });
        scroller.appendChild(photo);
      }
      scroller.appendChild(el('h2', 'news-detail-title', item.title));
      var meta = item.source || 'News';
      var age = ageLabel(item.published);
      if (age) {
        meta += ' · ' + age;
      }
      scroller.appendChild(el('div', 'news-detail-meta', meta));
      var body = el('div', 'news-detail-body');
      var paras = summaryParagraphs(item);
      if (!paras.length) {
        body.appendChild(el('p', null, 'No summary available for this story.'));
      } else {
        for (i = 0; i < paras.length; i++) {
          body.appendChild(el('p', null, paras[i]));
        }
      }
      scroller.appendChild(body);
      card.appendChild(closeBtn);
      card.appendChild(scroller);
      panel.appendChild(backdrop);
      panel.appendChild(card);
      panel.hidden = false;
      scroller.scrollTop = 0;
      applyStale(card);
    }

    function openDetail() {
      if (!items.length) {
        return;
      }
      detailOpen = true;
      util.clearTimer('news-rotate');
      renderDetail();
    }

    function closeDetail() {
      detailOpen = false;
      var panel = util.$('news-detail');
      if (panel) {
        panel.hidden = true;
        util.emptyEl(panel);
      }
      armRotate();
    }

    function applyItems(list, at) {
      var currentKey = items[index] ? normTitle(items[index].title) : '';
      var still = false;
      items = list || [];
      savedAt = at || Date.now();
      index = 0;
      if (currentKey) {
        var i;
        for (i = 0; i < items.length; i++) {
          if (normTitle(items[i].title) === currentKey) {
            index = i;
            still = true;
            break;
          }
        }
      }
      if (window.KH && window.KH.status) {
        window.KH.status.set('news', savedAt);
      }
      renderHeadline();
      if (detailOpen && (!still || !items.length)) {
        closeDetail();
      } else if (detailOpen) {
        renderDetail();
      } else {
        armRotate();
      }
    }

    function fetchDirect(feed) {
      return util.fetchText('news-direct-' + feed.name, feed.url, {
        record: false,
        timeout: 20000
      }).then(function (text) {
        return parseFeed(text, feed.name);
      }).catch(function (err) {
        console.error('[news]', feed.name, err);
        return [];
      });
    }

    function xmlFromReader(data) {
      if (data && data.data && typeof data.data.html === 'string') {
        return data.data.html;
      }
      if (data && typeof data.html === 'string') {
        return data.html;
      }
      return '';
    }

    function fetchMarkdown(feed) {
      return util.fetchText('news-md-' + feed.name, READER + feed.url, {
        record: false,
        timeout: 20000
      }).then(function (text) {
        var parsed = parseFeed(text, feed.name);
        if (parsed.length) {
          return parsed;
        }
        return fetchDirect(feed);
      }).catch(function (err) {
        console.error('[news]', feed.name, err);
        return fetchDirect(feed);
      });
    }

    function fetchFeed(key) {
      var feed = FEEDS[key];
      if (!feed) {
        return Promise.resolve([]);
      }
      return util.fetchJson('news-' + key, READER + feed.url, {
        record: false,
        timeout: 25000,
        headers: {
          Accept: 'application/json',
          'X-Return-Format': 'html'
        }
      }).then(function (data) {
        var parsed = parseFeed(xmlFromReader(data), feed.name);
        if (parsed.length) {
          return parsed;
        }
        return fetchMarkdown(feed);
      }).catch(function (err) {
        console.error('[news]', key, err);
        return fetchMarkdown(feed);
      });
    }

    function scheduleRefresh(fails) {
      var minutes = (util.cfg.refreshMinutes && util.cfg.refreshMinutes.news) || 15;
      var delay = fails > 0 ? util.backoffMs(fails) : util.jitterMs(minutes);
      util.schedule('news', refresh, delay);
    }

    function refresh() {
      var sources = newsSources();
      var lists = [];
      var keys = [];
      var i;
      for (i = 0; i < sources.length; i++) {
        if (FEEDS[sources[i]]) {
          lists.push(null);
          keys.push(sources[i]);
        }
      }
      if (!keys.length) {
        emptyMessage = 'Headlines unavailable';
        renderHeadline();
        return;
      }
      var pending = keys.length;
      var saw = false;
      function settle(idx, parsed) {
        lists[idx] = parsed || [];
        if (lists[idx].length) {
          saw = true;
        }
        var merged = mergeHeadlines(lists, maxItems(), Date.now());
        if (merged.length) {
          util.cacheSet('news', merged);
          applyItems(merged, Date.now());
        }
        pending -= 1;
        if (pending > 0) {
          return;
        }
        if (saw && merged.length) {
          failCount = 0;
          scheduleRefresh(0);
          return;
        }
        failCount += 1;
        var cached = util.cacheGet('news');
        if (!items.length && cached && cached.data && cached.data.length) {
          applyItems(cached.data, cached.savedAt);
        } else if (!items.length) {
          emptyMessage = 'Headlines unavailable';
          renderHeadline();
        }
        scheduleRefresh(failCount);
      }
      var cursor = 0;
      var running = 0;
      var pool = 4;
      function launch() {
        while (running < pool && cursor < keys.length) {
          (function (idx, key) {
            running += 1;
            fetchFeed(key).then(function (parsed) {
              running -= 1;
              settle(idx, parsed);
              launch();
            });
          })(cursor, keys[cursor]);
          cursor += 1;
        }
      }
      launch();
    }

    var swipe = { x: 0, y: 0, active: false, suppress: false };

    function step(dir) {
      if (items.length < 2) {
        return;
      }
      index = stepIndex(index, items.length, dir);
      renderHeadline();
      if (detailOpen) {
        renderDetail();
      } else {
        armRotate();
      }
    }

    function onPointerDown(ev) {
      if (!items.length) {
        return;
      }
      if (ev.pointerType === 'mouse' && ev.button !== 0) {
        return;
      }
      swipe.active = true;
      swipe.x = ev.clientX;
      swipe.y = ev.clientY;
      if (ev.currentTarget.setPointerCapture) {
        try {
          ev.currentTarget.setPointerCapture(ev.pointerId);
        } catch (err) {
          console.error('[news]', err);
        }
      }
    }

    function onPointerUp(ev) {
      if (!swipe.active) {
        return;
      }
      swipe.active = false;
      var dx = ev.clientX - swipe.x;
      var dy = ev.clientY - swipe.y;
      if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy)) {
        return;
      }
      swipe.suppress = true;
      ev.preventDefault();
      ev.stopPropagation();
      step(dx < 0 ? 1 : -1);
    }

    function onPointerCancel() {
      swipe.active = false;
    }

    function onNewsClick(ev) {
      if (swipe.suppress) {
        swipe.suppress = false;
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      var node = ev.target;
      while (node && node.id !== 'news') {
        if (node.classList && node.classList.contains('news-hit')) {
          ev.preventDefault();
          ev.stopPropagation();
          openDetail();
          return;
        }
        node = node.parentNode;
      }
    }

    function onDetailClick(ev) {
      if (swipe.suppress) {
        swipe.suppress = false;
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      var node = ev.target;
      while (node && node.id !== 'news-detail') {
        if (node.classList && node.classList.contains('news-close')) {
          ev.preventDefault();
          ev.stopPropagation();
          closeDetail();
          return;
        }
        if (node.classList && node.classList.contains('news-modal-card')) {
          return;
        }
        node = node.parentNode;
      }
      if (!swipe.suppress) {
        closeDetail();
      }
    }

    function renderCache() {
      var cached = util.cacheGet('news');
      if (cached && cached.data && cached.data.length) {
        applyItems(cached.data, cached.savedAt);
      } else {
        emptyMessage = 'Loading headlines…';
        renderHeadline();
      }
    }

    exports.init = function () {
      if (!bound) {
        var newsEl = util.$('news');
        var detailEl = util.$('news-detail');
        if (newsEl) {
          newsEl.addEventListener('click', onNewsClick);
          newsEl.addEventListener('pointerdown', onPointerDown);
          newsEl.addEventListener('pointerup', onPointerUp);
          newsEl.addEventListener('pointercancel', onPointerCancel);
        }
        if (detailEl) {
          detailEl.addEventListener('click', onDetailClick);
          detailEl.addEventListener('pointerdown', onPointerDown);
          detailEl.addEventListener('pointerup', onPointerUp);
          detailEl.addEventListener('pointercancel', onPointerCancel);
        }
        bound = true;
      }
      renderCache();
      refresh();
      util.onReschedule(function () {
        scheduleRefresh(failCount);
        if (!detailOpen) {
          armRotate();
        }
      });
    };

    exports.refresh = refresh;
    KH.news = exports;
  }

  if (typeof window !== 'undefined' && window.document) {
    attachBrowserApi();
  }
})(typeof module !== 'undefined' && module.exports
  ? module.exports
  : ((window.KH = window.KH || {}).news = (window.KH && window.KH.news) || {}));

const { test } = require('node:test');
const assert = require('node:assert/strict');
const news = require('../js/news.js');

const RSS = [
  '<rss><channel>',
  '<item>',
  '<title>Alpha &amp; the beta</title>',
  '<link>https://example.com/a</link>',
  '<pubDate>Wed, 21 Oct 2026 15:00:00 GMT</pubDate>',
  '<description>Short alpha summary.</description>',
  '<media:content url="https://cdn.example.com/alpha.jpg" type="image/jpeg" />',
  '<media:content url="https://cdn.example.com/clip.m3u8" type="application/x-mpegURL" />',
  '<content:encoded><![CDATA[<p>Alpha has a longer explanation.</p><p>Second paragraph.</p><img src="https://cdn.example.com/alpha-wide.png" /><img src="https://media.npr.org/include/images/tracking/npr-rss-pixel.png" />]]></content:encoded>',
  '</item>',
  '<item>',
  '<title><![CDATA[Gamma story]]></title>',
  '<link>https://example.com/g</link>',
  '<pubDate>Wed, 21 Oct 2026 12:00:00 GMT</pubDate>',
  '<description>Gamma summary only.</description>',
  '</item>',
  '<item>',
  '<title>Old story</title>',
  '<pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>',
  '<description>Too old to show.</description>',
  '</item>',
  '</channel></rss>'
].join('');

const READER = [
  'Title: Example',
  '',
  '### [City council sets the levy](https://example.com/levy)',
  '',
  '![City hall](https://cdn.example.com/levy.jpg)',
  '',
  'The council voted Tuesday to keep the same rate.',
  '',
  '[https://example.com/levy](https://example.com/levy)',
  'Wed, 21 Oct 2026 15:49:00 GMT',
  '',
  '### [Same headline from another desk](https://example.com/other)',
  '',
  'Duplicate title should collapse after merge.',
  'Wed, 21 Oct 2026 15:40:00 GMT'
].join('\n');

test('parses RSS titles, summaries, and entities', function () {
  var items = news.parseRss(RSS, 'NPR');
  assert.equal(items.length, 3);
  assert.equal(items[0].title, 'Alpha & the beta');
  assert.equal(items[0].source, 'NPR');
  assert.equal(items[0].link, 'https://example.com/a');
  assert.match(items[0].summary, /longer explanation/);
  assert.match(items[0].summary, /Second paragraph/);
  assert.equal(items[1].title, 'Gamma story');
  assert.equal(items[1].summary, 'Gamma summary only.');
  assert.equal(items[0].image, 'https://cdn.example.com/alpha.jpg');
  assert.deepEqual(items[0].images, [
    'https://cdn.example.com/alpha.jpg',
    'https://cdn.example.com/alpha-wide.png'
  ]);
});

test('parses reader markdown headlines and dates', function () {
  var items = news.parseReader(READER, 'WTHR');
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'City council sets the levy');
  assert.equal(items[0].summary, 'The council voted Tuesday to keep the same rate.');
  assert.equal(items[0].image, 'https://cdn.example.com/levy.jpg');
  assert.equal(items[0].published, 'Wed, 21 Oct 2026 15:49:00 GMT');
  assert.equal(items[1].source, 'WTHR');
});

test('parseFeed prefers RSS when the body is a feed', function () {
  var items = news.parseFeed(RSS, 'NPR');
  assert.equal(items[0].title, 'Alpha & the beta');
  var readerItems = news.parseFeed(READER, 'WTHR');
  assert.equal(readerItems[0].source, 'WTHR');
});

test('merges by recency, drops stale items, and dedupes titles', function () {
  var now = Date.parse('2026-10-21T16:00:00Z');
  var npr = news.parseRss(RSS, 'NPR');
  var wthr = news.parseReader(READER, 'WTHR');
  wthr.push({
    title: 'Alpha & the beta',
    source: 'WTHR',
    published: 'Wed, 21 Oct 2026 14:00:00 GMT',
    summary: 'Older copy of the same story.',
    link: 'https://example.com/dup'
  });
  var merged = news.mergeHeadlines([npr, wthr], 10, now);
  assert.equal(merged[0].title, 'City council sets the levy');
  assert.equal(merged.some(function (item) { return item.title === 'Old story'; }), false);
  var alphas = merged.filter(function (item) { return item.title === 'Alpha & the beta'; });
  assert.equal(alphas.length, 1);
  assert.equal(alphas[0].source, 'NPR');
});

test('swipe steps wrap in both directions', function () {
  assert.equal(news.stepIndex(0, 10, 1), 1);
  assert.equal(news.stepIndex(9, 10, 1), 0);
  assert.equal(news.stepIndex(0, 10, -1), 9);
  assert.equal(news.stepIndex(3, 0, 1), 0);
});

test('summary paragraphs skip a repeated title', function () {
  var paras = news.summaryParagraphs({
    title: 'Gamma story',
    summary: 'Gamma story\n\nThe rest of the summary.'
  });
  assert.deepEqual(paras, ['The rest of the summary.']);
});

test('escaped feed markup is shown as text', function () {
  assert.equal(
    news.stripHtml('&lt;p&gt;Hello &amp;amp; welcome&lt;/p&gt;&lt;p&gt;See the &lt;a href="https://example.com"&gt;story&lt;/a&gt;.&lt;/p&gt;'),
    'Hello & welcome\n\nSee the story.'
  );
  assert.equal(news.stripHtml('&amp;lt;p&amp;gt;Hi&amp;lt;/p&amp;gt;'), 'Hi');
  assert.equal(news.stripHtml('Plain &amp; simple'), 'Plain & simple');
  var xml = [
    '<rss><channel><item>',
    '<title>Tagged story</title>',
    '<description>&lt;p&gt;Hello &amp;amp; welcome&lt;/p&gt;&lt;p&gt;Second&lt;/p&gt;</description>',
    '</item></channel></rss>'
  ].join('');
  var item = news.parseRss(xml, 'Fox')[0];
  assert.equal(item.summary.indexOf('<'), -1);
  assert.deepEqual(news.summaryParagraphs(item), ['Hello & welcome', 'Second']);
  var cached = news.summaryParagraphs({
    title: 'Tagged story',
    summary: '<p>Hello</p>\n\n<p>Second</p>'
  });
  assert.deepEqual(cached, ['Hello', 'Second']);
});

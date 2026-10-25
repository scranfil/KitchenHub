'use strict';

var CACHE = 'kh-shell-3';
var SHELL = [
  './',
  './index.html',
  './config.js',
  './style.css',
  './manifest.webmanifest',
  './js/util.js',
  './js/icons.js',
  './js/weather.js',
  './js/alerts.js',
  './js/news.js',
  './js/presence.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

function putFresh(cache, url) {
  return fetch(new Request(url, { cache: 'reload' })).then(function (response) {
    if (!response || response.status !== 200) {
      throw new Error(url);
    }
    return cache.put(url, response);
  });
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return Promise.all(SHELL.map(function (url) {
        return putFresh(cache, url);
      }));
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE) {
          return caches.delete(key);
        }
        return Promise.resolve();
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

function sameOrigin(request) {
  return new URL(request.url).origin === self.location.origin;
}

function fromCache(request) {
  return caches.match(request, { ignoreSearch: true }).then(function (cached) {
    if (cached) {
      return cached;
    }
    if (request.mode === 'navigate') {
      return caches.match('./index.html');
    }
    return new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  });
}

function networkFirst(request) {
  return fetch(request, { cache: 'reload' }).then(function (response) {
    if (response && response.status === 200 && response.type === 'basic') {
      var copy = response.clone();
      caches.open(CACHE).then(function (cache) {
        return cache.put(request, copy);
      });
    }
    return response;
  }).catch(function () {
    return fromCache(request);
  });
}

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET' || !sameOrigin(event.request)) {
    return;
  }
  event.respondWith(networkFirst(event.request));
});

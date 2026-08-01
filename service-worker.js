"use strict";

const CACHE_PREFIX = "event-point-planner-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v3`;
const APP_SHELL_PATHS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon.svg",
];
const APP_SHELL_URLS = APP_SHELL_PATHS.map((path) => (
  new URL(path, self.registration.scope).href
));
const APP_SHELL_URL_SET = new Set(APP_SHELL_URLS);
const INDEX_URL = new URL("./index.html", self.registration.scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_URLS)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => (
            cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME
          ))
          .map((cacheName) => caches.delete(cacheName)),
      ))
      .then(() => self.clients.claim()),
  );
});

function cacheFirst(request) {
  return caches.open(CACHE_NAME).then((cache) => (
    cache.match(request).then((cachedResponse) => cachedResponse || fetch(request))
  ));
}

function cachedNavigation(request) {
  return caches.open(CACHE_NAME).then((cache) => (
    cache.match(INDEX_URL).then((cachedIndex) => cachedIndex || fetch(request))
  ));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(request.url);
  if (
    (requestUrl.protocol !== "http:" && requestUrl.protocol !== "https:")
    || requestUrl.origin !== self.location.origin
    || !requestUrl.href.startsWith(self.registration.scope)
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(cachedNavigation(request));
    return;
  }

  if (APP_SHELL_URL_SET.has(requestUrl.href)) {
    event.respondWith(cacheFirst(request));
  }
});

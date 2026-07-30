/**
 * Service worker: makes the site installable and playable offline.
 *
 * Strategy is network-first with a cache fallback, deliberately. Cache-first
 * would be faster, but these games get edited constantly and a stale cache on
 * a phone is genuinely annoying to clear. This way you always get the latest
 * version when you have signal, and the last-seen version when you don't.
 *
 * Nothing needs to be listed per-game: whatever you load gets cached as you
 * load it, so playing a game once online makes it available offline.
 */

const CACHE = "playground-v1";

// The launcher shell, so a cold offline start still gets you somewhere.
const SHELL = [
  "./",
  "./index.html",
  "./games.js",
  "./shared/style.css",
  "./shared/engine.js",
  "./shared/ui.js",
  "./shared/storage.js",
  "./manifest.webmanifest",
  "./icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // Individually, so one 404 doesn't fail the whole install.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((hit) => hit ?? caches.match("./index.html")),
      ),
  );
});

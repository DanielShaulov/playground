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
    // A page is always asked for afresh: a phone bringing a tab back would
    // otherwise be handed the copy it kept, however old, and build the rest
    // of the game round it.
    (request.mode === "navigate" ? fetch(request, { cache: "no-cache" }) : fetch(request))
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => keep(cache, request, copy));
        }
        return response;
      })
      .catch(() => kept(request)),
  );
});

// Scripts and stylesheets carry a ?v=<deploy> (scripts/stamp-build.mjs), so
// every deploy brings a new copy of each. Keep the newest and drop the rest.
async function keep(cache, request, copy) {
  await cache.put(request, copy);
  if (!new URL(request.url).search) return;
  for (const other of await cache.keys(request, { ignoreSearch: true }))
    if (other.url !== request.url) await cache.delete(other);
}

// Offline: the very file if we have it, else the same file from another
// deploy (better an old stylesheet than none), else the launcher, so there is
// somewhere to go. But never the launcher in place of a script or a
// stylesheet: a page that imports a module and is handed HTML fails with an
// error that explains nothing, so let that fail as what it is.
async function kept(request) {
  const cache = await caches.open(CACHE);
  return (
    (await cache.match(request)) ??
    (await cache.match(request, { ignoreSearch: true })) ??
    (/^(script|style|worker)$/.test(request.destination)
      ? undefined
      : await cache.match("./index.html")) ??
    Response.error()
  );
}

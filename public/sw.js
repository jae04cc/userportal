/**
 * A deliberately minimal service worker.
 *
 * It exists for one reason: Chrome will not fire `beforeinstallprompt` — and so
 * will not offer to install the app on Android — unless a service worker with a
 * fetch handler is registered. Without this file there is no install prompt.
 *
 * It caches NOTHING belonging to the app. Every page here is per-user and
 * permission-filtered, so a cached response is a response shown to the wrong
 * person. The only thing in the cache is a static offline page, and the only
 * requests touched are top-level page loads: server actions are POSTs, and
 * Next's client-side navigations are ordinary fetches, so both fall straight
 * through to the network untouched.
 */

const CACHE = "portal-offline-v1";
const OFFLINE_URL = "/offline.html";

/**
 * Priming the offline page, and never failing because of it.
 *
 * An install handler that rejects makes the whole worker redundant, and a
 * redundant worker means no `beforeinstallprompt` and no install prompt at all.
 * The offline page is a nicety; the fetch handler below is the entire point. So
 * every cache operation here is allowed to fail quietly — CacheStorage can and
 * does throw for reasons that have nothing to do with this app, and none of
 * them are worth losing installability over.
 */
function primeOfflinePage() {
  if (typeof caches === "undefined") return Promise.resolve();
  return caches
    .open(CACHE)
    // Bypass the HTTP cache, so a redeploy can't pick up a stale copy.
    .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
    .catch(() => {});
}

self.addEventListener("install", (event) => {
  // Take over immediately rather than waiting for every tab to close.
  event.waitUntil(primeOfflinePage().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  const sweep =
    typeof caches === "undefined"
      ? Promise.resolve()
      : caches
          .keys()
          .then((keys) =>
            Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
          )
          .catch(() => {});

  event.waitUntil(sweep.then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only full page loads. Anything else — assets, API calls, server actions —
  // is left entirely alone, which is what keeps this worker incapable of
  // serving one user's data to another.
  if (request.method !== "GET" || request.mode !== "navigate") return;

  event.respondWith(
    // Always the network first; the cache is a last resort, never a shortcut.
    // If the offline page was never cached, the browser's own error page is
    // shown, exactly as it would be without this worker.
    fetch(request).catch(() => {
      if (typeof caches === "undefined") return Response.error();
      return caches
        .match(OFFLINE_URL)
        .catch(() => undefined)
        .then((cached) => cached || Response.error());
    })
  );
});

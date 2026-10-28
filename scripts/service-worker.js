/* Build constants are prepended by generate-pwa.mjs. No remote imports. */
/* global CACHE_NAME, SHELL, ROUTES, INTEGRITY */
async function cacheResource(cache, url) {
  const response = await fetch(new Request(url, { cache: 'reload' }));
  if (!response.ok || response.type === 'opaque') throw new Error('Incomplete application shell');
  const type = response.headers.get('content-type') || '';
  if (!url.endsWith('.html') && type.includes('text/html')) throw new Error('Asset returned HTML');
  const digest = await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer());
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
  if (hex !== INTEGRITY[url]) throw new Error('Resource belongs to a different build');
  await cache.put(url, response);
}
const shellReady = async () => {
  const cache = await caches.open(CACHE_NAME);
  for (const url of SHELL) if (!(await cache.match(url))) return false;
  return true;
};
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // Each build has its own cache. A failed install cannot damage the active one.
      const cache = await caches.open(CACHE_NAME);
      try {
        for (const url of SHELL) {
          await cacheResource(cache, url);
        }
      } catch (error) {
        await caches.delete(CACHE_NAME);
        throw error;
      }
      // Deliberately no skipWaiting: an existing match keeps its coherent build.
    })(),
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Retain current + two previous builds, pruning only at safe activation.
      const earlier = (await caches.keys()).filter(
        (key) => key.startsWith('timer-games-') && key !== CACHE_NAME,
      );
      await Promise.all(earlier.slice(0, -2).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const path =
    event.request.mode === 'navigate' && ROUTES.includes(url.pathname)
      ? '/index.html'
      : url.pathname;
  if (!SHELL.includes(path)) {
    if (event.request.mode === 'navigate') return; // No unknown HTML fallbacks.
    // Existing clients can still request a previous build's content-hashed chunk.
    event.respondWith(
      (async () => {
        for (const name of (await caches.keys()).filter((key) => key.startsWith('timer-games-'))) {
          const previous = await (await caches.open(name)).match(path);
          if (previous && !(previous.headers.get('content-type') || '').includes('text/html'))
            return previous;
        }
        return fetch(event.request);
      })(),
    );
    return;
  }
  event.respondWith(
    (async () => {
      const cached = await (await caches.open(CACHE_NAME)).match(path);
      return (
        cached ||
        new Response('Required app resource is missing. Reopen while online.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' },
        })
      );
    })(),
  );
});
async function clientIsSafe(client) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const finish = (safe) => {
      clearTimeout(timeout);
      channel.port1.close();
      resolve(safe);
    };
    const timeout = setTimeout(() => finish(false), 2500);
    channel.port1.onmessage = (event) => finish(event.data?.safe === true);
    try {
      client.postMessage({ type: 'CAN_UPDATE' }, [channel.port2]);
    } catch {
      finish(false);
    }
  });
}

let updateAttempt;
function applyUpdate() {
  // Several idle tabs can request the same update at once. Share one handshake
  // so a second attempt cannot unlock clients while the first is activating.
  updateAttempt ??= (async () => {
    let clients = [];
    let accepted = false;
    try {
      clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (!(await shellReady())) return false;
      if (!(await Promise.all(clients.map(clientIsSafe))).every(Boolean)) return false;
      await self.skipWaiting();
      accepted = true;
      return true;
    } catch {
      return false;
    } finally {
      if (!accepted) {
        updateAttempt = undefined;
        clients.forEach((client) => {
          try {
            client.postMessage({ type: 'UPDATE_ABORT' });
          } catch {
            // A tab can close between the safety check and the abort message.
          }
        });
      }
    }
  })();
  return updateAttempt;
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'REPAIR_CACHE')
    event.waitUntil(
      (async () => {
        try {
          const cache = await caches.open(CACHE_NAME);
          for (const url of SHELL) if (!(await cache.match(url))) await cacheResource(cache, url);
        } catch {
          /* Keep the working portion of the coherent build. */
        }
        event.ports[0]?.postMessage({ ready: await shellReady(), build: CACHE_NAME });
      })(),
    );
  if (event.data?.type === 'CHECK_CACHE')
    event.waitUntil(
      (async () => {
        event.ports[0]?.postMessage({ ready: await shellReady(), build: CACHE_NAME });
      })(),
    );
  if (event.data?.type === 'APPLY_UPDATE')
    event.waitUntil(
      (async () => {
        event.ports[0]?.postMessage({ accepted: await applyUpdate() });
      })(),
    );
});

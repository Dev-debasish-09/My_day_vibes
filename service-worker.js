/* =====================================================================
   Little Sunshine: service-worker.js
   Makes the whole app work offline. On install it saves every file the
   app uses; after that, pages load from that saved copy first and only
   use the internet for anything new.

   !!! IMPORTANT: every time you change ANY file of the app (HTML, CSS,
   JS, data, fonts, icons), change CACHE_VERSION below, e.g.
   "sunshine-v2" -> "sunshine-v3". That is how phones notice there's a
   new version: they download it in the background and show
   "A fresh version is ready. Tap to refresh."
   If you add a new file, also add it to APP_FILES.
   ===================================================================== */
const CACHE_VERSION = 'sunshine-v4';

// Every file the app uses (paths are relative, so it also works in a sub-folder)
const APP_FILES = [
  './',
  // Pages
  'index.html',
  'home.html',
  'joy.html',
  'breathe.html',
  'me.html',
  'letters.html',
  // Styles and scripts
  'styles.css',
  'shared.js',
  'app.js',
  'home.js',
  'art.js',
  'joy.js',
  'breathe.js',
  'calm-sounds.js',
  'me.js',
  'letters-shared.js',
  'letters.js',
  'lib/qrcode.js',
  // Content
  'data/quotes.json',
  'data/poems.json',
  'data/compliments.json',
  'data/challenges.json',
  // Fonts
  'fonts/fraunces-latin.woff2',
  'fonts/fraunces-latin-ext.woff2',
  'fonts/fraunces-italic-latin.woff2',
  'fonts/fraunces-italic-latin-ext.woff2',
  'fonts/nunito-latin.woff2',
  'fonts/nunito-latin-ext.woff2',
  'fonts/dancing-script-latin.woff2',
  // Icons, images, manifest
  'favicon.ico',
  'icons/icon.svg',
  'icons/icon-maskable.svg',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'images/preview.png',
  'manifest.json',
];

// Some hosts (Vercel with cleanUrls) redirect "home.html" to "/home".
// A redirected response can't be used for a page, so keep a clean copy.
async function cleanCopy(response) {
  if (!response.redirected) return response;
  return new Response(await response.blob(), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}


/* ---------------- Install: save every file ---------------- */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await Promise.all(APP_FILES.map(async (path) => {
      // "reload" skips the browser's own HTTP cache, so we save the newest files
      const response = await fetch(new Request(path, { cache: 'reload' }));
      if (!response.ok) throw new Error('Could not save ' + path + ' (' + response.status + ')');
      await cache.put(path, await cleanCopy(response));
    }));
  })());
  // No skipWaiting() here: a new version waits until the person taps
  // "A fresh version is ready. Tap to refresh." (see shared.js)
});


/* ---------------- Activate: delete old versions ---------------- */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith('sunshine-') && name !== CACHE_VERSION)
      .map((name) => caches.delete(name)));
    await self.clients.claim(); // the very first time, take care of open pages right away
  })());
});

// The page asks for the waiting version when the person taps the toast
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});


/* ---------------- Fetch: cache first, then network ---------------- */
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // other sites: let the browser handle them

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);

    // 1. Saved copy (also finds "/home" as "home.html", and "/" as "index.html")
    const cached = await cache.match(request, { ignoreSearch: true }) ||
      (request.mode === 'navigate' && await matchCleanUrl(cache, url));
    if (cached) return cached;

    // 2. The network; keep a copy of anything new for next time
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        cache.put(request, await cleanCopy(response.clone()));
      }
      return response;
    } catch (err) {
      // 3. Offline and not saved: a page falls back to the welcome page
      if (request.mode === 'navigate') {
        return (await cache.match('index.html')) || Response.error();
      }
      throw err;
    }
  })());
});

async function matchCleanUrl(cache, url) {
  const path = url.pathname;
  if (path.endsWith('/')) return cache.match(new URL('index.html', url).href);
  if (!/\.[a-z0-9]+$/i.test(path)) return cache.match(url.origin + path + '.html');
  return undefined;
}

const CACHE_NAME = 'kairn-v2';

// Files to cache for offline use
const STATIC_ASSETS = [
  '/',
  '/index.html',
  'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700;9..144,800&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',
  'https://cdn.jsdelivr.net/npm/lucide@latest/dist/umd/lucide.min.js'
];

// Install: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache own files reliably; CDN files are best-effort
      return cache.addAll(['/', '/index.html']).then(() => {
        return Promise.allSettled(
          STATIC_ASSETS.slice(2).map(url =>
            cache.add(url).catch(() => {/* CDN miss is fine */})
          )
        );
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: remove old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first for Supabase API calls, cache-first for everything else
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Always go network-first for Supabase (real-time data)
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify({ error: 'You are offline. Please reconnect to sync your data.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // Cache-first for static assets (fonts, CDN scripts, app shell)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        // Only cache valid, same-origin or CDN responses
        if (
          !response ||
          response.status !== 200 ||
          (response.type !== 'basic' && response.type !== 'cors')
        ) {
          return response;
        }

        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });

        return response;
      }).catch(() => {
        // If offline and not cached, return offline page
        return caches.match('/index.html');
      });
    })
  );
});

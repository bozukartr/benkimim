const CACHE_NAME = 'guess-who-v3';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json'
];

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        Promise.all([
            self.clients.claim(),
            caches.keys().then((keys) => {
                return Promise.all(keys.map((key) => {
                    if (key !== CACHE_NAME) return caches.delete(key);
                }));
            })
        ])
    );
});

self.addEventListener('fetch', (e) => {
    // Only handle GET requests for the cache
    if (e.request.method !== 'GET' || e.request.url.startsWith('chrome-extension')) {
        return;
    }

    // Network-first strategy to ensure we always get the latest code if online
    e.respondWith(
        fetch(e.request).then((res) => {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => {
                cache.put(e.request, resClone);
            });
            return res;
        }).catch(() => caches.match(e.request))
    );
});

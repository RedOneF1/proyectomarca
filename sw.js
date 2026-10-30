// Service Worker para NOVA Landing (Cache-First para assets estáticos e imágenes)
const CACHE_NAME = 'nova-v1';
const PRECACHE_ASSETS = [
    './',
    './index.html',
    './css/estilos.min.css',
    './js/script.min.js',
    './fonts/montserrat-latin-var.woff2',
    './fonts/space-grotesk-latin-var.woff2',
    './favicon.svg',
    './favicon.ico'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.map((k) => k !== CACHE_NAME && caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET' || url.origin !== location.origin) return;

    // Cache-first para imágenes y fuentes
    if (url.pathname.includes('/img/') || url.pathname.includes('/fonts/')) {
        event.respondWith(
            caches.match(event.request).then((cached) => {
                if (cached) return cached;
                return fetch(event.request).then((response) => {
                    if (response.status === 200) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                    }
                    return response;
                });
            })
        );
        return;
    }

    // Network-first para el HTML y otros recursos
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});

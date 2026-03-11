const CACHE_NAME = 'gestor-rural-v2';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './icon.svg',
    './manifest.json',
    'https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js',
    'https://www.gstatic.com/firebasejs/12.10.0/firebase-analytics.js',
    'https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js',
    'https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Cache aberto: ', CACHE_NAME);
                return cache.addAll(ASSETS);
            })
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                return response || fetch(event.request);
            })
    );
});

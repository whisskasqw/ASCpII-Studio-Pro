/* Vinum Fortis — офлайн-кэш. Сначала сеть, при отказе — кэш. */
const CACHE = 'vinum-fortis-v3';
const FILES = ['./', 'index.html', 'styles.css', 'data.js', 'calc.js', 'app.js', 'i18n.js', 'i18n/keys.js', 'i18n/names-latin.js', 'i18n/names-uk.js', 'i18n/names-ka.js', 'i18n/uk.js', 'i18n/en.js', 'i18n/fr.js', 'i18n/es.js', 'i18n/it.js', 'i18n/de.js', 'i18n/pt.js', 'i18n/ka.js', 'manifest.webmanifest', 'icon.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok && (new URL(e.request.url).origin === location.origin || e.request.url.includes('fonts.g'))) {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy));
    }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});

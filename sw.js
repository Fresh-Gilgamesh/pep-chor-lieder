// Service Worker: macht die App installierbar und lädt die App-Hülle auch bei schlechtem Empfang.
// Musikdateien und Daten kommen immer frisch von Supabase.
const CACHE = 'pep-chor-v7';
const SHELL = ['./', 'index.html', 'admin.html', 'app.css', 'common.js', 'player.js', 'bg.js', 'admin.js',
  'config.js', 'supabase.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Supabase nie abfangen
  // Netzwerk zuerst, damit Updates sofort ankommen; bei Funkloch aus dem Cache
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./')))
  );
});

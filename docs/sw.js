// Service worker mínimo: rede primeiro, cache só como reserva.
// Assim uma nova versão publicada nunca fica presa em cache antigo.
const CACHE = 'ponto-v1';
const ARQUIVOS = ['index.html', 'admin.html', 'style.css', 'config.js', 'api.js', 'app.js', 'admin.js', 'manifest.json'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ARQUIVOS); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const chave = url.origin + url.pathname; // ignora ?t=token para não guardar tokens no cache
  e.respondWith(
    fetch(req)
      .then(function (r) {
        const copia = r.clone();
        caches.open(CACHE).then(function (c) { return c.put(chave, copia); });
        return r;
      })
      .catch(function () { return caches.match(chave); })
  );
});

/* Service worker di CialtronApp.
   Fa due cose, in questo ordine di importanza:

   1. L'HTML dell'app viene ripreso dalla rete ogni volta che c'è: così una
      modifica pubblicata si vede alla riapertura, senza restare indietro di un
      deploy. La copia in cache serve solo quando la rete non c'è.
   2. Con il telefono offline l'app si apre lo stesso e mostra classifica,
      rosa e partite già scaricate. Quello che per sua natura ha bisogno della
      rete — accesso, sincronizzazione, foto nuove — resta fermo finché non
      torna la linea, come è normale che sia. */

const CACHE_NAME = 'cialtron-shell-v1';
const SHELL_URLS = ['./', './index.html', './manifest.json', './icon-180.png', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(SHELL_URLS.map(async (url) => {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (res && res.ok) await cache.put(url, res.clone());
      } catch (e) {}
    }));
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // Supabase e le librerie non passano di qui

  // version.json è il controllo degli aggiornamenti: metterlo in cache
  // vorrebbe dire non accorgersi mai che ne è uscita una nuova.
  if (/version\.json$/.test(url.pathname)) return;

  const isShell = req.mode === 'navigate' || /\.html$/i.test(url.pathname) || url.pathname.endsWith('/');

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    if (isShell) {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        if (fresh && fresh.ok) { cache.put(req, fresh.clone()); return fresh; }
      } catch (e) {}
      const cached = await cache.match(req) || await cache.match('./index.html');
      if (cached) return cached;
      return new Response('Offline e nessuna copia salvata.', { status: 503, statusText: 'Offline' });
    }

    // icone e manifest cambiano di rado: prima la cache, aggiornando dietro
    const cached = await cache.match(req);
    const fresh = fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
    if (cached) { fresh; return cached; }
    const res = await fresh;
    return res || new Response('Offline e nessuna copia salvata.', { status: 503, statusText: 'Offline' });
  })());
});

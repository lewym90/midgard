// Midgard — praca bez internetu. Kod: najpierw sieć (szybkie aktualizacje), grafiki i czcionki: najpierw pamięć.
const CACHE = 'midgard-v0.2.0';
const CORE = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/main.js', 'js/engine.js', 'js/board.js', 'js/ui.js', 'js/data.js', 'js/hex.js', 'js/runes.js', 'js/audio.js',
  'assets/img/tlo/key-art.webp', 'assets/img/tlo/stol.webp', 'assets/img/marka/logo.webp',
  'assets/img/teren/snieg.webp', 'assets/img/teren/las.webp', 'assets/img/teren/lod.webp', 'assets/img/teren/bagno.webp', 'assets/img/teren/skaly.webp', 'assets/img/teren/kurhan.webp',
  'assets/img/material/dab.webp', 'assets/img/material/zelazo.webp', 'assets/img/material/kosc.webp', 'assets/img/material/pergamin.webp', 'assets/img/material/zloto.webp',
  ...['berserker', 'tarczowniczka', 'volva', 'skald', 'jarl', 'mistrz-run', 'lowczyni', 'ulfhedinn'].flatMap((k) => [`assets/img/bohaterowie/${k}-zeton.webp`, `assets/img/bohaterowie/${k}-karta.webp`]),
  'assets/img/wrogowie/draugr-zeton.webp', 'assets/img/wrogowie/lucznik-zeton.webp', 'assets/img/wrogowie/pan-kurhanu-zeton.webp',
  'assets/fonts/cinzel-latin-700-normal.woff2', 'assets/fonts/cinzel-latin-ext-700-normal.woff2',
  'assets/fonts/alegreya-sans-latin-400-normal.woff2', 'assets/fonts/alegreya-sans-latin-ext-400-normal.woff2',
  'assets/fonts/alegreya-sans-latin-500-normal.woff2', 'assets/fonts/alegreya-sans-latin-700-normal.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const isAsset = url.pathname.includes('/assets/');
  if (isAsset) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
  } else {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match('index.html'))));
  }
});

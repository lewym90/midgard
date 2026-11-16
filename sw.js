// Midgard — praca bez internetu. Kod: najpierw sieć (szybkie aktualizacje), grafiki i czcionki: najpierw pamięć.
const CACHE = 'midgard-v0.7.0';
const AUDIO_CACHE = 'midgard-audio-v1'; // osobno, żeby muzyka nie pobierała się od nowa przy każdej wersji
const CORE = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/main.js', 'js/osada.js', 'serwer/osada-dane.js', 'js/konto.js', 'js/konto-ui.js', 'js/engine.js', 'js/board.js', 'js/ui.js', 'js/data.js', 'js/hex.js', 'js/runes.js', 'js/audio.js',
  'assets/img/osada/teren.webp',
  ...['plakietka.png', 'rama-okno.png', 'pasek.png', 'medalion.webp', 'medalion-maly.webp', 'herb.webp', 'tarcza.webp', 'wstega.webp', 'zamknij.webp', 'ak-wyprawa.webp', 'ak-budowa.webp', 'ak-bohaterowie.webp', 'ak-zbierz.webp', 'ak-mapa.webp'].map((f) => 'assets/img/ui/' + f),
  'assets/img/tlo/start.webp', 'assets/img/tlo/stol.webp', 'assets/img/marka/logo.webp',
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
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== AUDIO_CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.includes('/assets/audio/') && url.pathname.endsWith('.mp3')) { e.respondWith(audioResponse(req)); return; }
  const isAsset = url.pathname.includes('/assets/') && !url.pathname.endsWith('lista.json');
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

// Muzyka: z pamięci, z obsługą zapytań o fragment pliku (Safari odtwarza audio kawałkami).
async function audioResponse(req) {
  const cache = await caches.open(AUDIO_CACHE);
  const plain = new Request(req.url);
  let res = await cache.match(plain);
  if (!res) {
    try { res = await fetch(plain); } catch (e) { return Response.error(); }
    if (res.ok) await cache.put(plain, res.clone());
  }
  const range = req.headers.get('range');
  if (!range || !res.ok) return res;
  const buf = await res.arrayBuffer();
  const size = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
  let start = m[1] ? Number(m[1]) : 0;
  let end = m[2] ? Number(m[2]) : size - 1;
  if (!m[1] && m[2]) { start = Math.max(0, size - Number(m[2])); end = size - 1; }
  end = Math.min(end, size - 1);
  if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes' },
  });
}

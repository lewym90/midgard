// Midgard — serwer gry. Bez zewnętrznych bibliotek: node:http, node:sqlite, node:crypto.
// Konta graczy, zaproszenia, sesje na wielu urządzeniach, zapis stanu gry.
// Uruchomienie: PORT=18900 MIDGARD_DANE=/var/lib/midgard node midgard.mjs
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import * as O from './osada-dane.js';

const WERSJA = '1.2.0';
const PORT = Number(process.env.PORT || 18900);
const DANE = process.env.MIDGARD_DANE || './dane';
const ORIGINS = (process.env.MIDGARD_ORIGINS || 'https://lewym90.github.io,http://localhost:8765,http://127.0.0.1:8765').split(',');
const MAX_BODY = 3 * 1024 * 1024;

fs.mkdirSync(DANE, { recursive: true });
const db = new DatabaseSync(path.join(DANE, 'midgard.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS gracze (
    id INTEGER PRIMARY KEY, nick TEXT NOT NULL UNIQUE COLLATE NOCASE, haslo TEXT NOT NULL,
    admin INTEGER NOT NULL DEFAULT 0, utworzony INTEGER NOT NULL, ostatnio INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS sesje (
    id INTEGER PRIMARY KEY, gracz_id INTEGER NOT NULL REFERENCES gracze(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE, urzadzenie TEXT NOT NULL, utworzona INTEGER NOT NULL, ostatnio INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS zaproszenia (
    kod TEXT PRIMARY KEY, admin INTEGER NOT NULL DEFAULT 0, utworzone INTEGER NOT NULL, przez INTEGER,
    uzyte_przez INTEGER, uzyte INTEGER, opis TEXT);
  CREATE TABLE IF NOT EXISTS ustawienia (klucz TEXT PRIMARY KEY, wartosc TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS osady (gracz_id INTEGER PRIMARY KEY REFERENCES gracze(id) ON DELETE CASCADE, dane TEXT NOT NULL, zmieniona INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS stany (
    gracz_id INTEGER PRIMARY KEY REFERENCES gracze(id) ON DELETE CASCADE,
    rev INTEGER NOT NULL, dane TEXT NOT NULL, zmieniony INTEGER NOT NULL, urzadzenie TEXT);
`);

const teraz = () => Date.now();
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ---------- hasła (scrypt) ----------
function hashHasla(haslo) {
  const sol = crypto.randomBytes(16);
  const h = crypto.scryptSync(haslo, sol, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${sol.toString('base64')}$${h.toString('base64')}`;
}
function sprawdzHaslo(haslo, zapis) {
  const [alg, s, h] = String(zapis).split('$');
  if (alg !== 'scrypt') return false;
  const oczek = Buffer.from(h, 'base64');
  const got = crypto.scryptSync(haslo, Buffer.from(s, 'base64'), oczek.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(oczek, got);
}

// ---------- kody ----------
const ALFABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function kod(n = 8) {
  const b = crypto.randomBytes(n);
  let s = '';
  for (let i = 0; i < n; i++) s += ALFABET[b[i] % ALFABET.length];
  return `MID-${s.slice(0, 4)}-${s.slice(4)}`;
}
function noweHaslo() {
  const b = crypto.randomBytes(10);
  let s = '';
  for (let i = 0; i < 10; i++) s += ALFABET[b[i] % ALFABET.length].toLowerCase();
  return s;
}

// Hasło do gry: jedno, wspólne, ustawia je administrator. Bez niego nie da się założyć konta.
// Pierwsze konto założone na serwerze zostaje kontem administratora.
const plikHasla = path.join(DANE, 'haslo-gry.txt');
function hasloGry() { const r = db.prepare("SELECT wartosc FROM ustawienia WHERE klucz = 'haslo_gry'").get(); return r ? r.wartosc : null; }
function ustawHasloGry(h) {
  db.prepare("INSERT INTO ustawienia (klucz, wartosc) VALUES ('haslo_gry', ?) ON CONFLICT(klucz) DO UPDATE SET wartosc = excluded.wartosc").run(h);
  fs.writeFileSync(plikHasla, h + '\n', { mode: 0o600 });
}
if (!hasloGry()) ustawHasloGry(kod().slice(4)); // np. Q7KD-M2PX — administrator zmieni je na własne
else fs.writeFileSync(plikHasla, hasloGry() + '\n', { mode: 0o600 });
const zgodne = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

// ---------- ochrona przed zgadywaniem haseł ----------
const proby = new Map(); // klucz → [czasy nieudanych prób]
function zablokowany(k) {
  const t = teraz();
  const l = (proby.get(k) || []).filter((x) => t - x < 15 * 60 * 1000);
  proby.set(k, l);
  return l.length >= 8;
}
function nieudana(k) { (proby.get(k) || proby.set(k, []).get(k)).push(teraz()); }

// ---------- HTTP ----------
class Blad extends Error { constructor(kodHttp, msg) { super(msg); this.kodHttp = kodHttp; } }

function cors(req, res) {
  const o = req.headers.origin;
  if (o && ORIGINS.includes(o)) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
}

function czytajJson(req) {
  return new Promise((ok, zle) => {
    let n = 0; const kawalki = [];
    req.on('data', (c) => { n += c.length; if (n > MAX_BODY) { zle(new Blad(413, 'Za duże dane.')); req.destroy(); } else kawalki.push(c); });
    req.on('end', () => {
      if (!n) return ok({});
      try { ok(JSON.parse(Buffer.concat(kawalki).toString('utf8'))); } catch (e) { zle(new Blad(400, 'Niepoprawne dane.')); }
    });
    req.on('error', zle);
  });
}

function odpowiedz(res, kodHttp, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(kodHttp, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function ip(req) { return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(); }

function sesja(req) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!t) throw new Blad(401, 'Zaloguj się.');
  const s = db.prepare(`SELECT s.id AS sid, g.id, g.nick, g.admin FROM sesje s JOIN gracze g ON g.id = s.gracz_id WHERE s.token = ?`).get(sha(t));
  if (!s) throw new Blad(401, 'Sesja wygasła. Zaloguj się ponownie.');
  const t0 = teraz();
  db.prepare('UPDATE sesje SET ostatnio = ? WHERE id = ?').run(t0, s.sid);
  db.prepare('UPDATE gracze SET ostatnio = ? WHERE id = ?').run(t0, s.id);
  return s;
}

function nowaSesja(graczId, urzadzenie) {
  const token = crypto.randomBytes(32).toString('base64url');
  const t = teraz();
  db.prepare('INSERT INTO sesje (gracz_id, token, urzadzenie, utworzona, ostatnio) VALUES (?, ?, ?, ?, ?)').run(graczId, sha(token), nazwaUrz(urzadzenie), t, t);
  return token;
}

const nazwaUrz = (u) => String(u || 'Urządzenie').replace(/[^\p{L}\p{N} ()._,-]/gu, '').slice(0, 60) || 'Urządzenie';
const NICK = /^[\p{L}\p{N}_ -]{3,20}$/u;

function opisGracza(g) { return { nick: g.nick, admin: !!g.admin }; }

// ---------- trasy ----------
const trasy = {
  'GET /zdrowie': () => ({ ok: true, wersja: WERSJA, gracze: db.prepare('SELECT COUNT(*) n FROM gracze').get().n }),

  'POST /rejestracja': async (req) => {
    const b = await czytajJson(req);
    const k = 'rej:' + ip(req);
    if (zablokowany(k)) throw new Blad(429, 'Za dużo prób. Spróbuj za kwadrans.');
    const nick = String(b.nick || '').trim().replace(/\s+/g, ' ');
    const haslo = String(b.haslo || '');
    if (!NICK.test(nick)) throw new Blad(400, 'Imię gracza: 3–20 znaków (litery, cyfry, spacja, _ lub -).');
    if (haslo.length < 6 || haslo.length > 200) throw new Blad(400, 'Hasło musi mieć co najmniej 6 znaków.');
    if (!zgodne(b.haslo_gry, hasloGry())) { nieudana(k); throw new Blad(400, 'Złe hasło do gry. Zapytaj o nie tego, kto dał Ci link.'); }
    if (db.prepare('SELECT 1 FROM gracze WHERE nick = ?').get(nick)) throw new Blad(409, 'To imię jest już zajęte.');
    const t = teraz();
    const pierwszy = !db.prepare('SELECT 1 FROM gracze LIMIT 1').get();
    const r = db.prepare('INSERT INTO gracze (nick, haslo, admin, utworzony, ostatnio) VALUES (?, ?, ?, ?, ?)').run(nick, hashHasla(haslo), pierwszy ? 1 : 0, t, t);
    const g = db.prepare('SELECT * FROM gracze WHERE id = ?').get(r.lastInsertRowid);
    return { token: nowaSesja(g.id, b.urzadzenie), gracz: opisGracza(g) };
  },

  'POST /logowanie': async (req) => {
    const b = await czytajJson(req);
    const nick = String(b.nick || '').trim().replace(/\s+/g, ' ');
    const k1 = 'log:' + ip(req), k2 = 'nick:' + nick.toLowerCase();
    if (zablokowany(k1) || zablokowany(k2)) throw new Blad(429, 'Za dużo nieudanych prób. Spróbuj za kwadrans.');
    const g = db.prepare('SELECT * FROM gracze WHERE nick = ?').get(nick);
    if (!g || !sprawdzHaslo(String(b.haslo || ''), g.haslo)) { nieudana(k1); nieudana(k2); throw new Blad(401, 'Złe imię gracza albo hasło.'); }
    return { token: nowaSesja(g.id, b.urzadzenie), gracz: opisGracza(g) };
  },

  'POST /wyloguj': (req) => { const s = sesja(req); db.prepare('DELETE FROM sesje WHERE id = ?').run(s.sid); return { ok: true }; },

  'GET /ja': (req) => {
    const s = sesja(req);
    const urz = db.prepare('SELECT id, urzadzenie, utworzona, ostatnio FROM sesje WHERE gracz_id = ? ORDER BY ostatnio DESC').all(s.id)
      .map((u) => ({ id: u.id, nazwa: u.urzadzenie, od: u.utworzona, ostatnio: u.ostatnio, to: u.id === s.sid }));
    return { gracz: opisGracza(s), urzadzenia: urz };
  },

  'DELETE /urzadzenia': (req, arg) => {
    const s = sesja(req);
    db.prepare('DELETE FROM sesje WHERE id = ? AND gracz_id = ?').run(Number(arg), s.id);
    return { ok: true };
  },

  'POST /haslo': async (req) => {
    const s = sesja(req);
    const b = await czytajJson(req);
    const g = db.prepare('SELECT * FROM gracze WHERE id = ?').get(s.id);
    if (!sprawdzHaslo(String(b.stare || ''), g.haslo)) throw new Blad(400, 'Obecne hasło się nie zgadza.');
    const nowe = String(b.nowe || '');
    if (nowe.length < 6 || nowe.length > 200) throw new Blad(400, 'Nowe hasło musi mieć co najmniej 6 znaków.');
    db.prepare('UPDATE gracze SET haslo = ? WHERE id = ?').run(hashHasla(nowe), s.id);
    db.prepare('DELETE FROM sesje WHERE gracz_id = ? AND id != ?').run(s.id, s.sid);
    return { ok: true };
  },

  'GET /stan': (req) => {
    const s = sesja(req);
    const st = db.prepare('SELECT rev, dane, zmieniony, urzadzenie FROM stany WHERE gracz_id = ?').get(s.id);
    return st ? { rev: st.rev, dane: JSON.parse(st.dane), zmieniony: st.zmieniony, urzadzenie: st.urzadzenie } : { rev: 0, dane: null };
  },

  'PUT /stan': async (req) => {
    const s = sesja(req);
    const b = await czytajJson(req);
    const st = db.prepare('SELECT rev, dane FROM stany WHERE gracz_id = ?').get(s.id);
    const rev = st ? st.rev : 0;
    if (Number(b.rev) !== rev) throw Object.assign(new Blad(409, 'Na innym urządzeniu zapisano nowszy stan.'), { extra: { rev, dane: st ? JSON.parse(st.dane) : null } });
    const urz = db.prepare('SELECT urzadzenie FROM sesje WHERE id = ?').get(s.sid).urzadzenie;
    const dane = JSON.stringify(b.dane ?? null);
    db.prepare('INSERT INTO stany (gracz_id, rev, dane, zmieniony, urzadzenie) VALUES (?, ?, ?, ?, ?) ON CONFLICT(gracz_id) DO UPDATE SET rev = excluded.rev, dane = excluded.dane, zmieniony = excluded.zmieniony, urzadzenie = excluded.urzadzenie')
      .run(s.id, rev + 1, dane, teraz(), urz);
    return { rev: rev + 1 };
  },

  // ---------- osada ----------
  'GET /osada': (req) => zOsada(req, () => ({})),
  'POST /osada/buduj': async (req) => { const b = await czytajJson(req); return zOsada(req, (o, t) => blad(O.buduj(o, String(b.typ), Number(b.x), Number(b.y), t))); },
  'POST /osada/ulepsz': async (req) => { const b = await czytajJson(req); return zOsada(req, (o, t) => blad(O.ulepsz(o, Number(b.id), t))); },
  'POST /osada/anuluj': async (req) => { const b = await czytajJson(req); return zOsada(req, (o) => blad(O.anuluj(o, Number(b.id)))); },
  'POST /osada/przesun': async (req) => { const b = await czytajJson(req); return zOsada(req, (o) => blad(O.przesun(o, Number(b.id), Number(b.x), Number(b.y)))); },
  'POST /osada/zbierz': async (req) => {
    const b = await czytajJson(req);
    return zOsada(req, (o) => {
      const ids = b.id === 'wszystko' ? o.budynki.filter((x) => O.BUDYNKI[x.typ].produkcja).map((x) => x.id) : [Number(b.id)];
      const zebrane = {}; let komunikat = null;
      for (const id of ids) {
        const r = O.zbierz(o, id);
        if (r.ile) zebrane[r.surowiec] = (zebrane[r.surowiec] || 0) + r.ile;
        else if (ids.length === 1) komunikat = r.blad;
      }
      if (komunikat && !Object.keys(zebrane).length) throw new Blad(400, komunikat);
      return { zebrane };
    });
  },
  'POST /osada/wyprawa/start': async (req) => {
    const b = await czytajJson(req);
    return zOsada(req, (o, t) => {
      const poziom = O.LUP[b.poziom] ? b.poziom : 'wedrowiec';
      const id = crypto.randomBytes(8).toString('hex');
      const lista = Object.entries(o.wyprawy || {}).sort((a, c) => a[1].start - c[1].start);
      o.wyprawy = Object.fromEntries(lista.slice(-2));
      o.wyprawy[id] = { start: t, poziom };
      return { wyprawa: id, premie: O.premieBitwy(o) };
    });
  },
  'POST /osada/wyprawa/koniec': async (req) => {
    const b = await czytajJson(req);
    return zOsada(req, (o, t) => {
      const w = (o.wyprawy || {})[String(b.id)];
      if (!w) throw new Blad(400, 'Ta wyprawa została już rozliczona.');
      if (t - w.start < O.MIN_CZAS_WYPRAWY) throw new Blad(400, 'Bitwa trwała za krótko, żeby ją rozliczyć.');
      delete o.wyprawy[String(b.id)];
      const wygrana = b.wynik === 'win';
      o.statystyki[wygrana ? 'wygrane' : 'przegrane']++;
      return { lup: O.dodajLup(o, O.lup(w.poziom, wygrana)) };
    });
  },

  // ---------- administrator ----------
  'GET /admin/haslo-gry': (req) => { admin(req); return { haslo: hasloGry() }; },
  'POST /admin/haslo-gry': async (req) => {
    admin(req);
    const b = await czytajJson(req);
    const h = String(b.haslo || '').trim();
    if (h.length < 4 || h.length > 60) throw new Blad(400, 'Hasło do gry: od 4 do 60 znaków.');
    ustawHasloGry(h);
    return { haslo: h };
  },
  'GET /admin/gracze': (req) => {
    admin(req);
    return { gracze: db.prepare(`SELECT g.nick, g.admin, g.utworzony, g.ostatnio, (SELECT COUNT(*) FROM sesje s WHERE s.gracz_id = g.id) AS urzadzenia FROM gracze g ORDER BY g.ostatnio DESC`).all() };
  },
  'POST /admin/reset-hasla': async (req) => {
    admin(req);
    const b = await czytajJson(req);
    const g = db.prepare('SELECT * FROM gracze WHERE nick = ?').get(String(b.nick || ''));
    if (!g) throw new Blad(404, 'Nie ma takiego gracza.');
    const h = noweHaslo();
    db.prepare('UPDATE gracze SET haslo = ? WHERE id = ?').run(hashHasla(h), g.id);
    db.prepare('DELETE FROM sesje WHERE gracz_id = ?').run(g.id);
    return { nick: g.nick, haslo: h };
  },
};

// Wczytuje osadę gracza, przesuwa czas do teraz, wykonuje akcję w transakcji i zapisuje.
function blad(msg) { if (msg) throw new Blad(400, msg); return {}; }
function zOsada(req, akcja) {
  const s = sesja(req);
  const t = teraz();
  db.exec('BEGIN IMMEDIATE');
  try {
    const w = db.prepare('SELECT dane FROM osady WHERE gracz_id = ?').get(s.id);
    const o = w ? JSON.parse(w.dane) : O.nowaOsada(t);
    const gotowe = O.uplyw(o, t);
    const wynik = akcja(o, t) || {};
    db.prepare('INSERT INTO osady (gracz_id, dane, zmieniona) VALUES (?, ?, ?) ON CONFLICT(gracz_id) DO UPDATE SET dane = excluded.dane, zmieniona = excluded.zmieniona').run(s.id, JSON.stringify(o), t);
    db.exec('COMMIT');
    return { ...wynik, osada: o, teraz: t, gotowe };
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

function admin(req) {
  const s = sesja(req);
  if (!s.admin) throw new Blad(403, 'Tylko dla administratora gry.');
  return s;
}

const serwer = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = new URL(req.url, 'http://x');
  let p = url.pathname.replace(/\/+$/, '') || '/';
  if (p.startsWith('/midgard-api')) p = p.slice('/midgard-api'.length) || '/';
  // trasy z parametrem: /urzadzenia/12, /admin/zaproszenia/KOD
  let arg = null;
  let klucz = `${req.method} ${p}`;
  if (!trasy[klucz]) {
    const i = p.lastIndexOf('/');
    if (i > 0) { arg = decodeURIComponent(p.slice(i + 1)); klucz = `${req.method} ${p.slice(0, i)}`; }
  }
  const f = trasy[klucz];
  try {
    if (!f) throw new Blad(404, 'Nie ma takiego adresu.');
    odpowiedz(res, 200, await f(req, arg));
  } catch (e) {
    if (e instanceof Blad) odpowiedz(res, e.kodHttp, { blad: e.message, ...(e.extra || {}) });
    else { console.error(e); odpowiedz(res, 500, { blad: 'Błąd serwera.' }); }
  }
});

serwer.listen(PORT, '127.0.0.1', () => console.log(`Midgard ${WERSJA} słucha na 127.0.0.1:${PORT}, dane: ${DANE}`));

// codzienna kopia bazy (7 ostatnich)
function kopia() {
  try {
    const dir = path.join(DANE, 'kopie');
    fs.mkdirSync(dir, { recursive: true });
    const plik = path.join(dir, `midgard-${new Date().toISOString().slice(0, 10)}.db`);
    if (!fs.existsSync(plik)) db.exec(`VACUUM INTO '${plik.replace(/'/g, "''")}'`);
    const stare = fs.readdirSync(dir).filter((f) => f.endsWith('.db')).sort().slice(0, -7);
    for (const f of stare) fs.rmSync(path.join(dir, f));
  } catch (e) { console.error('kopia:', e.message); }
}
kopia();
setInterval(kopia, 6 * 3600 * 1000).unref();

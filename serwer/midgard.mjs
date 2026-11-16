// Midgard — serwer gry. Bez zewnętrznych bibliotek: node:http, node:sqlite, node:crypto.
// Konta graczy, zaproszenia, sesje na wielu urządzeniach, zapis stanu gry.
// Uruchomienie: PORT=18900 MIDGARD_DANE=/var/lib/midgard node midgard.mjs
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const WERSJA = '1.0.0';
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

// Pierwsze uruchomienie: kod zaproszenia dla administratora (właściciela gry).
function kodAdmina() {
  const jestAdmin = db.prepare('SELECT 1 FROM gracze WHERE admin = 1').get();
  if (jestAdmin) { try { fs.rmSync(path.join(DANE, 'kod-administratora.txt')); } catch (e) {} return null; }
  let z = db.prepare('SELECT kod FROM zaproszenia WHERE admin = 1 AND uzyte IS NULL').get();
  if (!z) {
    z = { kod: kod() };
    db.prepare('INSERT INTO zaproszenia (kod, admin, utworzone, opis) VALUES (?, 1, ?, ?)').run(z.kod, teraz(), 'administrator');
  }
  fs.writeFileSync(path.join(DANE, 'kod-administratora.txt'), z.kod + '\n', { mode: 0o600 });
  return z.kod;
}
kodAdmina();

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
    const kodZ = String(b.zaproszenie || '').trim().toUpperCase();
    const nick = String(b.nick || '').trim().replace(/\s+/g, ' ');
    const haslo = String(b.haslo || '');
    if (!NICK.test(nick)) throw new Blad(400, 'Imię gracza: 3–20 znaków (litery, cyfry, spacja, _ lub -).');
    if (haslo.length < 6 || haslo.length > 200) throw new Blad(400, 'Hasło musi mieć co najmniej 6 znaków.');
    const z = db.prepare('SELECT * FROM zaproszenia WHERE kod = ?').get(kodZ);
    if (!z || z.uzyte) { nieudana(k); throw new Blad(400, 'Ten kod zaproszenia jest nieprawidłowy albo został już użyty.'); }
    if (db.prepare('SELECT 1 FROM gracze WHERE nick = ?').get(nick)) throw new Blad(409, 'To imię jest już zajęte.');
    const t = teraz();
    db.exec('BEGIN');
    try {
      const r = db.prepare('INSERT INTO gracze (nick, haslo, admin, utworzony, ostatnio) VALUES (?, ?, ?, ?, ?)').run(nick, hashHasla(haslo), z.admin ? 1 : 0, t, t);
      db.prepare('UPDATE zaproszenia SET uzyte_przez = ?, uzyte = ? WHERE kod = ?').run(r.lastInsertRowid, t, kodZ);
      db.exec('COMMIT');
      const g = db.prepare('SELECT * FROM gracze WHERE id = ?').get(r.lastInsertRowid);
      if (g.admin) kodAdmina();
      return { token: nowaSesja(g.id, b.urzadzenie), gracz: opisGracza(g) };
    } catch (e) { db.exec('ROLLBACK'); throw e; }
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

  // ---------- administrator ----------
  'POST /admin/zaproszenia': async (req) => {
    const s = admin(req);
    const b = await czytajJson(req);
    const k = kod();
    db.prepare('INSERT INTO zaproszenia (kod, admin, utworzone, przez, opis) VALUES (?, 0, ?, ?, ?)').run(k, teraz(), s.id, String(b.opis || '').slice(0, 60));
    return { kod: k };
  },
  'GET /admin/zaproszenia': (req) => {
    admin(req);
    return { zaproszenia: db.prepare(`SELECT z.kod, z.opis, z.utworzone, z.uzyte, g.nick AS gracz FROM zaproszenia z LEFT JOIN gracze g ON g.id = z.uzyte_przez WHERE z.admin = 0 ORDER BY z.utworzone DESC LIMIT 100`).all() };
  },
  'DELETE /admin/zaproszenia': (req, arg) => {
    admin(req);
    db.prepare('DELETE FROM zaproszenia WHERE kod = ? AND uzyte IS NULL AND admin = 0').run(String(arg));
    return { ok: true };
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

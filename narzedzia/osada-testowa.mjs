// Tylko do testów lokalnych: ustawia osadę konta testowego (Lewy) tak, żeby było widać armię i rozwój bohaterów.
// Uruchom: MIDGARD_DANE=/tmp/mdane node narzedzia/osada-testowa.mjs
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import * as O from '../serwer/osada-dane.js';
const dane = process.env.MIDGARD_DANE;
if (!dane || !dane.startsWith('/tmp/')) { console.error('Tylko dla lokalnych danych w /tmp.'); process.exit(1); }
const db = new DatabaseSync(path.join(dane, 'midgard.db'));
const g = db.prepare('SELECT id FROM gracze WHERE nick = ?').get('Lewy');
const t = Date.now();
const o = O.nowaOsada(t);
o.budynki.find((b) => b.typ === 'dlugi_dom').poz = 4;
o.budynki.push({ id: o.nastId++, typ: 'hala_wojow', x: 6, y: 6, poz: 5, bufor: 0, bud: null });
o.budynki.push({ id: o.nastId++, typ: 'magazyn', x: 1, y: 6, poz: 2, bufor: 0, bud: null });
o.budynki.push({ id: o.nastId++, typ: 'swiatynia', x: 6, y: 1, poz: 2, bufor: 0, bud: null });
o.zasoby = { drewno: 1800, zelazo: 1500, zywnosc: 1600, srebro: 350 };
o.bohaterowie.skald = { xp: 0, valhalla: 0 };
o.bohaterowie.lowczyni = { xp: 30, valhalla: 0 };
o.bohaterowie.berserker.xp = 420;
o.bohaterowie.volva = { xp: 75, valhalla: t + 25 * 60 * 1000 };
o.wojsko = { woje: 2, tarczownicy: 1, lucznicy: 1 };
o.szkolenie = [{ typ: 'woje', start: t - 60 * 1000, koniec: t + 2 * 60 * 1000 }];
db.prepare('INSERT INTO osady (gracz_id, dane, zmieniona) VALUES (?, ?, ?) ON CONFLICT(gracz_id) DO UPDATE SET dane = excluded.dane, zmieniona = excluded.zmieniona').run(g.id, JSON.stringify(o), t);
console.log('osada testowa gotowa');

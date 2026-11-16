// Test zasad osady na fałszywym zegarze. Uruchom: node narzedzia/test-osada.mjs
import * as O from '../serwer/osada-dane.js';
const ok = (w, m) => { if (!w) { console.error('BŁĄD:', m); process.exitCode = 1; } else console.log('ok  ', m); };
const M = 60 * 1000, H = 60 * M;
let t = 1_000_000;
const o = O.nowaOsada(t);
ok(O.pojemnosc(o).drewno === 800, 'schowek Długiego Domu 800');
ok(O.budowniczowie(o) === 2, '2 budowniczych');
// produkcja tartaku 60/h: po 1 h bufor 63 (ognisko +5%)
t += H; O.uplyw(o, t);
const tartak = o.budynki.find((b) => b.typ === 'tartak');
ok(Math.round(tartak.bufor) === 63, 'tartak po 1 h: ' + tartak.bufor.toFixed(1));
// bufor zatrzymuje się po 8 h
t += 20 * H; O.uplyw(o, t);
ok(Math.round(tartak.bufor) === O.pojemnoscBufora(o, tartak), 'bufor pełny i stoi: ' + Math.round(tartak.bufor));
// zbieranie tylko do pojemności magazynu
const przed = o.zasoby.drewno; const r = O.zbierz(o, tartak.id);
ok(o.zasoby.drewno === Math.min(800, przed + 504) && r.ile === o.zasoby.drewno - przed, 'zbieranie do limitu: +' + r.ile + ', jest ' + o.zasoby.drewno);
// budowa kopalni na zajętym polu i na wolnym
ok(O.buduj(o, 'kopalnia', 4, 4, t) === 'To pole jest zajęte.', 'zajęte pole odrzucone');
ok(O.buduj(o, 'kopalnia', 0, 0, t) === null, 'kopalnia postawiona');
ok(O.buduj(o, 'kopalnia', 1, 0, t) !== null, 'druga kopalnia odrzucona (limit DD1)');
ok(O.buduj(o, 'skarbiec', 1, 0, t).includes('poziomie 2'), 'skarbiec wymaga DD2');
// ulepszenie tartaku zajmuje drugiego budowniczego, trzecia budowa odrzucona
ok(O.ulepsz(o, tartak.id, t) === 'Najpierw rozbuduj Długi Dom do poziomu 2.', 'tartak nie wyżej niż DD');
const dd = o.budynki.find((b) => b.typ === 'dlugi_dom');
o.zasoby.drewno = 800; o.zasoby.zelazo = 800;
ok(O.ulepsz(o, dd.id, t) === null, 'Długi Dom → 2 rozpoczęty');
o.zasoby.drewno = 800; o.zasoby.zelazo = 800; ok(O.buduj(o, 'magazyn', 2, 0, t) === 'Wszyscy budowniczowie są zajęci.', 'limit budowniczych');
// produkcja w trakcie budowy kopalni: zaczyna dopiero po ukończeniu
const kop = o.budynki.find((b) => b.typ === 'kopalnia');
const koniecKop = kop.bud.koniec, koniecDD = dd.bud.koniec;
t = koniecKop + H; const gotowe = O.uplyw(o, t);
ok(kop.poz === 1 && Math.round(kop.bufor) === 42, 'kopalnia gotowa i produkuje od końca budowy: ' + kop.bufor.toFixed(1));
ok(gotowe.some((g) => g.typ === 'kopalnia'), 'zgłoszone ukończenie');
t = koniecDD + 1; O.uplyw(o, t);
ok(dd.poz === 2 && O.pojemnosc(o).drewno === 1400, 'DD2: schowek 1400');
// anulowanie zwraca koszt
o.zasoby.drewno = 1000; o.zasoby.zelazo = 1000;
O.buduj(o, 'skarbiec', 1, 0, t); const sk = o.budynki.find((b) => b.typ === 'skarbiec');
const dr = o.zasoby.drewno; O.anuluj(o, sk.id);
ok(!o.budynki.includes(sk) && o.zasoby.drewno === dr + 200, 'anulowanie nowej budowy zwraca koszt i usuwa plac');
// czasy i koszty
ok(O.czasBudowy('dlugi_dom', 10) === 24 * 3600 * 1000, 'czas DD10 przycięty do 24 h');
console.log('koszt DD 2..10:', [2, 3, 5, 10].map((p) => `${p}: ${JSON.stringify(O.koszt('dlugi_dom', p))}`).join(' | '));
console.log('czas tartak 1..10 (min):', Array.from({ length: 10 }, (_, i) => Math.round(O.czasBudowy('tartak', i + 1) / M)).join(', '));
console.log('produkcja tartak 1..10 (/h):', Array.from({ length: 10 }, (_, i) => Math.round(O.produkcjaNaGodzine({ budynki: [] }, { typ: 'tartak', poz: i + 1 }))).join(', '));
// łup
const o2 = O.nowaOsada(t); const l = O.dodajLup(o2, O.lup('ragnarok', true));
ok(o2.zasoby.drewno === 800 && l.stracone.drewno > 0, 'łup przycięty do magazynu, nadmiar przepada');
console.log('premie bitwy (pusta osada):', JSON.stringify(O.premieBitwy(o2)));

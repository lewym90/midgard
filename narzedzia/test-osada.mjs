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

// ---------- armia i bohaterowie (E3) ----------
{
  let t = 5_000_000;
  const a = O.nowaOsada(t);
  ok(Object.keys(a.bohaterowie).join() === 'berserker,tarczowniczka,volva', 'na start trzech bohaterów');
  const stara = O.nowaOsada(t); delete stara.bohaterowie; delete stara.wojsko; delete stara.szkolenie; O.uplyw(stara, t + 1);
  ok(stara.bohaterowie && stara.wojsko && Array.isArray(stara.szkolenie), 'stara osada dostaje pola armii');
  ok(O.werbuj(a, 'skald').includes('poziomie 2'), 'Skald wymaga DD2');
  ok(O.szkol(a, 'woje', t) === 'Najpierw postaw Halę Wojów.', 'bez Hali nie ma szkolenia');
  // Hala Wojów 3, DD 3
  a.budynki.find((b) => b.typ === 'dlugi_dom').poz = 3;
  a.budynki.push({ id: 99, typ: 'hala_wojow', x: 0, y: 0, poz: 3, bufor: 0, bud: null });
  a.zasoby = { drewno: 2000, zelazo: 2000, zywnosc: 2000, srebro: 400 };
  ok(O.pojemnoscWojska(a) === 9 && O.miejscaWBitwie(a) === 2, 'Hala 3: 9 miejsc w wojsku, 2 oddziały w bitwie');
  ok(O.szkol(a, 'oszczepnicy', t).includes('poziomie 5'), 'oszczepnicy wymagają Hali 5');
  ok(O.szkol(a, 'woje', t) === null && O.szkol(a, 'lucznicy', t) === null, 'dwa oddziały w kolejce');
  ok(a.szkolenie[1].start === a.szkolenie[0].koniec, 'kolejka szkoli po kolei');
  const zyw = a.zasoby.zywnosc; O.anulujSzkolenie(a); ok(a.szkolenie.length === 1 && a.zasoby.zywnosc === zyw + 70, 'anulowanie ostatniego zwraca koszt');
  t += 3 * M + 1; const g = O.uplyw(a, t);
  ok(a.wojsko.woje === 1 && g.some((x) => x.oddzial === 'woje'), 'woje wyszkoleni po 3 min');
  // utrzymanie: 1 woj = 2 żywności na godzinę (farma też produkuje do bufora, nie do magazynu)
  const z0 = a.zasoby.zywnosc; t += 10 * H; O.uplyw(a, t);
  ok(Math.abs(z0 - a.zasoby.zywnosc - 20) < 0.01, 'utrzymanie 10 h × 2 = 20 żywności');
  a.zasoby.zywnosc = 1; t += 10 * H; O.uplyw(a, t); ok(a.zasoby.zywnosc === 0, 'żywność nie spada poniżej zera');
  // werbunek
  a.zasoby = { drewno: 2000, zelazo: 2000, zywnosc: 2000, srebro: 400 };
  ok(O.werbuj(a, 'skald') === null && a.bohaterowie.skald && a.zasoby.srebro === 280, 'Skald zwerbowany za srebro');
  ok(O.werbuj(a, 'skald') !== null, 'drugi raz ten sam bohater odrzucony');
  // wyprawa
  ok(O.przygotujWyprawe(a, ['berserker', 'skald', 'jarl'], [], t).blad.includes('nie ma jeszcze'), 'niezwerbowany bohater odrzucony');
  ok(O.przygotujWyprawe(a, ['berserker', 'skald', 'volva'], ['woje', 'woje'], t).blad.includes('tylu'), 'za mało oddziałów odrzucone');
  ok(O.przygotujWyprawe(a, ['berserker', 'skald', 'volva'], ['woje', 'woje', 'woje'], t).blad.includes('najwyżej 2'), 'limit miejsc w bitwie');
  const p = O.przygotujWyprawe(a, ['berserker', 'skald', 'volva'], ['woje'], t);
  ok(!p.blad && p.oddzialy.length === 1 && p.rozwoj.berserker.poz === 1, 'wyprawa przygotowana');
  const w = { poziom: 'wojownik', druzyna: p.druzyna, oddzialy: p.oddzialy };
  const r = O.rozliczDruzyne(a, w, true, ['volva'], [], t);
  ok(a.bohaterowie.berserker.xp === 70 && r.bohaterowie[0].awans && O.poziomBohatera(a, 'berserker') === 2, 'wygrana: 70 XP i awans na 2');
  ok(r.straty.woje === 1 && !a.wojsko.woje, 'poległy oddział znika z wojska');
  ok(O.wValhalli(a, 'volva', t + 1) && O.przygotujWyprawe(a, ['berserker', 'skald', 'volva'], [], t + 1).blad.includes('Valhalli'), 'polegla Völva w Valhalli');
  ok(!O.wValhalli(a, 'volva', t + O.czasValhalli(a, 'volva') + 1), 'Völva wraca z Valhalli');
  // limit poziomu = DD + 2
  a.bohaterowie.berserker.xp = 99999;
  ok(O.poziomBohatera(a, 'berserker') === 5, 'poziom bohatera ograniczony przez DD3 → 5');
  ok(JSON.stringify(O.premiaPoziomu(10)) === '{"zycie":9,"atak":3}', 'premie poziomu 10');
  console.log('XP do poziomów 2..10:', Array.from({ length: 9 }, (_, i) => O.xpNaPoziom(i + 2)).join(', '));
}

// ---------- obrona osady (E4) ----------
{
  let t = 9_000_000;
  const a = O.nowaOsada(t);
  O.uplyw(a, t + 1);
  ok(!a.najazd, 'przy DD1 nie ma najazdów');
  a.budynki.find((b) => b.typ === 'dlugi_dom').poz = 2;
  t += 1000; O.uplyw(a, t);
  ok(a.najazd && a.najazd.nr === 1 && a.najazd.czas === t + 18 * H, 'DD2: pierwsza fala za 18 h');
  ok(!O.moznaBronic(a, t) && O.moznaBronic(a, a.najazd.czas - 7 * H), 'bronić można na 8 h przed nadejściem');
  ok(O.zacznijObrone(a, ['berserker', 'tarczowniczka', 'volva'], [], t, 'x').blad.includes('8 godzin'), 'za wcześnie na obronę');
  // automatyczna obrona bez umocnień: porażka i straty
  a.zasoby = { drewno: 1000, zelazo: 1000, zywnosc: 1000, srebro: 200 };
  const sila = O.silaObrony(a, t);
  ok(sila.razem === 18 && O.silaFali(a) === 28, `siła obrony 18 (3 bohaterów poz. 1), fali 28 (jest ${sila.razem}/${O.silaFali(a)})`);
  const czas1 = a.najazd.czas;
  const g = O.uplyw(a, czas1 + 1000);
  const r = g.find((x) => x.najazd);
  ok(r && r.najazd.tryb === 'auto' && r.najazd.wynik === 'lose', 'fala dotarła: automatyczna obrona przegrana');
  ok(a.zasoby.drewno < 1000 && a.zasoby.drewno >= 640 && a.zasoby.srebro > 200 * 0.8, 'straty: część drewna, srebra mniej (skarbiec)');
  ok(a.najazd.nr === 2 && a.najazd.czas >= czas1 + 24 * H + 12 * H, 'następna fala później, po porażce +12 h tarczy');
  ok(a.raporty.length === 1 && a.raporty[0].nr === 1, 'raport zapisany');
  // umocnienia: palisada 8 (4 pola wału = 8), brama 1 (4), wieża 1 (6) → 36 ≥ 30
  for (let i = 0; i < 8; i++) a.budynki.push({ id: 200 + i, typ: 'palisada', x: i, y: 8, poz: 1, bufor: 0, bud: null });
  a.budynki.push({ id: 300, typ: 'brama', x: 8, y: 8, poz: 1, bufor: 0, bud: null });
  a.budynki.push({ id: 301, typ: 'wieza', x: 8, y: 7, poz: 1, bufor: 0, bud: null });
  const u = O.umocnienia(a);
  ok(u.palisada === 8 && u.brama === 1 && u.wieze.join() === '1' && u.dd === 2, 'umocnienia dla bitwy');
  ok(O.silaObrony(a, t).razem === 36, 'siła z umocnieniami 36');
  const czas2 = a.najazd.czas;
  O.uplyw(a, czas2 + 1);
  ok(a.raporty[0].nr === 2 && a.raporty[0].wynik === 'win' && a.slawa === 2, 'fala 2 odparta automatycznie, +2 sławy');
  // obrona osobista
  const czas3 = a.najazd.czas;
  const st = O.zacznijObrone(a, ['berserker', 'tarczowniczka', 'volva'], [], czas3 - 3 * H, 'walka1');
  ok(!st.blad && st.fala === 'fala-1' && st.obrona.brama === 1, 'obrona osobista rozpoczęta');
  ok(O.terminNajazdu(a) === czas3 + 2 * H, 'rozpoczęta bitwa przesuwa automat o 2 h');
  O.uplyw(a, czas3 + H); ok(a.najazd.nr === 3, 'w trakcie bitwy fala nie rozstrzyga się sama');
  ok(O.zakonczObrone(a, 'walka1', true, [], [], czas3 - 3 * H + 1000).blad.includes('krótko'), 'za krótka bitwa odrzucona');
  const kon = O.zakonczObrone(a, 'walka1', true, ['volva'], [], czas3 + H + 1000);
  ok(!kon.blad && kon.raport.tryb === 'bitwa' && kon.raport.wynik === 'win' && kon.raport.lup.drewno > 0, 'wygrana obrona osobista: łup');
  ok(a.bohaterowie.berserker.xp === 40 && O.wValhalli(a, 'volva', czas3 + H + 2000), 'doświadczenie i Valhalla po obronie');
  ok(O.zakonczObrone(a, 'walka1', true, [], [], czas3 + H + 5000).blad.includes('rozstrzygnięty'), 'drugie rozliczenie odrzucone');
  // porzucona bitwa: po 2 h rozstrzyga automat
  const czas4 = a.najazd.czas;
  O.zacznijObrone(a, ['berserker', 'tarczowniczka', 'skald'].filter((k) => a.bohaterowie[k]).concat(['volva']).slice(0, 3), [], czas4 - H, 'walka2');
  a.bohaterowie.volva.valhalla = 0;
  const st2 = O.zacznijObrone(a, ['berserker', 'tarczowniczka', 'volva'], [], czas4 - H, 'walka2');
  ok(!st2.blad, 'druga obrona rozpoczęta');
  const g2 = O.uplyw(a, czas4 + 2 * H + 10);
  ok(g2.some((x) => x.najazd && x.najazd.tryb === 'auto') && a.najazd.nr === 5, 'porzucona bitwa: automat po 2 h');
  // offline przez kilka dni: kolejne fale rozstrzygają się po kolei
  const nr0 = a.najazd.nr;
  O.uplyw(a, a.najazd.czas + 4 * 24 * H);
  ok(a.najazd.nr >= nr0 + 2 && a.raporty.length <= 10, 'kilka fal pod nieobecność, raporty ograniczone do 10');
  // DD4 → wielka fala
  a.budynki.find((b) => b.typ === 'dlugi_dom').poz = 4;
  ok(O.falaKlucz(a) === 'fala-2' && O.silaFali(a) >= 70, 'DD4: wielka fala');
}

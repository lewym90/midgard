// Zasady osady — JEDEN plik dla serwera (źródło prawdy) i gry (podgląd liczników na żywo).
// Czas w milisekundach. Surowce: drewno, zelazo, zywnosc, srebro. Sława osobno.

export const SUROWCE = ['drewno', 'zelazo', 'zywnosc', 'srebro'];
export const NAZWY_SUROWCOW = { drewno: 'Drewno', zelazo: 'Żelazo', zywnosc: 'Żywność', srebro: 'Srebro' };
export const SIATKA = 9;          // osada: 9 × 9 pól
export const MAX_POZIOM = 10;
export const BUFOR_GODZIN = 8;    // tyle godzin urobku mieści budynek produkcyjny, potem staje
const H = 3600 * 1000;

// limit: ile sztuk wolno postawić przy poziomie Długiego Domu 1..10 (0 = jeszcze nie)
// koszt: koszt zbudowania (poziom 1); wyższe poziomy: × 1,65 na poziom
// czas: sekundy budowy poziomu 1; wyższe poziomy: × 2,2 na poziom (najwyżej 24 h)
export const BUDYNKI = {
  dlugi_dom: {
    nazwa: 'Długi Dom', grupa: 'serce', limit: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], koszt: { drewno: 400, zelazo: 250 }, czas: 120, skala: 1.55,
    opis: 'Serce osady. Jego poziom decyduje, ile budynków możesz postawić i jak wysoko je rozbudować. Ma też mały schowek na każdy surowiec.',
  },
  tartak: {
    nazwa: 'Tartak', grupa: 'produkcja', limit: [1, 1, 2, 2, 3, 3, 4, 4, 4, 5], koszt: { drewno: 80, zelazo: 40 }, czas: 30,
    produkcja: { surowiec: 'drewno', naGodzine: 60 },
    opis: 'Ścina i tnie sosny. Produkuje drewno.',
  },
  kopalnia: {
    nazwa: 'Kopalnia rudy', grupa: 'produkcja', limit: [1, 1, 2, 2, 3, 3, 3, 4, 4, 4], koszt: { drewno: 120 }, czas: 40,
    produkcja: { surowiec: 'zelazo', naGodzine: 40 },
    opis: 'Wydobywa rudę i wytapia z niej żelazo.',
  },
  farma: {
    nazwa: 'Farma', grupa: 'produkcja', limit: [1, 2, 2, 3, 3, 4, 4, 4, 5, 5], koszt: { drewno: 100, zelazo: 20 }, czas: 35,
    produkcja: { surowiec: 'zywnosc', naGodzine: 50 },
    opis: 'Pola, bydło i połów z fiordu. Produkuje żywność.',
  },
  skarbiec: {
    nazwa: 'Skarbiec', grupa: 'magazyn', limit: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1], koszt: { drewno: 200, zelazo: 150 }, czas: 90,
    produkcja: { surowiec: 'srebro', naGodzine: 8 }, magazyn: { srebro: 400 }, wzrostMagazynu: 1.5,
    opis: 'Przechowuje srebro i ściąga daninę od okolicznych gospodarstw. Srebro zdobywa się głównie w wyprawach.',
  },
  magazyn: {
    nazwa: 'Magazyn', grupa: 'magazyn', limit: [1, 1, 1, 2, 2, 2, 3, 3, 3, 3], koszt: { drewno: 150, zelazo: 80 }, czas: 60,
    magazyn: { drewno: 1200, zelazo: 1200 }, wzrostMagazynu: 1.45,
    opis: 'Przechowuje drewno i żelazo. Wyższy poziom mieści więcej.',
  },
  spichlerz: {
    nazwa: 'Spichlerz', grupa: 'magazyn', limit: [1, 1, 1, 2, 2, 2, 2, 3, 3, 3], koszt: { drewno: 150, zelazo: 50 }, czas: 60,
    magazyn: { zywnosc: 1500 }, wzrostMagazynu: 1.45,
    opis: 'Przechowuje żywność. Wyższy poziom mieści więcej.',
  },
  hala_wojow: {
    nazwa: 'Hala Wojów', grupa: 'wojsko', limit: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1], koszt: { drewno: 250, zelazo: 200, zywnosc: 100 }, czas: 120,
    bonus: 'zycie',
    opis: 'Tu szkolisz wojsko i tu bohaterowie ćwiczą między wyprawami. Każdy poziom: +1 do życia każdego wojownika w bitwie, więcej miejsc dla wojska i nowe rodzaje oddziałów.',
  },
  kuznia: {
    nazwa: 'Kuźnia', grupa: 'wojsko', limit: [0, 0, 1, 1, 1, 1, 1, 1, 1, 1], koszt: { drewno: 200, zelazo: 300 }, czas: 150,
    bonus: 'atak',
    opis: 'Lepsza broń dla drużyny. Poziomy 1, 4, 7 i 10: kolejne +1 do ataku każdego bohatera w bitwie.',
  },
  swiatynia: {
    nazwa: 'Świątynia', grupa: 'wojsko', limit: [0, 0, 0, 1, 1, 1, 1, 1, 1, 1], koszt: { drewno: 300, zelazo: 150, srebro: 80 }, czas: 180,
    bonus: 'hamingja',
    opis: 'Ofiary dla bogów. Poziomy 2, 5 i 8: kolejna moneta Hamingji (przerzut run) w każdej bitwie. Każdy poziom skraca o 7% pobyt poległych bohaterów w Valhalli.',
  },
  chata_volvy: {
    nazwa: 'Chata Völvy', grupa: 'wojsko', limit: [0, 0, 0, 0, 1, 1, 1, 1, 1, 1], koszt: { drewno: 250, srebro: 120 }, czas: 200,
    bonus: 'runy',
    opis: 'Wieszczka uczy czytać runy. Poziom 3: +1 runa w każdej rundzie bitwy, poziom 8: +2.',
  },
  chata_budowniczego: {
    nazwa: 'Chata budowniczego', grupa: 'osada', limit: [0, 1, 1, 1, 2, 2, 2, 2, 2, 2], koszt: { drewno: 500, zelazo: 300, srebro: 100 }, czas: 300, maxPoziom: 1,
    opis: 'Mieszka tu kolejny budowniczy: +1 budowa naraz.',
  },
  ognisko: {
    nazwa: 'Ognisko', grupa: 'osada', limit: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], koszt: { drewno: 60 }, czas: 20, maxPoziom: 5,
    opis: 'Ludzie zbierają się przy ogniu po pracy. Każdy poziom: +5% do produkcji wszystkich budynków.',
  },
  stocznia: {
    nazwa: 'Stocznia', grupa: 'wkrotce', limit: [0, 0, 1, 1, 1, 1, 1, 1, 1, 1], koszt: { drewno: 350, zelazo: 120 }, czas: 240,
    opis: 'Buduje drakkary. Zasięg wypraw na mapie Midgardu (działa od etapu wypraw).',
  },
  wieza: {
    nazwa: 'Wieża łucznicza', grupa: 'wkrotce', limit: [0, 1, 2, 2, 3, 3, 4, 4, 5, 5], koszt: { drewno: 180, zelazo: 60 }, czas: 60,
    opis: 'Strzela do trupów atakujących osadę (działa od etapu obrony osady).',
  },
  brama: {
    nazwa: 'Brama', grupa: 'wkrotce', limit: [0, 1, 1, 1, 2, 2, 2, 2, 3, 3], koszt: { drewno: 150, zelazo: 80 }, czas: 60,
    opis: 'Wejście w palisadzie (działa od etapu obrony osady).',
  },
  palisada: {
    nazwa: 'Palisada', grupa: 'wkrotce', limit: [0, 8, 12, 16, 20, 24, 28, 32, 36, 40], koszt: { drewno: 25 }, czas: 5,
    opis: 'Odcinek muru z zaostrzonych pali (działa od etapu obrony osady).',
  },
  kamien: {
    nazwa: 'Kamień runiczny', grupa: 'wkrotce', limit: [0, 0, 1, 1, 1, 2, 2, 2, 3, 3], koszt: { drewno: 100, zelazo: 100, srebro: 60 }, czas: 120,
    opis: 'Runy ochronne wzmacniające obrońców w pobliżu (działa od etapu obrony osady).',
  },
};

export const KOLEJNOSC = ['dlugi_dom', 'tartak', 'kopalnia', 'farma', 'magazyn', 'spichlerz', 'skarbiec', 'ognisko', 'chata_budowniczego',
  'hala_wojow', 'kuznia', 'swiatynia', 'chata_volvy', 'stocznia', 'wieza', 'brama', 'palisada', 'kamien'];

const zaokr = (n) => Math.max(5, Math.round(n / 5) * 5);

export function koszt(typ, poz) {
  const k = BUDYNKI[typ].koszt, m = Math.pow(1.65, poz - 1), out = {};
  for (const s in k) out[s] = zaokr(k[s] * m);
  return out;
}
export function czasBudowy(typ, poz) { return Math.min(24 * 3600, Math.round(BUDYNKI[typ].czas * Math.pow(2.2, poz - 1))) * 1000; }

// ---------- odczyty ----------
export const poziomDD = (o) => (o.budynki.find((b) => b.typ === 'dlugi_dom') || { poz: 1 }).poz || 1;
export const ileTypu = (o, typ) => o.budynki.filter((b) => b.typ === typ).length;
export const limitTypu = (o, typ) => BUDYNKI[typ].limit[Math.min(MAX_POZIOM, poziomDD(o)) - 1];
export function maxPoziom(o, typ) {
  if (typ === 'dlugi_dom') return MAX_POZIOM;
  return Math.min(BUDYNKI[typ].maxPoziom || MAX_POZIOM, poziomDD(o));
}
export const budowniczowie = (o) => 2 + o.budynki.filter((b) => b.typ === 'chata_budowniczego' && b.poz >= 1).length;
export const zajeci = (o) => o.budynki.filter((b) => b.bud).length;
export const poziomTypu = (o, typ) => Math.max(0, ...o.budynki.filter((b) => b.typ === typ).map((b) => b.poz));

export function premiaOgniska(o) { return 1 + 0.05 * poziomTypu(o, 'ognisko'); }
export function produkcjaNaGodzine(o, b, poz = b.poz) {
  const p = BUDYNKI[b.typ].produkcja;
  if (!p || poz < 1) return 0;
  return p.naGodzine * Math.pow(1.4, poz - 1) * premiaOgniska(o);
}
export const pojemnoscBufora = (o, b) => Math.floor(produkcjaNaGodzine(o, b) * BUFOR_GODZIN);

export function pojemnosc(o) {
  const dd = poziomDD(o);
  const cap = { drewno: 800 + 600 * (dd - 1), zelazo: 800 + 600 * (dd - 1), zywnosc: 800 + 600 * (dd - 1), srebro: 200 + 100 * (dd - 1) };
  for (const b of o.budynki) {
    const d = BUDYNKI[b.typ];
    if (!d.magazyn || b.poz < 1) continue;
    for (const s in d.magazyn) cap[s] += Math.floor(d.magazyn[s] * Math.pow(d.wzrostMagazynu, b.poz - 1));
  }
  return cap;
}

// Premie dla bitwy z budynków osady
export function premieBitwy(o) {
  const hala = poziomTypu(o, 'hala_wojow'), kuz = poziomTypu(o, 'kuznia'), sw = poziomTypu(o, 'swiatynia'), vol = poziomTypu(o, 'chata_volvy');
  return {
    zycie: hala,
    atak: kuz >= 1 ? Math.floor((kuz + 2) / 3) : 0,
    hamingja: Math.floor((sw + 1) / 3),
    runy: vol >= 8 ? 2 : vol >= 3 ? 1 : 0,
  };
}

// ---------- nowa osada ----------
export function nowaOsada(teraz) {
  const c = Math.floor(SIATKA / 2);
  const b = (id, typ, x, y, poz = 1) => ({ id, typ, x, y, poz, bufor: 0, bud: null });
  return {
    v: 1, czas: teraz, nastId: 5, slawa: 0,
    zasoby: { drewno: 600, zelazo: 400, zywnosc: 400, srebro: 100 },
    budynki: [b(1, 'dlugi_dom', c, c), b(2, 'tartak', c - 3, c - 1), b(3, 'farma', c + 2, c), b(4, 'ognisko', c, c + 2)],
    wyprawy: {},
    statystyki: { wygrane: 0, przegrane: 0 },
    bohaterowie: nowiBohaterowie(),
    wojsko: {},
    szkolenie: [],
  };
}

// Starsze zapisy osad (sprzed armii) dostają brakujące pola.
export function napraw(o) {
  if (!o.bohaterowie) o.bohaterowie = nowiBohaterowie();
  if (!o.wojsko) o.wojsko = {};
  if (!o.szkolenie) o.szkolenie = [];
  return o;
}

// ---------- upływ czasu: produkcja, utrzymanie wojska, budowy i szkolenie (w kolejności zdarzeń) ----------
function narosnij(o, od, doCzasu) {
  const dt = (doCzasu - od) / H;
  if (dt <= 0) return;
  for (const b of o.budynki) {
    if (!BUDYNKI[b.typ].produkcja || b.poz < 1) continue;
    b.bufor = Math.min(pojemnoscBufora(o, b), (b.bufor || 0) + produkcjaNaGodzine(o, b) * dt);
  }
  const ut = utrzymanie(o);
  if (ut > 0) o.zasoby.zywnosc = Math.max(0, o.zasoby.zywnosc - ut * dt);
}

// Zwraca listę ukończonych budów i szkoleń (do powiadomień).
export function uplyw(o, teraz) {
  napraw(o);
  const gotowe = [];
  let t = o.czas;
  for (;;) {
    const bud = o.budynki.filter((b) => b.bud && b.bud.koniec <= teraz).sort((a, b) => a.bud.koniec - b.bud.koniec)[0];
    const szk = o.szkolenie[0] && o.szkolenie[0].koniec <= teraz ? o.szkolenie[0] : null;
    if (!bud && !szk) break;
    if (szk && (!bud || szk.koniec <= bud.bud.koniec)) {
      narosnij(o, t, szk.koniec);
      t = Math.max(t, szk.koniec);
      o.szkolenie.shift();
      o.wojsko[szk.typ] = (o.wojsko[szk.typ] || 0) + 1;
      gotowe.push({ oddzial: szk.typ });
      continue;
    }
    narosnij(o, t, bud.bud.koniec);
    t = Math.max(t, bud.bud.koniec);
    bud.poz = bud.bud.cel;
    bud.bud = null;
    gotowe.push({ id: bud.id, typ: bud.typ, poz: bud.poz });
  }
  narosnij(o, t, teraz);
  o.czas = Math.max(o.czas, teraz);
  return gotowe;
}

// ---------- akcje (zwracają null albo komunikat błędu) ----------
const stac = (o, k) => Object.keys(k).every((s) => o.zasoby[s] >= k[s]);
const pobierz = (o, k) => { for (const s in k) o.zasoby[s] -= k[s]; };
export const zajetePole = (o, x, y, poza = null) => o.budynki.some((b) => b.x === x && b.y === y && b.id !== poza);
export function brakuje(o, k) { return Object.keys(k).filter((s) => o.zasoby[s] < k[s]).map((s) => `${NAZWY_SUROWCOW[s].toLowerCase()} (${Math.ceil(k[s] - o.zasoby[s])})`); }

export function czyMoznaPostawic(o, typ) {
  const d = BUDYNKI[typ];
  if (!d || typ === 'dlugi_dom') return 'Tego nie da się postawić.';
  const lim = limitTypu(o, typ);
  if (lim === 0) { const od = d.limit.findIndex((x) => x > 0) + 1; return `Wymaga Długiego Domu na poziomie ${od}.`; }
  if (ileTypu(o, typ) >= lim) { const od = d.limit.findIndex((x) => x > lim) + 1; return od ? `Limit osiągnięty. Więcej przy Długim Domu na poziomie ${od}.` : 'Limit osiągnięty.'; }
  return null;
}

export function buduj(o, typ, x, y, teraz) {
  const nie = czyMoznaPostawic(o, typ);
  if (nie) return nie;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= SIATKA || y >= SIATKA) return 'Poza osadą.';
  if (zajetePole(o, x, y)) return 'To pole jest zajęte.';
  if (zajeci(o) >= budowniczowie(o)) return 'Wszyscy budowniczowie są zajęci.';
  const k = koszt(typ, 1);
  if (!stac(o, k)) return 'Brakuje: ' + brakuje(o, k).join(', ') + '.';
  pobierz(o, k);
  const b = { id: o.nastId++, typ, x, y, poz: 0, bufor: 0, bud: { cel: 1, start: teraz, koniec: teraz + czasBudowy(typ, 1), koszt: k } };
  o.budynki.push(b);
  return null;
}

export function czyMoznaUlepszyc(o, b) {
  if (b.bud) return 'Ten budynek jest właśnie w budowie.';
  const max = maxPoziom(o, b.typ);
  if (b.poz >= (BUDYNKI[b.typ].maxPoziom || MAX_POZIOM)) return 'Najwyższy poziom.';
  if (b.poz >= max) return `Najpierw rozbuduj Długi Dom do poziomu ${b.poz + 1}.`;
  return null;
}

export function ulepsz(o, id, teraz) {
  const b = o.budynki.find((x) => x.id === id);
  if (!b) return 'Nie ma takiego budynku.';
  const nie = czyMoznaUlepszyc(o, b);
  if (nie) return nie;
  if (zajeci(o) >= budowniczowie(o)) return 'Wszyscy budowniczowie są zajęci.';
  const k = koszt(b.typ, b.poz + 1);
  if (!stac(o, k)) return 'Brakuje: ' + brakuje(o, k).join(', ') + '.';
  pobierz(o, k);
  b.bud = { cel: b.poz + 1, start: teraz, koniec: teraz + czasBudowy(b.typ, b.poz + 1), koszt: k };
  return null;
}

export function anuluj(o, id) {
  const b = o.budynki.find((x) => x.id === id);
  if (!b || !b.bud) return 'Tu nic się nie buduje.';
  const cap = pojemnosc(o);
  for (const s in b.bud.koszt) o.zasoby[s] = Math.min(cap[s], o.zasoby[s] + b.bud.koszt[s]);
  if (b.poz === 0) o.budynki = o.budynki.filter((x) => x !== b);
  else b.bud = null;
  return null;
}

// Zbiera urobek z budynku do magazynów. Zwraca { ile, surowiec } albo komunikat.
export function zbierz(o, id) {
  const b = o.budynki.find((x) => x.id === id);
  const p = b && BUDYNKI[b.typ].produkcja;
  if (!p) return { blad: 'Ten budynek nic nie produkuje.' };
  const wolne = pojemnosc(o)[p.surowiec] - o.zasoby[p.surowiec];
  const ile = Math.floor(Math.min(b.bufor || 0, Math.max(0, wolne)));
  if (ile <= 0) return { blad: wolne <= 0 ? `Magazyn na ${NAZWY_SUROWCOW[p.surowiec].toLowerCase()} jest pełny.` : 'Nie ma jeszcze czego zebrać.', surowiec: p.surowiec, ile: 0 };
  b.bufor -= ile;
  o.zasoby[p.surowiec] += ile;
  return { ile, surowiec: p.surowiec };
}

export function przesun(o, id, x, y) {
  const b = o.budynki.find((q) => q.id === id);
  if (!b) return 'Nie ma takiego budynku.';
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= SIATKA || y >= SIATKA) return 'Poza osadą.';
  if (zajetePole(o, x, y, id)) return 'To pole jest zajęte.';
  b.x = x; b.y = y;
  return null;
}

// ---------- wyprawy (bitwy) ----------
export const LUP = { wedrowiec: 1, wojownik: 2, ragnarok: 3.5 };
export const MIN_CZAS_WYPRAWY = 2 * 60 * 1000;
export function lup(poziom, wygrana) {
  const m = (LUP[poziom] || 1) * (wygrana ? 1 : 0.25);
  return { drewno: Math.round(250 * m), zelazo: Math.round(180 * m), zywnosc: Math.round(180 * m), srebro: Math.round(50 * m), slawa: wygrana ? Math.round(10 * (LUP[poziom] || 1)) : 0 };
}
export function dodajLup(o, l) {
  const cap = pojemnosc(o), dodane = {}, stracone = {};
  for (const s of SUROWCE) {
    const ile = Math.max(0, Math.min(l[s] || 0, cap[s] - o.zasoby[s]));
    o.zasoby[s] += ile; dodane[s] = ile; stracone[s] = (l[s] || 0) - ile;
  }
  o.slawa += l.slawa || 0;
  return { dodane, stracone, slawa: l.slawa || 0 };
}

// ======================================================================
// ARMIA I BOHATEROWIE (E3)
// ======================================================================

// Bohaterowie: trzech na start, reszta do zwerbowania za srebro.
export const BOHATEROWIE = {
  berserker: { nazwa: 'Berserker', start: true },
  tarczowniczka: { nazwa: 'Tarczowniczka', start: true },
  volva: { nazwa: 'Völva', start: true },
  skald: { nazwa: 'Skald', dd: 2, koszt: { srebro: 120, zywnosc: 200 } },
  lowczyni: { nazwa: 'Łowczyni', dd: 2, koszt: { srebro: 160, zywnosc: 200 } },
  jarl: { nazwa: 'Jarl', dd: 3, koszt: { srebro: 260, zywnosc: 300 } },
  'mistrz-run': { nazwa: 'Mistrz Run', dd: 4, koszt: { srebro: 380, zywnosc: 400 } },
  ulfhedinn: { nazwa: 'Ulfhedinn', dd: 5, koszt: { srebro: 520, zywnosc: 500 } },
};
export const KOLEJNOSC_BOHATEROW = ['berserker', 'tarczowniczka', 'volva', 'skald', 'lowczyni', 'jarl', 'mistrz-run', 'ulfhedinn'];
export const MAX_POZIOM_BOHATERA = 10;
function nowiBohaterowie() {
  const out = {};
  for (const k of KOLEJNOSC_BOHATEROW) if (BOHATEROWIE[k].start) out[k] = { xp: 0, valhalla: 0 };
  return out;
}

// Doświadczenie potrzebne do osiągnięcia poziomu p (łącznie): 60, 180, 360, 600, …
export const xpNaPoziom = (p) => 30 * p * (p - 1);
export const limitPoziomuBohatera = (o) => Math.min(MAX_POZIOM_BOHATERA, poziomDD(o) + 2);
export function poziomBohatera(o, typ) {
  const b = o.bohaterowie && o.bohaterowie[typ];
  if (!b) return 0;
  let p = 1;
  while (p < limitPoziomuBohatera(o) && b.xp >= xpNaPoziom(p + 1)) p++;
  return p;
}
// Premie z poziomu: +1 życia za każdy poziom ponad pierwszy, +1 ataku na poziomach 4, 7 i 10.
export const premiaPoziomu = (p) => ({ zycie: Math.max(0, p - 1), atak: (p >= 4) + (p >= 7) + (p >= 10) });
export function rozwojBohaterow(o) {
  const out = {};
  for (const k of Object.keys(o.bohaterowie || {})) { const p = poziomBohatera(o, k); out[k] = { poz: p, ...premiaPoziomu(p) }; }
  return out;
}
// Polegli wracają z Valhalli po: 20 min + 10 min na poziom, Świątynia skraca o 7% na poziom.
export function czasValhalli(o, typ) {
  const p = Math.max(1, poziomBohatera(o, typ));
  return Math.round((20 + 10 * p) * 60 * 1000 * Math.max(0.3, 1 - 0.07 * poziomTypu(o, 'swiatynia')));
}
export const wValhalli = (o, typ, teraz) => !!(o.bohaterowie[typ] && o.bohaterowie[typ].valhalla > teraz);

export function czyMoznaZwerbowac(o, typ) {
  const d = BOHATEROWIE[typ];
  if (!d) return 'Nie ma takiego bohatera.';
  if (o.bohaterowie[typ]) return 'Ten bohater jest już w osadzie.';
  if (poziomDD(o) < d.dd) return `Wymaga Długiego Domu na poziomie ${d.dd}.`;
  return null;
}
export function werbuj(o, typ) {
  napraw(o);
  const nie = czyMoznaZwerbowac(o, typ);
  if (nie) return nie;
  const k = BOHATEROWIE[typ].koszt;
  if (!stac(o, k)) return 'Brakuje: ' + brakuje(o, k).join(', ') + '.';
  pobierz(o, k);
  o.bohaterowie[typ] = { xp: 0, valhalla: 0 };
  return null;
}

// Oddziały: odblokowanie od poziomu Hali Wojów, koszt, czas szkolenia, utrzymanie (żywność na godzinę).
export const WOJSKO = {
  woje: { nazwa: 'Woje', hala: 1, koszt: { zywnosc: 60, zelazo: 30 }, czas: 3 * 60, utrzymanie: 2 },
  tarczownicy: { nazwa: 'Tarczownicy', hala: 2, koszt: { zywnosc: 80, zelazo: 60, drewno: 40 }, czas: 5 * 60, utrzymanie: 3 },
  lucznicy: { nazwa: 'Łucznicy', hala: 3, koszt: { zywnosc: 70, drewno: 90 }, czas: 6 * 60, utrzymanie: 2 },
  oszczepnicy: { nazwa: 'Oszczepnicy', hala: 5, koszt: { zywnosc: 100, zelazo: 90, drewno: 40 }, czas: 10 * 60, utrzymanie: 3 },
  berserkerzy: { nazwa: 'Berserkerzy', hala: 7, koszt: { zywnosc: 160, zelazo: 140, srebro: 30 }, czas: 20 * 60, utrzymanie: 5 },
};
export const KOLEJNOSC_WOJSKA = ['woje', 'tarczownicy', 'lucznicy', 'oszczepnicy', 'berserkerzy'];
export const MAX_KOLEJKI = 5;
export const pojemnoscWojska = (o) => 3 * poziomTypu(o, 'hala_wojow');
export const miejscaWBitwie = (o) => Math.min(5, Math.ceil(poziomTypu(o, 'hala_wojow') / 2));
export const liczbaWojska = (o) => Object.values(o.wojsko || {}).reduce((a, n) => a + n, 0);
export function utrzymanie(o) {
  let n = 0;
  for (const [t, ile] of Object.entries(o.wojsko || {})) n += (WOJSKO[t] ? WOJSKO[t].utrzymanie : 0) * ile;
  return n;
}

export function czyMoznaSzkolic(o, typ) {
  const d = WOJSKO[typ];
  if (!d) return 'Nie ma takiego oddziału.';
  const hala = poziomTypu(o, 'hala_wojow');
  if (hala < 1) return 'Najpierw postaw Halę Wojów.';
  if (hala < d.hala) return `Wymaga Hali Wojów na poziomie ${d.hala}.`;
  if (liczbaWojska(o) + o.szkolenie.length >= pojemnoscWojska(o)) return 'Brak miejsca w Hali Wojów. Rozbuduj ją, żeby utrzymać więcej wojska.';
  if (o.szkolenie.length >= MAX_KOLEJKI) return `W kolejce może czekać najwyżej ${MAX_KOLEJKI} oddziałów.`;
  return null;
}
export function szkol(o, typ, teraz) {
  napraw(o);
  const nie = czyMoznaSzkolic(o, typ);
  if (nie) return nie;
  const k = WOJSKO[typ].koszt;
  if (!stac(o, k)) return 'Brakuje: ' + brakuje(o, k).join(', ') + '.';
  pobierz(o, k);
  const ost = o.szkolenie[o.szkolenie.length - 1];
  const start = Math.max(teraz, ost ? ost.koniec : 0);
  o.szkolenie.push({ typ, start, koniec: start + WOJSKO[typ].czas * 1000 });
  return null;
}
// Anuluje ostatni oddział w kolejce i zwraca jego koszt.
export function anulujSzkolenie(o) {
  napraw(o);
  const z = o.szkolenie.pop();
  if (!z) return 'Nikt się nie szkoli.';
  const cap = pojemnosc(o);
  for (const [s2, n] of Object.entries(WOJSKO[z.typ].koszt)) o.zasoby[s2] = Math.min(cap[s2], o.zasoby[s2] + n);
  return null;
}

// ---------- wyprawa z drużyną i wojskiem ----------
// Sprawdza wybór gracza. Zwraca { blad } albo { druzyna, oddzialy, rozwoj, premie }.
export function przygotujWyprawe(o, druzyna, oddzialy, teraz) {
  napraw(o);
  if (!Array.isArray(druzyna) || druzyna.length !== 3 || new Set(druzyna).size !== 3) return { blad: 'Wybierz trzech różnych bohaterów.' };
  for (const k of druzyna) {
    if (!o.bohaterowie[k]) return { blad: `${(BOHATEROWIE[k] || { nazwa: k }).nazwa}: tego bohatera nie ma jeszcze w osadzie.` };
    if (wValhalli(o, k, teraz)) return { blad: `${BOHATEROWIE[k].nazwa} jest jeszcze w Valhalli.` };
  }
  const lista = Array.isArray(oddzialy) ? oddzialy.filter((t) => WOJSKO[t]) : [];
  if (lista.length > miejscaWBitwie(o)) return { blad: `Na wyprawę możesz zabrać najwyżej ${miejscaWBitwie(o)} oddziałów.` };
  const ile = {};
  for (const t of lista) { ile[t] = (ile[t] || 0) + 1; if (ile[t] > (o.wojsko[t] || 0)) return { blad: `Nie masz tylu oddziałów: ${WOJSKO[t].nazwa}.` }; }
  const r = rozwojBohaterow(o), rozwoj = {};
  for (const k of druzyna) rozwoj[k] = r[k];
  return { druzyna: druzyna.slice(), oddzialy: lista, rozwoj, premie: premieBitwy(o) };
}

export const XP_WYPRAWY = { wedrowiec: 40, wojownik: 70, ragnarok: 120 };
// Rozlicza drużynę: doświadczenie, Valhalla dla poległych, utracone oddziały.
// polegli: lista bohaterów, którzy padli; ocaleli: lista typów oddziałów, które wróciły.
export function rozliczDruzyne(o, w, wygrana, polegli, ocaleli, teraz) {
  napraw(o);
  const xp = Math.round((XP_WYPRAWY[w.poziom] || 40) * (wygrana ? 1 : 0.3));
  const bohaterowie = [];
  for (const k of w.druzyna || []) {
    const b = o.bohaterowie[k];
    if (!b) continue;
    const przed = poziomBohatera(o, k);
    b.xp += xp;
    const poz = poziomBohatera(o, k);
    const padl = Array.isArray(polegli) && polegli.includes(k);
    if (padl) b.valhalla = teraz + czasValhalli(o, k);
    bohaterowie.push({ typ: k, xp, poz, awans: poz > przed, valhalla: padl ? b.valhalla : 0 });
  }
  const wrocili = {};
  for (const t of Array.isArray(ocaleli) ? ocaleli : []) wrocili[t] = (wrocili[t] || 0) + 1;
  const straty = {};
  for (const t of w.oddzialy || []) {
    if (wrocili[t] > 0) { wrocili[t]--; continue; }
    if ((o.wojsko[t] || 0) > 0) { o.wojsko[t]--; straty[t] = (straty[t] || 0) + 1; }
  }
  return { bohaterowie, straty };
}

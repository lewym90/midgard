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
    opis: 'Tu bohaterowie ćwiczą między wyprawami. Każdy poziom: +1 do życia każdego bohatera w bitwie.',
  },
  kuznia: {
    nazwa: 'Kuźnia', grupa: 'wojsko', limit: [0, 0, 1, 1, 1, 1, 1, 1, 1, 1], koszt: { drewno: 200, zelazo: 300 }, czas: 150,
    bonus: 'atak',
    opis: 'Lepsza broń dla drużyny. Poziomy 1, 4, 7 i 10: kolejne +1 do ataku każdego bohatera w bitwie.',
  },
  swiatynia: {
    nazwa: 'Świątynia', grupa: 'wojsko', limit: [0, 0, 0, 1, 1, 1, 1, 1, 1, 1], koszt: { drewno: 300, zelazo: 150, srebro: 80 }, czas: 180,
    bonus: 'hamingja',
    opis: 'Ofiary dla bogów. Poziomy 2, 5 i 8: kolejna moneta Hamingji (przerzut run) w każdej bitwie.',
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
  };
}

// ---------- upływ czasu: produkcja i kończenie budów (w kolejności zdarzeń) ----------
function narosnij(o, od, doCzasu) {
  const dt = (doCzasu - od) / H;
  if (dt <= 0) return;
  for (const b of o.budynki) {
    if (!BUDYNKI[b.typ].produkcja || b.poz < 1) continue;
    b.bufor = Math.min(pojemnoscBufora(o, b), (b.bufor || 0) + produkcjaNaGodzine(o, b) * dt);
  }
}

// Zwraca listę ukończonych budów (do powiadomień).
export function uplyw(o, teraz) {
  const gotowe = [];
  let t = o.czas;
  for (;;) {
    const nast = o.budynki.filter((b) => b.bud && b.bud.koniec <= teraz).sort((a, b) => a.bud.koniec - b.bud.koniec)[0];
    if (!nast) break;
    narosnij(o, t, nast.bud.koniec);
    t = Math.max(t, nast.bud.koniec);
    nast.poz = nast.bud.cel;
    nast.bud = null;
    gotowe.push({ id: nast.id, typ: nast.typ, poz: nast.poz });
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

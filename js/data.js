// Dane gry: teren, bohaterowie, wrogowie, runy, scenariusz pierwszej bitwy.

export const TERRAIN = {
  '.': { id: 'snieg', name: 'Śnieg', cost: 1, def: 0, img: 'snieg', desc: 'Zwykły teren.' },
  'L': { id: 'las', name: 'Las', cost: 2, def: 1, img: 'las', desc: 'Ruch kosztuje 2. Stojący tu otrzymuje 1 obrażenie mniej.' },
  '~': { id: 'lod', name: 'Lód', cost: 1, def: -1, img: 'lod', desc: 'Śliski. Stojący tu otrzymuje 1 obrażenie więcej.' },
  'B': { id: 'bagno', name: 'Bagno', cost: 2, def: 0, img: 'bagno', desc: 'Ruch kosztuje 2.' },
  'S': { id: 'skaly', name: 'Skały', cost: 2, def: 1, img: 'skaly', range: 1, desc: 'Ruch kosztuje 2. Osłona: 1 obrażenie mniej. Ataki z dystansu sięgają o 1 pole dalej.' },
  'K': { id: 'kurhan', name: 'Kurhan', cost: 99, def: 0, img: 'kurhan', blocked: true, desc: 'Nie da się wejść. Stąd wstają umarli.' },
};

export const HEROES = {
  berserker: {
    name: 'Berserker', role: 'Niszczyciel', hp: 12, move: 3, atk: 3, range: 1,
    passive: 'Szał krwi: +1 do ataku za każde 4 utracone punkty życia.',
    power: 'Wir topora', powerDesc: 'Uderza wszystkich wrogów stojących obok. Nie zużywa zwykłego ataku.',
  },
  tarczowniczka: {
    name: 'Tarczowniczka', role: 'Obrońca', hp: 14, move: 2, atk: 2, range: 1,
    passive: 'Mur tarcz: sojusznicy obok niej otrzymują 1 obrażenie mniej.',
    power: 'Przyjmę cios', powerDesc: 'Do końca rundy przejmuje na siebie ciosy wymierzone w sojuszników stojących obok.',
  },
  volva: {
    name: 'Völva', role: 'Wieszczka', hp: 8, move: 2, atk: 1, range: 3,
    passive: 'Wieszczba: póki żyje, widzicie, kiedy i co przyjdzie z kurhanu.',
    power: 'Przetnij nić', powerDesc: 'Wybierz wroga: jego zamiar w tej rundzie przepada.',
  },
  skald: {
    name: 'Skald', role: 'Wsparcie', hp: 9, move: 2, atk: 1, range: 1,
    passive: 'Pieśń bojowa: bohaterowie stojący obok niego mają +1 do ataku.',
    power: 'Pieśń odwagi', powerDesc: 'Każdy inny żywy bohater odzyskuje 2 punkty życia i dostaje +1 ruchu.',
  },
  jarl: {
    name: 'Jarl', role: 'Dowódca', hp: 12, move: 2, atk: 3, range: 1,
    passive: 'Rozkazy: póki żyje, drużyna rzuca co rundę jedną runą więcej.',
    power: 'Na mój znak!', powerDesc: 'Wskaż bohatera, który już atakował: może zaatakować jeszcze raz.',
  },
  'mistrz-run': {
    name: 'Mistrz Run', role: 'Mag terenu', hp: 9, move: 2, atk: 2, range: 2,
    passive: 'Znawca ziemi: las, bagno i skały kosztują go tylko 1 ruchu.',
    power: 'Lodowa runa', powerDesc: 'Wskaż wolne pole w odległości do 3: do końca następnej rundy nikt przez nie nie przejdzie.',
  },
  lowczyni: {
    name: 'Łowczyni', role: 'Strzelczyni', hp: 9, move: 3, atk: 2, range: 3,
    passive: 'Pierwsza krew: +2 do ataku przeciw wrogowi, który ma pełne życie.',
    power: 'Drugi strzał', powerDesc: 'Jeśli już strzelała w tej rundzie, może strzelić jeszcze raz.',
  },
  ulfhedinn: {
    name: 'Ulfhedinn', role: 'Wilczy wojownik', hp: 10, move: 4, atk: 3, range: 1,
    passive: 'Wilczy krok: może przechodzić przez pola zajęte przez wrogów (nie może na nich stanąć).',
    power: 'Wilczy szał', powerDesc: '+3 do ataku do końca rundy.',
  },
};
// Oddziały z osady (szkolone w Hali Wojów). Walczą jak bohaterowie, ale bez mocy i nie dokładają run.
export const ODDZIALY = {
  woje: {
    name: 'Woje', role: 'Oddział', hp: 6, move: 3, atk: 2, range: 1, oddzial: true,
    passive: 'Zwykli wojownicy z osady. Tani i szybcy w szkoleniu.',
  },
  tarczownicy: {
    name: 'Tarczownicy', role: 'Oddział', hp: 9, move: 2, atk: 1, range: 1, pancerz: 1, oddzial: true,
    passive: 'Pancerz: każdy cios zadaje im 1 obrażenie mniej.',
  },
  lucznicy: {
    name: 'Łucznicy', role: 'Oddział', hp: 4, move: 2, atk: 2, range: 3, oddzial: true,
    passive: 'Strzelają na 3 pola. Słabi w zwarciu, trzymaj ich za tarczami.',
  },
  oszczepnicy: {
    name: 'Oszczepnicy', role: 'Oddział', hp: 5, move: 3, atk: 2, range: 2, oddzial: true,
    passive: 'Rzucają oszczepami na 2 pola.',
  },
  berserkerzy: {
    name: 'Berserkerzy', role: 'Oddział', hp: 8, move: 3, atk: 3, range: 1, oddzial: true,
    passive: 'Oddział w wilczych skórach. Najsilniejsi z wojska, ale drodzy w utrzymaniu.',
  },
};
export const ODDZIALY_ORDER = ['woje', 'tarczownicy', 'lucznicy', 'oszczepnicy', 'berserkerzy'];
// Dane jednostki po stronie drużyny: bohater albo oddział.
export const jednostka = (type) => HEROES[type] || ODDZIALY[type];

export const HERO_ORDER = ['berserker', 'tarczowniczka', 'volva', 'skald', 'jarl', 'mistrz-run', 'lowczyni', 'ulfhedinn'];
export const NAMES = {
  nom: { berserker: 'Berserker', tarczowniczka: 'Tarczowniczka', volva: 'Völva', skald: 'Skald', jarl: 'Jarl', 'mistrz-run': 'Mistrz Run', lowczyni: 'Łowczyni', ulfhedinn: 'Ulfhedinn' },
  gen: { berserker: 'Berserkera', tarczowniczka: 'Tarczowniczki', volva: 'Völvy', skald: 'Skalda', jarl: 'Jarla', 'mistrz-run': 'Mistrza Run', lowczyni: 'Łowczyni', ulfhedinn: 'Ulfhedinna',
    woje: 'wojów', tarczownicy: 'tarczowników', lucznicy: 'łuczników', oszczepnicy: 'oszczepników', berserkerzy: 'berserkerów' },
  fallen: { berserker: 'Poległ', tarczowniczka: 'Poległa', volva: 'Poległa', skald: 'Poległ', jarl: 'Poległ', 'mistrz-run': 'Poległ', lowczyni: 'Poległa', ulfhedinn: 'Poległ' },
};

export const ENEMIES = {
  draugr: { name: 'Draugr', hp: 6, move: 2, atk: 3, range: 1, armor: 0, desc: 'Wstały z kurhanu trup. Idzie do najbliższego żywego.' },
  lucznik: { name: 'Draugr łucznik', hp: 3, move: 2, atk: 2, range: 3, armor: 0, desc: 'Strzela z dystansu i trzyma się z dala od ostrzy.' },
  'pan-kurhanu': { name: 'Pan Kurhanu', hp: 20, move: 2, atk: 5, range: 1, armor: 1, boss: true, desc: 'Dawny wódz pogrzebany z bronią. Pancerz: każdy cios zadaje mu 1 obrażenie mniej. Co drugą rundę przyzywa draugra.' },
};

export const RUNES = {
  I: { name: 'Isa', short: 'Lód', desc: 'Lodowa runa Mistrza Run.' },
  T: { name: 'Tiwaz', short: 'Atak', desc: '+2 do obrażeń bohatera w tej rundzie.' },
  A: { name: 'Algiz', short: 'Tarcza', desc: '+2 tarczy do końca rundy. Tarcza pochłania obrażenia.' },
  R: { name: 'Raidho', short: 'Ruch', desc: '+2 ruchu w tej rundzie.' },
  K: { name: 'Kenaz', short: 'Moc', desc: 'Pozwala raz użyć mocy bohatera.' },
  B: { name: 'Berkano', short: 'Leczenie', desc: 'Leczy bohatera o 3 punkty życia.' },
  N: { name: 'Ansuz', short: 'Dowolna', desc: 'Staje się dowolną inną runą.' },
};
export const DIE_FACES = ['T', 'A', 'R', 'K', 'B', 'N'];

// Pierwsza bitwa: Kurhan nad fiordem.
const D = (c, r) => ({ type: 'draugr', at: [c, r] });
const L = (c, r) => ({ type: 'lucznik', at: [c, r] });
const BOSS = { type: 'pan-kurhanu', at: [8, 4] };
export const SCENARIO = {
  id: 'kurhan',
  title: 'Kurhan nad fiordem',
  goal: 'Zgładźcie Pana Kurhanu, zanim zima zabierze pole bitwy.',
  maxRounds: 10,
  frostStart: 4, // od końca tej rundy co rundę zamarza kolejna kolumna od zachodu
  frostDamage: 2,
  map: [
    'LL...S~~.LL',
    'L.....~...L',
    '..B...~.S..',
    '..BB.~..K..',
    '..B..~...S.',
    'L...S~....L',
    'LL..~~..LLL',
  ],
  heroSlots: [[1, 2], [1, 3], [0, 3]],
  troopSlots: [[0, 2], [1, 4], [0, 4], [2, 1], [1, 1]],
  // Kurhan czuje żywych: każdy oddział z osady budzi jednego trupa więcej (runda i miejsce po kolei).
  troopBossHp: 3, // i Pan Kurhanu ma tyle życia więcej za każdy oddział
  troopWaves: [[2, 'draugr', [9, 3]], [3, 'draugr', [9, 4]], [5, 'lucznik', [9, 2]], [2, 'draugr', [7, 1]], [6, 'draugr', [7, 5]]],
  levels: {
    wedrowiec: {
      name: 'Wędrowiec', desc: 'Na pierwszą bitwę i dla gości. 7 trupów, Pan Kurhanu słabszy i przyzywa raz.',
      bossHp: 16, summons: 1,
      waves: {
        1: [D(7, 1), D(7, 5), L(9, 2)],
        3: [D(9, 3)],
        4: [BOSS],
        5: [L(9, 2)],
        6: [D(7, 3)],
      },
    },
    wojownik: {
      name: 'Wojownik', desc: 'Prawdziwa bitwa. 10 trupów, Pan Kurhanu przyzywa dwa razy.',
      bossHp: 20, summons: 2,
      waves: {
        1: [D(7, 1), D(7, 5), D(9, 4), L(9, 2)],
        2: [D(9, 3)],
        3: [D(7, 3), L(9, 2)],
        4: [BOSS],
        6: [D(9, 3)],
      },
    },
    ragnarok: {
      name: 'Ragnarök', desc: 'Dla tych, którzy znają grę. 13 trupów, Pan Kurhanu przyzywa trzy razy.',
      bossHp: 20, summons: 3,
      waves: {
        1: [D(7, 1), D(7, 5), D(9, 4), L(9, 2)],
        2: [D(9, 3)],
        3: [D(7, 3), L(9, 2)],
        4: [BOSS],
        5: [D(7, 3)],
        6: [L(9, 2), D(9, 3)],
      },
    },
  },
  intro: [
    'Trzecią noc z rzędu psy wyją w stronę fiordu. Rybacy mówią, że stary kurhan nad wodą pękł, a z jego wnętrza bije mróz.',
    'Jarl wysyła troje najlepszych, jakich ma. Nie po to, żeby wygrali z umarłymi, tylko po to, żeby uciszyli tego, który ich budzi.',
    'Zanim wzejdzie słońce, umarli muszą wrócić do ziemi.',
  ],
  win: 'Pan Kurhanu pada w śnieg i tym razem nie wstaje. Draugry rozsypują się w proch, a nad fiordem po raz pierwszy od trzech nocy jest cicho. Skald będzie miał o czym śpiewać.',
  lose: 'Ostatni z drużyny pada w śnieg. Kurhan pochłania kolejnych zmarłych, a nad fiordem zapada długa noc. Saga tej drużyny kończy się tutaj.',
  loseTime: 'Mróz zamyka się nad polem bitwy, zanim Pan Kurhanu padł. Drużyna cofa się przez zamarznięty fiord, a za jej plecami umarli wciąż wychodzą z ziemi. Saga tej drużyny kończy się tutaj.',
};

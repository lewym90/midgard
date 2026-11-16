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
};

export const ENEMIES = {
  draugr: { name: 'Draugr', hp: 6, move: 2, atk: 3, range: 1, armor: 0, desc: 'Wstały z kurhanu trup. Idzie do najbliższego żywego.' },
  lucznik: { name: 'Draugr łucznik', hp: 3, move: 2, atk: 2, range: 3, armor: 0, desc: 'Strzela z dystansu i trzyma się z dala od ostrzy.' },
  'pan-kurhanu': { name: 'Pan Kurhanu', hp: 20, move: 2, atk: 5, range: 1, armor: 1, boss: true, desc: 'Dawny wódz pogrzebany z bronią. Pancerz: każdy cios zadaje mu 1 obrażenie mniej. Co drugą rundę przyzywa draugra.' },
};

export const RUNES = {
  T: { name: 'Tiwaz', short: 'Atak', desc: '+2 do obrażeń bohatera w tej rundzie.' },
  A: { name: 'Algiz', short: 'Tarcza', desc: '+2 tarczy do końca rundy. Tarcza pochłania obrażenia.' },
  R: { name: 'Raidho', short: 'Ruch', desc: '+2 ruchu w tej rundzie.' },
  K: { name: 'Kenaz', short: 'Moc', desc: 'Pozwala raz użyć mocy bohatera.' },
  B: { name: 'Berkano', short: 'Leczenie', desc: 'Leczy bohatera o 3 punkty życia.' },
  N: { name: 'Ansuz', short: 'Dowolna', desc: 'Staje się dowolną inną runą.' },
};
export const DIE_FACES = ['T', 'A', 'R', 'K', 'B', 'N'];

// Pierwsza bitwa: Kurhan nad fiordem.
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
  heroes: [
    { type: 'berserker', at: [1, 2] },
    { type: 'tarczowniczka', at: [1, 3] },
    { type: 'volva', at: [0, 3] },
  ],
  waves: {
    1: [
      { type: 'draugr', at: [7, 1] },
      { type: 'draugr', at: [7, 5] },
      { type: 'draugr', at: [9, 4] },
      { type: 'lucznik', at: [9, 2] },
    ],
    2: [{ type: 'draugr', at: [9, 3] }],
    3: [
      { type: 'draugr', at: [7, 3] },
      { type: 'lucznik', at: [9, 2] },
    ],
    4: [{ type: 'pan-kurhanu', at: [8, 4] }],
    5: [{ type: 'draugr', at: [7, 3] }],
    6: [
      { type: 'lucznik', at: [9, 2] },
      { type: 'draugr', at: [9, 3] },
    ],
  },
  intro: [
    'Trzecią noc z rzędu psy wyją w stronę fiordu. Rybacy mówią, że stary kurhan nad wodą pękł, a z jego wnętrza bije mróz.',
    'Jarl wysyła was troje. Berserkera, który nie zna strachu. Tarczowniczkę, która nie zna odwrotu. I starą Völvę, która widzi nici Norn.',
    'Zanim wzejdzie słońce, umarli muszą wrócić do ziemi.',
  ],
  win: 'Pan Kurhanu pada w śnieg i tym razem nie wstaje. Draugry rozsypują się w proch, a nad fiordem po raz pierwszy od trzech nocy jest cicho. Skald będzie miał o czym śpiewać.',
  lose: 'Ostatni z drużyny pada w śnieg. Kurhan pochłania kolejnych zmarłych, a nad fiordem zapada długa noc. Saga tej drużyny kończy się tutaj.',
  loseTime: 'Mróz zamyka się nad polem bitwy, zanim Pan Kurhanu padł. Drużyna cofa się przez zamarznięty fiord, a za jej plecami umarli wciąż wychodzą z ziemi. Saga tej drużyny kończy się tutaj.',
};

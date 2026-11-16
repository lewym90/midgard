// Zasady bitwy. Czysta logika bez DOM, żeby dało się ją testować.
// Każda akcja zmienia stan i zwraca listę zdarzeń do animacji.

import { TERRAIN, HEROES, ENEMIES, DIE_FACES, SCENARIO, SCENARIOS, ODDZIALY, BUDOWLE, jednostka } from './data.js';
import { key, parseKey, distance, neighbors } from './hex.js';

export const SAVE_VERSION = 2;

// ---------- pomocnicze ----------

export function clone(o) { return JSON.parse(JSON.stringify(o)); }

function rng(state) {
  // deterministyczny generator (mulberry32) zapisany w stanie
  let t = (state.seed = (state.seed + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const cols = (s) => s.map[0].length;
export const rows = (s) => s.map.length;
export const terrainAt = (s, c, r) => TERRAIN[s.map[r][c]];
export const isFrozen = (s, c) => c < s.frost;
export const unitAt = (s, c, r) => s.units.find((u) => u.hp > 0 && u.c === c && u.r === r);
export const unitById = (s, id) => s.units.find((u) => u.id === id);
export const livingHeroes = (s) => s.units.filter((u) => u.side === 'hero' && u.hp > 0);
// Bohaterowie bez oddziałów: od nich zależą runy i koniec bitwy.
export const livingChampions = (s) => s.units.filter((u) => u.side === 'hero' && u.hp > 0 && !u.oddzial && !u.budowla);
export const livingEnemies = (s) => s.units.filter((u) => u.side === 'enemy' && u.hp > 0);
export const nb = (s, c, r) => neighbors(c, r, cols(s), rows(s));

export function unitDef(u) { return u.side === 'hero' ? jednostka(u.type) : ENEMIES[u.type]; }

// ---------- tworzenie bitwy ----------

export const scen = (s) => SCENARIOS[s.scenario] || SCENARIO;
export const level = (s) => scen(s).levels[s.level] || Object.values(scen(s).levels)[0];

// Mapa obrony: kolumna palisady zależy od liczby odcinków w osadzie (2 odcinki = 1 pole wału).
function mapaObrony(S, ob) {
  const wal = new Set(S.wallOrder.slice(0, Math.min(S.wallOrder.length, Math.ceil((ob.palisada || 0) / 2))));
  return S.map.map((row, r) => row.replace('|', wal.has(r) ? 'P' : '.'));
}

// opcje: { rozwoj: { typ: { poz, zycie, atak } }, oddzialy: ['woje', ...] } — z osady, dla wypraw
//         { scenariusz: 'obrona', obrona: { dd, brama, wieze: [poziomy], kamien, palisada: liczba odcinków } } — obrona osady
export function newBattle(seed = (Date.now() & 0xffffffff) >>> 0, team = ['berserker', 'tarczowniczka', 'volva'], lvl = 'wedrowiec', premie = null, opcje = null) {
  const P = { zycie: 0, atak: 0, hamingja: 0, runy: 0, ...(premie || {}) };
  const rozwoj = (opcje && opcje.rozwoj) || {};
  const S = SCENARIOS[(opcje && opcje.scenariusz) || 'kurhan'] || SCENARIO;
  const ob = S.id === 'obrona' ? { dd: 1, brama: 0, wieze: [], kamien: 0, palisada: 0, ...((opcje && opcje.obrona) || {}) } : null;
  const s = {
    level: lvl,
    team: team.slice(),
    summoned: 0,
    premie: P,
    wyprawa: null,
    wards: [],
    v: SAVE_VERSION,
    scenario: S.id,
    seed,
    map: ob ? mapaObrony(S, ob) : S.map.slice(),
    round: 0,
    phase: 'start',
    result: null,
    frost: 0,
    hamingja: 3 + P.hamingja,
    units: [],
    dice: [],
    intents: [],
    nextId: 1,
    bossAwakeRound: null,
    log: [],
  };
  const nowa = (type, at, d, extra = {}) => {
    const hp = d.hp + P.zycie + (extra.zycie || 0);
    const u = {
      id: s.nextId++, side: 'hero', type, c: at[0], r: at[1],
      hp, maxHp: hp, moveLeft: d.move, attacked: false,
      runes: { T: 0, A: 0, R: 0, K: 0, B: 0 }, shield: 0, guard: false, bonusAtk: 0,
    };
    if (extra.atak) u.stalyAtak = extra.atak;
    if (extra.poz) u.poz = extra.poz;
    if (d.oddzial) u.oddzial = true;
    s.units.push(u);
  };
  team.forEach((type, i) => nowa(type, S.heroSlots[i], HEROES[type], rozwoj[type] || {}));
  const odd = ((opcje && opcje.oddzialy) || []).filter((t) => ODDZIALY[t]).slice(0, S.troopSlots.length);
  odd.forEach((type, i) => nowa(type, S.troopSlots[i], ODDZIALY[type]));
  if (odd.length && S.troopWaves) {
    s.extraWaves = {};
    const ile = Math.min(S.troopWaves.length, odd.length * (S.troopWavesNaOddzial || 1));
    S.troopWaves.slice(0, ile).forEach(([r, type, at]) => { (s.extraWaves[r] = s.extraWaves[r] || []).push({ type, at }); });
    s.bossBonus = S.troopBossHp * odd.length;
  }
  if (ob) {
    // budowle: życie z poziomu, bez premii Hali Wojów
    const bud = (type, at, hp, extra = {}) => {
      const d = BUDOWLE[type];
      s.units.push({ id: s.nextId++, side: 'hero', type, c: at[0], r: at[1], hp, maxHp: hp, moveLeft: 0, attacked: false,
        runes: { T: 0, A: 0, R: 0, K: 0, B: 0 }, shield: 0, guard: false, bonusAtk: 0, budowla: true, ...extra });
      return d;
    };
    bud('dlugi-dom', S.structureSlots['dlugi-dom'], 20 + 5 * Math.max(1, ob.dd), { poz: ob.dd });
    if (ob.brama > 0) bud('brama', [S.wallCol, S.gateRow], 10 + 5 * ob.brama, { poz: ob.brama });
    if (ob.kamien > 0) bud('kamien', S.structureSlots.kamien, 12 + 2 * ob.kamien, { poz: ob.kamien, aura: ob.kamien >= 6 ? 2 : 1 });
    (ob.wieze || []).filter((p) => p > 0).sort((a, b) => b - a).slice(0, S.structureSlots.wieza.length)
      .forEach((p, i) => bud('wieza', S.structureSlots.wieza[i], 8 + 2 * p, { poz: p, stalyAtak: Math.floor(p / 3) }));
  }
  return s;
}

// ---------- ruch ----------

export const wardAt = (s, c, r) => (s.wards || []).some((w) => w.c === c && w.r === r);

function enterCost(s, c, r, u = null) {
  const t = terrainAt(s, c, r);
  if (t.blocked || wardAt(s, c, r)) return Infinity;
  if (t.wal && (!u || u.side === 'enemy')) return Infinity; // wał: trupy nie przejdą (pole AI liczone jak dla trupów)
  if (t.walWroga && u && u.side === 'hero') return Infinity; // palisada jarla: drużyna nie przejdzie
  if (u && u.type === 'mistrz-run') return 1;
  return t.cost;
}

// Dijkstra po polach osiągalnych dla jednostki. Można przechodzić przez sojuszników, nie można kończyć na zajętym polu.
export function reachable(s, u, points, reserved = null) {
  const start = key(u.c, u.r);
  const best = new Map([[start, { cost: 0, prev: null, end: true }]]);
  const open = [[0, u.c, u.r]];
  while (open.length) {
    open.sort((a, b) => a[0] - b[0]);
    const [cost, c, r] = open.shift();
    if (cost > best.get(key(c, r)).cost) continue;
    for (const [nc, nr] of nb(s, c, r)) {
      const step = enterCost(s, nc, nr, u);
      const nc2 = cost + step;
      if (nc2 > points) continue;
      const occ = unitAt(s, nc, nr);
      if (occ && occ.id !== u.id && occ.side !== u.side && u.type !== 'ulfhedinn') continue; // wróg blokuje (poza Ulfhedinnem)
      const k = key(nc, nr);
      const end = !occ && !(reserved && reserved.has(k));
      const prev = best.get(k);
      if (!prev || nc2 < prev.cost) {
        best.set(k, { cost: nc2, prev: key(c, r), end });
        open.push([nc2, nc, nr]);
      }
    }
  }
  return best;
}

export function pathTo(map, k) {
  const path = [];
  let cur = k;
  while (cur) { path.unshift(parseKey(cur)); cur = map.get(cur).prev; }
  return path; // od startu do celu, włącznie
}

// Odległość po terenie (bez jednostek) od zbioru pól — pole odległości dla AI.
function distanceField(s, c0, r0) {
  const dist = new Map([[key(c0, r0), 0]]);
  const open = [[0, c0, r0]];
  while (open.length) {
    open.sort((a, b) => a[0] - b[0]);
    const [d, c, r] = open.shift();
    if (d > dist.get(key(c, r))) continue;
    for (const [nc, nr] of nb(s, c, r)) {
      const step = enterCost(s, nc, nr);
      if (!isFinite(step)) continue;
      const nd = d + step;
      const k = key(nc, nr);
      if (!dist.has(k) || nd < dist.get(k)) { dist.set(k, nd); open.push([nd, nc, nr]); }
    }
  }
  return dist;
}

// ---------- walka ----------

export function rangeOf(s, u) {
  const d = unitDef(u);
  let rg = d.range;
  if (rg > 1 && terrainAt(s, u.c, u.r).range) rg += terrainAt(s, u.c, u.r).range;
  return rg;
}

export function heroAttackValue(s, u) {
  const d = jednostka(u.type);
  let v = d.atk + 2 * u.runes.T + (u.bonusAtk || 0) + (u.stalyAtak || 0) + ((s && s.premie && s.premie.atak) || 0);
  if (u.type === 'berserker') v += Math.floor((u.maxHp - u.hp) / 4);
  if (u.type !== 'skald' && s && adjacentHeroes(s, u).some((h) => h.type === 'skald')) v += 1;
  return v;
}

export function adjacentHeroes(s, u) {
  return nb(s, u.c, u.r).map(([c, r]) => unitAt(s, c, r)).filter((x) => x && x.side === 'hero' && x.id !== u.id);
}

// Ile obrażeń faktycznie dostanie bohater (przed tarczą) i z czego to wynika.
export function heroDamage(s, target, base) {
  const parts = [];
  const wall = adjacentHeroes(s, target).length ? 1 : 0;
  if (wall) parts.push(`mur tarcz −${wall}`);
  const t = terrainAt(s, target.c, target.r);
  if (t.def > 0) parts.push(`${t.name.toLowerCase()} −${t.def}`);
  if (t.def < 0) parts.push(`${t.name.toLowerCase()} +${-t.def}`);
  let shieldmaid = 0;
  if (target.type !== 'tarczowniczka' && adjacentHeroes(s, target).some((h) => h.type === 'tarczowniczka')) {
    shieldmaid = 1; parts.push('Tarczowniczka −1');
  }
  const pancerz = jednostka(target.type).pancerz || 0;
  if (pancerz) parts.push(`pancerz −${pancerz}`);
  const kamien = livingHeroes(s).filter((k) => k.type === 'kamien' && distance(k.c, k.r, target.c, target.r) <= 2).reduce((m, k) => Math.max(m, k.aura || 1), 0);
  if (kamien) parts.push(`kamień runiczny −${kamien}`);
  const dmg = Math.max(1, base - wall - t.def - shieldmaid - pancerz - kamien);
  return { dmg, parts };
}

function applyHeroDamage(s, target, dmg) {
  const absorbed = Math.min(target.shield, dmg);
  target.shield -= absorbed;
  target.hp = Math.max(0, target.hp - (dmg - absorbed));
  return absorbed;
}

// ---------- runy ----------

export function rollDice(s) {
  const n = 2 * livingChampions(s).length + (livingChampions(s).some((h) => h.type === 'jarl') ? 1 : 0) + ((s.premie && s.premie.runy) || 0);
  s.dice = [];
  for (let i = 0; i < n; i++) s.dice.push({ id: i, face: DIE_FACES[Math.floor(rng(s) * 6)], used: false });
}

export function rerollDice(s) {
  if (s.hamingja <= 0) return false;
  s.hamingja--;
  for (const d of s.dice) if (!d.used) d.face = DIE_FACES[Math.floor(rng(s) * 6)];
  return true;
}

// face: runa, jaką staje się kość (dla Ansuz wybrana przez graczy)
export function assignRune(s, dieId, heroId, face) {
  const die = s.dice.find((d) => d.id === dieId);
  const h = unitById(s, heroId);
  if (!die || die.used || !h || h.hp <= 0 || h.side !== 'hero') return null;
  const f = die.face === 'N' ? face : die.face;
  if (!f || f === 'N') return null;
  if (f === 'K' && (h.oddzial || h.budowla)) return null; // oddziały i budowle nie mają mocy
  if (f === 'R' && h.budowla) return null; // budowle się nie ruszają
  if (f === 'T' && h.budowla && !jednostka(h.type).atk) return null; // brama, kamień i Długi Dom nie atakują
  die.used = true; die.assignedTo = heroId; die.as = f;
  const ev = [{ type: 'rune', heroId, face: f }];
  if (f === 'R') h.moveLeft += 2;
  else if (f === 'A') h.shield += 2;
  else if (f === 'B') {
    const before = h.hp;
    h.hp = Math.min(h.maxHp, h.hp + 3);
    ev.push({ type: 'heal', id: h.id, amount: h.hp - before, hp: h.hp });
  }
  if (f !== 'B') h.runes[f] = (h.runes[f] || 0) + 1;
  return ev;
}

// ---------- akcje bohaterów (narada) ----------

export function heroMoves(s, h) {
  if (h.hp <= 0 || s.phase !== 'narada') return new Map();
  return reachable(s, h, h.moveLeft);
}

export function moveHero(s, heroId, c, r) {
  const h = unitById(s, heroId);
  const map = heroMoves(s, h);
  const k = key(c, r);
  const e = map.get(k);
  if (!e || !e.end || (c === h.c && r === h.r)) return null;
  const path = pathTo(map, k);
  h.moveLeft -= e.cost;
  h.c = c; h.r = r;
  return [{ type: 'move', id: h.id, path }];
}

export function attackTargets(s, h) {
  if (h.hp <= 0 || h.attacked || s.phase !== 'narada') return [];
  if (h.budowla && !jednostka(h.type).atk) return []; // brama, kamień i Długi Dom nie walczą
  const rg = rangeOf(s, h);
  return livingEnemies(s).filter((e) => distance(h.c, h.r, e.c, e.r) <= rg);
}

function hitEnemy(s, h, e, ev) {
  let raw = heroAttackValue(s, h);
  if (h.type === 'lowczyni' && e.hp === e.maxHp) raw += 2;
  const dmg = Math.max(1, raw - (ENEMIES[e.type].armor || 0));
  e.hp = Math.max(0, e.hp - dmg);
  ev.push({ type: 'hit', from: h.id, to: e.id, dmg, hp: e.hp, ranged: distance(h.c, h.r, e.c, e.r) > 1 });
  if (e.hp <= 0) {
    ev.push({ type: 'death', id: e.id });
    s.intents = s.intents.filter((i) => i.unitId !== e.id);
  }
}

export function heroAttack(s, heroId, enemyId) {
  const h = unitById(s, heroId);
  const e = unitById(s, enemyId);
  if (!attackTargets(s, h).includes(e)) return null;
  h.attacked = true;
  const ev = [];
  hitEnemy(s, h, e, ev);
  checkEnd(s, ev);
  return ev;
}

export function wardTargets(s, h) {
  const out = [];
  for (let r = 0; r < rows(s); r++) for (let c = 0; c < cols(s); c++) {
    if (distance(h.c, h.r, c, r) > 3 || terrainAt(s, c, r).blocked || unitAt(s, c, r) || wardAt(s, c, r)) continue;
    out.push([c, r]);
  }
  return out;
}

export function orderTargets(s) { return livingHeroes(s).filter((x) => x.attacked); }

export function canUsePower(s, h) {
  if (!h || h.hp <= 0 || s.phase !== 'narada' || h.runes.K <= 0) return false;
  if (h.type === 'berserker') return nb(s, h.c, h.r).some(([c, r]) => { const u = unitAt(s, c, r); return u && u.side === 'enemy'; });
  if (h.type === 'tarczowniczka') return !h.guard;
  if (h.type === 'volva') return s.intents.some((i) => !i.canceled);
  if (h.type === 'skald') return livingHeroes(s).some((x) => x.id !== h.id);
  if (h.type === 'jarl') return orderTargets(s).length > 0;
  if (h.type === 'mistrz-run') return wardTargets(s, h).length > 0;
  if (h.type === 'lowczyni') return h.attacked;
  if (h.type === 'ulfhedinn') return true;
  return false;
}

export function usePower(s, heroId, targetId = null) {
  const h = unitById(s, heroId);
  if (!canUsePower(s, h)) return null;
  const ev = [];
  if (h.type === 'berserker') {
    const foes = nb(s, h.c, h.r).map(([c, r]) => unitAt(s, c, r)).filter((u) => u && u.side === 'enemy');
    ev.push({ type: 'power', id: h.id, power: 'wir' });
    for (const e of foes) hitEnemy(s, h, e, ev);
  } else if (h.type === 'tarczowniczka') {
    h.guard = true;
    ev.push({ type: 'power', id: h.id, power: 'oslona' });
  } else if (h.type === 'volva') {
    const it = s.intents.find((i) => i.unitId === targetId && !i.canceled);
    if (!it) return null;
    for (const i of s.intents) if (i.unitId === targetId) i.canceled = true;
    ev.push({ type: 'power', id: h.id, power: 'nic', target: targetId });
  } else if (h.type === 'skald') {
    ev.push({ type: 'power', id: h.id, power: 'piesn' });
    for (const x of livingHeroes(s)) {
      if (x.id === h.id) continue;
      const before = x.hp;
      x.hp = Math.min(x.maxHp, x.hp + 2);
      if (!x.budowla) x.moveLeft += 1;
      if (x.hp > before) ev.push({ type: 'heal', id: x.id, amount: x.hp - before, hp: x.hp });
    }
  } else if (h.type === 'jarl') {
    const x = unitById(s, targetId);
    if (!x || x.hp <= 0 || x.side !== 'hero' || !x.attacked) return null;
    x.attacked = false;
    ev.push({ type: 'power', id: h.id, power: 'rozkaz', target: x.id });
  } else if (h.type === 'mistrz-run') {
    const [c, r] = targetId || [];
    if (!wardTargets(s, h).some(([a, b]) => a === c && b === r)) return null;
    s.wards.push({ c, r, until: s.round + 1 });
    ev.push({ type: 'power', id: h.id, power: 'runa', at: [c, r] });
  } else if (h.type === 'lowczyni') {
    h.attacked = false;
    ev.push({ type: 'power', id: h.id, power: 'strzal' });
  } else if (h.type === 'ulfhedinn') {
    h.bonusAtk = (h.bonusAtk || 0) + 3;
    ev.push({ type: 'power', id: h.id, power: 'szal' });
  }
  h.runes.K--;
  checkEnd(s, ev);
  return ev;
}

// ---------- tura wroga: nici Norn ----------

function heroOrderFor(s, e) {
  const field = distanceField(s, e.c, e.r);
  return livingHeroes(s)
    .map((h) => ({ h, d: field.get(key(h.c, h.r)) ?? 999 }))
    .sort((a, b) => a.d - b.d || a.h.hp - b.h.hp || a.h.id - b.h.id)
    .map((x) => x.h);
}

function bestEnd(map, filter, score) {
  let best = null;
  for (const [k, v] of map) {
    if (!v.end) continue;
    const [c, r] = parseKey(k);
    if (!filter(c, r, v)) continue;
    const sc = score(c, r, v);
    if (!best || sc < best.sc) best = { k, sc };
  }
  return best && best.k;
}

export function planIntents(s) {
  s.intents = [];
  const reserved = new Set();
  let order = 1;
  for (const e of livingEnemies(s)) {
    const d = ENEMIES[e.type];
    if (d.budowla && !d.atk) continue; // dwór i brama nie mają zamiarów
    const map = reachable(s, e, d.move, reserved);
    const targets = heroOrderFor(s, e);
    if (!targets.length) break;
    let intent = null;
    const ranged = d.range > 1;
    for (const h of targets) {
      const inRange = (c, r) => distance(c, r, h.c, h.r) <= (ranged ? d.range + (terrainAt(s, c, r).range || 0) : 1);
      const curOk = inRange(e.c, e.r);
      let dest;
      if (ranged) {
        // łucznik: strzela z miejsca albo z pola jak najdalej od ostrzy
        const minHeroDist = (c, r) => Math.min(...livingHeroes(s).map((x) => distance(c, r, x.c, x.r)));
        if (curOk && minHeroDist(e.c, e.r) >= 2) dest = key(e.c, e.r);
        else dest = bestEnd(map, inRange, (c, r, v) => -minHeroDist(c, r) * 10 + v.cost);
      } else {
        dest = curOk ? key(e.c, e.r) : bestEnd(map, inRange, (c, r, v) => v.cost);
      }
      if (dest) {
        intent = { unitId: e.id, kind: ranged ? 'shot' : 'melee', path: pathTo(map, dest), attack: [h.c, h.r], dmg: d.atk, targetId: h.id };
        break;
      }
    }
    if (!intent) {
      // marsz w stronę najbliższego bohatera
      const h = targets[0];
      const field = distanceField(s, h.c, h.r);
      const dest = bestEnd(map, () => true, (c, r, v) => (field.get(key(c, r)) ?? 999) * 10 + v.cost);
      intent = { unitId: e.id, kind: 'march', path: pathTo(map, dest || key(e.c, e.r)), attack: null, dmg: 0, targetId: h.id };
    }
    const last = intent.path[intent.path.length - 1];
    reserved.add(key(last[0], last[1]));
    intent.order = order++;
    intent.canceled = false;
    s.intents.push(intent);

    // Pan Kurhanu przyzywa draugra co drugą rundę od przebudzenia (począwszy od następnej)
    if (e.type === 'pan-kurhanu' && s.bossAwakeRound !== null && (s.round - s.bossAwakeRound) % 2 === 1 && s.summoned < level(s).summons) {
      const spot = freeNearBarrow(s, reserved);
      if (spot) {
        reserved.add(key(spot[0], spot[1]));
        s.intents.push({ unitId: e.id, kind: 'summon', path: [[e.c, e.r]], attack: null, spawn: spot, dmg: 0, order: order++, canceled: false });
      }
    }
  }
}

function barrowHex(s) {
  for (let r = 0; r < rows(s); r++) for (let c = 0; c < cols(s); c++) if (s.map[r][c] === 'K') return [c, r];
  return scen(s).spawnOrigin || null;
}

function freeNearBarrow(s, reserved = new Set(), prefer = null) {
  const b = barrowHex(s);
  const ok = (c, r) => !terrainAt(s, c, r).blocked && !wardAt(s, c, r) && !unitAt(s, c, r) && !reserved.has(key(c, r));
  if (prefer && ok(prefer[0], prefer[1])) return prefer;
  // najbliższe wolne pole od kurhanu (BFS po odległości)
  const all = [];
  for (let r = 0; r < rows(s); r++) for (let c = 0; c < cols(s); c++) if (ok(c, r)) all.push([distance(c, r, b[0], b[1]), c, r]);
  all.sort((a, b2) => a[0] - b2[0] || b2[1] - a[1] || a[2] - b2[2]);
  return all.length ? [all[0][1], all[0][2]] : null;
}

function spawn(s, type, at, ev, hpWlasne = null) {
  const spot = freeNearBarrow(s, new Set(), at);
  if (!spot) return null;
  const d = ENEMIES[type];
  // pan kurhanu: życie z poziomu (+ za oddziały); jarl: z poziomu; dwór: z fali (+ za oddziały)
  const hp = d.budowla ? (hpWlasne || d.hp) + (d.cel ? s.bossBonus || 0 : 0)
    : d.boss ? level(s).bossHp + (type === 'pan-kurhanu' ? s.bossBonus || 0 : 0) : d.hp;
  const u = { id: s.nextId++, side: 'enemy', type, c: spot[0], r: spot[1], hp, maxHp: hp };
  s.units.push(u);
  ev.push({ type: 'spawn', id: u.id, unit: clone(u) });
  if (type === 'pan-kurhanu') s.bossAwakeRound = s.round;
  return u;
}

// ---------- przebieg rundy ----------

// Fale danej rundy: z poziomu trudności plus trupy obudzone przez oddziały.
export function wavesFor(s, r) {
  return (level(s).waves[r] || []).concat((s.extraWaves && s.extraWaves[r]) || []);
}

export function startRound(s) {
  const ev = [];
  s.round++;
  for (const h of livingHeroes(s)) {
    h.moveLeft = jednostka(h.type).move;
    h.attacked = false;
    h.runes = { T: 0, A: 0, R: 0, K: 0, B: 0 };
    h.shield = 0;
    h.guard = false;
    h.bonusAtk = 0;
  }
  s.wards = (s.wards || []).filter((w) => w.until >= s.round);
  ev.push({ type: 'round', round: s.round });
  for (const w of wavesFor(s, s.round)) spawn(s, w.type, w.at, ev, w.hp);
  s.phase = 'narada';
  planIntents(s);
  rollDice(s);
  return ev;
}

export function upcomingWaves(s, ahead = 2) {
  const out = [];
  for (let r = s.round + 1; r <= s.round + ahead; r++) { const W = wavesFor(s, r); if (W.length) out.push({ round: r, units: W.map((w) => w.type) }); }
  return out;
}

// Ilu trupów jeszcze nie wyszło z kurhanu (bez Pana Kurhanu).
export function remainingInBarrow(s) {
  let n = 0;
  for (let r = s.round + 1; r <= scen(s).maxRounds; r++) n += wavesFor(s, r).filter((w) => w.type !== 'pan-kurhanu').length;
  const boss = s.units.find((u) => u.type === 'pan-kurhanu');
  if (!boss || boss.hp > 0) n += (level(s).summons || 0) - s.summoned;
  return n;
}

export function bossAwakeAt(s) {
  for (const [r, list] of Object.entries(level(s).waves)) if (list.some((w) => w.type === 'pan-kurhanu')) return Number(r);
  return null;
}

function wygrana(s, ev) {
  s.result = 'win'; s.phase = 'koniec';
  for (const e of livingEnemies(s)) { e.hp = 0; ev.push({ type: 'death', id: e.id, crumble: true }); }
  ev.push({ type: 'end', result: 'win' });
}

function checkEnd(s, ev) {
  if (s.result) return;
  if (scen(s).winOnTime) {
    // obrona: przegrana, gdy padnie Długi Dom albo wszyscy bohaterowie; wygrana, gdy nie ma już trupów ani fal
    const dom = s.units.find((u) => u.type === 'dlugi-dom');
    if (dom && dom.hp <= 0) {
      s.result = 'lose'; s.phase = 'koniec'; s.powod = 'dom';
      for (const u of livingHeroes(s)) u.uciekl = true;
      ev.push({ type: 'end', result: 'lose' });
    } else if (!livingChampions(s).length) {
      s.result = 'lose'; s.phase = 'koniec';
      for (const u of livingHeroes(s)) u.uciekl = true;
      ev.push({ type: 'end', result: 'lose' });
    } else if (s.round >= 1 && !livingEnemies(s).length && remainingInBarrow(s) === 0) wygrana(s, ev);
    return;
  }
  if (scen(s).celWroga) {
    // wioska jarla: wygrana, gdy padnie dwór; przegrana, gdy padną wszyscy bohaterowie
    const cel = s.units.find((u) => u.type === scen(s).celWroga);
    if (cel && cel.hp <= 0) wygrana(s, ev);
    else if (!livingChampions(s).length) {
      s.result = 'lose'; s.phase = 'koniec';
      for (const u of livingHeroes(s)) u.uciekl = true;
      ev.push({ type: 'end', result: 'lose' });
    }
    return;
  }
  const boss = s.units.find((u) => u.type === 'pan-kurhanu');
  if (boss && boss.hp <= 0) {
    s.result = 'win'; s.phase = 'koniec';
    for (const e of livingEnemies(s)) { e.hp = 0; ev.push({ type: 'death', id: e.id, crumble: true }); }
    ev.push({ type: 'end', result: 'win' });
  } else if (!livingChampions(s).length) {
    s.result = 'lose'; s.phase = 'koniec';
    for (const u of livingHeroes(s)) u.uciekl = true; // oddziały bez wodzów się wycofują
    ev.push({ type: 'end', result: 'lose' });
  }
}

// Koniec narady: wrogowie wykonują swoje zamiary, potem mróz, potem nowa runda.
export function resolveEnemyTurn(s) {
  if (s.phase !== 'narada') return [];
  s.phase = 'wrog';
  const ev = [{ type: 'phase', phase: 'wrog' }];
  for (const it of s.intents) {
    if (s.result) break;
    const e = unitById(s, it.unitId);
    if (!e || e.hp <= 0) continue;
    if (it.canceled) { ev.push({ type: 'cut', id: e.id }); continue; }

    if (it.kind === 'summon') {
      if (spawn(s, 'draugr', it.spawn, ev)) s.summoned++;
      continue;
    }

    // ruch po zaplanowanej ścieżce; staje, gdy droga zablokowana
    const walked = [[e.c, e.r]];
    let lastFree = 0;
    for (let i = 1; i < it.path.length; i++) {
      const [c, r] = it.path[i];
      const occ = unitAt(s, c, r);
      if ((occ && occ.side !== e.side) || wardAt(s, c, r)) break;
      walked.push([c, r]);
      if (!occ) lastFree = walked.length - 1;
    }
    const finalPath = walked.slice(0, lastFree + 1);
    const [fc, fr] = finalPath[finalPath.length - 1];
    if (fc !== e.c || fr !== e.r) { e.c = fc; e.r = fr; ev.push({ type: 'move', id: e.id, path: finalPath }); }

    if (!it.attack) continue;
    const d = ENEMIES[e.type];
    const rg = d.range > 1 ? d.range + (terrainAt(s, e.c, e.r).range || 0) : 1;
    const [ac, ar] = it.attack;
    let target = unitAt(s, ac, ar);
    if (distance(e.c, e.r, ac, ar) > rg || !target || target.side !== 'hero') {
      ev.push({ type: 'miss', from: e.id, at: [ac, ar], ranged: d.range > 1, reason: distance(e.c, e.r, ac, ar) > rg ? 'far' : 'empty' });
      continue;
    }
    // Tarczowniczka przejmuje cios
    const guard = livingHeroes(s).find((h) => h.type === 'tarczowniczka' && h.guard && h.id !== target.id && distance(h.c, h.r, target.c, target.r) === 1);
    let redirected = false;
    if (guard) { target = guard; redirected = true; }
    const { dmg, parts } = heroDamage(s, target, it.dmg);
    const absorbed = applyHeroDamage(s, target, dmg);
    ev.push({ type: 'hit', from: e.id, to: target.id, dmg: dmg - absorbed, absorbed, hp: target.hp, shield: target.shield, parts, redirected, ranged: d.range > 1 });
    if (target.hp <= 0) ev.push({ type: 'death', id: target.id });
    checkEnd(s, ev);
  }
  if (!s.result) endOfRound(s, ev);
  return ev;
}

function endOfRound(s, ev) {
  // mróz
  const S = scen(s);
  if (s.round >= S.frostStart) {
    s.frost = Math.min(cols(s), s.round - S.frostStart + 1);
    ev.push({ type: 'frost', frost: s.frost });
    for (const h of livingHeroes(s)) {
      if (isFrozen(s, h.c)) {
        h.hp = Math.max(0, h.hp - S.frostDamage);
        ev.push({ type: 'hit', from: null, to: h.id, dmg: S.frostDamage, absorbed: 0, hp: h.hp, frost: true });
        if (h.hp <= 0) ev.push({ type: 'death', id: h.id });
      }
    }
    checkEnd(s, ev);
    if (s.result) return;
  }
  if (s.round >= S.maxRounds) {
    if (S.winOnTime) { wygrana(s, ev); return; } // obrona: świt, osada przetrwała
    s.result = 'lose'; s.phase = 'koniec';
    ev.push({ type: 'end', result: 'lose', reason: 'czas' });
    return;
  }
  ev.push(...startRound(s));
}

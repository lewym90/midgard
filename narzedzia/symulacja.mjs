// Automatyczny test zasad: prosty bot rozgrywa wiele bitew. Wykrywa błędy i daje zgrubny obraz trudności.
// Uruchom: node narzedzia/symulacja.mjs [liczba_bitew]
import * as E from '../js/engine.js';
import { distance, key, parseKey } from '../js/hex.js';

function botRound(s, smart) {
  const heroes = E.livingHeroes(s);
  const boss = () => E.livingEnemies(s).find((e) => e.type === 'pan-kurhanu' || e.type === 'dwor');
  const byType = (t) => heroes.find((h) => h.type === t && h.hp > 0);
  // runy
  for (const d of s.dice) {
    if (d.used) continue;
    let f = d.face === 'N' ? 'T' : d.face;
    let target;
    if (f === 'B') target = heroes.slice().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    else if (f === 'A') target = heroes.find((h) => s.intents.some((i) => i.targetId === h.id && i.attack)) || heroes[0];
    else if (f === 'K') target = smart ? (byType('berserker') || heroes[0]) : heroes[0];
    else target = byType('berserker') || heroes[0];
    if (target) E.assignRune(s, d.id, target.id, f);
  }
  for (const h of E.livingHeroes(s)) {
    if (s.result) return;
    const goal = boss() || E.livingEnemies(s).sort((a, b) => distance(h.c, h.r, a.c, a.r) - distance(h.c, h.r, b.c, b.r))[0];
    const tryAttack = () => {
      const t = E.attackTargets(s, h);
      if (!t.length) return false;
      const pick = t.find((e) => e.type === 'pan-kurhanu' || e.type === 'dwor') || t.sort((a, b) => a.hp - b.hp)[0];
      E.heroAttack(s, h.id, pick.id);
      return true;
    };
    if (!tryAttack() && goal) {
      const map = E.heroMoves(s, h);
      let best = null;
      for (const [k, v] of map) {
        if (!v.end) continue;
        const [c, r] = parseKey(k);
        let sc = distance(c, r, goal.c, goal.r) + (E.isFrozen(s, c + 1) ? 3 : 0);
        if (h.type === 'volva') sc = Math.abs(distance(c, r, goal.c, goal.r) - 3);
        if (!best || sc < best.sc) best = { c, r, sc };
      }
      if (best) E.moveHero(s, h.id, best.c, best.r);
      tryAttack();
    }
    if (smart && h.hp > 0 && E.canUsePower(s, h)) {
      if (h.type === 'volva') {
        const it = s.intents.find((i) => !i.canceled && i.attack);
        if (it) E.usePower(s, h.id, it.unitId);
      } else if (h.type === 'jarl') {
        const t = E.orderTargets(s)[0]; if (t) E.usePower(s, h.id, t.id);
      } else if (h.type === 'mistrz-run') {
        const it = s.intents.find((i) => !i.canceled && i.path.length > 1);
        const tg = E.wardTargets(s, h);
        const spot = it && tg.find(([c, r]) => c === it.path[1][0] && r === it.path[1][1]);
        if (spot) E.usePower(s, h.id, spot);
      } else E.usePower(s, h.id);
      if (h.type === 'lowczyni' || h.type === 'ulfhedinn') tryAttack();
    }
  }
}

const N = Number(process.argv[2] || 300);
const ALL = ['berserker', 'tarczowniczka', 'volva', 'skald', 'jarl', 'mistrz-run', 'lowczyni', 'ulfhedinn'];
const teams = [];
for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) for (let c = b + 1; c < 8; c++) teams.push([ALL[a], ALL[b], ALL[c]]);
const perHero = {};
for (const lvl of ['wedrowiec', 'wojownik', 'ragnarok'])
for (const smart of [false, true]) {
  const st = { win: 0, lose: 0, rounds: 0 };
  for (let i = 0; i < N; i++) {
    const team = teams[i % teams.length];
    const s = E.newBattle(i * 7919 + 13, team, lvl);
    E.startRound(s);
    let guard = 0;
    while (!s.result && guard++ < 50) {
      botRound(s, smart);
      if (s.result) break;
      E.resolveEnemyTurn(s);
      // spójność: nikt nie stoi na tym samym polu, nikt na kurhanie
      const seen = new Set();
      for (const u of s.units.filter((u) => u.hp > 0)) {
        const k = key(u.c, u.r);
        if (seen.has(k)) throw new Error('Dwie jednostki na polu ' + k + ' runda ' + s.round);
        if (E.terrainAt(s, u.c, u.r).blocked) throw new Error('Jednostka na kurhanie');
        seen.add(k);
      }
      JSON.parse(JSON.stringify(s));
    }
    st[s.result]++;
    st.rounds += s.round;
    if (smart && lvl === 'wojownik') for (const t of team) { perHero[t] = perHero[t] || [0, 0]; perHero[t][0] += s.result === 'win'; perHero[t][1]++; }
  }
  console.log(lvl, smart ? 'bot sprytny' : 'bot prosty', 'wygrane', Math.round(100 * st.win / N) + '%', 'średnio rund', (st.rounds / N).toFixed(1));
}
console.log('Wojownik, sprytny bot — % wygranych drużyn z danym bohaterem:');
for (const [k, [w, n]] of Object.entries(perHero)) console.log('  ', k.padEnd(14), Math.round(100 * w / n) + '%');

// Wyprawy z osady: rozwinięci bohaterowie i oddziały (sprawdza silnik z oddziałami i pokazuje wpływ armii).
const WARIANTY = [
  ['bez armii', {}, []],
  ['2 × woje', {}, ['woje', 'woje']],
  ['tarcz.+łucz.+oszcz.', {}, ['tarczownicy', 'lucznicy', 'oszczepnicy']],
  ['poz. 5 + 5 oddziałów', { poz: 5, zycie: 4, atak: 1 }, ['tarczownicy', 'berserkerzy', 'lucznicy', 'oszczepnicy', 'woje']],
];
for (const lvl of ['wojownik', 'ragnarok']) for (const [nazwa, rw, odd] of WARIANTY) {
  let win = 0, padlo = 0, wyslano = 0;
  const M2 = Math.min(N, 150);
  for (let i = 0; i < M2; i++) {
    const team = teams[i % teams.length];
    const rozwoj = Object.fromEntries(team.map((k) => [k, rw]));
    const s = E.newBattle(i * 104729 + 7, team, lvl, null, { rozwoj, oddzialy: odd });
    E.startRound(s);
    let guard = 0;
    while (!s.result && guard++ < 50) {
      botRound(s, true);
      if (s.result) break;
      E.resolveEnemyTurn(s);
      const seen = new Set();
      for (const u of s.units.filter((u) => u.hp > 0)) {
        const k = key(u.c, u.r);
        if (seen.has(k)) throw new Error('Dwie jednostki na polu ' + k);
        seen.add(k);
      }
    }
    win += s.result === 'win';
    const oddz = s.units.filter((u) => u.oddzial);
    wyslano += oddz.length; padlo += oddz.filter((u) => u.hp <= 0).length;
  }
  console.log(`z osady ${lvl.padEnd(9)} ${nazwa.padEnd(22)} wygrane ${Math.round(100 * win / M2)}%` + (wyslano ? `, polegli z oddziałów ${Math.round(100 * padlo / wyslano)}%` : ''));
}

// Obrona osady: fale z lasu, budowle z osady. Sprawdza silnik obrony i pokazuje, ile dają umocnienia.
const OBRONY = [
  ['bez umocnień', { dd: 2 }],
  ['palisada 8 + brama 1', { dd: 2, palisada: 8, brama: 1 }],
  ['+ wieża 1', { dd: 2, palisada: 8, brama: 1, wieze: [1] }],
  ['DD5: pełna, 2 wieże 3, kamień 3', { dd: 5, palisada: 20, brama: 3, wieze: [3, 3], kamien: 3 }],
  ['DD8: pełna, 3 wieże 6, kamień 6', { dd: 8, palisada: 32, brama: 6, wieze: [6, 6, 6], kamien: 6 }],
];
const ROZWOJ = { 'fala-1': {}, 'fala-2': { poz: 4, zycie: 3, atak: 1 }, 'fala-3': { poz: 7, zycie: 6, atak: 2 } };
for (const fala of ['fala-1', 'fala-2', 'fala-3']) for (const [nazwa, ob] of OBRONY) {
  let win = 0, dom = 0, rany = 0;
  const M3 = Math.min(N, 150);
  for (let i = 0; i < M3; i++) {
    const team = teams[i % teams.length];
    const rozwoj = Object.fromEntries(team.map((k) => [k, ROZWOJ[fala]]));
    const s = E.newBattle(i * 7919 + 3, team, fala, null, { rozwoj, scenariusz: 'obrona', obrona: ob });
    const miejsca = new Map(s.units.filter((u) => u.budowla).map((u) => [u.id, key(u.c, u.r)]));
    E.startRound(s);
    let guard = 0;
    while (!s.result && guard++ < 50) {
      botRound(s, true);
      if (s.result) break;
      E.resolveEnemyTurn(s);
      const seen = new Set();
      for (const u of s.units.filter((u) => u.hp > 0)) {
        const k = key(u.c, u.r);
        if (seen.has(k)) throw new Error('Dwie jednostki na polu ' + k);
        if (u.side === 'enemy' && s.map[u.r][u.c] === 'P') throw new Error('Trup na wale ' + k);
        if (u.budowla && miejsca.get(u.id) !== k) throw new Error('Budowla się ruszyła: ' + u.type);
        seen.add(k);
      }
    }
    if (!s.result) throw new Error('Obrona bez wyniku');
    win += s.result === 'win';
    dom += s.powod === 'dom';
    const d = s.units.find((u) => u.type === 'dlugi-dom'); rany += 1 - d.hp / d.maxHp;
  }
  console.log(`obrona ${fala} ${nazwa.padEnd(32)} wygrane ${Math.round(100 * win / M3)}%, Długi Dom padł w ${Math.round(100 * dom / M3)}%, średnio stracił ${Math.round(100 * rany / M3)}% życia`);
}

// Wioski jarłów: drużyna rozwinięta mniej więcej tak, jak przy odblokowaniu danego jarła.
const JARLOWIE = [
  ['jarl-1', { poz: 4, zycie: 3, atak: 1 }, { zycie: 3, atak: 1 }],
  ['jarl-2', { poz: 6, zycie: 5, atak: 1 }, { zycie: 5, atak: 2 }],
  ['jarl-3', { poz: 8, zycie: 7, atak: 2 }, { zycie: 7, atak: 3 }],
];
for (const [poz, rw, premie] of JARLOWIE) for (const [nazwa, odd] of [['bez armii', []], ['3 oddziały', ['tarczownicy', 'lucznicy', 'woje']], ['5 oddziałów', ['tarczownicy', 'berserkerzy', 'lucznicy', 'oszczepnicy', 'woje']]]) {
  let win = 0, czas = 0;
  const M4 = Math.min(N, 150);
  for (let i = 0; i < M4; i++) {
    const team = teams[i % teams.length];
    const rozwoj = Object.fromEntries(team.map((k) => [k, rw]));
    const s = E.newBattle(i * 6151 + 11, team, poz, premie, { rozwoj, oddzialy: odd, scenariusz: 'wioska' });
    E.startRound(s);
    let guard = 0;
    while (!s.result && guard++ < 50) {
      botRound(s, true);
      if (s.result) break;
      E.resolveEnemyTurn(s);
      const seen = new Set();
      for (const u of s.units.filter((u) => u.hp > 0)) {
        const k = key(u.c, u.r);
        if (seen.has(k)) throw new Error('Dwie jednostki na polu ' + k);
        if (u.side === 'hero' && s.map[u.r][u.c] === 'W') throw new Error('Drużyna na palisadzie jarla ' + k);
        seen.add(k);
      }
    }
    if (!s.result) throw new Error('Wioska bez wyniku');
    win += s.result === 'win'; czas += s.round;
  }
  console.log(`wioska ${poz} ${nazwa.padEnd(12)} wygrane ${Math.round(100 * win / M4)}%, średnio rund ${(czas / M4).toFixed(1)}`);
}

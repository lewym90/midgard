// Automatyczny test zasad: prosty bot rozgrywa wiele bitew. Wykrywa błędy i daje zgrubny obraz trudności.
// Uruchom: node narzedzia/symulacja.mjs [liczba_bitew]
import * as E from '../js/engine.js';
import { distance, key, parseKey } from '../js/hex.js';

function botRound(s, smart) {
  const heroes = E.livingHeroes(s);
  const boss = () => E.livingEnemies(s).find((e) => e.type === 'pan-kurhanu');
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
      const pick = t.find((e) => e.type === 'pan-kurhanu') || t.sort((a, b) => a.hp - b.hp)[0];
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
      } else E.usePower(s, h.id);
    }
  }
}

const N = Number(process.argv[2] || 300);
const stats = { win: 0, lose: 0, rounds: 0, czas: 0 };
for (const smart of [false, true]) {
  const st = { win: 0, lose: 0, rounds: 0 };
  for (let i = 0; i < N; i++) {
    const s = E.newBattle(i * 7919 + 13);
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
  }
  console.log(smart ? 'bot sprytny' : 'bot prosty', st, 'średnio rund', (st.rounds / N).toFixed(1));
}

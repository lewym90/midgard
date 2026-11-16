// Panele DOM: bohaterowie, nici Norn, runy, pasek górny, teksty zasad.
import { HEROES, ENEMIES, RUNES, SCENARIO } from './data.js';
import { runeSvg } from './runes.js';
import { heroAttackValue, upcomingWaves, canUsePower, attackTargets } from './engine.js';

const $ = (id) => document.getElementById(id);

const NOM = { berserker: 'Berserker', tarczowniczka: 'Tarczowniczka', volva: 'Völva' };
const GEN = { berserker: 'Berserkera', tarczowniczka: 'Tarczowniczki', volva: 'Völvy' };
const FALLEN = { berserker: 'Poległ', tarczowniczka: 'Poległa', volva: 'Poległa' };

export const tokenUrl = (u) => `assets/img/${u.side === 'hero' ? 'bohaterowie' : 'wrogowie'}/${u.type}-zeton.webp`;

function plural(n, one, few, many) {
  if (n === 1) return one;
  const d = n % 10, dd = n % 100;
  return d >= 2 && d <= 4 && !(dd >= 12 && dd <= 14) ? few : many;
}

export function renderTop(v) {
  $('top-goal').textContent = SCENARIO.goal;
  $('stat-round').innerHTML = `Runda ${Math.max(1, v.round)}<small>/ ${SCENARIO.maxRounds}</small>`;
  const fr = $('stat-frost');
  if (v.frost > 0) {
    fr.classList.add('frost-on');
    fr.innerHTML = `Mróz <small>${v.frost} ${plural(v.frost, 'kolumna', 'kolumny', 'kolumn')}</small>`;
  } else {
    fr.classList.remove('frost-on');
    fr.innerHTML = `Mróz <small>od rundy ${SCENARIO.frostStart}</small>`;
  }
  let coins = '';
  for (let i = 0; i < 3; i++) coins += `<span class="coin ${i < v.hamingja ? '' : 'spent'}">${runeSvg('N', 'r')}</span>`;
  $('stat-hamingja').innerHTML = coins;
}

export function renderHeroes(v, sel, handlers) {
  const box = $('panel-heroes');
  box.innerHTML = '';
  for (const u of v.units.filter((x) => x.side === 'hero')) {
    const d = HEROES[u.type];
    const dead = u.hp <= 0;
    const card = document.createElement('div');
    card.className = 'hero-card' + (sel.heroId === u.id ? ' selected' : '') + (dead ? ' dead' : '') + (sel.dieId != null && !dead ? ' target-mode' : '');
    const ratio = u.hp / u.maxHp;
    const atk = heroAttackValue(u);
    const canAtk = !u.attacked && attackTargets(v, u).length > 0;
    const runeChips = Object.entries(u.runes).flatMap(([f, n]) => Array.from({ length: n }, () => `<span class="rune-chip" title="${RUNES[f].name}">${runeSvg(f)}</span>`)).join('');
    const powerOk = !dead && v.phase === 'narada' && canUsePower(v, u);
    card.innerHTML = `
      <div class="hero-avatar" style="background-image:url(${tokenUrl(u)})"></div>
      <div class="hero-name">${d.name}</div>
      <div class="hero-role">${dead ? FALLEN[u.type] : d.role}</div>
      <div class="hp">
        <div class="hp-bar"><div class="hp-fill ${ratio <= 0.34 ? 'low' : ''}" style="width:${ratio * 100}%"></div></div>
        <span class="hp-num">${u.hp}/${u.maxHp}</span>
        ${u.shield > 0 ? `<span class="shield-badge">${runeSvg('A')}${u.shield}</span>` : ''}
      </div>
      ${dead ? '' : `
      <div class="hero-stats">
        <span>Ruch <b>${u.moveLeft}</b></span>
        <span class="${u.attacked ? 'done' : ''}">Atak <b>${atk}</b>${d.range > 1 ? ` · zasięg ${d.range}` : ''}</span>
        ${u.attacked ? '<span>atak wykonany</span>' : canAtk ? '<span style="color:#ef7a64">wróg w zasięgu</span>' : ''}
      </div>
      ${runeChips ? `<div class="hero-runes">${runeChips}</div>` : ''}
      ${u.guard ? '<div class="guard-on">Przyjmuje ciosy za sąsiadów</div>' : ''}
      <div class="hero-power">
        <button class="btn btn-small" data-power="${u.id}" ${powerOk ? '' : 'disabled'}>${runeSvg('K', 'rune inline-rune')} ${d.power}</button>
        <div class="power-desc">${d.powerDesc} Wymaga runy Kenaz.</div>
      </div>
      <div class="hero-passive">${d.passive}</div>`}
    `;
    card.addEventListener('click', (e) => {
      const pb = e.target.closest('[data-power]');
      if (pb) { e.stopPropagation(); if (!pb.disabled) handlers.power(u.id); return; }
      if (!dead) handlers.hero(u.id);
    });
    box.appendChild(card);
  }
}

export function intentText(v, it) {
  const u = v.units.find((x) => x.id === it.unitId);
  const name = `<b>${ENEMIES[u.type].name}</b>`;
  const tgt = v.units.find((x) => x.id === it.targetId);
  if (it.canceled) return `Nić przecięta. ${name} w tej rundzie nic nie zrobi.`;
  if (it.kind === 'summon') return `${name} przyzwie z kurhanu nowego draugra.`;
  const moves = it.path.length > 1;
  if (it.kind === 'march') return `${name} idzie w stronę ${tgt ? `<b>${GEN[tgt.type]}</b>` : 'drużyny'}.`;
  const who = tgt ? `<b>${GEN[tgt.type]}</b>` : 'celu';
  const dmg = `<span class="dmg">${it.dmg}</span>`;
  if (it.kind === 'shot') return `${name} ${moves ? 'przechodzi i ' : ''}strzela w pole ${who}: ${dmg}`;
  return `${name} ${moves ? 'podchodzi i ' : ''}uderza w pole ${who}: ${dmg}`;
}

export function renderNorns(v, sel, handlers) {
  const list = $('intent-list');
  list.innerHTML = '';
  if (!v.intents.length) {
    list.innerHTML = '<li class="dice-empty">Nici jeszcze nie są utkane.</li>';
  }
  for (const it of v.intents) {
    const u = v.units.find((x) => x.id === it.unitId);
    if (!u || u.hp <= 0) continue;
    const li = document.createElement('li');
    li.className = 'intent' + (it.canceled ? ' cut' : '') + (sel.hlUnit === u.id ? ' hl' : '') + (sel.mode === 'cut' && !it.canceled ? ' cuttable' : '');
    li.innerHTML = `<span class="intent-order">${it.order}</span><span class="intent-token" style="background-image:url(${tokenUrl(u)})"></span><span class="intent-text">${intentText(v, it)}</span>`;
    li.addEventListener('click', () => handlers.intent(u.id));
    li.addEventListener('mouseenter', () => handlers.hoverIntent(u.id));
    li.addEventListener('mouseleave', () => handlers.hoverIntent(null));
    list.appendChild(li);
  }
  const fs = $('foresight');
  const volva = v.units.find((x) => x.type === 'volva' && x.hp > 0);
  const waves = upcomingWaves(v, 2);
  if (volva && waves.length) {
    fs.innerHTML = '<h3>Wieszczba Völvy</h3>' + waves.map((w) => {
      const counts = {};
      for (const t of w.units) counts[t] = (counts[t] || 0) + 1;
      const txt = Object.entries(counts).map(([t, n]) => (n > 1 ? `${n}× ` : '') + ENEMIES[t].name).join(', ');
      return `<p><b>Runda ${w.round}:</b> z kurhanu wstanie ${txt}.</p>`;
    }).join('');
  } else if (!volva) {
    fs.innerHTML = '<h3>Wieszczba</h3><p>Völva poległa. Nie wiecie już, co przyjdzie z kurhanu.</p>';
  } else fs.innerHTML = '';
}

export function renderDice(v, sel, handlers, rolling = false) {
  const box = $('dice');
  box.innerHTML = '';
  const free = v.dice.filter((d) => !d.used);
  if (v.phase !== 'narada') { box.innerHTML = '<span class="dice-empty">Umarli wykonują swoje zamiary…</span>'; return; }
  if (!free.length) { box.innerHTML = '<span class="dice-empty">Wszystkie runy rozdane.</span>'; return; }
  free.forEach((d, i) => {
    const b = document.createElement('button');
    b.className = 'die' + (sel.dieId === d.id ? ' selected' : '') + (rolling ? ' rolling' : '');
    if (rolling) b.style.animationDelay = `${i * 0.07}s`;
    b.title = `${RUNES[d.face].name}: ${RUNES[d.face].desc}`;
    b.innerHTML = runeSvg(d.face) + `<span class="die-name">${RUNES[d.face].short}</span>`;
    b.addEventListener('click', () => handlers.die(d.id));
    box.appendChild(b);
  });
}

export function renderButtons(v, undoCount, busy) {
  const n = v.phase === 'narada';
  const free = v.dice.filter((d) => !d.used).length;
  const rr = $('btn-reroll');
  rr.innerHTML = `Przerzuć runy <span style="opacity:.75">(${v.hamingja})</span>`;
  rr.disabled = busy || !n || v.hamingja <= 0 || free === 0;
  $('btn-undo').disabled = busy || !n || undoCount === 0;
  $('btn-end').disabled = busy || !n;
}

export function setHint(html) { $('hint').innerHTML = html; }

export function renderAnsuz(onPick) {
  const box = $('ansuz-choices');
  box.innerHTML = '';
  for (const f of ['T', 'A', 'R', 'K', 'B']) {
    const b = document.createElement('button');
    b.className = 'die';
    b.innerHTML = runeSvg(f) + `<span class="die-name">${RUNES[f].short}</span>`;
    b.title = RUNES[f].desc;
    b.addEventListener('click', () => onPick(f));
    box.appendChild(b);
  }
}

export function rulesHtml() {
  const runes = ['T', 'A', 'R', 'K', 'B', 'N'].map((f) => `<div class="rune-row"><span class="rune-chip">${runeSvg(f)}</span><span><b>${RUNES[f].name}</b> — ${RUNES[f].desc}</span></div>`).join('');
  return `
  <p>Midgard to gra kooperacyjna. Wszyscy gracze grają razem przeciw umarłym i siedzą przy jednym ekranie. Wygrywacie albo przegrywacie wspólnie.</p>
  <h3>Runda</h3>
  <ol>
    <li><b>Nici Norn.</b> Na początku rundy każdy wróg pokazuje, co zrobi: złota nić to jego droga, czerwona strzała to cios, a liczba w czerwonym kole to siła ciosu. Numer przy wrogu mówi, w jakiej kolejności zagrają.</li>
    <li><b>Rzut run.</b> Dostajecie po dwie runy na każdego żywego bohatera.</li>
    <li><b>Narada.</b> Razem ustalacie plan. Rozdajecie runy, ruszacie bohaterami i atakujecie, w dowolnej kolejności. Każdy ruch można cofnąć, dopóki nie skończycie narady.</li>
    <li><b>Tura umarłych.</b> Wrogowie po kolei wykonują pokazane zamiary.</li>
    <li><b>Mróz.</b> Od końca rundy ${SCENARIO.frostStart} co rundę zamarza kolejna kolumna pól od zachodu. Bohater stojący na zamarzniętym polu na koniec rundy traci ${SCENARIO.frostDamage} punkty życia.</li>
  </ol>
  <h3>Najważniejsza zasada: cios trafia w pole</h3>
  <p>Wróg uderza w pole, na którym bohater stał, gdy tkano nici. Jeśli bohater z niego zejdzie, cios trafi w pustkę. Jeśli wejdzie tam inny bohater, oberwie on. Możecie też zastawić wrogowi drogę: wróg nie przejdzie przez bohatera i stanie wcześniej, a wtedy może nie sięgnąć celu.</p>
  <h3>Bohater w swojej rundzie</h3>
  <ul>
    <li>Może iść o tyle pól, ile ma punktów ruchu. Las, bagno i skały kosztują 2, reszta 1. Przez sojuszników można przechodzić, przez wrogów nie.</li>
    <li>Może raz zaatakować wroga w zasięgu, przed ruchem albo po nim.</li>
    <li>Może użyć swojej mocy, jeśli ma runę Kenaz.</li>
  </ul>
  <h3>Obrona</h3>
  <ul>
    <li><b>Mur tarcz:</b> bohater, obok którego stoi inny bohater, otrzymuje 1 obrażenie mniej.</li>
    <li><b>Tarczowniczka</b> dodatkowo chroni sąsiadów o kolejne 1.</li>
    <li><b>Las i skały</b> dają 1 obrażenie mniej, <b>lód</b> 1 więcej.</li>
    <li>Cios zawsze zadaje co najmniej 1 obrażenie. Tarcza z runy Algiz pochłania obrażenia przed utratą życia.</li>
  </ul>
  <h3>Runy</h3>
  <div class="rune-table">${runes}</div>
  <p><b>Hamingja</b>, czyli szczęście rodu: trzy złote monety na całą bitwę. Każda pozwala raz przerzucić wszystkie nierozdane runy.</p>
  <h3>Bohaterowie</h3>
  <ul>
    ${Object.values(HEROES).map((h) => `<li><b>${h.name}</b> (życie ${h.hp}, ruch ${h.move}, atak ${h.atk}${h.range > 1 ? `, zasięg ${h.range}` : ''}). ${h.passive} Moc <i>${h.power}</i>: ${h.powerDesc}</li>`).join('')}
  </ul>
  <h3>Wrogowie</h3>
  <ul>
    ${Object.values(ENEMIES).map((e) => `<li><b>${e.name}</b> (życie ${e.hp}, ruch ${e.move}, cios ${e.atk}${e.range > 1 ? `, zasięg ${e.range}` : ''}). ${e.desc}</li>`).join('')}
  </ul>
  <h3>Sterowanie</h3>
  <p>Stuknij bohatera na planszy albo jego kartę. Złote pola pokazują, dokąd może pójść, a czerwone obręcze, kogo może zaatakować. Stuknij runę na dole, a potem bohatera, żeby mu ją dać. Stuknij wroga albo jego wpis w Niciach Norn, żeby podświetlić jego zamiar.</p>`;
}

// Panele DOM: bohaterowie, nici Norn, runy, pasek górny, teksty zasad.
import { HEROES, ENEMIES, RUNES, SCENARIO, HERO_ORDER, NAMES, ODDZIALY, ODDZIALY_ORDER, BUDOWLE, jednostka } from './data.js';
import { runeSvg } from './runes.js';
import { heroAttackValue, upcomingWaves, canUsePower, attackTargets, remainingInBarrow, bossAwakeAt, level, wavesFor, scen } from './engine.js';

const $ = (id) => document.getElementById(id);

const GEN = NAMES.gen;
const FALLEN = NAMES.fallen;

export const tokenUrl = (u) => (BUDOWLE[u.type] && u.side === 'hero' ? `assets/img/osada/${BUDOWLE[u.type].sprite}.webp`
  : u.side === 'enemy' && ENEMIES[u.type] && ENEMIES[u.type].sprite ? `assets/img/osada/${ENEMIES[u.type].sprite}.webp`
  : `assets/img/${u.oddzial || ODDZIALY[u.type] ? 'oddzialy' : u.side === 'hero' ? 'bohaterowie' : 'wrogowie'}/${u.type}-zeton.webp`);

function plural(n, one, few, many) {
  if (n === 1) return one;
  const d = n % 10, dd = n % 100;
  return d >= 2 && d <= 4 && !(dd >= 12 && dd <= 14) ? few : many;
}

export function renderTop(v) {
  const S = scen(v);
  $('top-goal').textContent = S.goal;
  document.querySelector('.top-scenario').textContent = S.title;
  $('stat-round').innerHTML = `Runda ${Math.max(1, v.round)}<small>/ ${S.maxRounds}</small>`;
  const fr = $('stat-frost');
  fr.hidden = S.frostStart > S.maxRounds;
  if (v.frost > 0) {
    fr.classList.add('frost-on');
    fr.innerHTML = `Mróz <small>${v.frost} ${plural(v.frost, 'kolumna', 'kolumny', 'kolumn')}</small>`;
  } else {
    fr.classList.remove('frost-on');
    fr.innerHTML = `Mróz <small>od rundy ${S.frostStart}</small>`;
  }
  let coins = '';
  const ileMonet = Math.max(v.hamingja, 3 + ((v.premie && v.premie.hamingja) || 0));
  if (ileMonet > 3) coins = `<span class="coin ${v.hamingja ? '' : 'spent'}">${runeSvg('N', 'r')}</span><span class="coin-ile">×${v.hamingja}</span>`;
  else for (let i = 0; i < ileMonet; i++) coins += `<span class="coin ${i < v.hamingja ? '' : 'spent'}">${runeSvg('N', 'r')}</span>`;
  $('stat-hamingja').innerHTML = coins;
}

export function renderHeroes(v, sel, handlers) {
  const box = $('panel-heroes');
  box.innerHTML = '';
  for (const u of v.units.filter((x) => x.side === 'hero')) {
    const d = jednostka(u.type);
    const dead = u.hp <= 0;
    const card = document.createElement('div');
    card.className = 'hero-card' + (u.oddzial ? ' oddzial' : '') + (u.budowla ? ' oddzial budowla' : '') + (sel.heroId === u.id ? ' selected' : '') + (dead ? ' dead' : '') + (sel.dieId != null && !dead ? ' target-mode' : '');
    const ratio = u.hp / u.maxHp;
    const atk = heroAttackValue(v, u);
    const canAtk = !u.attacked && attackTargets(v, u).length > 0;
    const runeChips = Object.entries(u.runes).flatMap(([f, n]) => Array.from({ length: n }, () => `<span class="rune-chip" title="${RUNES[f].name}">${runeSvg(f)}</span>`)).join('');
    const powerOk = !dead && v.phase === 'narada' && canUsePower(v, u);
    card.innerHTML = `
      ${u.budowla ? `<div class="hero-avatar bud-av"><img src="assets/img/osada/${d.sprite}.webp" alt=""></div>` : u.oddzial ? `<div class="hero-avatar troop-av"><span>${d.name[0]}</span><img src="${tokenUrl(u)}" alt="" onerror="this.remove()"></div>` : `<div class="hero-avatar" style="background-image:url(${tokenUrl(u)})"></div>`}
      <div class="hero-name">${d.name}${u.poz ? ` <small class="hero-poz">poz. ${u.poz}</small>` : ''}</div>
      <div class="hero-role">${dead ? (u.budowla ? 'Zburzona' : u.oddzial ? 'Rozbici' : FALLEN[u.type]) : d.role}</div>
      <div class="hp">
        <div class="hp-bar"><div class="hp-fill ${ratio <= 0.34 ? 'low' : ''}" style="width:${ratio * 100}%"></div></div>
        <span class="hp-num">${u.hp}/${u.maxHp}</span>
        ${u.shield > 0 ? `<span class="shield-badge">${runeSvg('A')}${u.shield}</span>` : ''}
      </div>
      ${dead ? '' : `
      <div class="hero-stats">
        ${u.budowla ? (d.atk ? '' : '<span>Nie walczy</span>') : `<span>Ruch <b>${u.moveLeft}</b></span>`}
        ${u.budowla && !d.atk ? '' : `<span class="${u.attacked ? 'done' : ''}">Atak <b>${atk}</b>${d.range > 1 ? ` · zasięg ${d.range}` : ''}</span>`}
        ${u.attacked ? '<span>atak wykonany</span>' : canAtk ? '<span style="color:#ef7a64">wróg w zasięgu</span>' : ''}
      </div>
      ${runeChips ? `<div class="hero-runes">${runeChips}</div>` : ''}
      ${u.guard ? '<div class="guard-on">Przyjmuje ciosy za sąsiadów</div>' : ''}
      ${u.oddzial || u.budowla ? '' : `<div class="hero-power">
        <button class="btn btn-small" data-power="${u.id}" ${powerOk ? '' : 'disabled'}>${runeSvg('K', 'rune inline-rune')} ${d.power}</button>
        <div class="power-desc">${d.powerDesc} Wymaga runy Kenaz.</div>
      </div>`}
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
  if (it.kind === 'march' && !ENEMIES[u.type].move) return `${name} czeka, aż ktoś podejdzie na ${ENEMIES[u.type].range} pola.`;
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
  const hadVolva = v.units.some((x) => x.type === 'volva');
  const waves = upcomingWaves(v, 2);
  const left = remainingInBarrow(v);
  const boss = v.units.find((x) => x.type === 'pan-kurhanu');
  const S = scen(v);
  const obrona = S.winOnTime;
  const dom = v.units.find((x) => x.type === 'dlugi-dom');
  const dwor = S.celWroga && v.units.find((x) => x.type === S.celWroga);
  const jarl = v.units.find((x) => x.side === 'enemy' && ENEMIES[x.type].boss && ENEMIES[x.type].zywy);
  const bossAt = bossAwakeAt(v);
  const bossLine = S.celWroga
    ? `${dwor ? `<b>Dwór jarla: ${dwor.hp}/${dwor.maxHp}</b>. Zburzcie go, a wioska się podda.` : 'Dwór jarla stoi za palisadą.'}${jarl && jarl.hp > 0 ? ` ${ENEMIES[jarl.type].name}: ${jarl.hp}/${jarl.maxHp}.` : ''} Do posiłków jarla: ${Math.max(0, S.maxRounds - v.round)} ${plural(Math.max(0, S.maxRounds - v.round), 'runda', 'rundy', 'rund')}.`
    : obrona
    ? `${dom ? `<b>Długi Dom: ${dom.hp}/${dom.maxHp}</b>. ` : ''}Do świtu: ${Math.max(0, scen(v).maxRounds - v.round)} ${plural(Math.max(0, scen(v).maxRounds - v.round), 'runda', 'rundy', 'rund')}.${bossAt && !boss ? ` W rundzie ${bossAt} przyjdzie Pan Kurhanu.` : boss && boss.hp > 0 ? ` <b>Pan Kurhanu: ${boss.hp}/${boss.maxHp}</b>.` : ''}`
    : !boss
      ? `Pan Kurhanu śpi. Obudzi się w rundzie ${bossAt}.`
      : boss.hp > 0 ? `<b>Pan Kurhanu: ${boss.hp}/${boss.maxHp}</b>. Jego śmierć kończy bitwę, a wszystkie trupy rozsypią się w proch.` : 'Pan Kurhanu nie żyje.';
  const rz = S.rezerwaRzecz || ['trup', 'trupy', 'trupów'];
  const barrow = `<div class="barrow">${S.rezerwa || 'W kurhanie czeka jeszcze'}: <b>${left} ${plural(left, rz[0], rz[1], rz[2])}</b>.<div class="boss-line">${bossLine}</div></div>`;
  $('barrow').innerHTML = barrow;
  if (volva && waves.length) {
    fs.innerHTML = '<h3>Wieszczba Völvy</h3>' + waves.map((w) => {
      const counts = {};
      for (const t of w.units) counts[t] = (counts[t] || 0) + 1;
      const txt = Object.entries(counts).map(([t, n]) => (n > 1 ? `${n}× ` : '') + ENEMIES[t].name).join(', ');
      return `<p><b>Runda ${w.round}:</b> ${S.przybycie || 'z kurhanu wstanie'} ${txt}.</p>`;
    }).join('');
  } else if (hadVolva && !volva) {
    fs.innerHTML = '<h3>Wieszczba</h3><p>Völva poległa. Nie wiecie już, kiedy przyjdą kolejni.</p>';
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

export function renderAnsuz(onPick, bezK = false) {
  const box = $('ansuz-choices');
  box.innerHTML = '';
  for (const f of ['T', 'A', 'R', 'K', 'B'].filter((x) => !(bezK && x === 'K'))) {
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
  <h3>Lodowa runa</h3>
  <p>Mistrz Run może zablokować pole. Nikt przez nie nie przejdzie do końca następnej rundy. Wróg, którego droga tamtędy prowadzi, zatrzyma się przed runą.</p>
  <h3>Runy</h3>
  <div class="rune-table">${runes}</div>
  <p><b>Hamingja</b>, czyli szczęście rodu: trzy złote monety na całą bitwę. Każda pozwala raz przerzucić wszystkie nierozdane runy.</p>
  <h3>Bohaterowie</h3>
  <ul>
    ${HERO_ORDER.map((k) => HEROES[k]).map((h) => `<li><b>${h.name}</b> (życie ${h.hp}, ruch ${h.move}, atak ${h.atk}${h.range > 1 ? `, zasięg ${h.range}` : ''}). ${h.passive} Moc <i>${h.power}</i>: ${h.powerDesc}</li>`).join('')}
  </ul>
  <h3>Oddziały z osady</h3>
  <p>Na wyprawę z osady możesz zabrać oddziały wyszkolone w Hali Wojów. Ruszają się i walczą jak bohaterowie, mogą dostawać runy (poza Kenaz), ale nie mają mocy i nie dokładają run do rzutu. Kurhan czuje żywych: każdy oddział budzi jednego trupa więcej, a Pan Kurhanu ma 3 życia więcej. Oddział, który padnie, przepada. Gdy polegną wszyscy bohaterowie, oddziały się wycofują i bitwa jest przegrana.</p>
  <ul>
    ${ODDZIALY_ORDER.map((k) => ODDZIALY[k]).map((h) => `<li><b>${h.name}</b> (życie ${h.hp}, ruch ${h.move}, atak ${h.atk}${h.range > 1 ? `, zasięg ${h.range}` : ''}). ${h.passive}</li>`).join('')}
  </ul>
  <h3>Obrona osady</h3>
  <p>Gdy Długi Dom osiągnie poziom 2, do osady zaczynają ciągnąć fale trupów, mniej więcej co dobę. Licznik fali widać u góry ekranu osady. Na 8 godzin przed nadejściem możesz wyjść jej naprzeciw: wtedy walczysz na polu przed palisadą. Bronisz Długiego Domu przez 8 rund albo do rozbicia wszystkich trupów. Przegrywasz, gdy padnie Długi Dom albo wszyscy bohaterowie.</p>
  <ul>
    <li><b>Wał palisady.</b> Każde 2 odcinki palisady w osadzie to jedno pole wału (najwyżej 6). Trupy przez wał nie przejdą, twoi przechodzą, a stojący na wale dostaje 2 obrażenia mniej.</li>
    <li><b>Brama</b> zamyka przejście w środku wału. Twoi przez nią przechodzą, trupy muszą ją rozbić.</li>
    <li><b>Wieże łucznicze</b> strzelają na 3 pola. Wybierasz je jak bohatera i atakujesz nimi. Możesz im dać runę ataku, tarczy albo leczenia.</li>
    <li><b>Kamień runiczny</b> osłania: twoi do 2 pól od niego dostają 1 obrażenie mniej.</li>
    <li>Jeśli nie staniesz do bitwy, osada broni się sama: liczy się siła bohaterów, wojska i umocnień przeciw sile fali. Przegrana kosztuje część zapasów (srebra mniej, bo pilnuje go skarbiec), a następna fala przychodzi później.</li>
  </ul>
  <h3>Wioski jarłów</h3>
  <p>Na mapie Midgardu czekają wioski jarłów, którzy przeszli na stronę zimy: Ketil Jednooki (od Długiego Domu 3), Ragna Siwa (Długi Dom 5, po pokonaniu Ketila) i Thorgrim Lodowy Kieł (Długi Dom 7, po pokonaniu Ragny). Wioska broni się za palisadą, przez którą drużyna nie przejdzie: trzeba rozbić bramę albo strzelać nad palami. Wieże jarła strzelają na 3 pola. Wygrywacie, gdy zburzycie dwór jarła w 10 rund. Za każdy oddział jarl zwołuje jednego wojownika więcej, a dwór jest mocniejszy. Łup jest duży, zwłaszcza w srebrze i żelazie, a pierwsze zwycięstwo daje podwójną sławę. Po zdobyciu wioska odbudowuje się przez 8 godzin.</p>
  <h3>Wrogowie</h3>
  <ul>
    ${Object.values(ENEMIES).map((e) => `<li><b>${e.name}</b> (życie ${e.hp}, ruch ${e.move}, cios ${e.atk}${e.range > 1 ? `, zasięg ${e.range}` : ''}). ${e.desc}</li>`).join('')}
  </ul>
  <h3>Sterowanie</h3>
  <p>Stuknij bohatera na planszy albo jego kartę. Złote pola pokazują, dokąd może pójść, a czerwone obręcze, kogo może zaatakować. Stuknij runę na dole, a potem bohatera, żeby mu ją dać. Stuknij wroga albo jego wpis w Niciach Norn, żeby podświetlić jego zamiar.</p>`;
}

// status: { typ: { poz, blokada } } dla wyprawy z osady (blokada = powód, dla którego nie można wybrać)
export function renderTeam(picked, onToggle, status = null) {
  const grid = $('team-grid');
  grid.innerHTML = '';
  grid.classList.toggle('full', picked.length >= 3);
  for (const k of HERO_ORDER) {
    const d = HEROES[k];
    const st = status && status[k];
    const i = picked.indexOf(k);
    const b = document.createElement('button');
    b.className = 'pick' + (i >= 0 ? ' on' : '') + (st && st.blokada ? ' zablokowany' : '');
    if (st && st.blokada) b.disabled = true;
    b.innerHTML = `
      <div class="pick-art" style="background-image:url(assets/img/bohaterowie/${k}-karta.webp)">${i >= 0 ? `<span class="pick-num">${i + 1}</span>` : ''}${st && st.poz ? `<span class="pick-poz">poz. ${st.poz}</span>` : ''}</div>
      <div class="pick-body">
        <div class="pick-name">${d.name}</div>
        <div class="pick-role">${d.role}</div>
        ${st && st.blokada ? `<div class="pick-blok">${st.blokada}</div>` : ''}
        <div class="pick-stats"><span>Życie <b>${d.hp + ((st && st.zycie) || 0)}</b></span><span>Ruch <b>${d.move}</b></span><span>Atak <b>${d.atk + ((st && st.atak) || 0)}</b>${d.range > 1 ? ` · zasięg ${d.range}` : ''}</span></div>
        <div class="pick-text">${d.passive}</div>
        <div class="pick-text"><b>${d.power}</b> (Kenaz): ${d.powerDesc}</div>
      </div>`;
    b.addEventListener('click', () => onToggle(k));
    grid.appendChild(b);
  }
}

// Wybór oddziałów na wyprawę. wojsko: { typ: ile }, wybrane: lista typów, limit: miejsca w bitwie.
export function renderTroops(wojsko, wybrane, limit, onZmiana, obrona = false) {
  const box = $('team-troops');
  const typy = ODDZIALY_ORDER.filter((t) => wojsko[t] > 0);
  box.hidden = !typy.length && !limit;
  if (box.hidden) return;
  const ile = (t) => wybrane.filter((x) => x === t).length;
  box.innerHTML = `<h3 class="team-troops-t">Oddziały <small>${wybrane.length} / ${limit} miejsc</small></h3>
    ${typy.length ? '' : '<p class="team-troops-pusto">Nie masz jeszcze wojska. Szkolisz je w Hali Wojów.</p>'}
    <div class="team-troops-l">${typy.map((t) => { const d = ODDZIALY[t]; return `<div class="troop-pick">
      <div class="troop-av"><span>${d.name[0]}</span><img src="assets/img/oddzialy/${t}-zeton.webp" alt="" onerror="this.remove()"></div>
      <div class="troop-txt"><b>${d.name}</b><small>Życie ${d.hp} · Atak ${d.atk}${d.range > 1 ? ` · zasięg ${d.range}` : ''} · masz ${wojsko[t]}</small></div>
      <div class="troop-ile"><button class="btn btn-small" data-minus="${t}" ${ile(t) ? '' : 'disabled'}>−</button><b>${ile(t)}</b>
      <button class="btn btn-small" data-plus="${t}" ${ile(t) < wojsko[t] && wybrane.length < limit ? '' : 'disabled'}>+</button></div></div>`; }).join('')}</div>
    ${wybrane.length && !obrona ? `<p class="team-troops-pusto">Kurhan czuje żywych: ${wybrane.length} ${plural(wybrane.length, 'trup więcej', 'trupy więcej', 'trupów więcej')}, Pan Kurhanu silniejszy o ${SCENARIO.troopBossHp * wybrane.length} życia.</p>` : ''}`;
  box.querySelectorAll('[data-plus]').forEach((b) => { b.onclick = () => onZmiana(b.dataset.plus, 1); });
  box.querySelectorAll('[data-minus]').forEach((b) => { b.onclick = () => onZmiana(b.dataset.minus, -1); });
}

export function renderLevels(cur, onPick) {
  const box = $('levels');
  box.innerHTML = '';
  for (const [k, l] of Object.entries(SCENARIO.levels)) {
    const b = document.createElement('button');
    b.className = 'btn btn-small' + (k === cur ? ' on' : '');
    b.textContent = l.name;
    b.addEventListener('click', () => onPick(k));
    box.appendChild(b);
  }
  $('level-desc').textContent = SCENARIO.levels[cur].desc;
}

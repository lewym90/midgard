// Midgard — sterowanie grą: ekrany, narada, odtwarzanie zdarzeń, zapis.
import * as E from './engine.js';
import { Board } from './board.js';
import * as UI from './ui.js';
import { HEROES, ENEMIES, RUNES, SCENARIO, TERRAIN, HERO_ORDER, NAMES } from './data.js';
import { key, distance } from './hex.js';
import { audio } from './audio.js';
import { konto } from './konto.js';
import * as KUI from './konto-ui.js';
import { osada } from './osada.js';

const VERSION = '0.6.0';
const PREF_KEY = 'midgard.druzyna';
const SAVE_KEY = 'midgard.bitwa.v1';
const $ = (id) => document.getElementById(id);

let state = null;      // prawda
let view = null;       // to, co widać (podczas animacji zostaje w tyle za prawdą)
let undo = [];
let busy = false;
let board = null;
const sel = { heroId: null, dieId: null, mode: null, hlUnit: null };
let pick = { team: ['berserker', 'tarczowniczka', 'volva'], level: 'wedrowiec' };
function wczytajPick() {
  let p = konto.dane().druzyna;
  if (!p) { try { p = JSON.parse(localStorage.getItem(PREF_KEY)); } catch (e) {} }
  if (p && p.team && p.level) pick = { team: p.team.slice(), level: p.level };
}
wczytajPick();

// ---------- zapis ----------
// Zapis: na koncie (serwer + kopia w urządzeniu); bez konta tylko w urządzeniu.
const store = {
  save() { konto.zapisz({ ...konto.dane(), bitwa: state && !state.result ? state : null, druzyna: pick }); },
  load() { const s = konto.dane().bitwa; return s && s.v === E.SAVE_VERSION ? s : null; },
  clear() { konto.zapisz({ ...konto.dane(), bitwa: null, druzyna: pick }); },
};
// stary zapis sprzed kont (tylko w urządzeniu) przenosimy raz na konto
function przeniesStaryZapis() {
  try {
    const old = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (old && old.v === E.SAVE_VERSION && !konto.dane().bitwa) konto.zapisz({ ...konto.dane(), bitwa: old, druzyna: pick });
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {}
}

// ---------- grafiki ----------
function loadImages() {
  const list = {
    'teren-snieg': 'teren/snieg', 'teren-las': 'teren/las', 'teren-lod': 'teren/lod', 'teren-bagno': 'teren/bagno',
    'teren-skaly': 'teren/skaly', 'teren-kurhan': 'teren/kurhan',
    ...Object.fromEntries(HERO_ORDER.map((k) => ['zeton-' + k, `bohaterowie/${k}-zeton`])),
    'zeton-draugr': 'wrogowie/draugr-zeton', 'zeton-lucznik': 'wrogowie/lucznik-zeton', 'zeton-pan-kurhanu': 'wrogowie/pan-kurhanu-zeton',
  };
  const out = {};
  return Promise.all(Object.entries(list).map(([k, p]) => new Promise((res) => {
    const im = new Image();
    im.onload = () => { out[k] = im; res(); };
    im.onerror = () => res();
    im.src = `assets/img/${p}.webp`;
  }))).then(() => out);
}

// ---------- ekrany ----------
function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === id);
  if (id === 'screen-battle' && board) requestAnimationFrame(() => board.resize());
  if (id === 'screen-battle') updateMusic(); else audio.music('hymn');
  if (id === 'screen-osada') osada.otworz();
}

// Dokąd wracać z bitwy i z wyboru drużyny
function domEkran() { return konto.zalogowany ? 'screen-osada' : 'screen-start'; }
const NAZWY_PREMII = { zycie: (n) => `+${n} życia`, atak: (n) => `+${n} ataku`, hamingja: (n) => `+${n} ${n === 1 ? 'moneta' : 'monety'} Hamingji`, runy: (n) => `+${n} ${n === 1 ? 'runa' : 'runy'} na rundę` };
const NAZWY_SUR = { drewno: 'drewno', zelazo: 'żelazo', zywnosc: 'żywność', srebro: 'srebro' };

// ---------- muzyka bitwy: poziom napięcia z sytuacji na planszy ----------
function battleTrack() {
  if (!state || state.result) return null;
  const heroes = E.livingHeroes(state), foes = E.livingEnemies(state);
  if (foes.some((e) => e.type === 'pan-kurhanu')) return 'boss';
  const low = heroes.some((h) => h.hp / h.maxHp <= 0.34);
  const engaged = foes.filter((e) => heroes.some((h) => distance(h.c, h.r, e.c, e.r) <= 1)).length;
  if (low || engaged >= 3) return 'bitwa-3';
  if (foes.some((e) => heroes.some((h) => distance(h.c, h.r, e.c, e.r) <= 3))) return 'bitwa-2';
  return 'bitwa-1';
}
function updateMusic() { if ($('screen-battle').classList.contains('active')) audio.music(battleTrack()); }

function refreshSound() {
  const on = audio.prefs.music || audio.prefs.sfx;
  for (const b of document.querySelectorAll('.sound-btn')) b.classList.toggle('off', !on);
  $('m-music').textContent = `Muzyka: ${audio.prefs.music ? 'włączona' : 'wyłączona'}`;
  $('m-sfx').textContent = `Efekty: ${audio.prefs.sfx ? 'włączone' : 'wyłączone'}`;
}
function overlay(id, on = true) { $(id).hidden = !on; }

function confirmBox(title, text) {
  return new Promise((res) => {
    $('confirm-title').textContent = title; $('confirm-text').textContent = text;
    overlay('ov-confirm');
    const done = (v) => { overlay('ov-confirm', false); $('confirm-yes').onclick = $('confirm-no').onclick = null; res(v); };
    $('confirm-yes').onclick = () => done(true);
    $('confirm-no').onclick = () => done(false);
  });
}

function banner(t1, t2 = '', cls = '', ms = 1300) {
  const b = $('banner');
  b.className = 'banner ' + cls;
  b.innerHTML = `<div class="b1">${t1}</div>${t2 ? `<div class="b2">${t2}</div>` : ''}`;
  requestAnimationFrame(() => b.classList.add('show'));
  return new Promise((res) => setTimeout(() => { b.classList.remove('show'); setTimeout(res, 350); }, ms));
}

// ---------- rysowanie stanu ----------
function syncBoardUI() {
  const ui = { selected: sel.heroId, reach: new Set(), attackable: new Set(), cutMode: sel.mode === 'cut', runeTarget: sel.dieId != null, hlUnit: sel.hlUnit, wardSpots: new Set(), orderIds: new Set() };
  if (!busy && view.phase === 'narada' && sel.mode === 'ward') {
    const mr = state.units.find((u) => u.type === 'mistrz-run' && u.hp > 0);
    if (mr) for (const [c, r] of E.wardTargets(state, mr)) ui.wardSpots.add(key(c, r));
  }
  if (!busy && view.phase === 'narada' && sel.mode === 'order') for (const h of E.orderTargets(state)) ui.orderIds.add(h.id);
  if (!busy && view.phase === 'narada' && sel.heroId != null && !sel.mode) {
    const h = E.unitById(state, sel.heroId);
    if (h && h.hp > 0) {
      for (const [k, v] of E.heroMoves(state, h)) if (v.end && k !== key(h.c, h.r)) ui.reach.add(k);
      for (const e of E.attackTargets(state, h)) ui.attackable.add(e.id);
    }
  }
  board.setUI(ui);
}

function render(rolling = false) {
  board.setView(view);
  syncBoardUI();
  const handlers = { hero: onHeroCard, power: onPower, intent: onIntentClick, hoverIntent: (id) => { sel.hlUnit = id; syncBoardUI(); }, die: onDie };
  UI.renderTop(view);
  UI.renderHeroes(view, sel, handlers);
  UI.renderNorns(view, sel, handlers);
  UI.renderDice(view, sel, handlers, rolling);
  UI.renderButtons(view, undo.length, busy);
  updateHint();
}

function updateHint(extra) {
  if (extra) return UI.setHint(extra);
  if (busy || view.phase === 'wrog') return UI.setHint('Umarli wykonują swoje zamiary…');
  if (view.phase !== 'narada') return UI.setHint('');
  if (sel.mode === 'cut') return UI.setHint('<b>Völva:</b> wskaż wroga na planszy albo na liście Nici Norn. Jego zamiar w tej rundzie przepadnie.');
  if (sel.mode === 'ward') return UI.setHint('<b>Mistrz Run:</b> wskaż podświetlone pole. Do końca następnej rundy nikt przez nie nie przejdzie.');
  if (sel.mode === 'order') return UI.setHint('<b>Jarl:</b> wskaż bohatera, który już atakował. Będzie mógł zaatakować jeszcze raz.');
  if (sel.dieId != null) {
    const d = state.dice.find((x) => x.id === sel.dieId);
    return UI.setHint(`<b>${RUNES[d.face].name}</b>: ${RUNES[d.face].desc} Stuknij bohatera, który ma ją dostać.`);
  }
  if (sel.heroId != null) {
    const h = E.unitById(state, sel.heroId);
    const d = HEROES[h.type];
    return UI.setHint(`<b>${d.name}</b>: ruch ${h.moveLeft}, atak ${E.heroAttackValue(state, h)}${h.attacked ? ' (już atakował)' : ''}. Złote pola: dokąd może pójść. Czerwona obręcz: kogo może zaatakować.`);
  }
  UI.setHint('<b>Narada.</b> Wybierz bohatera, żeby nim ruszyć albo zaatakować. Stuknij runę na dole, a potem bohatera, żeby mu ją dać.');
}

// ---------- odtwarzanie zdarzeń ----------
function applyEvent(v, ev) {
  const u = (id) => v.units.find((x) => x.id === id);
  if (ev.type === 'move') { const x = u(ev.id); const [c, r] = ev.path[ev.path.length - 1]; x.c = c; x.r = r; }
  else if (ev.type === 'hit') { const x = u(ev.to); if (x) { x.hp = ev.hp; if (ev.shield !== undefined) x.shield = ev.shield; } }
  else if (ev.type === 'death') { const x = u(ev.id); if (x) x.hp = 0; }
  else if (ev.type === 'spawn') v.units.push(E.clone(ev.unit));
  else if (ev.type === 'frost') v.frost = ev.frost;
  else if (ev.type === 'heal') { const x = u(ev.id); if (x) x.hp = ev.hp; }
  else if (ev.type === 'round') { v.round = ev.round; v.intents = []; v.phase = 'narada'; v.dice = []; }
  else if (ev.type === 'phase') v.phase = ev.phase;
  else if (ev.type === 'power' && ev.power === 'nic') for (const i of v.intents) if (i.unitId === ev.target) i.canceled = true;
  else if (ev.type === 'power' && ev.power === 'oslona') { const x = u(ev.id); if (x) x.guard = true; }
  else if (ev.type === 'power' && ev.power === 'runa') { v.wards = (v.wards || []).concat([{ c: ev.at[0], r: ev.at[1], until: v.round + 1 }]); }
}

const SOUND = { move: 'krok', spawn: 'przyzwanie', frost: 'mroz', heal: 'leczenie', cut: 'nic' };

async function play(events) {
  busy = true;
  render();
  let newRound = false;
  for (const ev of events) {
    if (ev.type === 'phase' && ev.phase === 'wrog') { audio.play('rog'); applyEvent(view, ev); render(); await banner('Tura umarłych', 'Nici Norn się dopełniają', 'red', 1000); continue; }
    if (ev.type === 'round') {
      newRound = true;
      applyEvent(view, ev); render();
      await banner(`Runda ${ev.round}`, ev.round === 1 ? 'Umarli wychodzą z kurhanu' : E.level(state).waves[ev.round] ? 'Kurhan znów się otwiera' : 'Norny tkają nowe nici', '', 1150);
      continue;
    }
    if (ev.type === 'frost') { await banner('Mróz', 'Zima zabiera kolejną część pola bitwy', 'frost', 900); }
    if (ev.type === 'spawn' && ev.unit.type === 'pan-kurhanu') await banner('Pan Kurhanu', 'Wstaje z grobu. Jego śmierć zakończy bitwę.', 'red', 1700);
    if (ev.type === 'hit') audio.play(ev.ranged ? 'strzal' : ev.absorbed && !ev.dmg ? 'tarcza' : 'cios');
    if (ev.type === 'death') { const x = view.units.find((y) => y.id === ev.id); audio.play(x && x.side === 'hero' ? 'bohater_pada' : 'smierc'); }
    if (SOUND[ev.type]) audio.play(SOUND[ev.type]);
    if (ev.type === 'hit' && ev.hp === 0) {
      // zostaw jednostkę widoczną do animacji śmierci
      const x = view.units.find((y) => y.id === ev.to);
      await board.animate(ev, view);
      if (x) { x.shield = ev.shield ?? x.shield; }
      render();
      continue;
    }
    if (ev.type === 'spawn') { applyEvent(view, ev); await board.animate(ev, view); render(); continue; }
    await board.animate(ev, view);
    applyEvent(view, ev);
    render();
  }
  view = E.clone(state);
  busy = false;
  if (newRound && !state.result) { audio.play('runy'); render(true); }
  else render();
  store.save();
  updateMusic();
  if (state.result) setTimeout(showEnd, 600);
}

async function act(fn) {
  if (busy || !state || state.phase !== 'narada') return false;
  const snap = JSON.stringify(state);
  const ev = fn(state);
  if (!ev) return false;
  undo.push(snap);
  if (undo.length > 60) undo.shift();
  await play(ev);
  return true;
}

// ---------- obsługa wejścia ----------
async function giveDie(dieId, heroId) {
  const d = state.dice.find((x) => x.id === dieId);
  if (!d) return;
  let face = d.face;
  if (face === 'N') {
    face = await new Promise((res) => {
      UI.renderAnsuz((f) => { overlay('ov-ansuz', false); res(f); });
      $('btn-ansuz-cancel').onclick = () => { overlay('ov-ansuz', false); res(null); };
      overlay('ov-ansuz');
    });
    if (!face) return;
  }
  sel.dieId = null;
  audio.play('runa');
  await act((s) => E.assignRune(s, dieId, heroId, face));
  render();
}

function onDie(id) {
  if (busy) return;
  audio.unlock();
  sel.mode = null;
  sel.dieId = sel.dieId === id ? null : id;
  render();
}

async function powerOn(type, target) {
  const h = state.units.find((u) => u.type === type && u.hp > 0);
  sel.mode = null;
  if (h) await act((s) => E.usePower(s, h.id, target));
  render();
}

function onHeroCard(id) {
  if (busy) return;
  audio.unlock();
  if (sel.dieId != null) return giveDie(sel.dieId, id);
  if (sel.mode === 'order') { if (E.orderTargets(state).some((h) => h.id === id)) return powerOn('jarl', id); }
  sel.mode = null;
  sel.heroId = sel.heroId === id ? null : id;
  render();
}

async function onPower(id) {
  if (busy) return;
  audio.unlock();
  const h = E.unitById(state, id);
  const MODE = { volva: 'cut', jarl: 'order', 'mistrz-run': 'ward' };
  if (MODE[h.type]) {
    sel.mode = sel.mode === MODE[h.type] ? null : MODE[h.type];
    sel.dieId = null;
    render();
    return;
  }
  sel.mode = null;
  await act((s) => E.usePower(s, id));
}

async function cutThread(enemyId) {
  const volva = state.units.find((u) => u.type === 'volva' && u.hp > 0);
  sel.mode = null;
  await act((s) => E.usePower(s, volva.id, enemyId));
}

function onIntentClick(unitId) {
  if (busy) return;
  if (sel.mode === 'cut') return cutThread(unitId);
  sel.hlUnit = sel.hlUnit === unitId ? null : unitId;
  render();
}

async function onTap(c, r) {
  if (busy || !state || state.phase !== 'narada') return;
  audio.unlock();
  const u = E.unitAt(state, c, r);
  if (sel.dieId != null) {
    if (u && u.side === 'hero') return giveDie(sel.dieId, u.id);
    sel.dieId = null; render(); return;
  }
  if (sel.mode === 'cut') {
    if (u && u.side === 'enemy' && state.intents.some((i) => i.unitId === u.id && !i.canceled)) return cutThread(u.id);
    sel.mode = null; render(); return;
  }
  if (sel.mode === 'ward') {
    const mr = state.units.find((x) => x.type === 'mistrz-run' && x.hp > 0);
    if (mr && E.wardTargets(state, mr).some(([a, b]) => a === c && b === r)) return powerOn('mistrz-run', [c, r]);
    sel.mode = null; render(); return;
  }
  if (sel.mode === 'order') {
    if (u && E.orderTargets(state).includes(u)) return powerOn('jarl', u.id);
    sel.mode = null; render(); return;
  }
  if (u && u.side === 'hero') { sel.heroId = sel.heroId === u.id ? null : u.id; sel.hlUnit = null; render(); return; }
  if (sel.heroId != null) {
    const h = E.unitById(state, sel.heroId);
    if (u && u.side === 'enemy' && E.attackTargets(state, h).includes(u)) { await act((s) => E.heroAttack(s, h.id, u.id)); return; }
    if (!u) {
      const m = E.heroMoves(state, h).get(key(c, r));
      if (m && m.end) { await act((s) => E.moveHero(s, h.id, c, r)); return; }
    }
  }
  if (u && u.side === 'enemy') {
    sel.hlUnit = sel.hlUnit === u.id ? null : u.id;
    const d = ENEMIES[u.type];
    render();
    updateHint(`<b>${d.name}</b>: życie ${u.hp}/${u.maxHp}, cios ${d.atk}${d.range > 1 ? `, zasięg ${d.range}` : ''}${d.armor ? `, pancerz ${d.armor}` : ''}. ${d.desc}`);
    return;
  }
  sel.heroId = null; sel.hlUnit = null;
  render();
  const t = TERRAIN[state.map[r][c]];
  updateHint(`<b>${t.name}${c < state.frost ? ' (zamarznięte)' : ''}</b>: ${t.desc}${c < state.frost ? ` Na koniec rundy bohater tutaj traci ${SCENARIO.frostDamage} życia.` : ''}`);
}

function onHover(h) {
  if (busy || !state || sel.heroId != null || sel.dieId != null || sel.mode) return;
  if (!h) return updateHint();
  const u = E.unitAt(state, h[0], h[1]);
  if (u && u.side === 'enemy') { const d = ENEMIES[u.type]; return updateHint(`<b>${d.name}</b>: życie ${u.hp}/${u.maxHp}, cios ${d.atk}${d.range > 1 ? `, zasięg ${d.range}` : ''}${d.armor ? `, pancerz ${d.armor}` : ''}.`); }
  if (u) return updateHint();
  const t = TERRAIN[state.map[h[1]][h[0]]];
  updateHint(`<b>${t.name}${h[0] < state.frost ? ' (zamarznięte)' : ''}</b>: ${t.desc}`);
}

async function endNarada() {
  if (busy || state.phase !== 'narada') return;
  const freeDice = state.dice.filter((d) => !d.used).length;
  const idle = E.livingHeroes(state).filter((h) => !h.attacked && E.attackTargets(state, h).length).map((h) => HEROES[h.type].name);
  const warn = [];
  if (freeDice) warn.push(`${freeDice} ${freeDice === 1 ? 'runa czeka' : freeDice < 5 ? 'runy czekają' : 'run czeka'} na przydział`);
  if (idle.length) warn.push(`${idle.join(' i ')} ${idle.length > 1 ? 'mogą' : 'może'} jeszcze zaatakować`);
  if (warn.length && !(await confirmBox('Zakończyć naradę?', warn.join('; ') + '.'))) return;
  sel.heroId = null; sel.dieId = null; sel.mode = null; sel.hlUnit = null;
  undo = [];
  const ev = E.resolveEnemyTurn(state);
  await play(ev);
}

function doUndo() {
  if (busy || !undo.length) return;
  state = JSON.parse(undo.pop());
  view = E.clone(state);
  sel.dieId = null; sel.mode = null;
  if (sel.heroId != null && !E.unitById(state, sel.heroId)) sel.heroId = null;
  store.save();
  render();
}

function doReroll() {
  if (busy || !E.rerollDice(state)) return;
  undo = []; // przerzutu nie da się cofnąć
  sel.dieId = null;
  view = E.clone(state);
  audio.play('runy');
  store.save();
  render(true);
}

function showEnd() {
  const win = state.result === 'win';
  audio.music(win ? 'zwyciestwo' : 'porazka');
  $('end-title').textContent = win ? 'Zwycięstwo' : 'Klęska';
  const alive = E.livingHeroes(state).length;
  $('end-text').innerHTML = `<p>${win ? SCENARIO.win : alive ? SCENARIO.loseTime : SCENARIO.lose}</p><p class="stats">Bitwa trwała ${state.round} ${state.round === 1 ? 'rundę' : state.round < 5 ? 'rundy' : 'rund'}. Przeżyło ${alive} z ${state.team.length} bohaterów. Poziom: ${E.level(state).name}.</p><p class="stats" id="end-lup">${state.wyprawa ? 'Liczę łup…' : konto.zalogowany ? 'Ta bitwa nie była wyprawą z osady, więc nie daje łupu.' : ''}</p>`;
  $('btn-end-menu').textContent = konto.zalogowany ? 'Wróć do osady' : 'Menu główne';
  overlay('ov-end');
  const wyprawa = state.wyprawa;
  store.clear();
  if (wyprawa) rozliczWyprawe(wyprawa, state.result);
}

async function rozliczWyprawe(id, wynik) {
  const el = () => $('end-lup');
  try {
    const r = await konto.api('POST', '/osada/wyprawa/koniec', { id, wynik });
    const d = r.lup.dodane, st = r.lup.stracone;
    const czesci = Object.keys(NAZWY_SUR).filter((k) => d[k]).map((k) => `${NAZWY_SUR[k]} +${d[k]}`);
    const przep = Object.keys(NAZWY_SUR).filter((k) => st[k] > 0).map((k) => `${NAZWY_SUR[k]} ${st[k]}`);
    let t = `Łup do osady: ${czesci.length ? czesci.join(', ') : 'nic się nie zmieściło'}${r.lup.slawa ? `, sława +${r.lup.slawa}` : ''}.`;
    if (przep.length) t += ` Nie zmieściło się w magazynach: ${przep.join(', ')}.`;
    if (el()) el().textContent = t;
    osada._przyjmij && osada._przyjmij(r);
  } catch (e) { if (el()) el().textContent = 'Łup: ' + e.message; }
}

// ---------- start bitwy ----------
function openTeam() {
  const draw = () => {
    UI.renderTeam(pick.team, (k) => {
      const i = pick.team.indexOf(k);
      if (i >= 0) pick.team.splice(i, 1);
      else if (pick.team.length < 3) pick.team.push(k);
      draw();
    });
    UI.renderLevels(pick.level, (l) => { pick.level = l; draw(); });
    const go = $('btn-team-go');
    go.disabled = pick.team.length !== 3;
    go.textContent = pick.team.length === 3 ? 'Dalej' : `Wybierz jeszcze ${3 - pick.team.length}`;
  };
  draw();
  show('screen-team');
}

async function newBattle() {
  store.clear();
  // wyprawa z osady: premie z budynków i łup po bitwie
  let wyprawa = null, premie = null;
  if (konto.zalogowany && pick.zOsady) {
    try { const r = await konto.api('POST', '/osada/wyprawa/start', { poziom: pick.level }); wyprawa = r.wyprawa; premie = r.premie; }
    catch (e) { KUI.toast('Brak połączenia z osadą: ta bitwa nie da łupu.'); }
  }
  state = E.newBattle(undefined, pick.team, pick.level, premie);
  state.wyprawa = wyprawa;
  const pl = premie ? Object.entries(premie).filter(([, n]) => n > 0).map(([k, n]) => NAZWY_PREMII[k](n)) : [];
  view = E.clone(state);
  undo = [];
  Object.assign(sel, { heroId: null, dieId: null, mode: null, hlUnit: null });
  $('intro-text').innerHTML = SCENARIO.intro.map((p) => `<p>${p}</p>`).join('');
  $('intro-goal').textContent = SCENARIO.goal + (pl.length ? ` Premie z osady: ${pl.join(', ')}.` : '');
  show('screen-battle');
  render();
  overlay('ov-intro');
}

async function beginFight() {
  overlay('ov-intro', false);
  const ev = E.startRound(state);
  await play(ev);
}

function continueBattle() {
  const s = store.load();
  if (!s) return;
  state = s; view = E.clone(state); undo = [];
  Object.assign(sel, { heroId: null, dieId: null, mode: null, hlUnit: null });
  show('screen-battle');
  render();
}

function refreshStart() {
  $('btn-continue').hidden = !store.load();
  $('btn-osada').hidden = !konto.zalogowany;
  $('btn-new').textContent = konto.zalogowany ? 'Szybka bitwa (bez łupu)' : 'Bitwa: Kurhan nad fiordem';
  $('btn-new').classList.toggle('btn-gold', !konto.zalogowany);
  $('konto-nick').textContent = konto.zalogowany ? konto.nick : 'Bez konta';
  pokazStatus(konto.zalogowany ? konto.status : 'gosc');
}

function pokazStatus(st) {
  const el = $('konto-sync');
  const T = { zapisane: ['zapisano na serwerze', 'ok'], czeka: ['zapisuję…', ''], offline: ['bez sieci, wyślę później', 'warn'], blad: ['błąd zapisu na serwerze', 'warn'], nieznany: ['łączę z serwerem…', ''], gosc: ['gra tylko na tym urządzeniu', ''] };
  const [t, c] = T[st] || T.nieznany;
  el.textContent = t; el.className = c;
}

function naEkranie(id) { return $(id).classList.contains('active'); }

// Gdy z serwera przyjdzie nowszy zapis (gra na innym urządzeniu).
function przyjmijZdalny(powod) {
  wczytajPick();
  if (naEkranie('screen-battle') && !busy) {
    const s = store.load();
    if (s && (!state || s.round !== state.round || JSON.stringify(s) !== JSON.stringify(state))) {
      state = s; view = E.clone(state); undo = [];
      Object.assign(sel, { heroId: null, dieId: null, mode: null, hlUnit: null });
      render();
      KUI.toast('Wczytano nowszy stan bitwy z innego urządzenia.');
    }
  } else if (powod === 'konflikt') KUI.toast('Na innym urządzeniu zapisano nowszy stan. Wczytałem go.');
  refreshStart();
}

function poZalogowaniu(nowe) {
  wczytajPick();
  przeniesStaryZapis();
  refreshStart();
  show('screen-start');
  if (konto.zalogowany) KUI.toast(nowe ? `Witaj w Midgardzie, ${konto.nick}!` : `Witaj, ${konto.nick}.`);
}

// ---------- uruchomienie ----------
async function boot() {
  $('version').textContent = 'wersja ' + VERSION;
  $('rules-text').innerHTML = UI.rulesHtml();
  refreshStart();
  // konto i synchronizacja
  KUI.initLogin(poZalogowaniu);
  konto.onStatus = (st) => pokazStatus(st);
  konto.onZmiana = przyjmijZdalny;
  konto.onWylogowanie = () => { show('screen-login'); KUI.toast('Sesja wygasła. Zaloguj się ponownie.'); };
  $('btn-konto').onclick = () => KUI.otworzKonto(() => show('screen-login'));
  if (konto.zalogowany || konto.gosc) {
    show('screen-start');
    if (konto.zalogowany) {
      konto.ja().catch(() => {});
      konto.pobierz().then((zm) => { if (zm) przyjmijZdalny(); else refreshStart(); });
    }
  } else show('screen-login');
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && konto.zalogowany && !busy) konto.pobierz().then((zm) => { if (zm) przyjmijZdalny(); });
  });

  const images = await loadImages();
  board = new Board($('board'), images);
  board.onTap = onTap;
  board.onHover = onHover;
  new ResizeObserver(() => { board.resize(); }).observe($('board-wrap'));
  if (document.fonts) document.fonts.ready.then(() => board.resize());

  // pierwsze dotknięcie gdziekolwiek odblokowuje dźwięk (wymóg iOS)
  document.addEventListener('pointerdown', () => audio.unlock(), { capture: true });
  audio.music('hymn');
  refreshSound();
  for (const b of document.querySelectorAll('.sound-btn')) b.onclick = () => {
    const on = !(audio.prefs.music || audio.prefs.sfx);
    audio.setPref('music', on); audio.setPref('sfx', on); refreshSound();
  };
  $('m-music').onclick = () => { audio.setPref('music', !audio.prefs.music); refreshSound(); };
  $('m-sfx').onclick = () => { audio.setPref('sfx', !audio.prefs.sfx); refreshSound(); };
  $('btn-new').onclick = async () => { audio.unlock(); if (store.load() && !(await confirmBox('Nowa bitwa?', 'Zapisana bitwa zostanie utracona.'))) return; pick.zOsady = false; openTeam(); };
  $('btn-team-back').onclick = () => show(pick.zOsady ? 'screen-osada' : 'screen-start');
  $('btn-osada').onclick = () => { audio.unlock(); show('screen-osada'); };
  osada.init(async () => {
    audio.unlock();
    if (store.load() && !(await confirmBox('Nowa wyprawa?', 'Masz niedokończoną bitwę. Zostanie utracona.'))) return;
    pick.zOsady = true; openTeam();
  }, () => { refreshStart(); show('screen-start'); });
  $('btn-team-go').onclick = () => { if (pick.team.length === 3) newBattle(); };
  $('btn-continue').onclick = () => { audio.unlock(); continueBattle(); };
  $('btn-rules').onclick = () => overlay('ov-rules');
  $('btn-rules-close').onclick = () => overlay('ov-rules', false);
  $('btn-intro-rules').onclick = () => overlay('ov-rules');
  $('btn-intro-go').onclick = () => { audio.unlock(); beginFight(); };
  $('btn-end').onclick = endNarada;
  $('btn-undo').onclick = doUndo;
  $('btn-reroll').onclick = doReroll;
  $('btn-menu').onclick = () => overlay('ov-menu');
  $('m-resume').onclick = () => overlay('ov-menu', false);
  $('m-rules').onclick = () => { overlay('ov-menu', false); overlay('ov-rules'); };
  $('m-restart').onclick = async () => { overlay('ov-menu', false); if (await confirmBox('Zacząć od nowa?', 'Obecna bitwa przepadnie.')) { pick.team = state.team.slice(); pick.level = state.level; newBattle(); } };
  $('m-exit').onclick = () => { overlay('ov-menu', false); store.save(); refreshStart(); show(domEkran()); };
  $('btn-end-again').onclick = () => { overlay('ov-end', false); openTeam(); };
  $('btn-end-menu').onclick = () => { overlay('ov-end', false); refreshStart(); show(domEkran()); };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { sel.heroId = null; sel.dieId = null; sel.mode = null; sel.hlUnit = null; if (view) render(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') doUndo();
  });

  window.midgard = { osada, audio, state: () => state, view: () => view, board, busy: () => busy, render: () => { view = E.clone(state); render(); } };
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

boot();

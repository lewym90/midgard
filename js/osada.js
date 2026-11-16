// Ekran osady: mapa izometryczna, budowanie, ulepszanie, zbieranie surowców.
// Stan prawdziwy jest na serwerze; tu tylko podgląd na żywo z tych samych zasad (serwer/osada-dane.js).
import * as O from '../serwer/osada-dane.js';
import { konto } from './konto.js';
import { toast } from './konto-ui.js';
import { audio } from './audio.js';
import { HEROES, HERO_ORDER } from './data.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const IKONA = { drewno: 'ik-drewno', zelazo: 'ik-zelazo', zywnosc: 'ik-zywnosc', srebro: 'ik-srebro' };
const ikonaUrl = (s) => `assets/img/osada/${IKONA[s] || s}.webp`;
const liczba = (n) => Math.floor(n).toLocaleString('pl-PL');

export function czas(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sek = s % 60;
  if (h) return `${h} h ${String(m).padStart(2, '0')} min`;
  if (m) return `${m} min ${String(sek).padStart(2, '0')} s`;
  return `${sek} s`;
}

// ---------- geometria świata (piksele obrazu terenu 1536 × 1024) ----------
const TW = 124, TH = 62, CX = 760, CY = 520, N = O.SIATKA;
const SWIAT = { w: 1536, h: 1024 };
const OBSZAR = { x: 190, y: 150, w: 1150, h: 700 }; // to, co ma się zmieścić w widoku na start
const srodek = (x, y) => [CX + (x - y) * TW / 2, CY + (x + y - (N - 1)) * TH / 2];
function pole(wx, wy) {
  const u = (wx - CX) / (TW / 2), v = (wy - CY) / (TH / 2) + (N - 1);
  const x = Math.round((u + v) / 2), y = Math.round((v - u) / 2);
  return x >= 0 && y >= 0 && x < N && y < N ? [x, y] : null;
}
const SKALA = { dlugi_dom: 1.85, palisada: 1.05, kamien: 0.95, wieza: 1.1, brama: 1.3, stocznia: 1.45, farma: 1.38, ognisko: 1.15 };
const SKALA_DOM = 1.28;
// Punkty na obrazku budynku (ułamki szerokości i wysokości): dym i światło ognia.
const DYM = { dlugi_dom: [[0.55, 0.12]], kuznia: [[0.44, 0.03]], ognisko: [[0.5, 0.18]], chata_volvy: [[0.53, 0.04]], hala_wojow: [[0.52, 0.12]] };
const OGIEN = {
  dlugi_dom: [[0.1, 0.84, 0.6], [0.36, 0.86, 0.6], [0.5, 0.6, 0.35]], kuznia: [[0.48, 0.55, 1.2]], ognisko: [[0.5, 0.58, 1.4]],
  chata_volvy: [[0.5, 0.55, 0.7]], hala_wojow: [[0.62, 0.8, 0.6]], skarbiec: [[0.1, 0.68, 0.6]], swiatynia: [[0.25, 0.86, 0.5], [0.55, 0.86, 0.5]],
  kopalnia: [[0.28, 0.32, 0.4]], farma: [[0.6, 0.35, 0.35]], magazyn: [[0.25, 0.4, 0.35]], brama: [[0.22, 0.75, 0.5], [0.78, 0.75, 0.5]],
};
// Woda fiordu na obrazie terenu (do błysków)
const WODA = [[1536, 360], [1470, 480], [1420, 640], [1330, 780], [1180, 900], [1010, 990], [900, 1024], [1536, 1024]];

class Osada {
  constructor() {
    this.o = null;          // stan z serwera
    this.widok = null;      // stan przesunięty do teraz (podgląd)
    this.przes = 0;         // różnica zegara serwera i urządzenia
    this.wybrany = null;    // id budynku
    this.polePuste = null;  // [x, y]
    this.tryb = null;       // 'przesun'
    this.img = {};
    this.zajety = false;
    this.fx = [];
    this.cam = null;
    this.typ = null;        // typ budynku do postawienia (tryb 'postaw')
    this.widokPanelu = null; // 'budynek' | 'pole' | 'lista' | 'bohaterowie'
    this.snieg = [];
    this.dym = [];
    this.kruki = [];
    this.nastKruki = performance.now() + 6000;
    this.statyczna = null;
    this.statKlucz = '';
  }

  // ---------- start ----------
  init(onWyprawa, onWyjdz) {
    this.onWyprawa = onWyprawa;
    this.cv = $('o-canvas');
    this.g = this.cv.getContext('2d');
    $('o-wroc').onclick = onWyjdz;
    $('o-wyprawa').onclick = () => onWyprawa();
    $('o-zbierz').onclick = () => this.zbierzWszystko();
    $('o-budowa').onclick = () => { audio.unlock(); this.wybrany = null; this.polePuste = null; this.tryb = null; this._pokazPanel('lista'); };
    $('o-bohaterowie').onclick = () => { audio.unlock(); this.wybrany = null; this.polePuste = null; this.tryb = null; this._pokazPanel('bohaterowie'); };
    $('o-sheet-zamknij').onclick = () => this.zamknijPanel();
    this._wczytajObrazy();
    this._gesty();
    new ResizeObserver(() => this._rozmiar()).observe($('o-mapa'));
    const petla = (ts) => { this._rysuj(ts); requestAnimationFrame(petla); };
    requestAnimationFrame(petla);
    setInterval(() => this._tik(), 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && this.aktywna()) this.pobierz(); });
  }

  aktywna() { return $('screen-osada').classList.contains('active'); }

  _wczytajObrazy() {
    const nazwy = [...Object.keys(O.BUDYNKI), 'teren', 'ik-drewno', 'ik-zelazo', 'ik-zywnosc', 'ik-srebro', 'ik-slawa', 'ik-budowniczy'];
    for (const n of nazwy) {
      const im = new Image();
      im.onload = () => { this.img[n] = im; this.statKlucz = ''; };
      im.src = `assets/img/osada/${n}.webp`;
    }
    for (const n of ['tarcza', 'medalion-maly']) {
      const im = new Image();
      im.onload = () => { this.img['ui-' + n] = im; };
      im.src = `assets/img/ui/${n}.webp`;
    }
  }

  async otworz() {
    this.zamknijPanel();
    this._rozmiar();
    if (!this.o) $('o-res').innerHTML = '<span class="o-wait">Wczytuję osadę…</span>';
    await this.pobierz();
  }

  teraz() { return Date.now() + this.przes; }

  _przyjmij(r) {
    this.o = r.osada;
    this.przes = r.teraz - Date.now();
    for (const g of r.gotowe || []) toast(`Ukończono: ${O.BUDYNKI[g.typ].nazwa}, poziom ${g.poz}.`);
    this._tik(true);
  }

  async pobierz() {
    if (!konto.zalogowany) return;
    try { this._przyjmij(await konto.api('GET', '/osada')); }
    catch (e) { toast(e.message); }
  }

  async akcja(sciezka, dane, poSukcesie) {
    if (this.zajety) return;
    this.zajety = true;
    try {
      const r = await konto.api('POST', '/osada/' + sciezka, dane);
      this._przyjmij(r);
      if (poSukcesie) poSukcesie(r);
      return r;
    } catch (e) { toast(e.message); return null; }
    finally { this.zajety = false; this._panel(); }
  }

  // ---------- czas ----------
  _tik(odswiezPanel = false) {
    if (!this.o) return;
    const w = JSON.parse(JSON.stringify(this.o));
    const gotowe = O.uplyw(w, this.teraz());
    this.widok = w;
    this._pasek();
    if (gotowe.length && !this._czekaNaSerwer) {
      this._czekaNaSerwer = true;
      this.pobierz().finally(() => { this._czekaNaSerwer = false; });
    }
    if (odswiezPanel || (!$('o-sheet').hidden && !this.zajety)) this._panel(true);
  }

  // ---------- pasek surowców ----------
  _pasek() {
    const o = this.widok, cap = O.pojemnosc(o);
    const wolni = O.budowniczowie(o) - O.zajeci(o);
    $('o-res').innerHTML = O.SUROWCE.map((s) => {
      const pelny = o.zasoby[s] >= cap[s];
      const proc = Math.min(100, (100 * o.zasoby[s]) / cap[s]);
      return `<div class="o-plak${pelny ? ' pelny' : ''}" title="${O.NAZWY_SUROWCOW[s]}"><div class="o-plak-ram"></div><img class="o-plak-ik" src="${ikonaUrl(s)}" alt="">
        <div class="o-plak-in"><b>${liczba(o.zasoby[s])}</b><small>/ ${liczba(cap[s])}</small></div><div class="o-plak-bar"><i style="width:${proc}%"></i></div></div>`;
    }).join('');
    $('o-nick').textContent = konto.nick || '';
    $('o-herb-poz').textContent = O.poziomDD(o);
    $('o-staty').innerHTML = `<span class="o-chip" title="Sława"><img src="${ikonaUrl('ik-slawa')}" alt="">${liczba(o.slawa)}</span>` +
      `<span class="o-chip${wolni ? '' : ' pelny'}" title="Wolni budowniczowie"><img src="${ikonaUrl('ik-budowniczy')}" alt="">${wolni}/${O.budowniczowie(o)}</span>`;
    const doZebrania = o.budynki.filter((b) => O.BUDYNKI[b.typ].produkcja && b.bufor >= 1).length;
    $('o-zbierz').disabled = !doZebrania;
    let lic = $('o-zbierz').querySelector('.o-med-licznik');
    if (doZebrania) {
      if (!lic) { lic = document.createElement('span'); lic.className = 'o-med-licznik'; $('o-zbierz').querySelector('.o-med-k').appendChild(lic); }
      lic.textContent = doZebrania;
    } else if (lic) lic.remove();
  }

  // ---------- akcje ----------
  async zbierzWszystko() {
    audio.unlock();
    const r = await this.akcja('zbierz', { id: 'wszystko' });
    if (r) this._pokazZebrane(r.zebrane, null);
  }

  async zbierz(id) {
    const r = await this.akcja('zbierz', { id });
    if (r) this._pokazZebrane(r.zebrane, id);
  }

  _pokazZebrane(z, id) {
    const wpisy = Object.entries(z || {});
    if (!wpisy.length) { toast('Magazyny są pełne albo nie ma jeszcze czego zebrać.'); return; }
    for (const b of this.o.budynki) {
      if (id != null && b.id !== id) continue;
      const p = O.BUDYNKI[b.typ].produkcja;
      if (!p || !z[p.surowiec]) continue;
      const [x, y] = srodek(b.x, b.y);
      this.fx.push({ x, y: y - TH * 1.2, tekst: `+${liczba(z[p.surowiec])}`, surowiec: p.surowiec, t0: performance.now() });
      if (id == null) break;
    }
    if (id == null) toast('Zebrano: ' + wpisy.map(([s, n]) => `${O.NAZWY_SUROWCOW[s].toLowerCase()} +${liczba(n)}`).join(', '));
    audio.play('klik');
  }

  // ---------- panel na dole ----------
  zamknijPanel() { $('o-sheet').hidden = true; this.wybrany = null; this.polePuste = null; this.tryb = null; this.typ = null; this.widokPanelu = null; this._podpowiedz(''); }
  _pokazPanel(w) { this.widokPanelu = w; this._panelKlucz = ''; this._podpowiedz(''); this._panel(); }

  _podpowiedz(t) { const el = $('o-podp'); el.textContent = t; el.hidden = !t; }

  _wybierzBudynek(id) { this.wybrany = id; this.polePuste = null; this.tryb = null; this._pokazPanel('budynek'); }
  _wybierzPole(x, y) { this.polePuste = [x, y]; this.wybrany = null; this.tryb = null; this._pokazPanel('pole'); }

  _koszt(k, o) {
    return Object.entries(k).map(([s, n]) => `<span class="o-k${o.zasoby[s] < n ? ' brak' : ''}"><img src="${ikonaUrl(s)}" alt="">${liczba(n)}</span>`).join('');
  }

  _efekt(o, b, poz) {
    const d = O.BUDYNKI[b.typ];
    if (d.produkcja) return `Produkcja: <b>${liczba(O.produkcjaNaGodzine(o, b, poz))}</b> ${O.NAZWY_SUROWCOW[d.produkcja.surowiec].toLowerCase()} na godzinę`;
    if (d.magazyn) return 'Pojemność: ' + Object.entries(d.magazyn).map(([s, v]) => `<b>${liczba(v * Math.pow(d.wzrostMagazynu, poz - 1))}</b> ${O.NAZWY_SUROWCOW[s].toLowerCase()}`).join(', ');
    if (b.typ === 'dlugi_dom') return `Schowek: <b>${liczba(800 + 600 * (poz - 1))}</b> na każdy surowiec, srebro <b>${liczba(200 + 100 * (poz - 1))}</b>`;
    if (b.typ === 'ognisko') return `Produkcja wszystkich budynków: <b>+${5 * poz}%</b>`;
    if (d.bonus === 'zycie') return `Życie każdego bohatera w bitwie: <b>+${poz}</b>`;
    if (d.bonus === 'atak') return `Atak każdego bohatera w bitwie: <b>+${Math.floor((poz + 2) / 3)}</b>`;
    if (d.bonus === 'hamingja') return `Dodatkowe monety Hamingji: <b>+${Math.floor((poz + 1) / 3)}</b>`;
    if (d.bonus === 'runy') return `Dodatkowe runy w rundzie: <b>+${poz >= 8 ? 2 : poz >= 3 ? 1 : 0}</b>`;
    return '';
  }

  _panel(tylkoLiczniki = false) {
    const box = $('o-sheet-body'), o = this.widok;
    if (!o) return;
    if (!this.widokPanelu) { $('o-sheet').hidden = true; return; }
    $('o-sheet').hidden = false;
    if (this.widokPanelu === 'bohaterowie') return this._panelBohaterow(box, o, tylkoLiczniki);
    if (this.widokPanelu === 'budynek') {
      const b = o.budynki.find((x) => x.id === this.wybrany);
      if (!b) { this.zamknijPanel(); return; }
      if (tylkoLiczniki && this._panelKlucz === `b${b.id}:${b.poz}:${!!b.bud}`) {
        const l = box.querySelector('[data-licznik]');
        if (l && b.bud) { l.textContent = czas(b.bud.koniec - this.teraz()); box.querySelector('.pasek-rama i').style.width = `${100 * Math.min(1, (this.teraz() - b.bud.start) / (b.bud.koniec - b.bud.start))}%`; }
        const buf = box.querySelector('[data-bufor]');
        if (buf) buf.textContent = `${liczba(b.bufor)} / ${liczba(O.pojemnoscBufora(o, b))}`;
        const btn = box.querySelector('[data-zbierz]');
        if (btn) btn.disabled = this.zajety || b.bufor < 1;
        return;
      }
      this._panelKlucz = `b${b.id}:${b.poz}:${!!b.bud}`;
      const d = O.BUDYNKI[b.typ];
      const max = d.maxPoziom || O.MAX_POZIOM;
      let h = `<div class="o-head"><img src="assets/img/osada/${b.typ}.webp" alt=""><div><h3 class="wstega">${d.nazwa}</h3><div class="o-poz">${b.poz ? `Poziom ${b.poz}${max > 1 ? ` z ${max}` : ''}` : 'W budowie'}</div></div></div>
        <p class="o-opis">${d.opis}</p>`;
      if (b.poz >= 1) { const e = this._efekt(o, b, b.poz); if (e) h += `<p class="o-ef">${e}</p>`; }
      if (d.produkcja && b.poz >= 1) {
        h += `<div class="o-row"><span>Urobek w budynku: <b data-bufor>${liczba(b.bufor)} / ${liczba(O.pojemnoscBufora(o, b))}</b></span>
          <button class="btn btn-small btn-gold" data-zbierz ${b.bufor < 1 || this.zajety ? 'disabled' : ''}>Zbierz</button></div>`;
      }
      if (b.bud) {
        const p = Math.min(1, (this.teraz() - b.bud.start) / (b.bud.koniec - b.bud.start));
        h += `<div class="o-bud"><div>Budowa poziomu ${b.bud.cel}: zostało <b data-licznik>${czas(b.bud.koniec - this.teraz())}</b></div>
          <div class="pasek-rama"><i style="width:${100 * p}%"></i></div>
          <button class="btn btn-small" data-anuluj>Anuluj (zwrot surowców)</button></div>`;
      } else if (b.poz < max) {
        const nie = O.czyMoznaUlepszyc(o, b);
        const k = O.koszt(b.typ, b.poz + 1);
        const brak = O.brakuje(o, k);
        const wolni = O.budowniczowie(o) - O.zajeci(o);
        const e = this._efekt(o, b, b.poz + 1);
        h += `<div class="o-next"><h4>Poziom ${b.poz + 1}</h4>${e ? `<p class="o-ef">${e}</p>` : ''}
          <div class="o-row"><div class="o-koszt">${this._koszt(k, o)}<span class="o-k">⏱ ${czas(O.czasBudowy(b.typ, b.poz + 1))}</span></div>
          <button class="btn btn-small btn-gold" data-ulepsz ${nie || brak.length || !wolni || this.zajety ? 'disabled' : ''}>Rozbuduj</button></div>
          ${nie ? `<p class="o-pow">${nie}</p>` : brak.length ? `<p class="o-pow">Brakuje: ${brak.join(', ')}.</p>` : !wolni ? '<p class="o-pow">Wszyscy budowniczowie są zajęci.</p>' : ''}</div>`;
      } else h += '<p class="o-ef">Najwyższy poziom.</p>';
      h += `<div class="o-row o-row-end"><button class="btn btn-small" data-przesun>Przenieś</button></div>`;
      box.innerHTML = h;
      const q = (sel) => box.querySelector(sel);
      if (q('[data-zbierz]')) q('[data-zbierz]').onclick = () => this.zbierz(b.id);
      if (q('[data-anuluj]')) q('[data-anuluj]').onclick = () => this.akcja('anuluj', { id: b.id });
      if (q('[data-ulepsz]')) q('[data-ulepsz]').onclick = () => this.akcja('ulepsz', { id: b.id }, () => { audio.play('klik'); toast(`Rozpoczęto rozbudowę: ${d.nazwa}.`); });
      q('[data-przesun]').onclick = () => { this.tryb = 'przesun'; $('o-sheet').hidden = true; this._podpowiedz(`Stuknij wolne pole, na które przenieść: ${d.nazwa}. Stuknij budynek, żeby anulować.`); };
      return;
    }
    // lista budynków: dla wybranego pola albo z przycisku Budowa
    const klucz = `${this.widokPanelu}${this.polePuste}:${JSON.stringify(o.zasoby)}:${O.zajeci(o)}:${o.budynki.length}`;
    if (tylkoLiczniki && this._panelKlucz === klucz) return;
    this._panelKlucz = klucz;
    const naPole = this.widokPanelu === 'pole';
    const wolni = O.budowniczowie(o) - O.zajeci(o);
    let h = `<div class="o-head"><div><h3 class="wstega">Nowy budynek</h3><div class="o-poz">${wolni ? `Wolni budowniczowie: ${wolni}` : 'Wszyscy budowniczowie są zajęci'}${naPole ? '' : ' · po wyborze wskażesz miejsce'}</div></div></div><div class="o-lista">`;
    const typy = O.KOLEJNOSC.filter((t) => t !== 'dlugi_dom');
    typy.sort((a, b) => (O.czyMoznaPostawic(o, a) ? 1 : 0) - (O.czyMoznaPostawic(o, b) ? 1 : 0));
    for (const typ of typy) {
      const d = O.BUDYNKI[typ];
      const nie = O.czyMoznaPostawic(o, typ);
      const k = O.koszt(typ, 1);
      const brak = O.brakuje(o, k);
      const lim = O.limitTypu(o, typ);
      h += `<div class="o-opt${nie ? ' off' : ''}"><img src="assets/img/osada/${typ}.webp" alt="">
        <div class="o-opt-txt"><b>${d.nazwa}</b> <span class="o-ile">${O.ileTypu(o, typ)}/${lim}</span>${d.grupa === 'wkrotce' ? ' <span class="o-wkr">wkrótce</span>' : ''}
        <div class="o-koszt">${this._koszt(k, o)}<span class="o-k">⏱ ${czas(O.czasBudowy(typ, 1))}</span></div>
        ${nie ? `<div class="o-pow">${nie}</div>` : ''}</div>
        <button class="btn btn-small btn-gold" data-typ="${typ}" ${nie || brak.length || !wolni || this.zajety ? 'disabled' : ''}>${naPole ? 'Postaw' : 'Wybierz'}</button></div>`;
    }
    box.innerHTML = h + '</div>';
    box.querySelectorAll('[data-typ]').forEach((btn) => {
      btn.onclick = () => {
        const typ = btn.dataset.typ;
        if (naPole) { const [x, y] = this.polePuste; this._postaw(typ, x, y); return; }
        this.typ = typ; this.tryb = 'postaw';
        $('o-sheet').hidden = true;
        this._podpowiedz(`${O.BUDYNKI[typ].nazwa}: stuknij wolne pole w osadzie. Stuknij budynek, żeby anulować.`);
      };
    });
  }

  _postaw(typ, x, y) {
    this.akcja('buduj', { typ, x, y }, (r) => {
      audio.play('klik');
      const nowy = r.osada.budynki.find((b) => b.x === x && b.y === y);
      toast(`Rozpoczęto budowę: ${O.BUDYNKI[typ].nazwa}.`);
      if (nowy) this._wybierzBudynek(nowy.id); else this.zamknijPanel();
    });
  }

  _panelBohaterow(box, o, tylkoLiczniki) {
    if (tylkoLiczniki && this._panelKlucz === 'boh') return;
    this._panelKlucz = 'boh';
    const p = O.premieBitwy(o);
    const lista = [];
    if (p.zycie) lista.push(`<b>+${p.zycie}</b> życia (Hala Wojów)`);
    if (p.atak) lista.push(`<b>+${p.atak}</b> ataku (Kuźnia)`);
    if (p.hamingja) lista.push(`<b>+${p.hamingja}</b> Hamingji (Świątynia)`);
    if (p.runy) lista.push(`<b>+${p.runy}</b> run na rundę (Chata Völvy)`);
    box.innerHTML = `<div class="o-head"><div><h3 class="wstega">Bohaterowie</h3><div class="o-poz">Na wyprawę bierzesz trzech.</div></div></div>
      <p class="o-premie">${lista.length ? 'Premie z osady w każdej wyprawie: ' + lista.join(', ') + '.' : 'Osada nie daje jeszcze premii. Postaw Halę Wojów, Kuźnię, Świątynię albo Chatę Völvy, żeby wzmocnić bohaterów w bitwie.'}</p>
      <div class="o-boh">${HERO_ORDER.map((k) => { const d = HEROES[k]; return `<div class="o-boh-k"><img src="assets/img/bohaterowie/${k}-zeton.webp" alt=""><b>${d.name}</b>
        <span>Życie ${d.hp}${p.zycie ? ` <em>+${p.zycie}</em>` : ''} · Ruch ${d.move} · Atak ${d.atk}${p.atak ? ` <em>+${p.atak}</em>` : ''}${d.range > 1 ? ` · zasięg ${d.range}` : ''}</span></div>`; }).join('')}</div>`;
  }

  // ---------- kamera i gesty ----------
  _rozmiar() {
    const r = $('o-mapa').getBoundingClientRect();
    if (!r.width) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = r.width; this.H = r.height;
    this.cv.width = Math.round(r.width * this.dpr); this.cv.height = Math.round(r.height * this.dpr);
    // wolne miejsce między górnym i dolnym interfejsem
    const gora = Math.max(0, $('o-hud-top').getBoundingClientRect().bottom - r.top);
    const dol = Math.max(0, r.bottom - $('o-hud-dol').getBoundingClientRect().top);
    const poziomo = this.W > this.H * 1.4;
    const wolneH = Math.max(120, this.H - (poziomo ? gora * 0.6 : gora + dol));
    const fit = Math.min(this.W / OBSZAR.w, wolneH / OBSZAR.h);
    const pokrycie = Math.max(this.W / SWIAT.w, this.H / SWIAT.h);
    this.minZoom = Math.max(fit * 0.85, pokrycie);
    this.maxZoom = Math.max(fit * 3.2, 1.6);
    if (!this.cam || this._fit !== fit) {
      this._fit = fit;
      const z = Math.max(fit, this.minZoom);
      // środek osady w środku wolnego miejsca
      const srY = poziomo ? (gora * 0.6) / 2 : (gora - dol) / 2;
      this.cam = { z, x: CX, y: CY - srY / z };
    }
    this._ogranicz();
  }

  _ogranicz() {
    const c = this.cam;
    c.z = Math.min(this.maxZoom, Math.max(this.minZoom, c.z));
    const hw = this.W / 2 / c.z, hh = this.H / 2 / c.z;
    c.x = hw * 2 >= SWIAT.w ? SWIAT.w / 2 : Math.min(SWIAT.w - hw, Math.max(hw, c.x));
    c.y = hh * 2 >= SWIAT.h ? SWIAT.h / 2 : Math.min(SWIAT.h - hh, Math.max(hh, c.y));
  }

  _doSwiata(px, py) { const c = this.cam; return [c.x + (px - this.W / 2) / c.z, c.y + (py - this.H / 2) / c.z]; }

  _gesty() {
    const pt = new Map();
    let ruch = 0, start = null, pinch = null;
    const xy = (e) => { const r = this.cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    this.cv.addEventListener('pointerdown', (e) => {
      this.cv.setPointerCapture(e.pointerId);
      pt.set(e.pointerId, xy(e));
      if (pt.size === 1) { ruch = 0; start = { p: xy(e), cam: { ...this.cam } }; }
      if (pt.size === 2) {
        const [a, b] = [...pt.values()];
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: this.cam.z, m: this._doSwiata((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) };
        ruch = 99;
      }
    });
    this.cv.addEventListener('pointermove', (e) => {
      if (!pt.has(e.pointerId) || !this.cam) return;
      pt.set(e.pointerId, xy(e));
      if (pt.size === 2 && pinch) {
        const [a, b] = [...pt.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        this.cam.z = pinch.z * d / pinch.d;
        this._ogranicz();
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        this.cam.x = pinch.m[0] - (mx - this.W / 2) / this.cam.z;
        this.cam.y = pinch.m[1] - (my - this.H / 2) / this.cam.z;
        this._ogranicz();
      } else if (pt.size === 1 && start) {
        const p = xy(e);
        const dx = p[0] - start.p[0], dy = p[1] - start.p[1];
        ruch = Math.max(ruch, Math.hypot(dx, dy));
        if (ruch > 8) { this.cam.x = start.cam.x - dx / this.cam.z; this.cam.y = start.cam.y - dy / this.cam.z; this._ogranicz(); }
      }
    });
    const koniec = (e) => {
      if (!pt.has(e.pointerId)) return;
      const p = xy(e);
      pt.delete(e.pointerId);
      if (pt.size < 2) pinch = null;
      if (pt.size === 0) { if (ruch <= 8 && e.type === 'pointerup') this._stuk(p[0], p[1]); start = null; }
      else { const [q] = [...pt.values()]; start = { p: q, cam: { ...this.cam } }; }
    };
    this.cv.addEventListener('pointerup', koniec);
    this.cv.addEventListener('pointercancel', koniec);
    this.cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const [px, py] = xy(e);
      const m = this._doSwiata(px, py);
      this.cam.z *= Math.exp(-e.deltaY * 0.0015);
      this._ogranicz();
      this.cam.x = m[0] - (px - this.W / 2) / this.cam.z;
      this.cam.y = m[1] - (py - this.H / 2) / this.cam.z;
      this._ogranicz();
    }, { passive: false });
  }

  _stuk(px, py) {
    if (!this.widok) return;
    audio.unlock();
    const [wx, wy] = this._doSwiata(px, py);
    // dymek z urobkiem
    for (const b of this._produkcyjne()) {
      const [x, y] = this._dymek(b);
      if (Math.hypot(wx - x, wy - y) < 30) { this.zbierz(b.id); return; }
    }
    const b = this._budynekPod(wx, wy);
    if (this.tryb === 'postaw') {
      const p = pole(wx, wy);
      const typ = this.typ;
      if (b || !p) { this.zamknijPanel(); return; }
      this.tryb = null; this.typ = null; this._podpowiedz('');
      this._postaw(typ, p[0], p[1]);
      return;
    }
    if (this.tryb === 'przesun') {
      const p = pole(wx, wy);
      const id = this.wybrany;
      this.tryb = null; this._podpowiedz('');
      if (b || !p) { this._wybierzBudynek(id); return; }
      this.akcja('przesun', { id, x: p[0], y: p[1] }, () => this._wybierzBudynek(id));
      return;
    }
    if (b) { this._wybierzBudynek(b.id); return; }
    const p = pole(wx, wy);
    if (p) this._wybierzPole(p[0], p[1]);
    else this.zamknijPanel();
  }

  _sprite(b) {
    const im = this.img[b.typ];
    const [x, y] = srodek(b.x, b.y);
    const w = TW * (SKALA[b.typ] || SKALA_DOM);
    const h = im ? w * im.height / im.width : w * 0.8;
    return { im, x: x - w / 2, y: y + TH * 0.42 - h, w, h, cx: x, cy: y };
  }

  _budynekPod(wx, wy) {
    const lista = [...this.widok.budynki].sort((a, b) => (b.x + b.y) - (a.x + a.y));
    const p = pole(wx, wy);
    if (p) { const naPolu = lista.find((b) => b.x === p[0] && b.y === p[1]); if (naPolu) return naPolu; }
    for (const b of lista) {
      const s = this._sprite(b);
      if (wx >= s.x + s.w * 0.15 && wx <= s.x + s.w * 0.85 && wy >= s.y + s.h * 0.1 && wy <= s.y + s.h) return b;
    }
    return null;
  }

  _produkcyjne() {
    return this.widok.budynki.filter((b) => {
      const p = O.BUDYNKI[b.typ].produkcja;
      return p && b.poz >= 1 && b.bufor >= Math.max(1, O.pojemnoscBufora(this.widok, b) * 0.1);
    });
  }

  _dymek(b) { const s = this._sprite(b); return [s.cx, s.y + s.h * 0.1 - 24]; }

  // ---------- rysowanie ----------
  // ---------- pora dnia: 0 = dzień, 1 = noc (według zegara urządzenia) ----------
  _noc() {
    let wym = null;
    try { wym = localStorage.getItem('midgard.pora'); } catch (e) {}
    if (wym === 'noc') return 1;
    if (wym === 'dzien') return 0;
    const d = new Date(), h = d.getHours() + d.getMinutes() / 60;
    if (h >= 8 && h < 16) return 0;
    if (h >= 16 && h < 19.5) return (h - 16) / 3.5;
    if (h >= 5.5 && h < 8) return 1 - (h - 5.5) / 2.5;
    return 1;
  }

  // ---------- warstwa stała: teren + wydeptane ścieżki (przerysowywana tylko po zmianie układu) ----------
  _warstwaStala() {
    const o = this.widok;
    const klucz = o ? o.budynki.map((b) => `${b.typ}${b.x},${b.y}`).join('|') : '';
    if (this.statyczna && klucz === this.statKlucz) return this.statyczna;
    if (!this.img.teren) return null;
    this.statKlucz = klucz;
    const cv = this.statyczna || document.createElement('canvas');
    cv.width = SWIAT.w; cv.height = SWIAT.h;
    const g = cv.getContext('2d');
    g.drawImage(this.img.teren, 0, 0, SWIAT.w, SWIAT.h);
    const dd = o && o.budynki.find((q) => q.typ === 'dlugi_dom');
    if (dd) {
      const [dx, dy] = srodek(dd.x, dd.y);
      const cel = [dx, dy + TH * 0.35];
      const sciezki = o.budynki.filter((q) => q !== dd && !['palisada', 'kamien'].includes(q.typ));
      g.lineCap = 'round'; g.lineJoin = 'round';
      // kilka przejść o malejącej szerokości = miękka, wydeptana ścieżka
      for (const [szer, kolor] of [[38, 'rgba(84,66,50,0.12)'], [28, 'rgba(90,70,52,0.18)'], [19, 'rgba(98,76,56,0.24)'], [10, 'rgba(118,94,70,0.28)']]) {
        g.lineWidth = szer; g.strokeStyle = kolor;
        for (const q of sciezki) {
          const [qx, qy] = srodek(q.x, q.y);
          const start = [qx, qy + TH * 0.3];
          const mx = (start[0] + cel[0]) / 2 + (start[1] - cel[1]) * 0.18, my = (start[1] + cel[1]) / 2 - (start[0] - cel[0]) * 0.06;
          g.beginPath(); g.moveTo(start[0], start[1]); g.quadraticCurveTo(mx, my, cel[0], cel[1]); g.stroke();
        }
      }
      // plac przed Długim Domem
      const pl = g.createRadialGradient(cel[0], cel[1] + 8, 4, cel[0], cel[1] + 8, 120);
      pl.addColorStop(0, 'rgba(110,88,66,0.32)'); pl.addColorStop(1, 'rgba(110,88,66,0)');
      g.fillStyle = pl; g.beginPath(); g.ellipse(cel[0], cel[1] + 8, 130, 62, 0, 0, Math.PI * 2); g.fill();
    }
    this.statyczna = cv;
    return cv;
  }

  // ---------- cząsteczki ----------
  _krok(dt, t) {
    // śnieg w przestrzeni ekranu
    const ile = Math.round(Math.min(220, (this.W * this.H) / 6500));
    while (this.snieg.length < ile) this.snieg.push({ x: Math.random() * this.W, y: Math.random() * this.H, r: 0.6 + Math.random() * 1.9, v: 14 + Math.random() * 30, f: Math.random() * 6.28 });
    this.snieg.length = Math.min(this.snieg.length, ile);
    for (const p of this.snieg) {
      p.y += p.v * dt; p.x += (Math.sin(t * 0.7 + p.f) * 10 + 8) * dt;
      if (p.y > this.H + 4) { p.y = -4; p.x = Math.random() * this.W; }
      if (p.x > this.W + 4) p.x = -4;
    }
    // dym z kominów (w przestrzeni świata)
    if (this.widok) {
      for (const b of this.widok.budynki) {
        if (b.poz < 1 || !DYM[b.typ]) continue;
        const s = this._sprite(b);
        for (const [fx, fy] of DYM[b.typ]) {
          if (Math.random() < dt * 2.2) this.dym.push({ x: s.x + s.w * fx + (Math.random() - 0.5) * 6, y: s.y + s.h * fy, r: 4 + Math.random() * 3, w: 0, zycie: 0, max: 3.5 + Math.random() * 2.5 });
        }
      }
    }
    for (const d of this.dym) { d.zycie += dt; d.y -= (12 + d.zycie * 4) * dt; d.x += (9 + Math.sin(t + d.max) * 4) * dt; d.r += 5.5 * dt; }
    this.dym = this.dym.filter((d) => d.zycie < d.max).slice(-260);
    // kruki
    if (t * 1000 > this.nastKruki && this.kruki.length === 0) {
      const z = Math.random() < 0.5;
      const y0 = 120 + Math.random() * 380, n = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) this.kruki.push({ x: (z ? -60 : SWIAT.w + 60) - (z ? 1 : -1) * i * (26 + Math.random() * 20), y: y0 + (Math.random() - 0.5) * 50, v: (z ? 1 : -1) * (70 + Math.random() * 18), f: Math.random() * 6.28 });
      this.nastKruki = t * 1000 + 25000 + Math.random() * 35000;
    }
    for (const k of this.kruki) { k.x += k.v * dt; k.y += Math.sin(t * 1.3 + k.f) * 6 * dt; }
    this.kruki = this.kruki.filter((k) => k.x > -200 && k.x < SWIAT.w + 200);
  }

  _poswiata(g, x, y, r, a, kolor) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${kolor},${a})`); gr.addColorStop(0.45, `rgba(${kolor},${a * 0.35})`); gr.addColorStop(1, `rgba(${kolor},0)`);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }

  // ---------- rysowanie ----------
  _rysuj(ts = performance.now()) {
    if (!this.aktywna() || !this.cam || !this.W) { this._ostatni = ts; return; }
    const dt = Math.min(0.05, Math.max(0, (ts - (this._ostatni || ts)) / 1000));
    this._ostatni = ts;
    const t = ts / 1000;
    this._krok(dt, t);
    const g = this.g, c = this.cam, noc = this._noc();
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#10151a'; g.fillRect(0, 0, this.W, this.H);
    g.setTransform(this.dpr * c.z, 0, 0, this.dpr * c.z, this.dpr * (this.W / 2 - c.x * c.z), this.dpr * (this.H / 2 - c.y * c.z));
    const stala = this._warstwaStala();
    if (stala) g.drawImage(stala, 0, 0);
    // błyski na wodzie
    g.save();
    g.beginPath(); WODA.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.clip();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const bx = 940 + ((i * 97) % 600), by = 420 + ((i * 173) % 600);
      const a = Math.max(0, Math.sin(t * 1.1 + i * 1.7)) * 0.16;
      if (a < 0.01) continue;
      g.strokeStyle = `rgba(200,225,255,${a})`; g.lineWidth = 2;
      g.beginPath(); g.moveTo(bx - 14, by); g.quadraticCurveTo(bx, by - 3 + Math.sin(t * 2 + i) * 2, bx + 14, by); g.stroke();
    }
    g.restore();
    const o = this.widok;
    const romb = (x, y, sk = 1) => { const [cx, cy] = srodek(x, y); g.beginPath(); g.moveTo(cx, cy - TH / 2 * sk); g.lineTo(cx + TW / 2 * sk, cy); g.lineTo(cx, cy + TH / 2 * sk); g.lineTo(cx - TW / 2 * sk, cy); g.closePath(); };
    // siatka tylko przy wybieraniu miejsca
    const siatka = this.polePuste || this.tryb === 'przesun' || this.tryb === 'postaw';
    if (siatka) {
      g.lineWidth = 1.5;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const zaj = o && O.zajetePole(o, x, y);
        romb(x, y, 0.94);
        if (!zaj && (this.tryb === 'postaw' || this.tryb === 'przesun')) { g.fillStyle = `rgba(242,211,138,${0.08 + 0.05 * Math.sin(t * 3 + x + y)})`; g.fill(); }
        g.strokeStyle = zaj ? 'rgba(255,255,255,0.06)' : 'rgba(255,240,200,0.35)'; g.stroke();
      }
    }
    if (this.polePuste) {
      romb(this.polePuste[0], this.polePuste[1], 0.96);
      g.fillStyle = `rgba(242,211,138,${0.25 + 0.12 * Math.sin(t * 4)})`; g.fill();
      g.lineWidth = 2.5; g.strokeStyle = '#f2d38a'; g.stroke();
    }
    if (!o) return;
    const lista = [...o.budynki].sort((a, b) => (a.x + a.y) - (b.x + b.y) || a.x - b.x);
    // cienie pod budynkami (światło z lewej góry)
    for (const b of lista) {
      const s = this._sprite(b);
      const sx = s.cx + s.w * 0.06, sy = s.cy + TH * 0.25;
      const gr = g.createRadialGradient(sx, sy, 2, sx, sy, s.w * 0.5);
      gr.addColorStop(0, 'rgba(15,20,30,0.42)'); gr.addColorStop(1, 'rgba(15,20,30,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(sx, sy, s.w * 0.52, s.w * 0.22, 0, 0, Math.PI * 2); g.fill();
    }
    for (const b of lista) {
      const s = this._sprite(b);
      if (b.id === this.wybrany) {
        romb(b.x, b.y, 1.05);
        g.fillStyle = 'rgba(242,211,138,0.22)'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = '#f2d38a'; g.stroke();
      }
      if (s.im) {
        g.save();
        if (b.poz === 0) g.globalAlpha = 0.55;
        if (b.id === this.wybrany) { g.shadowColor = 'rgba(255,220,140,0.9)'; g.shadowBlur = 22; }
        g.drawImage(s.im, s.x, s.y, s.w, s.h);
        g.restore();
      }
    }
    // dym (pod nocną mgłą, nad budynkami)
    for (const d of this.dym) {
      const k = d.zycie / d.max;
      const a = Math.sin(Math.PI * Math.min(1, k * 1.3)) * 0.28 * (1 - k);
      g.fillStyle = `rgba(${200 - noc * 110},${200 - noc * 105},${205 - noc * 95},${a})`;
      g.beginPath(); g.arc(d.x, d.y, d.r, 0, Math.PI * 2); g.fill();
    }
    // pora dnia
    if (noc > 0.01) {
      g.save();
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = `rgba(${Math.round(255 - noc * 165)},${Math.round(255 - noc * 140)},${Math.round(255 - noc * 85)},1)`;
      g.fillRect(0, 0, this.W, this.H);
      const zmierzch = Math.max(0, 1 - Math.abs(noc - 0.45) * 2.6);
      if (zmierzch > 0) { g.globalCompositeOperation = 'soft-light'; g.fillStyle = `rgba(255,140,60,${0.35 * zmierzch})`; g.fillRect(0, 0, this.W, this.H); }
      g.restore();
    }
    // ogień, pochodnie i okna (mocniejsze nocą)
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const b of lista) {
      if (b.poz < 1) continue;
      const s = this._sprite(b);
      for (const [fx, fy, moc] of OGIEN[b.typ] || []) {
        const mig = 0.82 + 0.18 * Math.sin(t * 9 + fx * 13) * Math.sin(t * 5.3 + fy * 7);
        const a = (0.16 + 0.55 * noc) * moc * mig;
        this._poswiata(g, s.x + s.w * fx, s.y + s.h * fy, s.w * (0.18 + 0.12 * moc) * (0.9 + 0.1 * mig), a, '255,150,60');
      }
      if (noc > 0.3 && !['palisada', 'kamien', 'ognisko'].includes(b.typ)) this._poswiata(g, s.cx, s.y + s.h * 0.55, s.w * 0.28, 0.16 * noc, '255,170,80');
    }
    // runiczny kamień świeci na niebiesko
    for (const b of lista) if (b.typ === 'kamien' && b.poz >= 1) { const s = this._sprite(b); this._poswiata(g, s.cx, s.y + s.h * 0.45, s.w * 0.45, (0.18 + 0.25 * noc) * (0.8 + 0.2 * Math.sin(t * 1.5)), '120,200,255'); }
    g.restore();
    // pasek budowy i tarcze poziomu
    for (const b of lista) {
      const s = this._sprite(b);
      if (b.bud) {
        const p = Math.min(1, (this.teraz() - b.bud.start) / (b.bud.koniec - b.bud.start));
        const bw = TW * 0.9, bx = s.cx - bw / 2, by = s.cy + TH * 0.34;
        g.fillStyle = 'rgba(8,6,5,0.9)'; this._pigulka(g, bx - 3, by - 3, bw + 6, 16); g.fill();
        g.strokeStyle = '#8a6a2a'; g.lineWidth = 1.5; this._pigulka(g, bx - 3, by - 3, bw + 6, 16); g.stroke();
        g.fillStyle = '#e1b85c'; this._pigulka(g, bx, by, Math.max(10, bw * p), 10); g.fill();
        g.font = '700 16px Cinzel, serif'; g.textAlign = 'center'; g.textBaseline = 'bottom';
        g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.9)';
        const txt = czas(b.bud.koniec - this.teraz());
        g.strokeText(txt, s.cx, by - 5); g.fillStyle = '#fff3d6'; g.fillText(txt, s.cx, by - 5);
      }
      if (b.poz >= 1 && (O.BUDYNKI[b.typ].maxPoziom || 10) > 1) {
        const tw = 26, th = 31, lx = s.cx + s.w * 0.3, ly = s.cy + TH * 0.02;
        const tim = this.img['ui-tarcza'];
        if (tim) g.drawImage(tim, lx - tw / 2, ly - th / 2, tw, th);
        g.font = '700 14px Cinzel, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.strokeText(String(b.poz), lx, ly - 2);
        g.fillStyle = '#fff1d0'; g.fillText(String(b.poz), lx, ly - 2);
      }
    }
    // dymki z urobkiem
    const med = this.img['ui-medalion-maly'];
    for (const b of this._produkcyjne()) {
      const [x, y0] = this._dymek(b);
      const y = y0 + Math.sin(t * 2.4 + b.id) * 3;
      const pelny = b.bufor >= O.pojemnoscBufora(o, b) - 0.5;
      if (pelny) { g.save(); g.globalCompositeOperation = 'lighter'; this._poswiata(g, x, y, 40, 0.35 + 0.15 * Math.sin(t * 5), '255,70,50'); g.restore(); }
      g.beginPath(); g.arc(x, y, 19, 0, Math.PI * 2); g.fillStyle = 'rgba(18,14,10,0.92)'; g.fill();
      if (med) g.drawImage(med, x - 25, y - 25, 50, 50);
      const im = this.img[IKONA[O.BUDYNKI[b.typ].produkcja.surowiec]];
      if (im) g.drawImage(im, x - 15, y - 15, 30, 30);
    }
    // kruki
    g.strokeStyle = 'rgba(12,12,16,0.85)'; g.lineWidth = 2.2; g.lineCap = 'round';
    for (const k of this.kruki) {
      const mach = Math.sin(t * 9 + k.f) * 5, kier = Math.sign(k.v);
      g.beginPath(); g.moveTo(k.x - 9, k.y - mach); g.quadraticCurveTo(k.x - 4, k.y - 3, k.x, k.y); g.quadraticCurveTo(k.x + 4, k.y - 3, k.x + 9, k.y - mach); g.stroke();
      g.beginPath(); g.moveTo(k.x, k.y); g.lineTo(k.x + kier * 3, k.y + 1); g.stroke();
    }
    // liczby po zebraniu
    const now = performance.now();
    this.fx = this.fx.filter((f) => now - f.t0 < 1400);
    for (const f of this.fx) {
      const k = (now - f.t0) / 1400;
      g.globalAlpha = 1 - k;
      g.font = '700 28px Cinzel, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,0.85)';
      g.strokeText(f.tekst, f.x, f.y - k * 50); g.fillStyle = '#f2d38a'; g.fillText(f.tekst, f.x, f.y - k * 50);
      g.globalAlpha = 1;
    }
    // śnieg na wierzchu (ekran)
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = `rgba(240,246,255,${0.75 - noc * 0.25})`;
    for (const p of this.snieg) { g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill(); }
  }

  _pigulka(g, x, y, w, h) { const r = h / 2; g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2); g.lineTo(x + r, y + h); g.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5); g.closePath(); }
}

export const osada = new Osada();

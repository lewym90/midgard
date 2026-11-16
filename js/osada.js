// Ekran osady: mapa izometryczna, budowanie, ulepszanie, zbieranie surowców.
// Stan prawdziwy jest na serwerze; tu tylko podgląd na żywo z tych samych zasad (serwer/osada-dane.js).
import * as O from '../serwer/osada-dane.js';
import { konto } from './konto.js';
import { toast } from './konto-ui.js';
import { audio } from './audio.js';

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
const SKALA = { dlugi_dom: 1.6, palisada: 0.95, kamien: 0.85, wieza: 0.95, brama: 1.15, stocznia: 1.3, farma: 1.25, ognisko: 1.0 };

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
  }

  // ---------- start ----------
  init(onWyprawa, onWyjdz) {
    this.onWyprawa = onWyprawa;
    this.cv = $('o-canvas');
    this.g = this.cv.getContext('2d');
    $('o-wroc').onclick = onWyjdz;
    $('o-wyprawa').onclick = () => onWyprawa();
    $('o-zbierz').onclick = () => this.zbierzWszystko();
    $('o-sheet-zamknij').onclick = () => this.zamknijPanel();
    this._wczytajObrazy();
    this._gesty();
    new ResizeObserver(() => this._rozmiar()).observe($('o-mapa'));
    const petla = () => { this._rysuj(); requestAnimationFrame(petla); };
    requestAnimationFrame(petla);
    setInterval(() => this._tik(), 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && this.aktywna()) this.pobierz(); });
  }

  aktywna() { return $('screen-osada').classList.contains('active'); }

  _wczytajObrazy() {
    const nazwy = [...Object.keys(O.BUDYNKI), 'teren', 'ik-drewno', 'ik-zelazo', 'ik-zywnosc', 'ik-srebro', 'ik-slawa', 'ik-budowniczy'];
    for (const n of nazwy) {
      const im = new Image();
      im.onload = () => { this.img[n] = im; };
      im.src = `assets/img/osada/${n}.webp`;
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
      return `<div class="o-zas${pelny ? ' pelny' : ''}" title="${O.NAZWY_SUROWCOW[s]}"><img src="${ikonaUrl(s)}" alt=""><div><b>${liczba(o.zasoby[s])}</b><small>/ ${liczba(cap[s])}</small></div></div>`;
    }).join('') +
      `<div class="o-zas" title="Sława"><img src="${ikonaUrl('ik-slawa')}" alt=""><div><b>${liczba(o.slawa)}</b><small>sława</small></div></div>` +
      `<div class="o-zas${wolni ? '' : ' pelny'}" title="Wolni budowniczowie"><img src="${ikonaUrl('ik-budowniczy')}" alt=""><div><b>${wolni}/${O.budowniczowie(o)}</b><small>budowniczy</small></div></div>`;
    const doZebrania = o.budynki.some((b) => O.BUDYNKI[b.typ].produkcja && b.bufor >= 1);
    $('o-zbierz').disabled = !doZebrania;
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
  zamknijPanel() { $('o-sheet').hidden = true; this.wybrany = null; this.polePuste = null; this.tryb = null; this._podpowiedz(''); }

  _podpowiedz(t) { const el = $('o-podp'); el.textContent = t; el.hidden = !t; }

  _wybierzBudynek(id) { this.wybrany = id; this.polePuste = null; this.tryb = null; this._podpowiedz(''); this._panel(); }
  _wybierzPole(x, y) { this.polePuste = [x, y]; this.wybrany = null; this._podpowiedz(''); this._panel(); }

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
    if (this.wybrany == null && !this.polePuste) { $('o-sheet').hidden = true; return; }
    $('o-sheet').hidden = false;
    if (this.wybrany != null) {
      const b = o.budynki.find((x) => x.id === this.wybrany);
      if (!b) { this.zamknijPanel(); return; }
      if (tylkoLiczniki && this._panelKlucz === `b${b.id}:${b.poz}:${!!b.bud}`) {
        const l = box.querySelector('[data-licznik]');
        if (l && b.bud) { l.textContent = czas(b.bud.koniec - this.teraz()); box.querySelector('.o-prog i').style.width = `${100 * Math.min(1, (this.teraz() - b.bud.start) / (b.bud.koniec - b.bud.start))}%`; }
        const buf = box.querySelector('[data-bufor]');
        if (buf) buf.textContent = `${liczba(b.bufor)} / ${liczba(O.pojemnoscBufora(o, b))}`;
        const btn = box.querySelector('[data-zbierz]');
        if (btn) btn.disabled = this.zajety || b.bufor < 1;
        return;
      }
      this._panelKlucz = `b${b.id}:${b.poz}:${!!b.bud}`;
      const d = O.BUDYNKI[b.typ];
      const max = d.maxPoziom || O.MAX_POZIOM;
      let h = `<div class="o-head"><img src="assets/img/osada/${b.typ}.webp" alt=""><div><h3>${d.nazwa}</h3><div class="o-poz">${b.poz ? `Poziom ${b.poz}${max > 1 ? ` z ${max}` : ''}` : 'W budowie'}</div></div></div>
        <p class="o-opis">${d.opis}</p>`;
      if (b.poz >= 1) { const e = this._efekt(o, b, b.poz); if (e) h += `<p class="o-ef">${e}</p>`; }
      if (d.produkcja && b.poz >= 1) {
        h += `<div class="o-row"><span>Urobek w budynku: <b data-bufor>${liczba(b.bufor)} / ${liczba(O.pojemnoscBufora(o, b))}</b></span>
          <button class="btn btn-small btn-gold" data-zbierz ${b.bufor < 1 || this.zajety ? 'disabled' : ''}>Zbierz</button></div>`;
      }
      if (b.bud) {
        const p = Math.min(1, (this.teraz() - b.bud.start) / (b.bud.koniec - b.bud.start));
        h += `<div class="o-bud"><div>Budowa poziomu ${b.bud.cel}: zostało <b data-licznik>${czas(b.bud.koniec - this.teraz())}</b></div>
          <div class="o-prog"><i style="width:${100 * p}%"></i></div>
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
      const q = (s) => box.querySelector(s);
      if (q('[data-zbierz]')) q('[data-zbierz]').onclick = () => this.zbierz(b.id);
      if (q('[data-anuluj]')) q('[data-anuluj]').onclick = () => this.akcja('anuluj', { id: b.id });
      if (q('[data-ulepsz]')) q('[data-ulepsz]').onclick = () => this.akcja('ulepsz', { id: b.id }, () => { audio.play('klik'); toast(`Rozpoczęto rozbudowę: ${d.nazwa}.`); });
      q('[data-przesun]').onclick = () => { this.tryb = 'przesun'; $('o-sheet').hidden = true; this._podpowiedz(`Stuknij wolne pole, na które przenieść: ${d.nazwa}. Stuknij budynek, żeby anulować.`); };
      return;
    }
    // menu budowy dla pustego pola
    if (tylkoLiczniki && this._panelKlucz === `p${this.polePuste}:${JSON.stringify(o.zasoby)}:${O.zajeci(o)}`) return;
    this._panelKlucz = `p${this.polePuste}:${JSON.stringify(o.zasoby)}:${O.zajeci(o)}`;
    const wolni = O.budowniczowie(o) - O.zajeci(o);
    let h = `<div class="o-head"><div><h3>Nowy budynek</h3><div class="o-poz">${wolni ? `Wolni budowniczowie: ${wolni}` : 'Wszyscy budowniczowie są zajęci'}</div></div></div><div class="o-lista">`;
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
        <button class="btn btn-small btn-gold" data-typ="${typ}" ${nie || brak.length || !wolni || this.zajety ? 'disabled' : ''}>Postaw</button></div>`;
    }
    box.innerHTML = h + '</div>';
    box.querySelectorAll('[data-typ]').forEach((btn) => {
      btn.onclick = () => {
        const [x, y] = this.polePuste;
        const typ = btn.dataset.typ;
        this.akcja('buduj', { typ, x, y }, (r) => {
          audio.play('klik');
          const nowy = r.osada.budynki.find((b) => b.x === x && b.y === y);
          toast(`Rozpoczęto budowę: ${O.BUDYNKI[typ].nazwa}.`);
          if (nowy) this._wybierzBudynek(nowy.id); else this.zamknijPanel();
        });
      };
    });
  }

  // ---------- kamera i gesty ----------
  _rozmiar() {
    const r = $('o-mapa').getBoundingClientRect();
    if (!r.width) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = r.width; this.H = r.height;
    this.cv.width = Math.round(r.width * this.dpr); this.cv.height = Math.round(r.height * this.dpr);
    const fit = Math.min(this.W / OBSZAR.w, this.H / OBSZAR.h);
    const pokrycie = Math.max(this.W / SWIAT.w, this.H / SWIAT.h);
    this.minZoom = Math.max(fit * 0.85, pokrycie); // zawsze bez pustych pasów
    this.maxZoom = Math.max(fit * 3.2, 1.6);
    if (!this.cam || this._fit !== fit) {
      this._fit = fit;
      // na wąskim ekranie trochę bliżej, ale cała osada w zasięgu jednego przesunięcia
      this.cam = { z: Math.max(fit, this.minZoom), x: CX, y: CY };
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
    const w = TW * (SKALA[b.typ] || 1.12);
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

  _dymek(b) { const s = this._sprite(b); return [s.cx, s.y + s.h * 0.12 - 22]; }

  // ---------- rysowanie ----------
  _rysuj() {
    if (!this.aktywna() || !this.cam || !this.W) return;
    const g = this.g, c = this.cam, t = performance.now() / 1000;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#10151a'; g.fillRect(0, 0, this.W, this.H);
    g.setTransform(this.dpr * c.z, 0, 0, this.dpr * c.z, this.dpr * (this.W / 2 - c.x * c.z), this.dpr * (this.H / 2 - c.y * c.z));
    if (this.img.teren) g.drawImage(this.img.teren, 0, 0, SWIAT.w, SWIAT.h);
    const o = this.widok;
    // siatka
    const romb = (x, y, s = 1) => { const [cx, cy] = srodek(x, y); g.beginPath(); g.moveTo(cx, cy - TH / 2 * s); g.lineTo(cx + TW / 2 * s, cy); g.lineTo(cx, cy + TH / 2 * s); g.lineTo(cx - TW / 2 * s, cy); g.closePath(); };
    const pokazSiatke = this.polePuste || this.tryb === 'przesun';
    g.lineWidth = 1.2 / c.z * this.dpr;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      romb(x, y, 0.96);
      g.strokeStyle = pokazSiatke ? 'rgba(255,240,200,0.32)' : 'rgba(255,240,200,0.10)';
      g.stroke();
    }
    if (this.polePuste) {
      romb(this.polePuste[0], this.polePuste[1], 0.96);
      g.fillStyle = `rgba(242,211,138,${0.25 + 0.12 * Math.sin(t * 4)})`; g.fill();
      g.lineWidth = 2.5; g.strokeStyle = '#f2d38a'; g.stroke();
    }
    if (!o) return;
    // budynki od tyłu do przodu
    const lista = [...o.budynki].sort((a, b) => (a.x + a.y) - (b.x + b.y) || a.x - b.x);
    for (const b of lista) {
      const s = this._sprite(b);
      if (b.id === this.wybrany) {
        romb(b.x, b.y, 1.0);
        g.fillStyle = 'rgba(242,211,138,0.25)'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = '#f2d38a'; g.stroke();
      }
      if (s.im) {
        g.save();
        if (b.poz === 0) g.globalAlpha = 0.5;
        if (b.id === this.wybrany) { g.shadowColor = 'rgba(255,220,140,0.9)'; g.shadowBlur = 18; }
        g.drawImage(s.im, s.x, s.y, s.w, s.h);
        g.restore();
      }
      // pasek budowy
      if (b.bud) {
        const p = Math.min(1, (this.teraz() - b.bud.start) / (b.bud.koniec - b.bud.start));
        const bw = TW * 0.8, bx = s.cx - bw / 2, by = s.cy + TH * 0.32;
        g.fillStyle = 'rgba(8,6,5,0.85)'; this._pigulka(g, bx - 2, by - 2, bw + 4, 14); g.fill();
        g.fillStyle = '#d4a64a'; this._pigulka(g, bx, by, Math.max(10, bw * p), 10); g.fill();
        g.font = '700 15px Cinzel, serif'; g.textAlign = 'center'; g.textBaseline = 'bottom';
        g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.9)';
        const txt = czas(b.bud.koniec - this.teraz());
        g.strokeText(txt, s.cx, by - 3); g.fillStyle = '#fff3d6'; g.fillText(txt, s.cx, by - 3);
      }
      // poziom
      if (b.poz >= 1 && (O.BUDYNKI[b.typ].maxPoziom || 10) > 1) {
        const lx = s.cx + TW * 0.36, ly = s.cy + TH * 0.12;
        g.beginPath(); g.arc(lx, ly, 11, 0, Math.PI * 2);
        g.fillStyle = '#1b1410'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#d4a64a'; g.stroke();
        g.font = '700 13px Cinzel, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#f6e7c1';
        g.fillText(String(b.poz), lx, ly + 1);
      }
    }
    // dymki z urobkiem
    for (const b of this._produkcyjne()) {
      const [x, y0] = this._dymek(b);
      const y = y0 + Math.sin(t * 2.4 + b.id) * 3;
      const pelny = b.bufor >= O.pojemnoscBufora(o, b) - 0.5;
      g.beginPath(); g.arc(x, y, 22, 0, Math.PI * 2);
      g.fillStyle = 'rgba(246,234,208,0.95)'; g.fill();
      g.lineWidth = 3; g.strokeStyle = pelny ? '#d64a3c' : '#d4a64a'; g.stroke();
      g.beginPath(); g.moveTo(x - 7, y + 19); g.lineTo(x, y + 30); g.lineTo(x + 7, y + 19); g.fillStyle = 'rgba(246,234,208,0.95)'; g.fill();
      const im = this.img[IKONA[O.BUDYNKI[b.typ].produkcja.surowiec]];
      if (im) g.drawImage(im, x - 15, y - 15, 30, 30);
    }
    // efekty: liczby po zebraniu
    const now = performance.now();
    this.fx = this.fx.filter((f) => now - f.t0 < 1400);
    for (const f of this.fx) {
      const k = (now - f.t0) / 1400;
      g.globalAlpha = 1 - k;
      g.font = '700 26px Cinzel, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,0.85)';
      g.strokeText(f.tekst, f.x, f.y - k * 50); g.fillStyle = '#f2d38a'; g.fillText(f.tekst, f.x, f.y - k * 50);
      g.globalAlpha = 1;
    }
  }

  _pigulka(g, x, y, w, h) { const r = h / 2; g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2); g.lineTo(x + r, y + h); g.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5); g.closePath(); }
}

export const osada = new Osada();

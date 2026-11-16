// Konto gracza: logowanie, urządzenia, synchronizacja zapisu z serwerem.
const DOMYSLNY = 'https://188-68-247-201.sslip.io/midgard-api';
const lokalny = ['localhost', '127.0.0.1'].includes(location.hostname);
export const API = localStorage.getItem('midgard.api') || (lokalny ? 'http://127.0.0.1:18900/midgard-api' : DOMYSLNY);

const K_TOKEN = 'midgard.token', K_GRACZ = 'midgard.gracz', K_GOSC = 'midgard.gosc';
const kStan = (nick) => 'midgard.stan.' + (nick ? nick.toLowerCase() : 'gosc');

export class BladApi extends Error {
  constructor(kod, msg, extra = {}) { super(msg); this.kod = kod; Object.assign(this, extra); }
}

function czytaj(k, d = null) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
function pisz(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

export function nazwaUrzadzenia() {
  const ua = navigator.userAgent;
  const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const sys = /iPhone/.test(ua) ? 'iPhone' : ipad ? 'iPad' : /Android/.test(ua) ? 'Android' : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Urządzenie';
  const prz = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  const app = window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone;
  return `${sys}${prz ? ' · ' + prz : ''}${app ? ' (aplikacja)' : ''}`;
}

class Konto {
  constructor() {
    this.token = czytaj(K_TOKEN);
    this.gracz = czytaj(K_GRACZ);
    this.gosc = !!czytaj(K_GOSC) && !this.token;
    this.stan = czytaj(kStan(this.gracz && this.gracz.nick), { rev: 0, dane: null, brudny: false });
    this.status = 'nieznany'; // 'zapisane' | 'czeka' | 'offline' | 'blad'
    this.onZmiana = null;       // wołane, gdy z serwera przyjdzie nowszy stan
    this.onStatus = null;
    this._timer = null;
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.wyslij(true); });
    window.addEventListener('online', () => this.wyslij());
  }

  get zalogowany() { return !!this.token; }
  get nick() { return this.gracz ? this.gracz.nick : null; }

  async api(metoda, sciezka, body, { bezTokenu = false, keepalive = false } = {}) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 12000);
    let r;
    try {
      r = await fetch(API + sciezka, {
        method: metoda, signal: ctl.signal, keepalive,
        headers: { 'Content-Type': 'application/json', ...(this.token && !bezTokenu ? { Authorization: 'Bearer ' + this.token } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new BladApi(0, 'Brak połączenia z serwerem gry.');
    } finally { clearTimeout(t); }
    let j = {};
    try { j = await r.json(); } catch (e) {}
    if (r.status === 401 && !bezTokenu) this._wylogujLokalnie();
    if (!r.ok) throw new BladApi(r.status, j.blad || 'Błąd serwera.', j);
    return j;
  }

  _ustaw(token, gracz) {
    this.token = token; this.gracz = gracz; this.gosc = false;
    pisz(K_TOKEN, token); pisz(K_GRACZ, gracz); pisz(K_GOSC, null);
    this.stan = czytaj(kStan(gracz.nick), { rev: 0, dane: null, brudny: false });
  }

  _wylogujLokalnie() {
    this.token = null; pisz(K_TOKEN, null);
    if (this.onWylogowanie) this.onWylogowanie();
  }

  async zaloguj(nick, haslo) {
    const j = await this.api('POST', '/logowanie', { nick, haslo, urzadzenie: nazwaUrzadzenia() }, { bezTokenu: true });
    this._ustaw(j.token, j.gracz);
    await this.pobierz();
    return j.gracz;
  }

  async zarejestruj(zaproszenie, nick, haslo) {
    const j = await this.api('POST', '/rejestracja', { zaproszenie, nick, haslo, urzadzenie: nazwaUrzadzenia() }, { bezTokenu: true });
    this._ustaw(j.token, j.gracz);
    await this.pobierz();
    return j.gracz;
  }

  async wyloguj() {
    await this.wyslij(true).catch(() => {});
    try { await this.api('POST', '/wyloguj'); } catch (e) {}
    this.token = null; this.gracz = null;
    pisz(K_TOKEN, null); pisz(K_GRACZ, null);
    this.stan = { rev: 0, dane: null, brudny: false };
  }

  grajJakoGosc() {
    this.gosc = true; pisz(K_GOSC, true);
    this.stan = czytaj(kStan(null), { rev: 0, dane: null, brudny: false });
  }

  ja() { return this.api('GET', '/ja').then((j) => { this.gracz = j.gracz; pisz(K_GRACZ, j.gracz); return j; }); }
  usunUrzadzenie(id) { return this.api('DELETE', '/urzadzenia/' + id); }
  zmienHaslo(stare, nowe) { return this.api('POST', '/haslo', { stare, nowe }); }
  adminZaproszenie(opis) { return this.api('POST', '/admin/zaproszenia', { opis }); }
  adminZaproszenia() { return this.api('GET', '/admin/zaproszenia'); }
  adminUsunZaproszenie(k) { return this.api('DELETE', '/admin/zaproszenia/' + encodeURIComponent(k)); }
  adminGracze() { return this.api('GET', '/admin/gracze'); }
  adminResetHasla(nick) { return this.api('POST', '/admin/reset-hasla', { nick }); }

  // ---------- dane gry ----------
  dane() { return this.stan.dane || {}; }

  zapisz(dane) {
    this.stan.dane = dane;
    this.stan.brudny = true;
    this._zapiszLokalnie();
    if (!this.token) return;
    this._status('czeka');
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.wyslij(), 1500);
  }

  _zapiszLokalnie() { pisz(kStan(this.nick), this.stan); }
  _status(s) { this.status = s; if (this.onStatus) this.onStatus(s); }

  async wyslij(teraz = false) {
    clearTimeout(this._timer);
    if (!this.token || !this.stan.brudny) return;
    try {
      const j = await this.api('PUT', '/stan', { rev: this.stan.rev, dane: this.stan.dane }, { keepalive: teraz });
      this.stan.rev = j.rev; this.stan.brudny = false;
      this._zapiszLokalnie(); this._status('zapisane');
    } catch (e) {
      if (e.kod === 409) {
        // inne urządzenie zapisało nowszy stan: przyjmujemy go
        this.stan = { rev: e.rev, dane: e.dane, brudny: false };
        this._zapiszLokalnie(); this._status('zapisane');
        if (this.onZmiana) this.onZmiana('konflikt');
      } else this._status(e.kod === 0 ? 'offline' : 'blad');
    }
  }

  // Pobiera stan z serwera. Zwraca true, jeśli dane się zmieniły.
  async pobierz() {
    if (!this.token) return false;
    try {
      const j = await this.api('GET', '/stan');
      if (this.stan.brudny && j.rev === this.stan.rev) { await this.wyslij(); return false; }
      if (j.rev !== this.stan.rev || (j.rev === 0 && this.stan.dane == null)) {
        const zmiana = j.rev !== this.stan.rev;
        this.stan = { rev: j.rev, dane: j.dane, brudny: false };
        this._zapiszLokalnie(); this._status('zapisane');
        return zmiana;
      }
      this._status('zapisane');
      return false;
    } catch (e) { this._status(e.kod === 0 ? 'offline' : 'blad'); return false; }
  }
}

export const konto = new Konto();

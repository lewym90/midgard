// Dźwięk: muzyka (strumieniowo, z przenikaniem) i efekty (krótkie bufory) przez Web Audio.
// Brak pliku = cisza, bez błędów. Lista dostępnych plików: assets/audio/lista.json.
const SFX = {
  krok: 'sfx/krok.mp3', cios: 'sfx/cios.mp3', strzal: 'sfx/strzal.mp3', tarcza: 'sfx/tarcza.mp3',
  smierc: 'sfx/smierc-draugra.mp3', bohater_pada: 'sfx/bohater-pada.mp3', przyzwanie: 'sfx/przyzwanie.mp3',
  runy: 'sfx/rzut-run.mp3', runa: 'sfx/runa.mp3', rog: 'sfx/rog.mp3', mroz: 'sfx/mroz.mp3', klik: 'sfx/klik.mp3',
  leczenie: 'sfx/leczenie.mp3', nic: 'sfx/nic.mp3',
};
const MUSIC = {
  hymn: 'muzyka/hymn.mp3', 'bitwa-1': 'muzyka/bitwa-1.mp3', 'bitwa-2': 'muzyka/bitwa-2.mp3', 'bitwa-3': 'muzyka/bitwa-3.mp3',
  boss: 'muzyka/boss.mp3', zwyciestwo: 'muzyka/zwyciestwo.mp3', porazka: 'muzyka/porazka.mp3',
};
const PREF = 'midgard.dzwiek';
const FADE = 2.2;
const MUSIC_VOL = 0.75, SFX_VOL = 0.9;

class AudioMgr {
  constructor() {
    this.ctx = null;
    this.have = null; // zbiór dostępnych plików
    this.buffers = {};
    this.tracks = {}; // klucz → { el, gain }
    this.wanted = null;
    this.prefs = { music: true, sfx: true };
    try { Object.assign(this.prefs, JSON.parse(localStorage.getItem(PREF)) || {}); } catch (e) {}
    this.ready = fetch('assets/audio/lista.json').then((r) => (r.ok ? r.json() : [])).catch(() => []).then((l) => { this.have = new Set(l); });
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend(); else this.ctx.resume();
    });
  }

  savePrefs() { try { localStorage.setItem(PREF, JSON.stringify(this.prefs)); } catch (e) {} }

  // Wywoływać w obsłudze dotknięcia/kliknięcia (wymóg przeglądarek, zwłaszcza iOS).
  unlock() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.connect(c.destination);
    this.musicBus = c.createGain(); this.musicBus.gain.value = this.prefs.music ? MUSIC_VOL : 0; this.musicBus.connect(this.master);
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = this.prefs.sfx ? SFX_VOL : 0; this.sfxBus.connect(this.master);
    const make = () => {
      for (const [k, f] of Object.entries(MUSIC)) {
        if (!this.have.has(f) || this.tracks[k]) continue;
        const el = new Audio();
        el.src = 'assets/audio/' + f;
        el.preload = 'auto';
        el.loop = !['zwyciestwo', 'porazka'].includes(k);
        el.setAttribute('playsinline', '');
        let gain = null;
        try {
          const src = c.createMediaElementSource(el);
          gain = c.createGain(); gain.gain.value = 0; src.connect(gain); gain.connect(this.musicBus);
        } catch (e) { gain = null; }
        this.tracks[k] = { el, gain };
        // krótkie "odblokowanie" każdego utworu w tym samym dotknięciu (iOS)
        const p = el.play();
        if (p && p.then) p.then(() => { if (this.wanted !== k) el.pause(); }).catch(() => {});
      }
      for (const [k, f] of Object.entries(SFX)) if (this.have.has(f)) this._loadSfx(k, f);
      if (this.wanted) this.music(this.wanted, true);
    };
    if (this.have) make(); else this.ready.then(make);
  }

  async _loadSfx(k, f) {
    try {
      const r = await fetch('assets/audio/' + f);
      if (!r.ok) return;
      this.buffers[k] = await this.ctx.decodeAudioData(await r.arrayBuffer());
    } catch (e) { /* brak pliku — cisza */ }
  }

  play(k, vol = 1) {
    if (!this.ctx || !this.prefs.sfx || !this.buffers[k]) return;
    const src = this.ctx.createBufferSource(); src.buffer = this.buffers[k];
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(g); g.connect(this.sfxBus); src.start();
  }

  // Przenikanie do wybranego utworu (null = cisza). Zapętlony utwór wraca tam, gdzie przerwał.
  music(k, force = false) {
    if (k && this.have && !this.have.has(MUSIC[k])) k = this._fallback(k);
    if (k === this.wanted && !force) return;
    this.wanted = k;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const [key, t] of Object.entries(this.tracks)) {
      if (!t.gain) continue;
      const g = t.gain.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      clearTimeout(t.stop);
      if (key === k) {
        if (!t.el.loop) t.el.currentTime = 0;
        if (t.el.paused) t.el.play().catch(() => {});
        g.linearRampToValueAtTime(1, now + (t.el.loop ? FADE : 0.3));
      } else {
        g.linearRampToValueAtTime(0, now + FADE);
        t.stop = setTimeout(() => { if (this.wanted !== key) t.el.pause(); }, FADE * 1000 + 150);
      }
    }
  }

  _fallback(k) {
    if (!this.have) return k;
    const order = ['bitwa-3', 'bitwa-2', 'bitwa-1'];
    if (k === 'boss') return order.find((x) => this.have.has(MUSIC[x])) || null;
    if (!order.includes(k)) return null;
    const i = order.indexOf(k);
    return order.slice(i).concat(order.slice(0, i).reverse()).find((x) => this.have.has(MUSIC[x])) || null;
  }

  setPref(which, on) {
    this.prefs[which] = on;
    this.savePrefs();
    if (!this.ctx) return;
    const bus = which === 'music' ? this.musicBus : this.sfxBus;
    const now = this.ctx.currentTime;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setValueAtTime(bus.gain.value, now);
    bus.gain.linearRampToValueAtTime(on ? (which === 'music' ? MUSIC_VOL : SFX_VOL) : 0, now + 0.4);
  }
}

export const audio = new AudioMgr();

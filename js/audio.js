// Dźwięk: mikser na Web Audio. Pliki dojdą później (assets/audio/*). Brak pliku = cisza, bez błędów.
const FILES = {
  // efekty
  krok: 'sfx/krok.mp3', cios: 'sfx/cios.mp3', strzal: 'sfx/strzal.mp3', tarcza: 'sfx/tarcza.mp3',
  smierc: 'sfx/smierc-draugra.mp3', bohater_pada: 'sfx/bohater-pada.mp3', przyzwanie: 'sfx/przyzwanie.mp3',
  runy: 'sfx/rzut-run.mp3', runa: 'sfx/runa.mp3', rog: 'sfx/rog.mp3', mroz: 'sfx/mroz.mp3', klik: 'sfx/klik.mp3',
  leczenie: 'sfx/leczenie.mp3', nic: 'sfx/nic.mp3',
};

class Audio {
  constructor() { this.ctx = null; this.buffers = {}; this.sfxGain = null; this.enabled = true; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.8; this.sfxGain.connect(this.ctx.destination);
      // lista.json mówi, które pliki już są — bez niej nic nie pobieramy
      fetch('assets/audio/lista.json').then((r) => (r.ok ? r.json() : [])).then((have) => {
        for (const [k, f] of Object.entries(FILES)) if (have.includes(f)) this._load(k, f);
      }).catch(() => {});
    } catch (e) { this.ctx = null; }
  }
  async _load(k, f) {
    try {
      const r = await fetch('assets/audio/' + f);
      if (!r.ok) return;
      this.buffers[k] = await this.ctx.decodeAudioData(await r.arrayBuffer());
    } catch (e) { /* brak pliku — cisza */ }
  }
  play(k, vol = 1) {
    if (!this.enabled || !this.ctx || !this.buffers[k]) return;
    const src = this.ctx.createBufferSource(); src.buffer = this.buffers[k];
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(g); g.connect(this.sfxGain); src.start();
  }
}

export const audio = new Audio();

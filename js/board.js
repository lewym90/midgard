// Rysowanie planszy na płótnie: teren, nici Norn, żetony, animacje.
import { center, corners, boardPixelSize, pixelToHex, key, SQRT3 } from './hex.js';
import { TERRAIN, ENEMIES, jednostka } from './data.js';
import { drawRune } from './runes.js';

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

function hash(c, r, k = 0) {
  let h = (c * 374761393 + r * 668265263 + k * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export class Board {
  constructor(canvas, images) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.img = images;
    this.view = null;
    this.ui = { selected: null, reach: new Set(), attackable: new Set(), cutMode: false, runeTarget: false, hlUnit: null, wardSpots: new Set(), orderIds: new Set() };
    this.anim = new Map(); // id → {x,y,alpha,scale}
    this.tweens = [];
    this.fx = [];
    this.hover = null;
    this.frostFade = null;
    this.staticKey = '';
    this.t = 0;
    this.onTap = null;
    this.onHover = null;
    this._bind();
    this.resize();
    const loop = (ts) => { this.t = ts / 1000; this._step(); this._draw(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  setView(v) { this.view = v; this._ensureStatic(); }
  setUI(u) { Object.assign(this.ui, u); }

  // ---------- rozmiar ----------
  resize() {
    const r = this.cv.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = Math.max(1, r.width); this.H = Math.max(1, r.height);
    this.cv.width = Math.round(this.W * this.dpr);
    this.cv.height = Math.round(this.H * this.dpr);
    this.staticKey = '';
    this._ensureStatic();
  }

  _layout() {
    const v = this.view;
    const cols = v.map[0].length, rows = v.map.length;
    const pad = Math.min(this.W, this.H) * 0.035;
    const s = Math.min((this.W - 2 * pad) / (1.5 * (cols - 1) + 2), (this.H - 2 * pad) / (SQRT3 * (rows + 0.5)));
    const [bw, bh] = boardPixelSize(cols, rows, s);
    this.s = s; this.cols = cols; this.rows = rows;
    this.ox = (this.W - bw) / 2; this.oy = (this.H - bh) / 2;
    this.bw = bw; this.bh = bh;
  }

  pos(c, r) { const [x, y] = center(c, r, this.s); return [x + this.ox, y + this.oy]; }

  // ---------- warstwa terenu (rysowana raz) ----------
  _ensureStatic() {
    if (!this.view) return;
    const k = `${this.W}x${this.H}@${this.dpr}|${this.view.frost}`;
    if (k === this.staticKey) return;
    this.staticKey = k;
    this._layout();
    const s = this.s, dpr = this.dpr;
    const pad = Math.ceil(s * 0.6);
    const cv = document.createElement('canvas');
    cv.width = Math.ceil((this.bw + 2 * pad) * dpr); cv.height = Math.ceil((this.bh + 2 * pad) * dpr);
    const g = cv.getContext('2d');
    g.scale(dpr, dpr); g.translate(pad, pad);
    this.staticPad = pad; this.staticCv = cv;
    const hexPath = (c, r, scale = 1) => {
      const [x, y] = center(c, r, s);
      const pts = corners(x, y, s * scale);
      g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.closePath();
      return [x, y];
    };
    // cień całej mapy na stole
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.75)'; g.shadowBlur = s * 0.9; g.shadowOffsetY = s * 0.25;
    g.fillStyle = '#000';
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) { hexPath(c, r, 1.02); g.fill(); }
    g.restore();
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const t = TERRAIN[this.view.map[r][c]];
        const tex = this.img['teren-' + t.img];
        const [x, y] = hexPath(c, r);
        g.save(); g.clip();
        const size = (2 * s) / 0.42;
        const h = hash(c, r);
        const offX = ((h % 1000) / 1000) * (size - 2 * s);
        const offY = (((h >>> 10) % 1000) / 1000) * (size - 2 * s);
        if (tex) g.drawImage(tex, x - s - offX, y - s - offY, size, size);
        g.fillStyle = 'rgba(12,16,26,0.2)'; g.fillRect(x - s, y - s, 2 * s, 2 * s);
        // światło i cień w heksie
        const lg = g.createLinearGradient(x - s, y - s, x + s, y + s);
        lg.addColorStop(0, 'rgba(255,235,200,0.10)'); lg.addColorStop(0.5, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(0,0,0,0.28)');
        g.fillStyle = lg; g.fillRect(x - s, y - s, 2 * s, 2 * s);
        const rg = g.createRadialGradient(x, y, s * 0.35, x, y, s * 1.05);
        rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, t.blocked ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.35)');
        g.fillStyle = rg; g.fillRect(x - s, y - s, 2 * s, 2 * s);
        if (c < this.view.frost) this._frostHex(g, c, r, x, y, s, 1);
        g.restore();
        hexPath(c, r);
        g.lineWidth = Math.max(1.2, s * 0.055); g.strokeStyle = 'rgba(12,8,5,0.9)'; g.stroke();
        hexPath(c, r, 0.94);
        g.lineWidth = Math.max(0.6, s * 0.018);
        g.strokeStyle = c < this.view.frost ? 'rgba(210,235,255,0.5)' : 'rgba(255,228,180,0.10)'; g.stroke();
      }
    }
  }

  _frostHex(g, c, r, x, y, s, alpha) {
    g.save();
    g.globalAlpha = alpha;
    const fg = g.createRadialGradient(x, y, s * 0.1, x, y, s);
    fg.addColorStop(0, 'rgba(215,235,250,0.38)'); fg.addColorStop(1, 'rgba(235,248,255,0.72)');
    g.fillStyle = fg; g.fillRect(x - s, y - s, 2 * s, 2 * s);
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = Math.max(0.6, s * 0.02);
    for (let i = 0; i < 5; i++) {
      const h = hash(c, r, i + 3);
      let px = x + (((h % 200) / 100) - 1) * s * 0.7, py = y + ((((h >>> 8) % 200) / 100) - 1) * s * 0.7;
      g.beginPath(); g.moveTo(px, py);
      for (let j = 0; j < 3; j++) {
        const hh = hash(c, r, i * 7 + j);
        px += (((hh % 200) / 100) - 1) * s * 0.35; py += ((((hh >>> 9) % 200) / 100) - 1) * s * 0.35;
        g.lineTo(px, py);
      }
      g.stroke();
    }
    g.restore();
  }

  // ---------- wejście ----------
  _bind() {
    let down = null;
    const pt = (e) => { const r = this.cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    this.cv.addEventListener('pointerdown', (e) => { down = pt(e); });
    this.cv.addEventListener('pointerup', (e) => {
      if (!down) return;
      const p = pt(e);
      if (Math.hypot(p[0] - down[0], p[1] - down[1]) < 18) {
        const h = this.hexAt(p[0], p[1]);
        if (h && this.onTap) this.onTap(h[0], h[1]);
      }
      down = null;
    });
    this.cv.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const p = pt(e);
      const h = this.hexAt(p[0], p[1]);
      const k = h ? key(h[0], h[1]) : null;
      if (k !== this.hover) { this.hover = k; if (this.onHover) this.onHover(h); }
    });
    this.cv.addEventListener('pointerleave', () => { this.hover = null; if (this.onHover) this.onHover(null); });
  }

  hexAt(x, y) {
    if (!this.view) return null;
    const [c, r] = pixelToHex(x - this.ox, y - this.oy, this.s);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return null;
    return [c, r];
  }

  // ---------- animacje ----------
  tween(dur, fn) {
    return new Promise((res) => this.tweens.push({ t0: performance.now(), dur: dur * 1000, fn, res }));
  }

  _step() {
    const now = performance.now();
    this.tweens = this.tweens.filter((tw) => {
      const k = Math.min(1, (now - tw.t0) / tw.dur);
      tw.fn(k);
      if (k >= 1) { tw.res(); return false; }
      return true;
    });
    this.fx = this.fx.filter((f) => now - f.t0 < f.dur * 1000);
  }

  float(x, y, text, color, big = false) {
    this.fx.push({ kind: 'text', x, y, text, color, big, t0: performance.now(), dur: 1.3 });
  }

  unitPos(u) {
    const a = this.anim.get(u.id);
    if (a && a.x !== undefined) return [a.x, a.y];
    return this.pos(u.c, u.r);
  }

  async animate(ev, view) {
    const S = this.s;
    const find = (id) => view.units.find((u) => u.id === id);
    if (ev.type === 'move') {
      const u = find(ev.id); if (!u) return;
      const pts = ev.path.map(([c, r]) => this.pos(c, r));
      const a = { x: pts[0][0], y: pts[0][1] };
      this.anim.set(u.id, a);
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        await this.tween(0.2, (k) => { const e = easeInOut(k); a.x = x0 + (x1 - x0) * e; a.y = y0 + (y1 - y0) * e; });
      }
      this.anim.delete(u.id);
    } else if (ev.type === 'hit') {
      const tgt = find(ev.to);
      const [tx, ty] = tgt ? this.unitPos(tgt) : [0, 0];
      if (ev.from != null) {
        const src = find(ev.from);
        if (src) {
          const [sx, sy] = this.unitPos(src);
          if (ev.ranged) {
            this.fx.push({ kind: 'bolt', x0: sx, y0: sy, x1: tx, y1: ty, t0: performance.now(), dur: 0.35, color: src.side === 'hero' ? '#c9b8ff' : '#e8d6a8' });
            await this.tween(0.33, () => {});
          } else {
            const a = { x: sx, y: sy };
            this.anim.set(src.id, a);
            await this.tween(0.14, (k) => { const e = easeOut(k); a.x = sx + (tx - sx) * 0.42 * e; a.y = sy + (ty - sy) * 0.42 * e; });
            this.fx.push({ kind: 'slash', x: tx, y: ty, t0: performance.now(), dur: 0.35, ang: Math.atan2(ty - sy, tx - sx) });
            this.tween(0.2, (k) => { const e = easeInOut(k); a.x = sx + (tx - sx) * 0.42 * (1 - e); a.y = sy + (ty - sy) * 0.42 * (1 - e); }).then(() => this.anim.delete(src.id));
          }
        }
      } else if (ev.frost) {
        this.fx.push({ kind: 'frostburst', x: tx, y: ty, t0: performance.now(), dur: 0.6 });
      }
      if (tgt) {
        const shake = { x: tx, y: ty };
        this.anim.set(tgt.id, shake);
        this.tween(0.3, (k) => { const amp = S * 0.08 * (1 - k); shake.x = tx + Math.sin(k * 40) * amp; shake.y = ty; }).then(() => { if (this.anim.get(tgt.id) === shake) this.anim.delete(tgt.id); });
        const txt = ev.dmg > 0 ? `−${ev.dmg}` : (ev.absorbed ? 'tarcza' : '0');
        this.float(tx, ty - S * 0.6, txt, ev.frost ? '#bfe3ff' : '#ff6b55', true);
        if (ev.absorbed) this.float(tx + S * 0.5, ty - S * 0.15, `tarcza −${ev.absorbed}`, '#a6cfe9');
        if (ev.redirected) this.float(tx, ty + S * 0.35, 'przyjęła cios', '#f2d38a');
      }
      await this.tween(0.32, () => {});
    } else if (ev.type === 'miss') {
      const src = find(ev.from);
      const [x, y] = this.pos(ev.at[0], ev.at[1]);
      if (src && ev.ranged) {
        const [sx, sy] = this.unitPos(src);
        this.fx.push({ kind: 'bolt', x0: sx, y0: sy, x1: x, y1: y, t0: performance.now(), dur: 0.35, color: '#e8d6a8' });
      } else this.fx.push({ kind: 'slash', x, y, t0: performance.now(), dur: 0.3, ang: 0, faint: true });
      this.float(x, y - S * 0.4, ev.reason === 'far' ? 'nie sięgnął' : 'pudło', '#d9cdb2');
      await this.tween(0.45, () => {});
    } else if (ev.type === 'death') {
      const u = find(ev.id); if (!u) return;
      const [x, y] = this.unitPos(u);
      const a = { x, y, alpha: 1, scale: 1, dying: true, unit: { ...u } };
      this.anim.set(u.id, a);
      this.fx.push({ kind: 'dust', x, y, t0: performance.now(), dur: 0.8, crumble: ev.crumble });
      await this.tween(ev.crumble ? 0.35 : 0.5, (k) => { a.alpha = 1 - k; a.scale = 1 - 0.35 * k; });
      this.anim.delete(u.id);
    } else if (ev.type === 'spawn') {
      const u = ev.unit;
      const [x, y] = this.pos(u.c, u.r);
      const a = { x, y: y + S * 0.4, alpha: 0, scale: 0.6 };
      this.anim.set(u.id, a);
      this.fx.push({ kind: 'summon', x, y, t0: performance.now(), dur: 0.9 });
      await this.tween(0.6, (k) => { const e = easeOut(k); a.y = y + S * 0.4 * (1 - e); a.alpha = e; a.scale = 0.6 + 0.4 * e; });
      this.anim.delete(u.id);
    } else if (ev.type === 'frost') {
      this.frostFade = { from: view.frost, to: ev.frost, k: 0 };
      await this.tween(0.8, (k) => { this.frostFade.k = k; });
      this.frostFade = null;
    } else if (ev.type === 'cut') {
      const u = find(ev.id);
      if (u) { const [x, y] = this.unitPos(u); this.float(x, y - S * 0.5, 'nić przecięta', '#e8e2d4'); }
      await this.tween(0.35, () => {});
    } else if (ev.type === 'heal') {
      const u = find(ev.id);
      if (u) { const [x, y] = this.unitPos(u); this.float(x, y - S * 0.6, `+${ev.amount}`, '#9fe08a', true); }
      await this.tween(0.2, () => {});
    } else if (ev.type === 'power') {
      const u = find(ev.id);
      if (u) {
        const [x, y] = this.unitPos(u);
        this.fx.push({ kind: 'ring', x, y, t0: performance.now(), dur: 0.7, color: ev.power === 'nic' ? '#e8e2d4' : ev.power === 'runa' ? '#bfe3ff' : '#f2d38a' });
        const NAME = { wir: 'Wir topora', oslona: 'Przyjmę cios', nic: 'Przetnij nić', piesn: 'Pieśń odwagi', rozkaz: 'Na mój znak!', runa: 'Lodowa runa', strzal: 'Drugi strzał', szal: 'Wilczy szał' };
        if (NAME[ev.power]) this.float(x, y - S * 0.95, NAME[ev.power], '#f2d38a');
      }
      if (ev.power === 'runa') {
        const [x, y] = this.pos(ev.at[0], ev.at[1]);
        this.fx.push({ kind: 'frostburst', x, y, t0: performance.now(), dur: 0.7 });
      }
      await this.tween(0.3, () => {});
    }
  }

  // ---------- rysowanie ----------
  _draw() {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.W, this.H);
    if (!this.view || !this.staticCv) return;
    const s = this.s, t = this.t;
    g.drawImage(this.staticCv, this.ox - this.staticPad, this.oy - this.staticPad, this.staticCv.width / this.dpr, this.staticCv.height / this.dpr);

    // zamarzanie kolejnej kolumny
    if (this.frostFade) {
      for (let c = this.frostFade.from; c < this.frostFade.to; c++) {
        for (let r = 0; r < this.rows; r++) {
          const [x, y] = this.pos(c, r);
          g.save(); this._hex(g, x, y, s); g.clip();
          this._frostHex(g, c, r, x, y, s, this.frostFade.k);
          g.restore();
        }
      }
    }

    // oddech kurhanu
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      if (this.view.map[r][c] !== 'K') continue;
      const [x, y] = this.pos(c, r);
      const p = 0.5 + 0.5 * Math.sin(t * 1.6);
      const rg = g.createRadialGradient(x, y, s * 0.2, x, y, s * 1.35);
      rg.addColorStop(0, `rgba(160,210,245,${0.28 + 0.2 * p})`); rg.addColorStop(0.6, `rgba(120,180,230,${0.1 + 0.08 * p})`); rg.addColorStop(1, 'rgba(150,200,235,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(x, y, s * 1.35, 0, Math.PI * 2); g.fill();
      g.save(); this._hex(g, x, y, s * 0.82);
      g.lineWidth = Math.max(1.5, s * 0.06); g.strokeStyle = `rgba(190,225,250,${0.45 + 0.35 * p})`;
      g.shadowColor = 'rgba(160,210,245,0.9)'; g.shadowBlur = s * 0.35; g.stroke(); g.restore();
    }

    // pola ruchu
    for (const k of this.ui.reach) {
      const [c, r] = k.split(',').map(Number);
      const [x, y] = this.pos(c, r);
      this._hex(g, x, y, s * 0.9);
      g.fillStyle = 'rgba(242,211,138,0.16)'; g.fill();
      g.lineWidth = Math.max(1, s * 0.035); g.strokeStyle = 'rgba(242,211,138,0.7)'; g.stroke();
    }
    for (const k of this.ui.wardSpots) {
      const [c, r] = k.split(',').map(Number);
      const [x, y] = this.pos(c, r);
      this._hex(g, x, y, s * 0.9);
      g.fillStyle = 'rgba(166,207,233,0.16)'; g.fill();
      g.lineWidth = Math.max(1, s * 0.035); g.strokeStyle = 'rgba(190,225,250,0.75)'; g.stroke();
    }
    for (const w of this.view.wards || []) {
      const [x, y] = this.pos(w.c, w.r);
      const p = 0.5 + 0.5 * Math.sin(t * 2.2 + w.c);
      const rg = g.createRadialGradient(x, y, 0, x, y, s * 0.95);
      rg.addColorStop(0, `rgba(200,235,255,${0.5 + 0.2 * p})`); rg.addColorStop(1, 'rgba(160,210,245,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(x, y, s * 0.95, 0, Math.PI * 2); g.fill();
      g.save(); g.shadowColor = 'rgba(170,220,255,1)'; g.shadowBlur = s * 0.5;
      g.strokeStyle = 'rgba(225,245,255,0.95)'; g.lineWidth = Math.max(1.5, s * 0.05);
      g.beginPath(); g.arc(x, y, s * 0.55, 0, Math.PI * 2); g.stroke();
      drawRune(g, 'I', x, y, s * 0.7, '#f2fbff', Math.max(2, s * 0.09));
      g.restore();
    }
    if (this.hover) {
      const [c, r] = this.hover.split(',').map(Number);
      const [x, y] = this.pos(c, r);
      this._hex(g, x, y, s * 0.96);
      g.lineWidth = Math.max(1, s * 0.03); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.stroke();
    }

    this._drawIntents(g);
    this._drawUnits(g);
    this._drawFx(g);
  }

  _hex(g, x, y, s) {
    const pts = corners(x, y, s);
    g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.closePath();
  }

  _drawIntents(g) {
    const v = this.view, s = this.s, t = this.t;
    if (!v.intents || !v.intents.length) return;
    const hl = this.ui.hlUnit;
    // kilka ciosów w to samo pole: rozkładamy znaczniki wokół żetonu
    const slot = new Map(), slotCount = new Map();
    for (const it of v.intents) if (it.attack && v.units.some((x) => x.id === it.unitId && x.hp > 0)) {
      const k = key(it.attack[0], it.attack[1]);
      slot.set(it, slotCount.get(k) || 0); slotCount.set(k, (slotCount.get(k) || 0) + 1);
    }
    for (const it of v.intents) {
      const u = v.units.find((x) => x.id === it.unitId && x.hp > 0);
      if (!u) continue;
      const dim = hl != null && hl !== it.unitId;
      g.save();
      g.globalAlpha = dim ? 0.25 : 1;
      if (it.kind === 'summon') {
        const [x, y] = this.pos(it.spawn[0], it.spawn[1]);
        const p = 0.5 + 0.5 * Math.sin(t * 3);
        g.strokeStyle = it.canceled ? 'rgba(200,200,200,0.5)' : `rgba(170,215,245,${0.55 + 0.4 * p})`;
        g.lineWidth = s * 0.05; g.setLineDash([s * 0.12, s * 0.1]); g.lineDashOffset = -t * s * 0.4;
        g.beginPath(); g.arc(x, y, s * 0.62, 0, Math.PI * 2); g.stroke();
        g.setLineDash([]);
        const img = this.img['zeton-draugr'];
        if (img && !it.canceled) { g.globalAlpha *= 0.35 + 0.15 * p; g.save(); g.beginPath(); g.arc(x, y, s * 0.55, 0, Math.PI * 2); g.clip(); g.drawImage(img, x - s * 0.55, y - s * 0.55, s * 1.1, s * 1.1); g.restore(); }
        g.restore();
        continue;
      }
      const pts = it.path.map(([c, r]) => this.pos(c, r));
      pts[0] = this.unitPos(u);
      const cut = it.canceled;
      // nić ruchu
      if (pts.length > 1) {
        g.lineCap = 'round'; g.lineJoin = 'round';
        g.shadowColor = cut ? 'transparent' : 'rgba(242,211,138,0.6)'; g.shadowBlur = s * 0.2;
        g.strokeStyle = cut ? 'rgba(200,200,200,0.45)' : 'rgba(232,196,118,0.9)';
        g.lineWidth = Math.max(1.5, s * 0.06);
        g.setLineDash([s * 0.16, s * 0.11]); g.lineDashOffset = -t * s * 0.5;
        g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
        g.setLineDash([]); g.shadowBlur = 0;
        const [ex, ey] = pts[pts.length - 1];
        g.fillStyle = cut ? 'rgba(200,200,200,0.5)' : 'rgba(242,211,138,0.95)';
        g.beginPath(); g.arc(ex, ey, s * 0.09, 0, Math.PI * 2); g.fill();
      }
      // cios
      if (it.attack) {
        const [sx, sy] = pts[pts.length - 1];
        const [tx, ty] = this.pos(it.attack[0], it.attack[1]);
        const dx = tx - sx, dy = ty - sy, L = Math.hypot(dx, dy) || 1;
        const nx = -dy / L, ny = dx / L;
        const bend = it.kind === 'shot' ? L * 0.35 : L * 0.18;
        const mx = (sx + tx) / 2 + nx * bend, my = (sy + ty) / 2 + ny * bend;
        // koniec strzałki na krawędzi żetonu celu
        const R = s * 0.74;
        const ax = tx - ((tx - mx) / Math.hypot(tx - mx, ty - my)) * R;
        const ay = ty - ((ty - my) / Math.hypot(tx - mx, ty - my)) * R;
        const startOff = Math.min(R * 0.9, L * 0.4);
        const bx = sx + ((mx - sx) / Math.hypot(mx - sx, my - sy)) * startOff;
        const by = sy + ((my - sy) / Math.hypot(mx - sx, my - sy)) * startOff;
        const col = cut ? 'rgba(200,200,200,0.5)' : 'rgba(226,72,56,0.95)';
        g.strokeStyle = col; g.lineWidth = Math.max(2, s * 0.075); g.lineCap = 'round';
        g.shadowColor = cut ? 'transparent' : 'rgba(255,60,40,0.55)'; g.shadowBlur = s * 0.25;
        if (it.kind === 'shot') { g.setLineDash([s * 0.14, s * 0.1]); g.lineDashOffset = -t * s * 0.6; }
        g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(mx, my, ax, ay); g.stroke();
        g.setLineDash([]); g.shadowBlur = 0;
        const ang = Math.atan2(ay - my, ax - mx);
        const ah = s * 0.26;
        g.fillStyle = col;
        g.beginPath(); g.moveTo(ax, ay);
        g.lineTo(ax - ah * Math.cos(ang - 0.45), ay - ah * Math.sin(ang - 0.45));
        g.lineTo(ax - ah * Math.cos(ang + 0.45), ay - ah * Math.sin(ang + 0.45));
        g.closePath(); g.fill();
        // znacznik obrażeń
        const ang0 = -Math.PI / 4 + (slot.get(it) || 0) * 0.78;
        const bxp = tx + Math.cos(ang0) * s * 0.78, byp = ty + Math.sin(ang0) * s * 0.78, br = Math.max(9, s * 0.27);
        g.fillStyle = cut ? '#3a3633' : '#5c130c';
        g.strokeStyle = cut ? '#777' : '#f2d38a'; g.lineWidth = Math.max(1, s * 0.035);
        g.beginPath(); g.arc(bxp, byp, br, 0, Math.PI * 2); g.fill(); g.stroke();
        g.fillStyle = '#fff3e0'; g.font = `700 ${Math.round(br * 1.25)}px Cinzel, serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(it.dmg), bxp, byp + s * 0.02);
        if (cut) {
          g.strokeStyle = '#e8e2d4'; g.lineWidth = Math.max(1.5, s * 0.05);
          g.beginPath(); g.moveTo(mx - s * 0.18, my - s * 0.18); g.lineTo(mx + s * 0.18, my + s * 0.18);
          g.moveTo(mx + s * 0.18, my - s * 0.18); g.lineTo(mx - s * 0.18, my + s * 0.18); g.stroke();
        }
      }
      g.restore();
    }
  }

  _drawUnits(g) {
    const v = this.view, s = this.s, t = this.t;
    const list = v.units.filter((u) => u.hp > 0 || (this.anim.get(u.id) || {}).dying);
    // wrogowie pod spodem, bohaterowie na wierzchu, wybrany na samej górze
    list.sort((a, b) => (a.side === b.side ? 0 : a.side === 'enemy' ? -1 : 1) || (a.id === this.ui.selected) - (b.id === this.ui.selected));
    for (const u0 of list) {
      const a = this.anim.get(u0.id) || {};
      const u = a.unit || u0;
      const [x, y] = this.unitPos(u);
      const boss = u.side === 'enemy' && ENEMIES[u.type].boss;
      const R = s * (boss ? 0.8 : u.oddzial ? 0.6 : 0.7) * (a.scale ?? 1);
      g.save();
      g.globalAlpha = a.alpha ?? 1;
      // cień
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.beginPath(); g.ellipse(x, y + R * 0.18, R * 1.05, R * 0.95, 0, 0, Math.PI * 2); g.fill();
      // pierścienie stanu
      const pulse = 0.5 + 0.5 * Math.sin(t * 4);
      if (this.ui.selected === u.id) {
        g.strokeStyle = `rgba(255,236,180,${0.55 + 0.45 * pulse})`; g.lineWidth = s * 0.08;
        g.shadowColor = 'rgba(255,220,140,0.9)'; g.shadowBlur = s * 0.4;
        g.beginPath(); g.arc(x, y, R + s * 0.12, 0, Math.PI * 2); g.stroke(); g.shadowBlur = 0;
      }
      if (this.ui.attackable.has(u.id)) {
        g.strokeStyle = `rgba(240,80,60,${0.5 + 0.5 * pulse})`; g.lineWidth = s * 0.07;
        g.shadowColor = 'rgba(255,60,40,0.9)'; g.shadowBlur = s * 0.35;
        g.beginPath(); g.arc(x, y, R + s * 0.12, 0, Math.PI * 2); g.stroke(); g.shadowBlur = 0;
      }
      if (this.ui.cutMode && u.side === 'enemy' && v.intents.some((i) => i.unitId === u.id && !i.canceled)) {
        g.strokeStyle = `rgba(235,230,220,${0.45 + 0.55 * pulse})`; g.lineWidth = s * 0.06;
        g.beginPath(); g.arc(x, y, R + s * 0.12, 0, Math.PI * 2); g.stroke();
      }
      if (this.ui.orderIds.has(u.id)) {
        g.strokeStyle = `rgba(242,211,138,${0.4 + 0.6 * pulse})`; g.lineWidth = s * 0.07;
        g.beginPath(); g.arc(x, y, R + s * 0.14, 0, Math.PI * 2); g.stroke();
      }
      if (this.ui.runeTarget && u.side === 'hero') {
        g.strokeStyle = `rgba(242,211,138,${0.4 + 0.6 * pulse})`; g.lineWidth = s * 0.06;
        g.beginPath(); g.arc(x, y, R + s * 0.12, 0, Math.PI * 2); g.stroke();
      }
      // obręcz
      const ring = g.createLinearGradient(x - R, y - R, x + R, y + R);
      if (u.oddzial) { ring.addColorStop(0, '#f4ead8'); ring.addColorStop(0.45, '#9c8a6c'); ring.addColorStop(1, '#3b3125'); }
      else if (u.side === 'hero') { ring.addColorStop(0, '#fff0bf'); ring.addColorStop(0.45, '#c9962f'); ring.addColorStop(1, '#5b3d0c'); }
      else if (boss) { ring.addColorStop(0, '#f0c66a'); ring.addColorStop(0.5, '#8d1f15'); ring.addColorStop(1, '#2a0a06'); }
      else { ring.addColorStop(0, '#9a9590'); ring.addColorStop(0.5, '#4a3f3a'); ring.addColorStop(1, '#151210'); }
      g.fillStyle = ring;
      g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#000'; g.beginPath(); g.arc(x, y, R * 0.89, 0, Math.PI * 2); g.fill();
      const img = this.img[(u.side === 'hero' ? 'zeton-' : 'zeton-') + u.type];
      if (img) {
        g.save(); g.beginPath(); g.arc(x, y, R * 0.86, 0, Math.PI * 2); g.clip();
        g.drawImage(img, x - R * 0.86, y - R * 0.86, R * 1.72, R * 1.72);
        if (u.side === 'enemy') { g.fillStyle = 'rgba(40,70,110,0.14)'; g.fillRect(x - R, y - R, 2 * R, 2 * R); }
        if (u.side === 'hero' && u.moveLeft === 0 && u.attacked && v.phase === 'narada') { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x - R, y - R, 2 * R, 2 * R); }
        g.restore();
      } else if (u.oddzial) {
        // zastępczy żeton oddziału, dopóki nie ma grafiki
        g.fillStyle = '#2a2219'; g.beginPath(); g.arc(x, y, R * 0.86, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#e9d9b4'; g.font = `700 ${Math.round(R * 0.9)}px Cinzel, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(jednostka(u.type).name[0], x, y + R * 0.04);
      }
      if (u.side === 'enemy') {
        g.strokeStyle = 'rgba(190,40,30,0.85)'; g.lineWidth = Math.max(1, s * 0.03);
        g.beginPath(); g.arc(x, y, R * 0.89, 0, Math.PI * 2); g.stroke();
      }
      // życie
      const pw = Math.max(R * 1.55, 30), ph = Math.max(15, s * 0.36), py = y + R * 0.92;
      g.fillStyle = 'rgba(8,6,5,0.92)';
      this._pill(g, x - pw / 2, py - ph / 2, pw, ph);
      g.fill();
      const ratio = Math.max(0, u.hp / u.maxHp);
      g.save(); this._pill(g, x - pw / 2, py - ph / 2, pw, ph); g.clip();
      g.fillStyle = u.side === 'hero' ? (ratio <= 0.34 ? '#b5352a' : '#a8812c') : '#8e2016';
      g.fillRect(x - pw / 2, py - ph / 2, pw * ratio, ph);
      g.restore();
      g.strokeStyle = u.side === 'hero' ? 'rgba(242,211,138,0.7)' : 'rgba(200,80,60,0.6)'; g.lineWidth = 1;
      this._pill(g, x - pw / 2, py - ph / 2, pw, ph); g.stroke();
      g.fillStyle = '#fff8ec'; g.font = `700 ${Math.round(ph * 0.78)}px Cinzel, serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(`${u.hp}`, x, py + ph * 0.04);
      // tarcza
      if (u.side === 'hero' && u.shield > 0) {
        const sx = x - R * 0.92, sy = y - R * 0.7, sr = Math.max(8, s * 0.24);
        g.fillStyle = '#163044'; g.strokeStyle = '#a6cfe9'; g.lineWidth = Math.max(1, s * 0.03);
        g.beginPath(); g.arc(sx, sy, sr, 0, Math.PI * 2); g.fill(); g.stroke();
        g.fillStyle = '#e4f3ff'; g.font = `700 ${Math.round(sr * 1.15)}px Cinzel, serif`;
        g.fillText(String(u.shield), sx, sy + 1);
      }
      if (u.side === 'hero' && u.guard) {
        g.strokeStyle = `rgba(166,207,233,${0.5 + 0.4 * pulse})`; g.lineWidth = s * 0.05; g.setLineDash([s * 0.1, s * 0.08]);
        g.beginPath(); g.arc(x, y, R + s * 0.9, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      }
      if (boss && u.hp > 0) {
        const mx = x, my = y - R - s * 0.32;
        g.fillStyle = '#f2d38a'; g.strokeStyle = '#3a0c06'; g.lineWidth = Math.max(1, s * 0.03);
        g.beginPath(); g.moveTo(mx, my + s * 0.2); g.lineTo(mx - s * 0.16, my); g.lineTo(mx + s * 0.16, my); g.closePath(); g.fill(); g.stroke();
        g.font = `700 ${Math.round(Math.max(10, s * 0.26))}px Cinzel, serif`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.lineWidth = Math.max(2, s * 0.05); g.strokeStyle = 'rgba(0,0,0,0.9)';
        g.strokeText('CEL', mx, my - s * 0.04); g.fillText('CEL', mx, my - s * 0.04);
        g.textBaseline = 'middle';
      }
      // numer zamiaru
      const it = v.intents && v.intents.find((i) => i.unitId === u.id && i.kind !== 'summon');
      if (it && u.side === 'enemy') {
        const bx = x - R * 0.82, by = y - R * 0.78, br = Math.max(8, s * 0.22);
        g.fillStyle = '#1b1714'; g.strokeStyle = it.canceled ? '#777' : '#d64a3c'; g.lineWidth = Math.max(1, s * 0.03);
        g.beginPath(); g.arc(bx, by, br, 0, Math.PI * 2); g.fill(); g.stroke();
        g.fillStyle = '#efe4cc'; g.font = `700 ${Math.round(br * 1.15)}px Cinzel, serif`;
        g.fillText(String(it.order), bx, by + 1);
      }
      g.restore();
    }
  }

  _pill(g, x, y, w, h) {
    const r = h / 2;
    g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
    g.lineTo(x + r, y + h); g.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5); g.closePath();
  }

  _drawFx(g) {
    const now = performance.now(), s = this.s;
    for (const f of this.fx) {
      const k = (now - f.t0) / (f.dur * 1000);
      g.save();
      if (f.kind === 'text') {
        const e = easeOut(Math.min(1, k * 1.4));
        g.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        const size = Math.round(Math.max(f.big ? 18 : 13, s * (f.big ? 0.62 : 0.36)));
        g.font = `700 ${size}px Cinzel, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = Math.max(2, size * 0.16); g.strokeStyle = 'rgba(0,0,0,0.85)';
        const yy = f.y - s * 0.5 * e;
        g.strokeText(f.text, f.x, yy); g.fillStyle = f.color; g.fillText(f.text, f.x, yy);
      } else if (f.kind === 'slash') {
        g.globalAlpha = (1 - k) * (f.faint ? 0.5 : 1);
        g.strokeStyle = '#fff1d6'; g.shadowColor = '#ff5a3c'; g.shadowBlur = s * 0.4; g.lineWidth = s * 0.08 * (1 - k * 0.5); g.lineCap = 'round';
        g.translate(f.x, f.y); g.rotate(f.ang + Math.PI / 2);
        g.beginPath(); g.arc(0, 0, s * 0.55, -0.9 + k * 0.4, 0.9 + k * 0.4); g.stroke();
      } else if (f.kind === 'bolt') {
        const e = Math.min(1, k * 1.2);
        const x = f.x0 + (f.x1 - f.x0) * e, y = f.y0 + (f.y1 - f.y0) * e;
        const tx = f.x0 + (f.x1 - f.x0) * Math.max(0, e - 0.25), ty = f.y0 + (f.y1 - f.y0) * Math.max(0, e - 0.25);
        g.strokeStyle = f.color; g.lineWidth = s * 0.06; g.lineCap = 'round'; g.shadowColor = f.color; g.shadowBlur = s * 0.3;
        g.globalAlpha = 1 - Math.max(0, k - 0.8) * 5;
        g.beginPath(); g.moveTo(tx, ty); g.lineTo(x, y); g.stroke();
      } else if (f.kind === 'dust' || f.kind === 'frostburst' || f.kind === 'summon') {
        const n = 14;
        const col = f.kind === 'dust' ? '160,150,140' : '200,230,255';
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + hash(i, 1) % 10;
          const d = s * (0.3 + 0.7 * easeOut(k)) * (0.6 + (hash(i, 2) % 40) / 100);
          g.fillStyle = `rgba(${col},${(1 - k) * 0.8})`;
          g.beginPath(); g.arc(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d - (f.kind === 'summon' ? s * 0.4 * k : 0), s * 0.06 * (1 - k * 0.5), 0, Math.PI * 2); g.fill();
        }
      } else if (f.kind === 'ring') {
        g.globalAlpha = 1 - k; g.strokeStyle = f.color; g.lineWidth = s * 0.08 * (1 - k); g.shadowColor = f.color; g.shadowBlur = s * 0.4;
        g.beginPath(); g.arc(f.x, f.y, s * (0.7 + 1.2 * easeOut(k)), 0, Math.PI * 2); g.stroke();
      }
      g.restore();
    }
  }
}

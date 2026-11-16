// Runy rysowane kreskami w polu 10×10 — ostre na każdym ekranie, bez zależności od czcionki.
export const RUNE_STROKES = {
  T: [[[5, 1], [5, 9.2]], [[2, 4], [5, 1], [8, 4]]],
  A: [[[5, 1], [5, 9.2]], [[2, 1.4], [5, 5]], [[8, 1.4], [5, 5]]],
  R: [[[3, 1], [3, 9.2]], [[3, 1], [7, 3], [3, 5]], [[3, 5], [7, 9.2]]],
  K: [[[7, 1], [3, 5], [7, 9]]],
  B: [[[3, 1], [3, 9.2]], [[3, 1], [7, 3], [3, 5], [7, 7], [3, 9.2]]],
  N: [[[3, 1], [3, 9.2]], [[3, 1], [7, 4]], [[3, 4], [7, 7]]],
  I: [[[5, 1], [5, 9.2]]],
};

export function runeSvg(face, cls = 'rune') {
  const paths = RUNE_STROKES[face]
    .map((line) => `<polyline points="${line.map((p) => p.join(',')).join(' ')}"/>`)
    .join('');
  return `<svg class="${cls}" viewBox="0 0 10 10.2" aria-hidden="true">${paths}</svg>`;
}

export function drawRune(ctx, face, x, y, size, color, width) {
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(size / 10, size / 10);
  ctx.strokeStyle = color;
  ctx.lineWidth = width / (size / 10);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const line of RUNE_STROKES[face]) {
    ctx.beginPath();
    line.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.stroke();
  }
  ctx.restore();
}

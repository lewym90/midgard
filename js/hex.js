// Heksy płaskie (flat-top), układ "odd-q": co druga kolumna przesunięta w dół o pół heksa.

export const SQRT3 = Math.sqrt(3);

export const key = (c, r) => c + ',' + r;
export const parseKey = (k) => k.split(',').map(Number);

export function toCube(c, r) {
  const x = c;
  const z = r - (c - (c & 1)) / 2;
  return [x, -x - z, z];
}

export function fromCube(x, y, z) {
  return [x, z + (x - (x & 1)) / 2];
}

export function distance(c1, r1, c2, r2) {
  const a = toCube(c1, r1);
  const b = toCube(c2, r2);
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

const CUBE_DIRS = [[1, -1, 0], [1, 0, -1], [0, 1, -1], [-1, 1, 0], [-1, 0, 1], [0, -1, 1]];

export function neighbors(c, r, cols, rows) {
  const [x, y, z] = toCube(c, r);
  const out = [];
  for (const [dx, dy, dz] of CUBE_DIRS) {
    const [nc, nr] = fromCube(x + dx, y + dy, z + dz);
    if (nc >= 0 && nr >= 0 && nc < cols && nr < rows) out.push([nc, nr]);
  }
  return out;
}

// Środek heksa w pikselach dla rozmiaru s (środek → wierzchołek).
export function center(c, r, s) {
  return [s + 1.5 * s * c, (SQRT3 / 2) * s + SQRT3 * s * (r + 0.5 * (c & 1))];
}

export function boardPixelSize(cols, rows, s) {
  return [2 * s + 1.5 * s * (cols - 1), SQRT3 * s * (rows + 0.5)];
}

export function corners(cx, cy, s) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    pts.push([cx + s * Math.cos(a), cy + s * Math.sin(a)]);
  }
  return pts;
}

// Piksel → heks (zaokrąglenie w układzie sześciennym).
export function pixelToHex(px, py, s) {
  const x = px - s;
  const y = py - (SQRT3 / 2) * s;
  const q = ((2 / 3) * x) / s;
  const rr = ((-1 / 3) * x + (SQRT3 / 3) * y) / s;
  let cx = q, cz = rr, cy = -cx - cz;
  let rx = Math.round(cx), ry = Math.round(cy), rz = Math.round(cz);
  const dx = Math.abs(rx - cx), dy = Math.abs(ry - cy), dz = Math.abs(rz - cz);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return fromCube(rx, ry, rz);
}

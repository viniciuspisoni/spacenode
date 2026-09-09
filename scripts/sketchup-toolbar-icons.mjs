// Gera os PNG da toolbar do SketchUp a partir do MESMO sistema do símbolo
// (grade 64, traço 5, pontas redondas, #333333) — ver
// sketchup/spacenode/assets/spacenode.svg.
//
//   node scripts/sketchup-toolbar-icons.mjs [pasta de saída]
//
// SVG só-contorno sai BRANCO na toolbar do Windows (o botão some), por isso
// os ícones são PNG rasterizado. Rasterizador próprio (distâncias com sinal +
// supersampling 4x) pra não trazer dependência de imagem pro projeto.
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

const GRID = 64;
const STROKE = 5;
const COLOR = [0x33, 0x33, 0x33];
const SS = 4; // supersampling

// ── Distâncias com sinal (unidades da grade) ──────────────────────────────
const len = (x, y) => Math.hypot(x, y);
function sdSegment(px, py, ax, ay, bx, by, w) {
  const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  return len(pax - bax * h, pay - bay * h) - w / 2;
}
const sdDisc = (px, py, cx, cy, r) => len(px - cx, py - cy) - r;
const sdRing = (px, py, cx, cy, r, w) => Math.abs(len(px - cx, py - cy) - r) - w / 2;
function sdRoundBox(px, py, x0, y0, x1, y1, rad) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const hx = (x1 - x0) / 2 - rad, hy = (y1 - y0) / 2 - rad;
  const qx = Math.abs(px - cx) - hx, qy = Math.abs(py - cy) - hy;
  return len(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad;
}
const sdRoundBoxOutline = (px, py, x0, y0, x1, y1, rad, w) =>
  Math.abs(sdRoundBox(px, py, x0, y0, x1, y1, rad)) - w / 2;
// Polígono fechado preenchido (distância ao contorno, sinal por even-odd).
function sdPolyFill(px, py, pts) {
  let d = Infinity, inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    d = Math.min(d, sdSegment(px, py, xi, yi, xj, yj, 0));
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside ? -d : d;
}
const union = (...ds) => Math.min(...ds);

// ── Rasterização ──────────────────────────────────────────────────────────
function render(size, shape, erase) {
  const n = size * SS;
  const unit = GRID / n;            // unidades de grade por pixel supersample
  const acc = new Float32Array(size * size);
  for (let sy = 0; sy < n; sy++) {
    for (let sx = 0; sx < n; sx++) {
      const x = (sx + 0.5) * unit, y = (sy + 0.5) * unit;
      let a = Math.max(0, Math.min(1, 0.5 - shape(x, y) / unit));
      if (a > 0 && erase) {
        // Recorte: abre um vão em volta de um elemento que se sobrepõe a
        // outro (ex.: o "+" sobre a moldura), pra ele não virar borrão.
        const e = Math.max(0, Math.min(1, 0.5 - erase(x, y) / unit));
        a *= 1 - e;
      }
      acc[Math.floor(sy / SS) * size + Math.floor(sx / SS)] += a;
    }
  }
  const px = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const alpha = Math.round((acc[i] / (SS * SS)) * 255);
    px[i * 4] = COLOR[0]; px[i * 4 + 1] = COLOR[1]; px[i * 4 + 2] = COLOR[2]; px[i * 4 + 3] = alpha;
  }
  return px;
}

// ── PNG (RGBA8, sem filtro) ───────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Os ícones ─────────────────────────────────────────────────────────────
const S = STROKE;

// Capturar vista: cantos de visor + ponto no centro. Enquadrar, não fotografar.
const capture = (x, y) => {
  const c = 13, arm = 14, far = 51;
  return union(
    sdSegment(x, y, c, c, c + arm, c, S), sdSegment(x, y, c, c, c, c + arm, S),
    sdSegment(x, y, far, c, far - arm, c, S), sdSegment(x, y, far, c, far, c + arm, S),
    sdSegment(x, y, c, far, c + arm, far, S), sdSegment(x, y, c, far, c, far - arm, S),
    sdSegment(x, y, far, far, far - arm, far, S), sdSegment(x, y, far, far, far, far - arm, S),
    sdDisc(x, y, 32, 32, 5.5)
  );
};

// Gerar render: a "faísca" que o painel usa pra IA (Saída), preenchida —
// contorno nesse tamanho vira mancha.
const spark = (cx, cy, k) => {
  const p = (dx, dy) => [cx + dx * k, cy + dy * k];
  return [p(0, -1), p(0.26, -0.26), p(1, 0), p(0.26, 0.26), p(0, 1), p(-0.26, 0.26), p(-1, 0), p(-0.26, -0.26)];
};
const generate = (x, y) => union(
  sdPolyFill(x, y, spark(28, 28, 21)),
  sdPolyFill(x, y, spark(51, 51, 9))
);

// Nova cena: moldura com "+" dentro — a vista atual vira cena do SketchUp.
const scene = (x, y) => union(
  sdRoundBoxOutline(x, y, 9, 13, 55, 51, 8, S),
  sdSegment(x, y, 32, 24, 32, 40, S),
  sdSegment(x, y, 24, 32, 40, 32, S)
);

// Espelho: moldura alta com o brilho na diagonal.
const mirror = (x, y) => union(
  sdRoundBoxOutline(x, y, 15, 7, 49, 57, 13, S),
  sdSegment(x, y, 24, 42, 40, 22, S - 1),
  sdSegment(x, y, 32, 48, 40, 38, S - 1)
);

const ICONS = { 'toolbar-capture': capture, 'toolbar-generate': generate, 'toolbar-scene': scene, 'toolbar-mirror': mirror };

const outDir = process.argv[2] || path.join(import.meta.dirname, '..', 'sketchup', 'spacenode', 'assets');
fs.mkdirSync(outDir, { recursive: true });
for (const [name, shape] of Object.entries(ICONS)) {
  for (const size of [24, 48]) {
    const file = path.join(outDir, `${name}-${size}.png`);
    fs.writeFileSync(file, png(size, render(size, shape)));
    console.log(file, fs.statSync(file).size + ' bytes');
  }
}

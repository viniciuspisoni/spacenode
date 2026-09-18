// Gera os PNG da toolbar do SketchUp a partir do MESMO sistema do símbolo
// (grade 64, pontas redondas, #333333) — ver
// sketchup/spacenode/assets/spacenode.svg.
//
//   node scripts/sketchup-toolbar-icons.mjs [pasta de saída]
//
// SVG só-contorno sai BRANCO na toolbar do Windows (o botão some), por isso
// os ícones são PNG rasterizado. Rasterizador próprio (distâncias com sinal +
// supersampling 4x) pra não trazer dependência de imagem pro projeto.
//
// Desenho: traço mais leve que o do símbolo (4,4 contra 5) e poucos elementos
// por ícone — a 24 px cada elemento a mais vira ruído. As curvas são reais: a
// faísca tem lados CÔNCAVOS (é o que separa uma faísca de um asterisco) e o
// espelho é um arco, não um retângulo. Curva vira polilinha densa antes de
// virar distância; a 24 px ninguém vê a facetagem.
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

const GRID = 64;
const S = 4.4;              // traço padrão
const COLOR = [0x33, 0x33, 0x33];
const SS = 4;               // supersampling

// ── Geometria ─────────────────────────────────────────────────────────────
const len = (x, y) => Math.hypot(x, y);
function quad(p0, c, p1, n = 12) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0],
              u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]);
  }
  return out;
}
function arc(cx, cy, r, a0, a1, n = 20) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

// ── Distâncias com sinal (unidades da grade) ──────────────────────────────
function sdSegment(px, py, ax, ay, bx, by, w) {
  const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  return len(pax - bax * h, pay - bay * h) - w / 2;
}
const sdDisc = (px, py, cx, cy, r) => len(px - cx, py - cy) - r;
function sdRoundBox(px, py, x0, y0, x1, y1, rad) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const hx = (x1 - x0) / 2 - rad, hy = (y1 - y0) / 2 - rad;
  const qx = Math.abs(px - cx) - hx, qy = Math.abs(py - cy) - hy;
  return len(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad;
}
const sdRoundBoxOutline = (px, py, x0, y0, x1, y1, rad, w) =>
  Math.abs(sdRoundBox(px, py, x0, y0, x1, y1, rad)) - w / 2;
// Traço ao longo de uma polilinha (fechada ou não).
function sdPath(px, py, pts, w, closed) {
  let d = Infinity;
  const last = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < last; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    d = Math.min(d, sdSegment(px, py, a[0], a[1], b[0], b[1], w));
  }
  return d;
}
// Polígono preenchido (distância ao contorno, sinal por even-odd).
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
// Abre um vão em `shape` com a forma `hole` — é o que mantém um badge legível
// quando ele encosta noutro elemento.
const subtract = (shape, hole) => Math.max(shape, -hole);

// ── Rasterização ──────────────────────────────────────────────────────────
//
// Camadas empilhadas em source-over, cada uma com a própria cor e alfa. O
// ícone da marca precisa disso — chip escuro, borda clara e o N branco são
// três cores no mesmo PNG. Os outros ícones passam uma camada só.
function render(size, layers) {
  const n = size * SS;
  const unit = GRID / n;
  const cov = layers.map(() => new Float32Array(size * size));
  for (let sy = 0; sy < n; sy++) {
    for (let sx = 0; sx < n; sx++) {
      const gx = (sx + 0.5) * unit, gy = (sy + 0.5) * unit;
      for (let li = 0; li < layers.length; li++) {
        const a = Math.max(0, Math.min(1, 0.5 - layers[li].shape(gx, gy) / unit));
        cov[li][Math.floor(sy / SS) * size + Math.floor(sx / SS)] += a;
      }
    }
  }
  const px = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let li = 0; li < layers.length; li++) {
      const [lr, lg, lb] = layers[li].color;
      const la = (cov[li][i] / (SS * SS)) * (layers[li].alpha === undefined ? 1 : layers[li].alpha);
      const na = la + a * (1 - la);
      if (na > 0) {
        r = (lr * la + r * a * (1 - la)) / na;
        g = (lg * la + g * a * (1 - la)) / na;
        b = (lb * la + b * a * (1 - la)) / na;
      }
      a = na;
    }
    px[i * 4] = Math.round(r); px[i * 4 + 1] = Math.round(g); px[i * 4 + 2] = Math.round(b);
    px[i * 4 + 3] = Math.round(a * 255);
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
  const l = Buffer.alloc(4); l.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([l, body, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
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

// Capturar: visor. Quatro cantos e o ponto de foco — enquadrar, não
// fotografar. Sem moldura fechada: o vazio é que faz o ícone respirar.
const capture = (x, y) => {
  const a = 12, b = 52, arm = 13;
  return union(
    sdSegment(x, y, a, a, a + arm, a, S), sdSegment(x, y, a, a, a, a + arm, S),
    sdSegment(x, y, b, a, b - arm, a, S), sdSegment(x, y, b, a, b, a + arm, S),
    sdSegment(x, y, a, b, a + arm, b, S), sdSegment(x, y, a, b, a, b - arm, S),
    sdSegment(x, y, b, b, b - arm, b, S), sdSegment(x, y, b, b, b, b - arm, S),
    sdDisc(x, y, 32, 32, 4.6)
  );
};

// Gerar: faísca de lados côncavos (quadráticas puxadas pro centro).
function sparkle(cx, cy, r, k = 0.2) {
  const tips = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  let pts = [];
  for (let i = 0; i < 4; i++) {
    const a = tips[i], b = tips[(i + 1) % 4];
    const p0 = [cx + a[0] * r, cy + a[1] * r];
    const p1 = [cx + b[0] * r, cy + b[1] * r];
    const c = [cx + (a[0] + b[0]) * r * k, cy + (a[1] + b[1]) * r * k];
    pts = pts.concat(quad(p0, c, p1, 10).slice(0, -1));
  }
  return pts;
}
const FAISCA_GRANDE = sparkle(28, 29, 21);
const FAISCA_PEQUENA = sparkle(51, 52, 8);
const generate = (x, y) => union(sdPolyFill(x, y, FAISCA_GRANDE), sdPolyFill(x, y, FAISCA_PEQUENA));

// Nova cena: a vista com um "+" de crachá embaixo, à direita. O quadro é
// menor pra o crachá caber FORA dele — quando o vão come o canto, o que
// sobra parece um retângulo quebrado, não uma vista com um mais.
const scene = (x, y) => {
  const quadro = sdRoundBoxOutline(x, y, 6, 12, 40, 44, 7, S);
  const vao = sdDisc(x, y, 50, 50, 10);
  return union(
    subtract(quadro, vao),
    sdSegment(x, y, 50, 42, 50, 58, S),
    sdSegment(x, y, 42, 50, 58, 50, S)
  );
};

// Espelho: arco de espelho de parede com um brilho na diagonal. Um risco só —
// dois viravam mancha a 24 px.
const ARCO = (() => {
  const cx = 32, w = 14, top = 27, bottom = 55;
  return [[cx - w, bottom], ...arc(cx, top, w, Math.PI, 2 * Math.PI, 20), [cx + w, bottom]];
})();
const mirror = (x, y) => union(
  sdPath(x, y, ARCO, S, true),
  sdSegment(x, y, 26, 44, 38, 28, S - 1.1)
);

// Marca: o ConstellationN num chip. O chip existe por LEGIBILIDADE, não por
// enfeite — um N monocromático de #333 some numa toolbar escura, e a toolbar
// do SketchUp muda de cor com o tema. No claro quem carrega é o chip escuro;
// no escuro, a borda clara e o N branco. O desenho é o mesmo símbolo oficial
// (spacenode.svg): três traços e quatro nós.
//
// A geometria é a de sketchup/spacenode/assets/spacenode.svg — a adaptação
// OFICIAL do símbolo pra toolbar: grade 64, nós em (16,16) (16,48) (48,16)
// (48,48), traço 5, nó r 6. É o arquivo de que o conceito aprovado foi
// desenhado (medido lá: razão nó/traço 2,6; aqui 2,4). Antes o traço vinha
// do símbolo mestre (1,5) engrossado por um fator próprio, e o resultado era
// ou um N com bolhas (nó grande demais) ou um N sem constelação.
const brand = (size) => {
  void size; // o mesmo desenho a 24 e a 48: o arquivo oficial já é pra 24
  const s = 5;
  const dot = 6;
  const a = 16, b = 48;
  return [
    { shape: (x, y) => sdRoundBox(x, y, 1, 1, 63, 63, 15), color: [0x17, 0x17, 0x1a] },
    {
      shape: (x, y) => sdRoundBoxOutline(x, y, 2.1, 2.1, 61.9, 61.9, 14.1, 2.4),
      color: [0xff, 0xff, 0xff],
      alpha: 0.34,
    },
    {
      shape: (x, y) => union(
        sdSegment(x, y, a, a, a, b, s),
        sdSegment(x, y, a, a, b, b, s),
        sdSegment(x, y, b, a, b, b, s),
        sdDisc(x, y, a, a, dot), sdDisc(x, y, a, b, dot),
        sdDisc(x, y, b, a, dot), sdDisc(x, y, b, b, dot)
      ),
      color: [0xff, 0xff, 0xff],
    },
  ];
};

// Um ícone é ou uma forma só (na cor padrão) ou uma função que devolve camadas.
const mono = (shape) => () => [{ shape, color: COLOR }];

const ICONS = {
  spacenode: brand,
  'toolbar-capture': mono(capture),
  'toolbar-generate': mono(generate),
  'toolbar-scene': mono(scene),
  'toolbar-mirror': mono(mirror),
};

const outDir = process.argv[2] || path.join(import.meta.dirname, '..', 'sketchup', 'spacenode', 'assets');
fs.mkdirSync(outDir, { recursive: true });
for (const [name, layersFor] of Object.entries(ICONS)) {
  for (const size of [24, 48]) {
    const file = path.join(outDir, `${name}-${size}.png`);
    fs.writeFileSync(file, png(size, render(size, layersFor(size))));
    console.log(file, fs.statSync(file).size + ' bytes');
  }
}

// Atlas de sprites da barra flutuante NATIVA do plugin (1.8.0).
//
// A barra deixou de ser uma página: é uma janela Win32 própria com alfa por
// pixel (UpdateLayeredWindow), e tudo que ela desenha vem daqui — placa com
// sombra e fio luminoso, chips de estado, ícones, marca oficial, dicas com
// seta e os quadros do spinner. O Ruby só recorta e compõe (AlphaBlend).
//
// Formato de saída, por escala de tela (1, 1.25, 1.5, 2):
//   sketchup/spacenode/assets/glassbar/<escala>.json   — mapa de sprites e layout
//   sketchup/spacenode/assets/glassbar/<escala>.bin.z  — pixels BGRA PRÉ-MULTIPLICADOS,
//                                                        linhas de cima pra baixo, zlib
// Raw + zlib em vez de PNG: o Ruby do SketchUp infla com Zlib nativo e copia
// direto pra DIB, sem decodificar imagem nem pré-multiplicar em laço Ruby.
//
// Referência de formato aprovada em 18/09/26: retângulo de cantos suavizados
// (raio ≈ 24% da altura), chip do botão ativo mais claro com aro, dica escura
// com seta. Medidas em px CSS a 1x; tudo multiplica pela escala.
//
// Rodar: node scripts/sketchup-glassbar-atlas.mjs

import sharp from 'sharp';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'sketchup', 'spacenode', 'assets', 'glassbar');
const PREVIEW = process.env.GLASSBAR_PREVIEW; // pasta opcional pra PNGs de conferência

const SCALES = [1, 1.25, 1.5, 2];

// ── Geometria (px CSS, 1x) ───────────────────────────────────────────────────
const H = 54;         // altura da placa (largura, na vertical)
const R = 13;         // raio da placa
const BTN = 46;       // célula do botão
const CHIP_R = 12;    // raio do chip de estado
const ICON = 24;
const MARK = 28;      // marca oficial
const PAD = 6;        // folga nas pontas
const GRIP = 6;       // zona dos pontinhos de arrastar
const GAP = 6;        // entre grip e marca
const SEP_L = 6, SEP_R = 13; // margens do traço separador (assimétricas, medidas do conceito)
const SHADOW_M = 28;  // margem do sprite da placa pra sombra caber
const TIP_M = 14;     // margem do sprite da dica
const TIP_GAP = 8;    // distância da placa até a ponta da seta
const CARET = 6, CARET_W = 12;
const TIP_H = 24, TIP_PAD_X = 9, TIP_R = 8, TIP_FONT = 11;

const ORDER = ['panel', 'capture', 'generate', 'scene', 'edit'];

const LABELS = {
  pt: {
    panel: 'Abrir o painel · dois cliques giram a barra',
    capture: 'Capturar vista', generate: 'Gerar render', scene: 'Nova cena', edit: 'Editar este render',
    needRender: 'Gere um render primeiro', offline: 'Conecte sua conta SPACENODE', busy: 'Gerando…',
  },
  en: {
    panel: 'Open the panel · double-click to rotate',
    capture: 'Capture view', generate: 'Generate render', scene: 'New scene', edit: 'Edit this render',
    needRender: 'Generate a render first', offline: 'Connect your SPACENODE account', busy: 'Generating…',
  },
};

// Comprimento da placa e posição de cada célula ao longo do eixo principal.
function axisLayout() {
  let pos = PAD + GRIP + GAP;
  const cells = {};
  cells.panel = pos; pos += BTN;
  const sep = pos + SEP_L + 0.5; pos += SEP_L + 1 + SEP_R;
  for (const id of ORDER.slice(1)) { cells[id] = pos; pos += BTN; }
  const length = pos + PAD;
  return { cells, sep, length, grip: PAD };
}
const AX = axisLayout(); // length = 274

// ── SVGs ─────────────────────────────────────────────────────────────────────
const svgDoc = (w, h, body) =>
  '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' + body + '</svg>';

function plateSvg(vertical) {
  const L = AX.length;
  const w = vertical ? H : L, h = vertical ? L : H;
  const W = w + SHADOW_M * 2, Hh = h + SHADOW_M * 2;
  const x = SHADOW_M, y = SHADOW_M;
  let dots = '';
  // pontinhos de arrastar: 2×3 na horizontal, 3×2 na vertical
  const cols = vertical ? 3 : 2, rows = vertical ? 2 : 3;
  const gx = vertical ? x + H / 2 : x + AX.grip + GRIP / 2;
  const gy = vertical ? y + AX.grip + GRIP / 2 : y + H / 2;
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
    const dx = (c - (cols - 1) / 2) * 3.4, dy = (r - (rows - 1) / 2) * 3.4;
    dots += '<circle cx="' + (gx + dx) + '" cy="' + (gy + dy) + '" r="1.05" fill="#fff" fill-opacity="0.30"/>';
  }
  const sep = vertical
    ? '<line x1="' + (x + 17) + '" y1="' + (y + AX.sep) + '" x2="' + (x + 37) + '" y2="' + (y + AX.sep) + '" stroke="#fff" stroke-opacity="0.16"/>'
    : '<line x1="' + (x + AX.sep) + '" y1="' + (y + 17) + '" x2="' + (x + AX.sep) + '" y2="' + (y + 37) + '" stroke="#fff" stroke-opacity="0.16"/>';
  return svgDoc(W, Hh,
    '<defs>' +
    '<filter id="sh" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="7"/></filter>' +
    '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#fff" stop-opacity="0.07"/><stop offset="0.45" stop-color="#fff" stop-opacity="0"/>' +
    '<stop offset="1" stop-color="#000" stop-opacity="0.12"/></linearGradient>' +
    '</defs>' +
    // sombra suave, só alfa
    '<rect x="' + x + '" y="' + (y + 7) + '" width="' + w + '" height="' + h + '" rx="' + R + '" fill="#000" fill-opacity="0.42" filter="url(#sh)"/>' +
    // corpo fumê translúcido (o conceito escurece o fundo pra ~63%)
    '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + R + '" fill="#24242a" fill-opacity="0.58"/>' +
    '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + R + '" fill="url(#g)"/>' +
    // fio luminoso discreto
    '<rect x="' + (x + 0.5) + '" y="' + (y + 0.5) + '" width="' + (w - 1) + '" height="' + (h - 1) + '" rx="' + (R - 0.5) + '" fill="none" stroke="#fff" stroke-opacity="0.30"/>' +
    dots + sep);
}

function chipSvg(kind) {
  const fill = { hover: 0.10, press: 0.18, on: 0.22 }[kind];
  const ring = kind === 'on' ? '<rect x="0.5" y="0.5" width="' + (BTN - 1) + '" height="' + (BTN - 1) + '" rx="' + (CHIP_R - 0.5) + '" fill="none" stroke="#fff" stroke-opacity="0.36"/>' : '';
  return svgDoc(BTN, BTN,
    '<rect x="0" y="0" width="' + BTN + '" height="' + BTN + '" rx="' + CHIP_R + '" fill="#fff" fill-opacity="' + fill + '"/>' + ring);
}

const ICON_PATHS = {
  capture: '<path d="M4 9V5.6C4 4.7 4.7 4 5.6 4H9"/><path d="M20 9V5.6C20 4.7 19.3 4 18.4 4H15"/><path d="M4 15v3.4c0 .9.7 1.6 1.6 1.6H9"/><path d="M20 15v3.4c0 .9-.7 1.6-1.6 1.6H15"/><circle cx="12" cy="12" r="2.4" fill="#fff" stroke="none"/>',
  generate: '<path d="M12 3.4c.7 3.6 1.6 4.5 5.2 5.2-3.6.7-4.5 1.6-5.2 5.2-.7-3.6-1.6-4.5-5.2-5.2 3.6-.7 4.5-1.6 5.2-5.2Z"/><path d="M18 15.2c.35 1.8.8 2.25 2.6 2.6-1.8.35-2.25.8-2.6 2.6-.35-1.8-.8-2.25-2.6-2.6 1.8-.35 2.25-.8 2.6-2.6Z"/>',
  scene: '<path d="M14.5 5H5.6C4.7 5 4 5.7 4 6.6v9.8c0 .9.7 1.6 1.6 1.6h9.8c.9 0 1.6-.7 1.6-1.6V9"/><path d="M19.5 4.5v5M22 7h-5"/>',
  edit: '<path d="M4.5 19.5l4.2-1.1L19 8.1a1.9 1.9 0 0 0 0-2.7l-.4-.4a1.9 1.9 0 0 0-2.7 0L5.6 15.3 4.5 19.5Z"/>',
};
function iconSvg(id) {
  return svgDoc(ICON, ICON,
    '<g fill="none" stroke="#fff" stroke-opacity="0.95" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + ICON_PATHS[id] + '</g>');
}
// ConstellationN — geometria de sketchup/spacenode/assets/spacenode.svg (a
// adaptação oficial do símbolo pra toolbar: traço 5, nó r 6, grade 64).
function markSvg() {
  const k = MARK / 64;
  return svgDoc(MARK, MARK,
    '<g transform="scale(' + k + ')">' +
    '<g stroke="#fff" stroke-opacity="0.95" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none">' +
    '<line x1="16" y1="16" x2="16" y2="48"/><line x1="16" y1="16" x2="48" y2="48"/><line x1="48" y1="16" x2="48" y2="48"/></g>' +
    '<g fill="#fff" fill-opacity="0.95"><circle cx="16" cy="16" r="6"/><circle cx="16" cy="48" r="6"/><circle cx="48" cy="16" r="6"/><circle cx="48" cy="48" r="6"/></g>' +
    '</g>');
}
function spinSvg(frame) {
  const S = 20, c = S / 2, r = 7.6;
  const a0 = (frame * 45) * Math.PI / 180, a1 = a0 + 100 * Math.PI / 180;
  const p = (a) => (c + r * Math.cos(a)).toFixed(2) + ' ' + (c + r * Math.sin(a)).toFixed(2);
  return svgDoc(S, S,
    '<circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="none" stroke="#fff" stroke-opacity="0.26" stroke-width="1.8"/>' +
    '<path d="M' + p(a0) + ' A' + r + ' ' + r + ' 0 0 1 ' + p(a1) + '" fill="none" stroke="#fff" stroke-opacity="0.95" stroke-width="1.8" stroke-linecap="round"/>');
}

// ── Dicas: texto medido de verdade (render + trim) ───────────────────────────
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const FONT = 'font-family="Segoe UI, Helvetica Neue, Arial, sans-serif" font-size="' + TIP_FONT + '" font-weight="500"';
async function measure(text) {
  const svg = svgDoc(600, 60, '<text x="20" y="30" ' + FONT + ' fill="#fff">' + esc(text) + '</text>');
  const { info } = await sharp(Buffer.from(svg), { density: 72 * 4 }).png().trim().toBuffer({ resolveWithObject: true });
  // trim reporta o deslocamento negativo até o conteúdo; /4 volta pra px CSS
  return { w: info.width / 4, top: -info.trimOffsetTop / 4, h: info.height / 4 };
}
let metrics = null; // ascendente/descendente da fonte, medidos uma vez
async function fontMetrics() {
  if (metrics) return metrics;
  const m = await measure('Ãgpqy');
  metrics = { ascent: 30 - m.top, descent: m.top + m.h - 30 };
  return metrics;
}
async function tipSvg(text, vertical) {
  const { ascent, descent } = await fontMetrics();
  const tw = Math.ceil((await measure(text)).w);
  const bw = tw + TIP_PAD_X * 2, bh = TIP_H;
  const baseline = (bh - (ascent + descent)) / 2 + ascent;
  let W, Hh, bx, by, caret, caretPath;
  if (vertical) {
    W = TIP_M + CARET + bw + TIP_M; Hh = TIP_M + bh + TIP_M;
    bx = TIP_M + CARET; by = TIP_M;
    caret = { x: TIP_M, y: Hh / 2 };
    caretPath = 'M' + caret.x + ' ' + caret.y + ' L' + (bx + 0.5) + ' ' + (caret.y - CARET_W / 2) + ' L' + (bx + 0.5) + ' ' + (caret.y + CARET_W / 2) + ' Z';
  } else {
    W = TIP_M + bw + TIP_M; Hh = TIP_M + CARET + bh + TIP_M;
    bx = TIP_M; by = TIP_M + CARET;
    caret = { x: W / 2, y: TIP_M };
    caretPath = 'M' + caret.x + ' ' + caret.y + ' L' + (caret.x - CARET_W / 2) + ' ' + (by + 0.5) + ' L' + (caret.x + CARET_W / 2) + ' ' + (by + 0.5) + ' Z';
  }
  const svg = svgDoc(W, Hh,
    '<defs><filter id="sh" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="5"/></filter></defs>' +
    '<rect x="' + bx + '" y="' + (by + 5) + '" width="' + bw + '" height="' + bh + '" rx="' + TIP_R + '" fill="#000" fill-opacity="0.45" filter="url(#sh)"/>' +
    '<path d="' + caretPath + '" fill="#121214" fill-opacity="0.94"/>' +
    '<rect x="' + bx + '" y="' + by + '" width="' + bw + '" height="' + bh + '" rx="' + TIP_R + '" fill="#121214" fill-opacity="0.94"/>' +
    '<rect x="' + (bx + 0.5) + '" y="' + (by + 0.5) + '" width="' + (bw - 1) + '" height="' + (bh - 1) + '" rx="' + (TIP_R - 0.5) + '" fill="none" stroke="#fff" stroke-opacity="0.13"/>' +
    '<text x="' + (bx + TIP_PAD_X) + '" y="' + (by + baseline).toFixed(2) + '" ' + FONT + ' fill="#fff" fill-opacity="0.96">' + esc(text) + '</text>');
  return { svg, caret, box: { w: bw, h: bh } };
}

// ── Empacotador de prateleira ────────────────────────────────────────────────
function pack(items, maxW) {
  const PADP = 2;
  let x = PADP, y = PADP, shelf = 0, W = 0;
  const placed = [];
  for (const it of items) {
    if (x + it.w + PADP > maxW && x > PADP) { x = PADP; y += shelf + PADP; shelf = 0; }
    placed.push({ ...it, x, y });
    x += it.w + PADP; shelf = Math.max(shelf, it.h); W = Math.max(W, x);
  }
  return { placed, w: W, h: y + shelf + PADP };
}

async function raster(svg, scale) {
  const { data, info } = await sharp(Buffer.from(svg), { density: 72 * scale }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

async function build(scale) {
  const px = (v) => Math.round(v * scale);
  const sprites = [];
  const add = async (name, svg, extra = {}) => { const r = await raster(svg, scale); sprites.push({ name, ...r, ...extra }); };

  await add('plate_h', plateSvg(false));
  await add('plate_v', plateSvg(true));
  for (const k of ['hover', 'press', 'on']) await add('chip_' + k, chipSvg(k));
  await add('icon_panel', markSvg());
  for (const id of ORDER.slice(1)) await add('icon_' + id, iconSvg(id));
  for (let i = 0; i < 8; i++) await add('spin_' + i, spinSvg(i));
  let tipMaxW = 0;
  for (const [loc, labels] of Object.entries(LABELS)) {
    for (const [key, text] of Object.entries(labels)) {
      for (const vertical of [false, true]) {
        const t = await tipSvg(text, vertical);
        await add('tip_' + (vertical ? 'v' : 'h') + '_' + loc + '_' + key, t.svg,
          { caret: { x: px(t.caret.x), y: px(t.caret.y) } });
        if (vertical) tipMaxW = Math.max(tipMaxW, t.box.w);
      }
    }
  }

  // maior sprite primeiro reduz buracos
  sprites.sort((a, b) => b.h - a.h);
  const packed = pack(sprites, px(1024));
  const atlas = Buffer.alloc(packed.w * packed.h * 4);
  for (const s of packed.placed) {
    for (let row = 0; row < s.h; row++) {
      s.data.copy(atlas, ((s.y + row) * packed.w + s.x) * 4, row * s.w * 4, (row + 1) * s.w * 4);
    }
  }
  // RGBA reto → BGRA pré-multiplicado (o que UpdateLayeredWindow/AlphaBlend esperam)
  const out = Buffer.alloc(atlas.length);
  for (let i = 0; i < atlas.length; i += 4) {
    const a = atlas[i + 3];
    out[i] = Math.round(atlas[i + 2] * a / 255);
    out[i + 1] = Math.round(atlas[i + 1] * a / 255);
    out[i + 2] = Math.round(atlas[i] * a / 255);
    out[i + 3] = a;
  }

  // ── Layout das janelas (px de dispositivo) ────────────────────────────────
  const layout = {};
  for (const vertical of [false, true]) {
    const L = AX.length;
    const plateW = vertical ? H : L, plateH = vertical ? L : H;
    // a dica pode ultrapassar as pontas da placa (horizontal) ou ficar à direita (vertical)
    const sideW = vertical ? TIP_GAP + CARET + tipMaxW + TIP_M * 2 : Math.max(SHADOW_M, 110);
    const plateX = vertical ? SHADOW_M : sideW;
    const plateY = SHADOW_M;
    const winW = vertical ? SHADOW_M + plateW + sideW : plateW + sideW * 2;
    const winH = vertical ? plateH + SHADOW_M * 2 : SHADOW_M + plateH + TIP_GAP + CARET + TIP_H + TIP_M + 10;
    const cells = {};
    for (const id of ORDER) {
      const along = AX.cells[id];
      cells[id] = vertical
        ? { x: px(plateX + 4), y: px(plateY + along), w: px(BTN), h: px(BTN) }
        : { x: px(plateX + along), y: px(plateY + 4), w: px(BTN), h: px(BTN) };
    }
    layout[vertical ? 'vertical' : 'horizontal'] = {
      window: { w: px(winW), h: px(winH) },
      plate: { x: px(plateX), y: px(plateY), w: px(plateW), h: px(plateH) },
      plateSprite: { dx: -px(SHADOW_M), dy: -px(SHADOW_M) },
      cells,
      tip: { side: vertical ? 'right' : 'bottom', gap: px(TIP_GAP) },
    };
  }

  const json = {
    version: 1,
    scale,
    atlas: { w: packed.w, h: packed.h },
    sprites: Object.fromEntries(packed.placed.map((s) => [s.name, { x: s.x, y: s.y, w: s.w, h: s.h, ...(s.caret ? { caret: s.caret } : {}) }])),
    layout,
    labels: LABELS,
  };
  fs.mkdirSync(OUT, { recursive: true });
  const base = path.join(OUT, String(scale));
  fs.writeFileSync(base + '.json', JSON.stringify(json));
  const z = zlib.deflateSync(out, { level: 9 });
  fs.writeFileSync(base + '.bin.z', z);
  if (PREVIEW) {
    fs.mkdirSync(PREVIEW, { recursive: true });
    await sharp(atlas, { raw: { width: packed.w, height: packed.h, channels: 4 } }).png().toFile(path.join(PREVIEW, 'atlas-' + scale + 'x.png'));
  }
  console.log('escala ' + scale + ': atlas ' + packed.w + 'x' + packed.h + ', ' + sprites.length + ' sprites, ' + z.length + ' bytes zlib');
}

for (const s of SCALES) await build(s);

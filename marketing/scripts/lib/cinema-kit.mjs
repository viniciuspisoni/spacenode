/**
 * CINEMA KIT — filme de apresentação do SPACENODE.
 *
 * Irmão do `reel-kit.mjs`, com outra gramática. O reel-kit foi feito para o feed:
 * 9:16 fixo, banda da imagem entre 4:3 e 16:9, zona segura do Instagram, texto que
 * troca em CORTE SECO (`overlay=enable='between(...)'`) e Ken Burns linear.
 *
 * Um filme de keynote precisa de outra coisa:
 *
 *   quadro       → configurável (1920×1080 master, 1080×1920 corte vertical)
 *   fundo        → #0A0A0A do BRIEF (preto de marca), nunca a imagem desfocada
 *   texto        → entra e sai em FADE DE ALPHA com easing, sobre a imagem viva
 *   movimento    → zoompan com smoothstep (acelera e desacelera), nunca linear
 *   respiração   → segmento `black`: um beat de preto puro entre atos
 *   letterbox    → opcional, barras 2.39:1 desenhadas no fim
 *
 * O resto (montagem por segmentos intermediários + xfade/concat, cards HTML
 * capturados com Playwright em dSF 2 e reduzidos com lanczos, `settb=AVTB` nos
 * dois ramos de todo xfade, TEMP descartado no início) é herdado do reel-kit
 * porque já está calibrado — inclusive os erros que ele aprendeu a evitar.
 *
 * Spec: ver `marketing/scripts/cinema.mjs --exemplo`.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

import { ffmpeg, probe } from './tools.mjs';

const BRAND_DIR = resolve(import.meta.dirname, '../../brand');
export const FPS = 30;

/**
 * Os dois fundos do BRIEF.md. O escuro não é o #1a1a1a das faixas da landing: filme é
 * mais fundo. O claro é o mesmo #FAFAFA das faixas claras.
 *
 * Um filme pode virar de um para o outro no meio (é a gramática de "isto roda há meses":
 * metade escura de ambientação, metade clara de prova), então tema é por SEGMENTO e por
 * CARD, nunca global.
 */
const BG = '#0A0A0A';
const BG_LIGHT = '#FAFAFA';

/** `bg` do segmento/card → cor de chapa. Aceita 'light', 'dark' ou um hex direto. */
const plate = (v) => (v === 'light' ? BG_LIGHT : v === 'dark' || !v ? BG : v);
const hex0x = (c) => c.replace('#', '0x');

const even = (n) => Math.round(n / 2) * 2;
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/** `{palavra}` → única palavra em verde (#30D158). Máx. 1 por peça inteira. */
export const accentuate = (t) => String(t).replace(/\{([^}]+)\}/g, '<span class="accent">$1</span>');
/** `[trecho]` → cinza terciário, como a 2ª linha do título do hero da landing. */
const dim = (t) => String(t).replace(/\[([^\]]+)\]/g, '<span class="dim">$1</span>');
const rich = (t) => accentuate(dim(esc(t))).replace(/&lt;br&gt;/g, '<br>');

export async function dims(src) {
  const { streams, format } = await probe(src);
  const s = streams[0];
  return { w: s.width, h: s.height, aspect: s.width / s.height, duration: Number(format?.duration || 0) };
}

/**
 * Geometria do quadro. `vertical` liga a zona segura do Instagram (220 no topo,
 * 320 na base) — no master 16:9 não existe UI cobrindo nada, então a margem é só
 * respiro de composição.
 */
export function frameGeometry({ w = 1920, h = 1080 } = {}, letterbox = 0) {
  const vertical = h > w;
  // As barras do letterbox comem quadro: sem descontá-las aqui, um card ancorado
  // na base escreve DENTRO da barra preta e o texto some. A zona segura recua para
  // dentro da janela visível.
  const bar = letterbox ? Math.max(even((h - w / letterbox) / 2), 0) : 0;
  const top = bar + (vertical ? 220 : 96);
  const bottom = h - bar - (vertical ? 320 : 96);
  return {
    w: even(w),
    h: even(h),
    vertical,
    bar,
    safeTop: top,
    safeBottom: bottom,
    margin: vertical ? 80 : 160,
    col: vertical ? w - 160 : Math.min(w - 320, 1360),
  };
}

// ------------------------------------------------------------------ CARDS ---

const fontFace = (file, ext = false) => `
@font-face {
  font-family: 'GeistLocal';
  src: url('${pathToFileURL(join(BRAND_DIR, file)).href}') format('woff2');
  font-weight: 100 900;
  font-style: normal;
  font-display: block;
  ${ext ? 'unicode-range: U+0100-024F, U+0259, U+1E00-1EFF, U+2020, U+20A0-20AB, U+20AD-20CF, U+2113, U+2C60-2C7F, U+A720-A7FF;' : ''}
}`;

const logoSvg = () =>
  readFileSync(join(BRAND_DIR, 'spacenode-logo-horizontal.svg'), 'utf8')
    .replace("font-family=\"Geist, 'Geist Sans', -apple-system, sans-serif\"", 'font-family="GeistLocal"');

const symbolSvg = () => readFileSync(join(BRAND_DIR, 'spacenode-symbol.svg'), 'utf8');

/**
 * CSS dos cards do filme. Tipografia da landing de set/2026: Geist 200–500,
 * tracking apertado (-0.03 a -0.045em), títulos em minúsculas com ponto final,
 * eyebrow uppercase 0.22em entre fios de 0.5px. No filme os pesos descem um
 * degrau (o texto fica mais tempo na tela e maior, então pede traço mais fino).
 */
const cardCss = (F) => `
.wrap { position: absolute; left: ${(F.w - F.col) / 2}px; width: ${F.col}px; text-align: center;
  display: flex; flex-direction: column; align-items: center; gap: 28px; }
/* Eixo tipográfico à esquerda: as cartelas de afirmação do filme voltam sempre ao mesmo x,
   para o leitor reencontrar o ponto do quadro onde a peça fala com ele. */
.wrap.left { left: ${F.margin}px; width: ${F.w - F.margin * 2}px; text-align: left; align-items: flex-start; }
.brand { display: flex; flex-direction: column; align-items: center; gap: 30px; }
.brand svg { height: 120px; width: auto; }
.wrap.center { top: 50%; transform: translateY(-50%); }
.wrap.bottom { bottom: ${F.h - F.safeBottom + 40}px; }
.wrap.top { top: ${F.safeTop + 40}px; }
.eyebrow { display: inline-flex; align-items: center; gap: 18px; font-size: 22px; font-weight: 500;
  text-transform: uppercase; letter-spacing: 0.22em; color: #a1a1a6; }
.eyebrow i { display: block; width: 34px; height: 1px; background: rgba(255,255,255,0.26); }
.big { font-size: 88px; font-weight: 200; line-height: 1.07; letter-spacing: -0.045em;
  color: #f5f5f7; text-wrap: balance; }
.mid { font-size: 60px; font-weight: 300; line-height: 1.12; letter-spacing: -0.038em;
  color: #f5f5f7; text-wrap: balance; }
.small { font-size: 34px; font-weight: 400; line-height: 1.45; letter-spacing: -0.012em;
  color: #a1a1a6; text-wrap: balance; }
/* #8a8a8f, não o #6e6e73 da landing: aqui o texto vive por cima de imagem, e o
   cinza terciário mais fechado desaparecia dentro da fachada. */
.dim { color: #8a8a8f; }
.accent { color: #30D158; }

/* Lower-third: legenda de interface, ancorada à esquerda, com fio fino em cima. */
.lower { position: absolute; left: ${F.margin}px; bottom: ${F.h - F.safeBottom + 40}px;
  max-width: ${Math.round(F.col * 0.72)}px; text-align: left; }
.lower .rule { width: 64px; height: 1px; background: rgba(255,255,255,0.4); margin-bottom: 26px; }
.lower .label { font-size: 20px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.22em;
  color: #a1a1a6; display: block; margin-bottom: 16px; }
.lower .text { font-size: 44px; font-weight: 300; line-height: 1.18; letter-spacing: -0.03em; color: #f5f5f7; }

/* Scrim: contraste do texto sobre imagem clara. Camada própria, como no reel-kit. */
.scrim-top, .scrim-bottom { position: absolute; left: 0; right: 0; }
.scrim-top { top: 0; height: ${Math.round(F.h * 0.42)}px;
  background: linear-gradient(180deg, rgba(10,10,10,0.86) 0%, rgba(10,10,10,0.42) 58%, rgba(10,10,10,0) 100%); }
.scrim-bottom { bottom: 0; height: ${Math.round(F.h * 0.46)}px;
  background: linear-gradient(0deg, rgba(10,10,10,0.90) 0%, rgba(10,10,10,0.48) 58%, rgba(10,10,10,0) 100%); }
.scrim-full { position: absolute; inset: 0; background: rgba(10,10,10,0.5); }

/* Vinheta: fecha as bordas sem escurecer o centro. Sutil de propósito. */
.vignette { position: absolute; inset: 0;
  background: radial-gradient(ellipse at center, rgba(0,0,0,0) 44%, rgba(0,0,0,0.34) 100%); }

/* Cartela final: símbolo + wordmark + CTA + microcopy. */
.final { position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 44px; }
.final svg { width: ${F.vertical ? 460 : 520}px; height: auto; margin-bottom: 20px; }
.final .cta { display: inline-flex; align-items: center; gap: 18px; padding: 24px 46px; border-radius: 16px;
  background: #f5f5f7; color: ${BG}; font-size: 34px; font-weight: 500; letter-spacing: -0.012em; }
.final .micro { font-size: 24px; font-weight: 400; color: #6e6e73; letter-spacing: 0.005em; }
.final .url { font-size: 28px; font-weight: 400; color: #a1a1a6; letter-spacing: 0.02em; }

/* Variante clara — espelha as faixas claras da landing (#fafafa / #1a1a1a / verde #30b46c).
   O verde muda de tom porque o #30D158 do escuro não tem contraste suficiente sobre claro. */
body.light .big, body.light .mid, body.light .lower .text { color: #1a1a1a; }
body.light .small, body.light .eyebrow, body.light .lower .label { color: #6e6e73; }
body.light .dim { color: #86868b; }
body.light .accent { color: #30b46c; }
body.light .eyebrow i { background: rgba(0,0,0,0.20); }
body.light .lower .rule { background: rgba(0,0,0,0.32); }
body.light .scrim-top { background: linear-gradient(180deg, rgba(250,250,250,0.90) 0%, rgba(250,250,250,0.45) 58%, rgba(250,250,250,0) 100%); }
body.light .scrim-bottom { background: linear-gradient(0deg, rgba(250,250,250,0.92) 0%, rgba(250,250,250,0.5) 58%, rgba(250,250,250,0) 100%); }
body.light .scrim-full { background: rgba(250,250,250,0.55); }
body.light .final .cta { background: #1a1a1a; color: ${BG_LIGHT}; }
body.light .final .micro { color: #86868b; }
body.light .final .url { color: #6e6e73; }
/* O SVG da marca é branco; no claro ele precisa virar escuro. */
body.light .final svg, body.light .brand svg { filter: invert(1); }
`;

/** Envelope HTML do card, no tamanho do quadro do filme. */
export function cardHtml({ body, F, solid = false, light = false }) {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><style>
${fontFace('geist-latin.woff2')}
${fontFace('geist-latin-ext.woff2', true)}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: ${F.w}px; height: ${F.h}px; }
body { background: ${solid ? (light ? BG_LIGHT : BG) : 'transparent'}; font-family: 'GeistLocal', sans-serif;
  color: ${light ? '#1a1a1a' : '#f5f5f7'};
  -webkit-font-smoothing: antialiased; position: relative; overflow: hidden; }
${cardCss(F)}
</style></head><body class="${light ? 'light' : ''}">${body}</body></html>`;
}

const eyebrowHtml = (t) => `<span class="eyebrow"><i></i>${rich(t)}<i></i></span>`;

/** Card declarado no spec → HTML. */
export function cardFromSpec(c, F) {
  const anchor = c.anchor || 'center';
  switch (c.layout) {
    case 'line': {
      // Uma ideia por plano: eyebrow opcional, uma frase grande, apoio opcional.
      const size = c.size === 'mid' ? 'mid' : 'big';
      // `logo: 'symbol' | 'horizontal'` põe a marca acima da linha — é o cartão de
      // apresentação ("este é o spacenode."), que não é a cartela final e não leva CTA.
      const marca = c.logo === 'symbol' ? `<div class="brand">${symbolSvg()}</div>`
        : c.logo === 'horizontal' ? `<div class="brand">${logoSvg()}</div>` : '';
      const parts = [
        marca,
        c.eyebrow ? eyebrowHtml(c.eyebrow) : '',
        c.big ? `<div class="${size}"${c.px ? ` style="font-size:${c.px}px"` : ''}>${rich(c.big)}</div>` : '',
        c.small ? `<div class="small">${rich(c.small)}</div>` : '',
      ].join('');
      // Texto centralizado sobre imagem cheia não tem contraste: o scrim de topo/base
      // não cobre o meio do quadro, e a frase some dentro da fachada. `scrim: "full"`
      // abaixa a imagem inteira sob o texto — é o que a Apple faz quando escreve
      // por cima do produto.
      const scrim = c.scrim === 'full' ? '<div class="scrim-full"></div>'
        : c.scrim ? '<div class="scrim-top"></div><div class="scrim-bottom"></div>' : '';
      return cardHtml({ F, light: c.theme === 'light', solid: c.solid === true, body: `${scrim}<div class="wrap ${anchor}${c.align === "left" ? " left" : ""}"${c.maxw ? ` style="width:${c.maxw}px"` : ""}>${parts}</div>` });
    }
    case 'lower': {
      // Legenda de interface: nunca compete com a imagem, fica no canto.
      const body = `${c.scrim ? '<div class="scrim-bottom"></div>' : ''}<div class="lower"><div class="rule"></div>${
        c.label ? `<span class="label">${rich(c.label)}</span>` : ''}<div class="text">${rich(c.text || '')}</div></div>`;
      return cardHtml({ F, light: c.theme === 'light', body });
    }
    case 'scrim':
      return cardHtml({ F, light: c.theme === 'light', body: c.full ? '<div class="scrim-full"></div>' : '<div class="scrim-top"></div><div class="scrim-bottom"></div>' });
    case 'vignette':
      return cardHtml({ F, light: c.theme === 'light', body: '<div class="vignette"></div>' });
    case 'final': {
      const micro = c.micro === '' ? '' : `<div class="micro">${rich(c.micro || '80 nodes grátis · sem cartão · em português')}</div>`;
      const body = `<div class="final">${logoSvg()}${
        c.cta ? `<div class="cta">${rich(c.cta)} <span>&rarr;</span></div>` : ''}${micro}${
        c.url ? `<div class="url">${rich(c.url)}</div>` : ''}</div>`;
      return cardHtml({ F, light: c.theme === 'light', solid: true, body });
    }
    case 'symbol':
      // Só o símbolo ConstellationN respirando no preto — abertura de filme.
      return cardHtml({ F, light: c.theme === 'light', solid: c.solid !== false, body: `<div class="final" style="gap:0">${symbolSvg().replace('<svg', `<svg style="width:${c.size || 200}px"`)}</div>` });
    case 'html':
      return cardHtml({ F, light: c.theme === 'light', solid: c.solid === true, body: c.body || '' });
    default:
      throw new Error(`layout de card desconhecido: ${c.layout}`);
  }
}

/** Captura em dSF 2 e reduz com lanczos — texto é o que mais sofre na compressão. */
export async function captureCards(cards, outDir, tmpDir, F) {
  await mkdir(outDir, { recursive: true });
  await mkdir(tmpDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: F.w, height: F.h }, deviceScaleFactor: 2 });
  const results = {};
  try {
    for (const [name, html] of Object.entries(cards)) {
      const htmlPath = join(tmpDir, `${name}.html`);
      const bigPath = join(tmpDir, `${name}@2x.png`);
      const finalPath = join(outDir, `${name}.png`);
      await writeFile(htmlPath, html, 'utf8');
      await page.goto(pathToFileURL(htmlPath).href);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: bigPath, omitBackground: true });
      await ffmpeg(['-i', bigPath, '-vf', `scale=${F.w}:${F.h}:flags=lanczos`, finalPath]);
      results[name] = finalPath;
    }
  } finally {
    await browser.close();
  }
  return results;
}

// -------------------------------------------------------------- SEGMENTOS ---

/**
 * Ken Burns com SMOOTHSTEP (3p²−2p³): o movimento nasce parado, ganha velocidade
 * e morre parado. É a diferença entre "slideshow com zoom" e plano de cinema —
 * o zoom linear do reel-kit denuncia o corte porque começa e termina em solavanco.
 * `pan`/`panY` em fração 0–1 da folga que o zoom abre (0 = borda, 0.5 = centro).
 */
const zoompan = (from, to, frames, w, h, pan, panY, perFrame = false, ease = true) => {
  const n = Math.max(frames - 1, 1);
  const p = `(on/${n})`;
  const e = ease ? `(3*pow(${p},2)-2*pow(${p},3))` : p;
  const x = pan ? `(iw-iw/zoom)*(${pan[0]}+${pan[1] - pan[0]}*${e})` : 'iw/2-(iw/zoom/2)';
  const y = panY ? `(ih-ih/zoom)*(${panY[0]}+${panY[1] - panY[0]}*${e})` : 'ih/2-(ih/zoom/2)';
  return `zoompan=z='${from}+${to - from}*${e}':x='${x}':y='${y}':d=${perFrame ? 1 : frames}:s=${w}x${h}:fps=${FPS}`;
};

const ENC = ['-r', String(FPS), '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', '-pix_fmt', 'yuv420p'];

/**
 * Still. Três encaixes:
 *   cover   → preenche o quadro (recorte). Para render em tela cheia.
 *   contain → a imagem INTEIRA flutuando no preto de marca, com margem. É o modo
 *             das capturas de interface: nada de fundo desfocado, nada de recorte.
 *   width   → a imagem ocupa a largura toda, centrada verticalmente (sangra em cima/baixo).
 */
export async function renderStill(seg, F, tmp, i) {
  const out = join(tmp, `seg-${i}.mp4`);
  const frames = Math.round(seg.dur * FPS);
  const [zf, zt] = seg.zoom || [1, 1.05];
  const ease = seg.ease !== false;
  const fit = seg.fit || 'cover';
  const info = {};

  // Recorte da FONTE, antes de qualquer encaixe. As capturas do app são retratos
  // altos (1000×2800 — o painel inteiro): jogadas inteiras num quadro 16:9 viram
  // uma tira estreita entre dois vazios pretos. O plano certo é o close macro num
  // pedaço: `crop: [x, y, w, h]` em pixels da fonte, ou `cropFrac` em fração 0–1.
  let src = seg.src;
  let d = await dims(seg.src);
  const cr = seg.crop || (seg.cropFrac && [
    seg.cropFrac[0] * d.w, seg.cropFrac[1] * d.h, seg.cropFrac[2] * d.w, seg.cropFrac[3] * d.h,
  ]);
  if (cr) {
    const [cx, cy, cw, ch] = cr.map((v) => Math.round(v));
    if (cx < 0 || cy < 0 || cw <= 0 || ch <= 0 || cx + cw > d.w || cy + ch > d.h) {
      throw new Error(`segmento ${i}: crop ${cw}×${ch} @ ${cx},${cy} sai da imagem ${d.w}×${d.h}`);
    }
    src = join(tmp, `seg-${i}-crop.png`);
    await ffmpeg(['-i', seg.src, '-vf', `crop=${cw}:${ch}:${cx}:${cy}`, src]);
    info.source = `crop ${cw}×${ch} @ ${cx},${cy} de ${d.w}×${d.h}`;
    d = { w: cw, h: ch, aspect: cw / ch, duration: 0 };
  }

  // Escurecer/dessaturar o plano é como se abre espaço para o texto por cima.
  const eq = (seg.brightness || seg.saturation)
    ? `,eq=brightness=${seg.brightness ?? 0}:saturation=${seg.saturation ?? 1}` : '';

  if (fit === 'cover') {
    const cov = join(tmp, `seg-${i}-cover.png`);
    const keepWidth = !!seg.pan && d.aspect > F.w / F.h;
    await ffmpeg(['-i', src, '-vf', keepWidth
      ? `scale=-2:${F.h * 2}:flags=lanczos`
      : `scale=${F.w * 2}:${F.h * 2}:force_original_aspect_ratio=increase:flags=lanczos,crop=${F.w * 2}:${F.h * 2}`, cov]);
    const zoomBase = keepWidth ? (d.aspect * F.h) / F.w : 1;
    await ffmpeg(['-i', cov, '-filter_complex',
      `[0:v]${zoompan(zf * zoomBase, zt * zoomBase, frames, F.w, F.h, seg.pan, seg.panY, false, ease)}${eq},setsar=1,format=yuv420p[out]`,
      '-map', '[out]', '-t', String(seg.dur), ...ENC, out]);
    info.crop = keepWidth ? `cover+pan ${seg.pan.join('→')}` : `cover ${d.w}×${d.h}`;
  } else {
    // contain / width: a imagem inteira sobre o preto de marca.
    // `reserveBottom` encolhe a imagem e a sobe, deixando uma faixa preta embaixo
    // para a legenda. Sem isso a legenda branca do card `lower` cai em cima do
    // painel claro do app e some — foi o que o primeiro QA mostrou.
    const inset = seg.inset ?? (fit === 'width' ? 0 : F.margin);
    const reserve = seg.reserveBottom || 0;
    const maxW = F.w - inset * 2;
    const maxH = (fit === 'width' ? F.h : F.safeBottom - F.safeTop) - reserve;
    let iw;
    let ih;
    if (seg.nativo) {
      // Escala 1:1, sem upscale nenhum. É o modo de um recorte de interface: um botão
      // de 902×98 esticado para a largura do quadro deixa de ler como software e passa
      // a ler como arte — e o argumento da cena é justamente que aquilo é a tela real.
      iw = even(d.w);
      ih = even(d.h);
      if (iw > F.w || ih > F.h) throw new Error(`segmento ${i}: nativo não cabe no quadro (${d.w}×${d.h} em ${F.w}×${F.h})`);
    } else {
      iw = maxW;
      ih = even(iw / d.aspect);
      if (fit !== 'width' && ih > maxH) { ih = even(maxH); iw = even(ih * d.aspect); }
      iw = even(iw);
    }
    // `posX` desloca a imagem na folga horizontal (0 = colada à esquerda, 0.5 = centro,
    // 1 = à direita). É o que abre espaço para o texto ao lado, em vez de por cima: um
    // recorte alto e estreito (a barra lateral do app) centrado no quadro colide com
    // qualquer cartela ancorada embaixo.
    const x = even((F.w - iw) * (seg.posX ?? 0.5));
    const y = even((F.h - reserve - ih) / 2);
    const bg = join(tmp, `seg-${i}-bg.png`);
    const plateImg = join(tmp, `seg-${i}-plate.png`);
    await ffmpeg(['-f', 'lavfi', '-i', `color=c=${hex0x(plate(seg.bg))}:s=${F.w}x${F.h}`, '-frames:v', '1', bg]);
    await ffmpeg(['-i', src, '-vf', seg.nativo ? `scale=${iw}:${ih}:flags=lanczos` : `scale=${iw * 2}:${ih * 2}:flags=lanczos`, plateImg]);
    await ffmpeg(['-loop', '1', '-framerate', String(FPS), '-t', String(seg.dur), '-i', bg, '-i', plateImg,
      '-filter_complex',
      `[1:v]${zoompan(zf, zt, frames, iw, ih, seg.pan, seg.panY, false, ease)}${eq}[img];[0:v]fps=${FPS}[bg];[bg][img]overlay=${x}:${y},setsar=1,format=yuv420p[out]`,
      '-map', '[out]', '-t', String(seg.dur), ...ENC, out]);
    info.crop = `${fit} ${iw}×${ih} @ ${x},${y}`;
  }
  return { file: out, dur: seg.dur, ...info };
}

/**
 * Vídeo (clipe do Animar ou b-roll gerado pelo próprio produto).
 *   cover   → preenche o quadro, recortando. Default.
 *   contain → o clipe inteiro numa banda sobre o preto de marca. É o modo do corte
 *             9:16: um plano 16:9 em cover dentro de um quadro vertical perde 69% da
 *             largura, e com ela o enquadramento que o arquiteto escolheu — o BRIEF
 *             manda preservá-lo (é a mesma razão da "banda" do reel-kit).
 */
export async function renderVideo(seg, F, tmp, i) {
  const out = join(tmp, `seg-${i}.mp4`);
  const d = await dims(seg.src);
  const speed = seg.speed || 1;
  const avail = (d.duration - (seg.start || 0)) / speed;
  const dur = Math.min(seg.dur || avail, avail);
  const pts = speed !== 1 ? `setpts=${(1 / speed).toFixed(4)}*PTS,` : '';
  const eq = seg.brightness ? `,eq=brightness=${seg.brightness}` : '';
  const fit = seg.fit === 'contain'
    ? `scale=${F.w}:${F.h}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${F.w}:${F.h}:(ow-iw)/2:(oh-ih)/2:color=${plate(seg.bg)}`
    : `scale=${F.w}:${F.h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${F.w}:${F.h}`;
  await ffmpeg(['-ss', String(seg.start || 0), '-i', seg.src, '-filter_complex',
    `[0:v]${pts}${fit},fps=${FPS}${eq},setsar=1,format=yuv420p[out]`,
    '-map', '[out]', '-t', String(dur), '-an', ...ENC, out]);
  return { file: out, dur, src: `${d.w}×${d.h} ${d.duration.toFixed(1)}s ${seg.fit || 'cover'}` };
}

/** Card cheio (cartela final, símbolo). */
export async function renderCardSegment(seg, cardPng, F, tmp, i) {
  if (!cardPng) throw new Error(`segmento ${i}: card "${seg.card}" não existe em cards`);
  const out = join(tmp, `seg-${i}.mp4`);
  const bg = join(tmp, `seg-${i}-bg.png`);
  await ffmpeg(['-f', 'lavfi', '-i', `color=c=${hex0x(plate(seg.bg))}:s=${F.w}x${F.h}`, '-frames:v', '1', bg]);
  await ffmpeg(['-loop', '1', '-framerate', String(FPS), '-t', String(seg.dur), '-i', bg,
    '-loop', '1', '-framerate', String(FPS), '-t', String(seg.dur), '-i', cardPng,
    '-filter_complex', `[0:v][1:v]overlay=0:0,setsar=1,format=yuv420p[out]`,
    '-map', '[out]', '-t', String(seg.dur), ...ENC, out]);
  return { file: out, dur: seg.dur };
}

/**
 * Mosaico que se preenche célula a célula. Portado do reel-kit porque é a única
 * mecânica que mostra ESCALA — "seis imagens", "nove luzes" — e nenhum outro tipo
 * de segmento consegue pôr seis coisas na tela ao mesmo tempo.
 *
 * Cada estágio vira um PNG e a sequência é concatenada; por isso o `zoom` usa
 * `perFrame` (a entrada já é vídeo — com d=frames o filtro repetiria o primeiro
 * estágio e congelaria o mosaico, que foi o primeiro bug da mecânica no reel-kit).
 */
export async function renderGrid(seg, F, tmp, i) {
  const { default: sharp } = await import('sharp');
  const srcs = seg.srcs || [];
  if (!srcs.length) throw new Error(`segmento ${i}: grid sem "srcs"`);
  const cols = seg.cols || Math.ceil(Math.sqrt(srcs.length));
  const rows = seg.rows || Math.ceil(srcs.length / cols);
  const gap = seg.gap ?? 10;
  const margin = seg.margin ?? 24;
  const aspect = seg.cellAspect || 16 / 9;
  let cellW = Math.floor((F.w - margin * 2 - gap * (cols - 1)) / cols);
  if (seg.fill) {
    const byH = Math.floor(((F.safeBottom - F.safeTop - (seg.reserveTop || 0)) - gap * (rows - 1)) / rows * aspect);
    cellW = Math.min(cellW, byH);
  }
  const cellH = Math.round(cellW / aspect);
  const gridW = cols * cellW + (cols - 1) * gap;
  const gridH = rows * cellH + (rows - 1) * gap;
  if (gridH > F.safeBottom - F.safeTop) {
    throw new Error(`grid ${cols}×${rows} não cabe na zona segura (${gridH}px > ${F.safeBottom - F.safeTop})`);
  }
  const x0 = Math.round((F.w - gridW) / 2);
  const y0 = seg.y ?? Math.round((F.h - gridH) / 2);
  const bgCor = plate(seg.bg);
  const empty = seg.emptyCell === 'none' ? null : (seg.emptyCell || (seg.bg === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)'));

  const cells = [];
  for (const s of srcs) cells.push(await sharp(s).resize(cellW, cellH, { fit: 'cover' }).toBuffer());

  const stages = seg.reveal === 'all' ? 1 : srcs.length;
  const stagePngs = [];
  for (let k = 1; k <= stages; k++) {
    const shown = seg.reveal === 'all' ? srcs.length : k;
    const comps = [];
    for (let c = 0; c < cols * rows; c++) {
      const cx = x0 + (c % cols) * (cellW + gap);
      const cy = y0 + Math.floor(c / cols) * (cellH + gap);
      if (c < shown && cells[c]) comps.push({ input: cells[c], left: cx, top: cy });
      else if (empty) comps.push({ input: { create: { width: cellW, height: cellH, channels: 4, background: empty } }, left: cx, top: cy });
    }
    const p = join(tmp, `seg-${i}-g${k}.png`);
    await sharp({ create: { width: F.w, height: F.h, channels: 3, background: bgCor } }).composite(comps).png().toFile(p);
    stagePngs.push(p);
  }

  const out = join(tmp, `seg-${i}.mp4`);
  const hold = seg.hold ?? 0;
  const each = (seg.dur - hold) / stages;
  const inputs = [];
  stagePngs.forEach((p, k) => inputs.push('-loop', '1', '-framerate', String(FPS), '-t', String(k === stages - 1 ? each + hold : each), '-i', p));
  const [zf, zt] = seg.zoom || [1, 1];
  const frames = Math.round(seg.dur * FPS);
  const chain = stagePngs.map((_, k) => `[${k}:v]fps=${FPS},setsar=1[g${k}]`).join(';');
  const cat = `${stagePngs.map((_, k) => `[g${k}]`).join('')}concat=n=${stages}:v=1:a=0[cat]`;
  const zoom = zf === 1 && zt === 1
    ? '[cat]format=yuv420p[out]'
    : `[cat]${zoompan(zf, zt, frames, F.w, F.h, null, null, true)},setsar=1,format=yuv420p[out]`;
  await ffmpeg([...inputs, '-filter_complex', `${chain};${cat};${zoom}`, '-map', '[out]', '-t', String(seg.dur), ...ENC, out]);
  return { file: out, dur: seg.dur, crop: `grid ${cols}×${rows} · ${srcs.length} imgs · célula ${cellW}×${cellH}` };
}

/** Beat de preto puro entre atos. A pausa é parte da montagem, não sobra. */
export async function renderBlack(seg, F, tmp, i) {
  const out = join(tmp, `seg-${i}.mp4`);
  await ffmpeg(['-f', 'lavfi', '-i', `color=c=${hex0x(plate(seg.bg))}:s=${F.w}x${F.h}:r=${FPS}`,
    '-t', String(seg.dur), ...ENC, out]);
  return { file: out, dur: seg.dur };
}

export function timeline(durs, transitions) {
  const starts = [];
  let t = 0;
  durs.forEach((d, i) => {
    starts.push(t);
    const tr = transitions[i];
    t += d - (tr && tr.type !== 'cut' ? tr.dur : 0);
  });
  return { starts, total: t + 0 };
}

// ----------------------------------------------------------------- FILME ---

export async function renderFilm(spec, { repo, tmpRoot }) {
  const F = frameGeometry(spec.frame, spec.letterbox);
  const outDir = join(repo, 'marketing/output', spec.slug);
  const tmp = join(tmpRoot, spec.slug);
  // Um render interrompido deixa segmentos truncados aqui; a execução seguinte
  // reaproveitaria esse lixo e falharia com "Error splitting the input into NAL units".
  await rm(tmp, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await mkdir(tmp, { recursive: true });
  console.log(`  quadro ${F.w}×${F.h} · ${FPS}fps · fundo ${BG}`);

  const htmls = {};
  for (const [name, c] of Object.entries(spec.cards || {})) htmls[name] = cardFromSpec(c, F);
  const cards = Object.keys(htmls).length ? await captureCards(htmls, join(tmp, 'cards'), join(tmp, 'html'), F) : {};

  const segs = [];
  for (let i = 0; i < spec.segments.length; i++) {
    const s = spec.segments[i];
    if (s.type === 'still') segs.push(await renderStill(s, F, tmp, i));
    else if (s.type === 'video') segs.push(await renderVideo(s, F, tmp, i));
    else if (s.type === 'card') segs.push(await renderCardSegment(s, cards[s.card], F, tmp, i));
    else if (s.type === 'black') segs.push(await renderBlack(s, F, tmp, i));
    else if (s.type === 'grid') segs.push(await renderGrid(s, F, tmp, i));
    else throw new Error(`segmento ${i}: tipo desconhecido ${s.type}`);
    console.log(`  seg ${i} ${s.type} ${segs[i].dur.toFixed(2)}s ${segs[i].crop || segs[i].src || ''}`);
  }

  const transitions = spec.transitions || [];
  if (transitions.length !== segs.length - 1) {
    throw new Error(`transitions: esperava ${segs.length - 1} entradas (segments − 1), recebi ${transitions.length}`);
  }
  transitions.forEach((t, k) => {
    if (t.type === 'cut') return;
    const limit = Math.min(segs[k].dur, segs[k + 1].dur);
    if (!(t.dur > 0) || t.dur > limit) {
      throw new Error(`transição ${k} (${t.type} ${t.dur}s) mais longa que um dos segmentos vizinhos (${segs[k].dur}s / ${segs[k + 1].dur}s): o xfade precisa de dur ≤ ${limit.toFixed(2)}s`);
    }
  });

  const tl = timeline(segs.map((s) => s.dur), transitions);
  console.log(`  timeline: ${tl.starts.map((t, i) => `seg${i}@${t.toFixed(2)}`).join(' · ')} · total ${tl.total.toFixed(2)}s`);

  const inputs = [];
  segs.forEach((s) => inputs.push('-i', s.file));
  const f = [];
  let cur = '[0:v]';
  let acc = segs[0].dur;
  for (let k = 0; k < segs.length - 1; k++) {
    const t = transitions[k] || { type: 'cut' };
    const next = `[${k + 1}:v]`;
    const lbl = `[j${k}]`;
    if (t.type === 'cut') {
      f.push(`${cur}${next}concat=n=2:v=1:a=0${lbl}`);
      acc += segs[k + 1].dur;
    } else {
      const offset = acc - t.dur;
      // `settb=AVTB` nos dois ramos: um segmento vindo de `concat` sai com timebase
      // 1/1000000 e o xfade recusa juntar com o 1/15360 dos demais.
      f.push(`${cur}settb=AVTB[xa${k}]`);
      f.push(`${next}settb=AVTB[xb${k}]`);
      f.push(`[xa${k}][xb${k}]xfade=transition=${t.type}:duration=${t.dur}:offset=${offset.toFixed(3)}${lbl}`);
      acc = offset + segs[k + 1].dur;
    }
    cur = lbl;
  }

  // Overlays em TEMPO GLOBAL, com fade de alpha. É a diferença central para o
  // reel-kit: lá o texto aparece e some em corte (`enable` puro); aqui ele nasce
  // e morre em fade, que é como um filme de keynote troca de cartela.
  let n = segs.length;
  const lastIsCard = spec.segments[spec.segments.length - 1]?.type === 'card';
  const cardStart = lastIsCard ? tl.starts[segs.length - 1] : Infinity;
  for (const o of spec.overlays || []) {
    if (!cards[o.card]) throw new Error(`overlay: card "${o.card}" não existe`);
    if (o.to > cardStart + 0.01) {
      console.log(`  aviso: overlay "${o.card}" ia até ${o.to}s e invadiria a cartela final (${cardStart.toFixed(2)}s) — truncado`);
      o.to = cardStart;
    }
    const fi = o.fadeIn ?? o.fade ?? 0.5;
    const fo = o.fadeOut ?? o.fade ?? 0.5;
    inputs.push('-loop', '1', '-framerate', String(FPS), '-t', String(tl.total), '-i', cards[o.card]);
    const c = `[c${n}]`;
    const lbl = `[o${n}]`;
    // fade com alpha=1 multiplica o alpha que o PNG já tem — o card continua
    // transparente onde não há texto, e a cartela inteira ganha o envelope.
    f.push(`[${n}:v]format=rgba,fade=t=in:st=${o.from.toFixed(3)}:d=${fi}:alpha=1,fade=t=out:st=${(o.to - fo).toFixed(3)}:d=${fo}:alpha=1${c}`);
    f.push(`${cur}${c}overlay=0:0:enable='between(t,${Math.max(o.from - 0.1, 0).toFixed(3)},${(o.to + 0.1).toFixed(3)})'${lbl}`);
    cur = lbl;
    n++;
  }

  // Letterbox: barras desenhadas por último, sobre tudo.
  if (spec.letterbox) {
    const bar = F.bar;
    if (bar > 0) {
      f.push(`${cur}drawbox=x=0:y=0:w=${F.w}:h=${bar}:color=black@1:t=fill,drawbox=x=0:y=${F.h - bar}:w=${F.w}:h=${bar}:color=black@1:t=fill[lb]`);
      cur = '[lb]';
      console.log(`  letterbox ${spec.letterbox}:1 → barras de ${bar}px`);
    }
  }

  f.push(`${cur}format=yuv420p[final]`);
  const mp4 = join(outDir, `${spec.slug}.mp4`);
  await ffmpeg([...inputs, '-filter_complex', f.join(';'), '-map', '[final]',
    '-r', String(FPS), '-c:v', 'libx264', '-crf', '17', '-preset', 'slow', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', mp4]);

  // QA: frames no meio de cada segmento (ou nos tempos pedidos) + probe.
  const qaDir = join(outDir, 'qa-frames');
  await mkdir(qaDir, { recursive: true });
  const times = spec.qa?.length
    ? spec.qa.filter((t) => t < tl.total)
    : tl.starts.map((s, i) => s + segs[i].dur / 2).filter((t) => t < tl.total);
  for (const t of times) {
    await ffmpeg(['-ss', String(t), '-i', mp4, '-frames:v', '1', join(qaDir, `t${t.toFixed(2).replace('.', '_')}.png`)]);
  }
  const info = await probe(mp4);
  await writeFile(join(outDir, 'probe.json'), JSON.stringify(info, null, 2), 'utf8');
  await writeFile(join(outDir, 'spec.json'), JSON.stringify(spec, null, 2), 'utf8');

  console.log(`  ✓ ${mp4}`);
  console.log(`  ✓ ${times.length} frames de QA em ${qaDir}`);
  return { mp4, qaDir, total: tl.total, frame: F, probe: info };
}

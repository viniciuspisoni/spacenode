/**
 * REEL KIT — montagem de Reels 9:16 (1080×1920, 30 fps, sem áudio) a partir de um
 * spec JSON declarativo. Generaliza o que o reel-impacto.mjs faz na mão:
 *
 *   segmentos  → cada um vira um mp4 intermediário 1080×1920 (still com Ken Burns,
 *                vídeo do Animar, ou card cheio)
 *   transições → xfade (wipeleft/wipeup/fade/…) ou corte seco, encadeadas
 *   overlays   → cards de texto/scrim em TEMPO GLOBAL (nunca wipados junto com a
 *                imagem — regra aprendida em julho)
 *   final      → QA frames + probe.json
 *
 * Regras herdadas do BRIEF.md: banda da imagem entre 4:3 e 16:9 centrada (não
 * recortar 16:9 em 9:16), fundo = a própria imagem desfocada, scrim como camada
 * própria, `setsar=1` em todo ramo, `-loop 1 -t` em toda imagem, zona segura
 * 220/320, texto só via HTML→PNG (Playwright dSF 2 → lanczos).
 *
 * Spec (ver reel-spec.mjs --exemplo):
 * {
 *   slug, band: { aspect?: number },          // aspect fixo ou auto (min dos stills)
 *   segments: [
 *     { type:'still', src, dur, fit:'band'|'cover', kenburns:[1,1.08], brightness:-0.2 },
 *     { type:'video', src, dur?, fit:'band'|'cover', speed:1, start:0, brightness:-0.2 },
 *     { type:'card',  card:'final', dur:1.2 },
 *   ],
 *   transitions: [ { type:'wipeleft'|'fade'|'cut', dur:0.5, ruler:true }, ... ], // n-1
 *   cards: { nome: { layout:'hook-sub'|'statement'|'chip'|'scrim'|'final'|'html', ... } },
 *   overlays: [ { card:'nome', from, to } ],  // tempo global, em segundos
 *   qa: [t, t, ...]                           // opcional
 * }
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { FRAME_H, FRAME_W, SAFE_BOTTOM, SAFE_TOP, captureCards, cardHtml } from './cards.mjs';
import { ffmpeg, probe } from './tools.mjs';

export { FRAME_W, FRAME_H, SAFE_TOP, SAFE_BOTTOM };
export const FPS = 30;
const BRAND_DIR = resolve(import.meta.dirname, '../../brand');
const even = (n) => Math.round(n / 2) * 2;

/** `{palavra}` → única palavra em verde. */
export const accentuate = (t) => String(t).replace(/\{([^}]+)\}/g, '<span class="accent">$1</span>');

export async function dims(src) {
  const { streams, format } = await probe(src);
  const s = streams[0];
  return { w: s.width, h: s.height, aspect: s.width / s.height, duration: Number(format?.duration || 0) };
}

/** Banda 1080 de largura, aspecto limitado entre 4:3 e 16:9, centrada; checa a zona segura. */
export function bandGeometry(aspect, { hookSize = 72, hookLines = 3, gapAbove = 76, gapBelow = 64, subHeight = 64 } = {}) {
  const a = Math.min(Math.max(aspect, 4 / 3), 16 / 9);
  const height = even(FRAME_W / a);
  const y = even((FRAME_H - height) / 2);
  const hookTop = y - gapAbove - Math.ceil(hookSize * 1.18 * hookLines);
  const subBottom = y + height + gapBelow + subHeight;
  if (hookTop < SAFE_TOP) throw new Error(`hook fora da zona segura (y=${hookTop} < ${SAFE_TOP})`);
  if (subBottom > SAFE_BOTTOM) throw new Error(`sub fora da zona segura (y=${subBottom} > ${SAFE_BOTTOM})`);
  return { aspect: a, height, y, hookTop, subBottom, gapAbove, gapBelow, hookSize };
}

/**
 * Geometria do modo SPLIT: duas bandas empilhadas (antes em cima, depois embaixo),
 * mesma câmera. Cada banda tem 520px de altura; a largura segue o aspecto (sem
 * recorte), centrada. Hook menor (56px, 2 linhas) para caber na zona segura.
 */
export function splitGeometry(aspect) {
  const bandH = 520, gap = 8;
  const bandW = Math.min(FRAME_W, even(bandH * aspect));
  const height = bandH * 2 + gap;
  const y = even((FRAME_H - height) / 2);
  const geo = { split: true, aspect, bandH, bandW, gap, height, y, hookSize: 56, gapAbove: 60, gapBelow: 40 };
  const hookTop = y - geo.gapAbove - Math.ceil(56 * 1.18 * 2);
  const subBottom = y + height + geo.gapBelow + 64;
  if (hookTop < SAFE_TOP) throw new Error(`split: hook fora da zona segura (${hookTop})`);
  if (subBottom > SAFE_BOTTOM) throw new Error(`split: sub fora da zona segura (${subBottom})`);
  return { ...geo, hookTop, subBottom };
}

// ---------------------------------------------------------------- CARDS ----
/**
 * Linguagem atual do SpaceNode (landing de set/2026, PRs #143/#147/#148):
 * faixa escura #1a1a1a (não #0a0a0a), texto #f5f5f7 / #a1a1a6 / #8a8a8f, Geist em
 * pesos 300–500 (título do hero é 300; títulos de seção 500), tracking apertado
 * (-0.03 a -0.045em), eyebrow uppercase 0.22em ladeado por fios de 0.5px, títulos
 * em minúsculas com ponto final ("três passos. do estudo à apresentação."),
 * CTA primário = pílula branca com texto escuro e seta, microcopy
 * "80 nodes grátis · sem cartão · em português". Verde #30d158 só funcional.
 * Variante light (#fafafa / #1a1a1a / verde #30b46c) espelha as faixas claras.
 */
const DARK = '#1a1a1a';
const baseCss = (band) => `
.scrim-top, .scrim-bottom { position: absolute; left: 0; right: 0; }
.scrim-top { top: 0; height: ${band.y}px;
  background: linear-gradient(180deg, rgba(26,26,26,0.96) 0%, rgba(26,26,26,0.90) 62%, rgba(26,26,26,0.58) 100%); }
.scrim-bottom { top: ${band.y + band.height}px; height: ${FRAME_H - band.y - band.height}px;
  background: linear-gradient(0deg, rgba(26,26,26,0.96) 0%, rgba(26,26,26,0.90) 62%, rgba(26,26,26,0.58) 100%); }
.scrim-full { position: absolute; inset: 0; background: rgba(26,26,26,0.55); }
.hook { position: absolute; bottom: ${FRAME_H - (band.y - band.gapAbove)}px; left: 80px; width: 920px;
  font-size: ${band.hookSize}px; font-weight: 500; line-height: 1.12; letter-spacing: -0.035em;
  text-align: center; text-wrap: balance; color: #f5f5f7; }
.hook .dim { color: #8a8a8f; }
.sub { position: absolute; top: ${band.y + band.height + band.gapBelow}px; left: 80px; width: 920px; text-align: center; }
.eyebrow { display: inline-flex; align-items: center; gap: 16px; font-size: 22px; font-weight: 500; text-transform: uppercase;
  letter-spacing: 0.22em; color: #a1a1a6; }
.eyebrow i { display: block; width: 32px; height: 1px; background: rgba(255,255,255,0.28); }
.payoff { font-size: 42px; font-weight: 400; letter-spacing: -0.02em; line-height: 1.3; color: #f5f5f7; text-wrap: balance; }
.chip { position: absolute; left: 0; right: 0; text-align: center; top: ${band.y + band.height + 28}px; }
.chip span { display: inline-block; padding: 12px 22px; border: 1px solid rgba(255,255,255,0.22); border-radius: 999px;
  font-size: 22px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.18em; color: #f5f5f7; background: rgba(26,26,26,0.62); }
.statement { position: absolute; left: 80px; width: 920px; top: 50%; transform: translateY(-50%);
  text-align: center; display: flex; flex-direction: column; gap: 40px; align-items: center; }
.statement .big { font-size: 84px; font-weight: 300; line-height: 1.08; letter-spacing: -0.045em; color: #f5f5f7; text-wrap: balance; }
.statement .big .dim { color: #8a8a8f; }
.statement .small { font-size: 36px; font-weight: 400; color: #a1a1a6; line-height: 1.5; letter-spacing: -0.01em; text-wrap: balance; }
.final { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 40px; }
.final svg { width: 440px; height: auto; margin-bottom: 24px; }
.final .cta { display: inline-flex; align-items: center; gap: 18px; padding: 26px 48px; border-radius: 18px;
  background: #f5f5f7; color: ${DARK}; font-size: 36px; font-weight: 500; letter-spacing: -0.01em; }
.final .micro { font-size: 24px; font-weight: 400; letter-spacing: 0.01em; color: #8a8a8f; }
.final .url { font-size: 28px; font-weight: 400; letter-spacing: 0.02em; color: #a1a1a6; }
body.light { background: #fafafa; color: ${DARK}; }
body.light .accent { color: #30b46c; }
body.light .statement .big, body.light .hook, body.light .payoff { color: ${DARK}; }
body.light .statement .big .dim, body.light .hook .dim { color: #86868b; }
body.light .statement .small { color: #424245; }
body.light .eyebrow { color: #86868b; }
body.light .eyebrow i { background: rgba(0,0,0,0.18); }
body.light .final .cta { background: ${DARK}; color: #fafafa; }
body.light .final .micro { color: #86868b; }
body.light .final .url { color: #424245; }
body.light .final svg { filter: invert(1); }
`;
/** `[texto]` → trecho em cinza terciário (a 2ª linha do título do hero é assim). */
const dim = (t) => String(t).replace(/\[([^\]]+)\]/g, '<span class="dim">$1</span>');
const rich = (t) => accentuate(dim(t));
const eyebrowHtml = (t) => `<span class="eyebrow"><i></i>${rich(t)}<i></i></span>`;

const logoSvg = () =>
  readFileSync(join(BRAND_DIR, 'spacenode-logo-horizontal.svg'), 'utf8')
    .replace("font-family=\"Geist, 'Geist Sans', -apple-system, sans-serif\"", 'font-family="GeistLocal"');

/** Gera o HTML de um card a partir do layout declarado no spec. */
export function cardFromSpec(c, band, opts = {}) {
  const light = c.theme === 'light';
  const solid = c.transparent === false || c.layout === 'final';
  // cards.mjs pinta #0A0A0A quando não é transparente; a faixa escura atual é #1a1a1a
  // `accent: false` no spec (pedido do dono em 04/09 para a rodada orgânica): {palavra}
  // deixa de sair em verde e vira o mesmo branco/preto do texto ao redor.
  const noAccent = opts.accent === false ? '.accent { color: inherit; }' : '';
  const css = baseCss(band) + (solid && !light ? `body { background: ${DARK}; }` : '') + noAccent + (c.css || '');
  const wrap = (html) => (light ? html.replace('<body>', '<body class="light">') : html);
  switch (c.layout) {
    case 'scrim':
      return cardHtml({ css, body: c.full ? '<div class="scrim-full"></div>' : '<div class="scrim-top"></div><div class="scrim-bottom"></div>' });
    case 'hook-sub':
      return wrap(cardHtml({ css, transparent: !solid, body: `
        ${c.hook ? `<div class="hook">${rich(c.hook)}</div>` : ''}
        ${c.sub || c.eyebrow ? `<div class="sub">${c.eyebrow ? eyebrowHtml(c.eyebrow) : ''}${c.sub ? `${c.eyebrow ? '<br><br>' : ''}<span class="payoff">${rich(c.sub)}</span>` : ''}</div>` : ''}` }));
    case 'chip':
      return cardHtml({ css, body: `<div class="chip"><span>${rich(c.text)}</span></div>` });
    case 'hook-fixed': {
      // Texto em posições FIXAS da zona segura, independente da banda — para imagens em
      // retrato (fit contain/cover) em que o texto fica sobre a imagem. `scrim: true`
      // acrescenta um escurecimento suave em cima e embaixo para garantir contraste.
      const size = c.size || 60;
      // Sobre imagem clara o cinza terciário some: o scrim aqui é mais alto e mais denso
      // que o da banda, e o [trecho] em cinza sobe para o quaternário claro (#c7c7cc).
      const scrim = c.scrim ? `<div style="position:absolute;left:0;right:0;top:0;height:760px;background:linear-gradient(180deg,rgba(26,26,26,0.92) 0%,rgba(26,26,26,0.72) 45%,rgba(26,26,26,0) 100%)"></div>
        <div style="position:absolute;left:0;right:0;bottom:0;height:780px;background:linear-gradient(0deg,rgba(26,26,26,0.92) 0%,rgba(26,26,26,0.72) 45%,rgba(26,26,26,0) 100%)"></div>` : '';
      const hook = c.hook ? `<style>.hook .dim, .payoff .dim { color: #c7c7cc; }</style><div class="hook" style="bottom:auto;top:${c.top || 300}px;font-size:${size}px">${rich(c.hook)}</div>` : '';
      const sub = c.sub || c.eyebrow ? `<div class="sub" style="top:auto;bottom:${c.bottom || 340}px">${c.eyebrow ? eyebrowHtml(c.eyebrow) : ''}${c.sub ? `${c.eyebrow ? '<br><br>' : ''}<span class="payoff" style="font-size:${c.subSize || 38}px">${rich(c.sub)}</span>` : ''}</div>` : '';
      return wrap(cardHtml({ css, transparent: !solid, body: `${scrim}${hook}${sub}` }));
    }
    case 'split-labels': {
      if (!band.split) throw new Error('split-labels exige band.split');
      const x = even((FRAME_W - band.bandW) / 2) + 20;
      const lbl = (t, y) => `<div style="position:absolute;left:${x}px;top:${y}px"><span style="display:inline-block;padding:8px 16px;border-radius:999px;background:rgba(10,10,10,0.62);border:1px solid rgba(255,255,255,0.22);font-size:20px;font-weight:500;text-transform:uppercase;letter-spacing:0.14em;color:#F5F5F7">${accentuate(t)}</span></div>`;
      return cardHtml({ css, body: `${lbl(c.top || 'Modelo', band.y + 20)}${lbl(c.bottom || 'Render', band.y + band.bandH + band.gap + 20)}` });
    }
    case 'statement':
      return wrap(cardHtml({ css, transparent: !solid, body: `
        <div class="statement">${c.eyebrow ? eyebrowHtml(c.eyebrow) : ''}
        <div class="big">${rich(c.big)}</div>${c.small ? `<div class="small">${rich(c.small)}</div>` : ''}</div>` }));
    case 'final': {
      // Fecho no padrão do hero/FinalCTA da landing: logo monocromático, pílula de CTA
      // com seta, microcopy factual e o domínio. `micro: ""` remove a linha.
      // Sem URL na arte por padrão (visual-guidelines §7); `url: "spacenode.app"` liga.
      const micro = c.micro === undefined ? '80 nodes grátis · sem cartão · em português' : c.micro;
      return wrap(cardHtml({ css, transparent: false, body: `<div class="final">${logoSvg()}${c.cta ? `<div class="cta">${rich(c.cta)}<span>→</span></div>` : ''}${micro ? `<div class="micro">${rich(micro)}</div>` : ''}${c.url ? `<div class="url">${c.url}</div>` : ''}</div>` }));
    }
    case 'html':
      return wrap(cardHtml({ css, transparent: !solid, body: c.body }));
    default:
      throw new Error(`layout de card desconhecido: ${c.layout}`);
  }
}

// ------------------------------------------------------------- SEGMENTOS ----
/** Fundo full-bleed desfocado (a própria imagem). Contraste do texto vem do scrim.
 *  `bg = 'dark'` troca por #1a1a1a sólido (para capturas de UI clara, que desfocadas viram cinza sujo). */
async function backdrop(src, dest, brightness = -0.2, bg) {
  if (bg === 'dark') {
    await ffmpeg(['-f', 'lavfi', '-i', `color=c=0x1a1a1a:s=${FRAME_W}x${FRAME_H}`, '-frames:v', '1', dest]);
    return;
  }
  await ffmpeg(['-i', src, '-vf', [
    `scale=${FRAME_W}:${FRAME_H}:force_original_aspect_ratio=increase:flags=lanczos`,
    `crop=${FRAME_W}:${FRAME_H}`, 'boxblur=42:2', `eq=brightness=${brightness}:saturation=0.72`,
  ].join(','), dest]);
}

/** Recorte centrado no aspecto da banda e escala (scale ×1 ou ×2 para o Ken Burns). */
async function bandPng(src, dest, aspect, w, h) {
  const d = await dims(src);
  const cw = Math.min(d.w, Math.round(d.h * aspect));
  const ch = Math.min(d.h, Math.round(d.w / aspect));
  await ffmpeg(['-i', src, '-vf', `crop=${cw}:${ch}:${Math.round((d.w - cw) / 2)}:${Math.round((d.h - ch) / 2)},scale=${w}:${h}:flags=lanczos`, dest]);
  return `${d.w}×${d.h} → ${cw}×${ch}`;
}

/**
 * Ken Burns linear. `pan` = [x0, x1] e `panY` = [y0, y1] em fração 0–1 da folga que o zoom
 * abre (0 = borda esquerda/topo, 0.5 = centro, 1 = direita/base). Sem eles, centrado.
 * Quando o zoom volta a 1 a folga é zero, então qualquer centro converge para a imagem inteira —
 * é o que permite abrir num detalhe e afastar até revelar tudo.
 */
const zoompan = (from, to, frames, w, h, pan, panY) => {
  const n = Math.max(frames - 1, 1);
  const x = pan ? `(iw-iw/zoom)*(${pan[0]}+${pan[1] - pan[0]}*on/${n})` : 'iw/2-(iw/zoom/2)';
  const y = panY ? `(ih-ih/zoom)*(${panY[0]}+${panY[1] - panY[0]}*on/${n})` : 'ih/2-(ih/zoom/2)';
  return `zoompan=z='${from}+${to - from}*on/${n}':x='${x}':y='${y}':d=${frames}:s=${w}x${h}:fps=${FPS}`;
};

/** Geometria "contain": a imagem inteira (qualquer aspecto, inclusive retrato) dentro da zona segura. */
export function containGeometry(aspect, inset = 0) {
  const maxH = SAFE_BOTTOM - SAFE_TOP - inset; // 1380 − margem para texto acima/abaixo
  const height = even(Math.min(maxH, FRAME_W / aspect));
  const bandW = even(Math.min(FRAME_W, height * aspect));
  const y = even((FRAME_H - height) / 2);
  return { contain: true, aspect, height, bandW, y, hookSize: 60, gapAbove: 48, gapBelow: 40 };
}

export async function renderStill(seg, bandIn, tmp, i) {
  // Num spec split, um still em modo band usa a banda clássica (4:3–16:9) centrada,
  // nunca a geometria empilhada (senão a imagem sairia esticada em 1080×1048).
  const band = bandIn.split ? bandGeometry(Math.min(Math.max(bandIn.aspect, 4 / 3), 16 / 9)) : bandIn;
  const out = join(tmp, `seg-${i}.mp4`);
  const frames = Math.round(seg.dur * FPS);
  const [zf, zt] = seg.kenburns || [1, 1.06];
  const brightness = seg.brightness ?? -0.2;
  const info = {};
  if ((seg.fit || 'band') === 'cover') {
    // Para permitir pan, o cover guarda a largura inteira da imagem (altura = 2×1920)
    // e o zoompan escolhe a janela; sem pan, recorta o centro como antes.
    const cov = join(tmp, `seg-${i}-cover.png`);
    const d = await dims(seg.src);
    const keepWidth = !!seg.pan && d.aspect > FRAME_W / FRAME_H;
    await ffmpeg(['-i', seg.src, '-vf', keepWidth
      ? `scale=-2:${FRAME_H * 2}:flags=lanczos`
      : `scale=${FRAME_W * 2}:${FRAME_H * 2}:force_original_aspect_ratio=increase:flags=lanczos,crop=${FRAME_W * 2}:${FRAME_H * 2}`, cov]);
    // com pan, o "zoom" mínimo é o que faz a janela 1080 caber na largura escalada
    const zoomBase = keepWidth ? (d.aspect * FRAME_H) / FRAME_W : 1;
    await ffmpeg(['-i', cov, '-filter_complex', `[0:v]${zoompan(zf * zoomBase, zt * zoomBase, frames, FRAME_W, FRAME_H, seg.pan, seg.panY)},setsar=1,format=yuv420p[out]`,
      '-map', '[out]', '-t', String(seg.dur), '-r', String(FPS), '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', out]);
    info.crop = keepWidth ? `cover+pan ${seg.pan.join('→')}` : 'cover';
  } else if (seg.fit === 'contain') {
    // Imagem inteira (retrato incluído) dentro da zona segura, sobre a própria imagem desfocada.
    const d = await dims(seg.src);
    const g = containGeometry(d.aspect, seg.inset || 0);
    const bg = join(tmp, `seg-${i}-bg.png`), bp = join(tmp, `seg-${i}-band.png`);
    await backdrop(seg.src, bg, brightness, seg.bg);
    await ffmpeg(['-i', seg.src, '-vf', `scale=${g.bandW * 2}:${g.height * 2}:flags=lanczos`, bp]);
    const x = even((FRAME_W - g.bandW) / 2);
    await ffmpeg(['-loop', '1', '-framerate', String(FPS), '-t', String(seg.dur), '-i', bg, '-i', bp,
      '-filter_complex', `[1:v]${zoompan(zf, zt, frames, g.bandW, g.height, seg.pan, seg.panY)}[band];[0:v]fps=${FPS}[bg];[bg][band]overlay=${x}:${g.y},setsar=1,format=yuv420p[out]`,
      '-map', '[out]', '-t', String(seg.dur), '-r', String(FPS), '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', out]);
    info.crop = `contain ${g.bandW}×${g.height} @ y=${g.y}`;
  } else {
    const bg = join(tmp, `seg-${i}-bg.png`), bp = join(tmp, `seg-${i}-band.png`);
    await backdrop(seg.src, bg, brightness, seg.bg);
    info.crop = await bandPng(seg.src, bp, band.aspect, FRAME_W * 2, band.height * 2);
    await ffmpeg(['-loop', '1', '-framerate', String(FPS), '-t', String(seg.dur), '-i', bg, '-i', bp,
      '-filter_complex', `[1:v]${zoompan(zf, zt, frames, FRAME_W, band.height, seg.pan, seg.panY)}[band];[0:v]fps=${FPS}[bg];[bg][band]overlay=(W-w)/2:${band.y},setsar=1,format=yuv420p[out]`,
      '-map', '[out]', '-t', String(seg.dur), '-r', String(FPS), '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', out]);
  }
  return { file: out, dur: seg.dur, ...info };
}

/** Vídeo do Animar: banda (recorte no aspecto da banda) sobre o próprio vídeo desfocado, ou cover. */
export async function renderVideo(seg, bandIn, tmp, i) {
  const band = bandIn.split ? bandGeometry(Math.min(Math.max(bandIn.aspect, 4 / 3), 16 / 9)) : bandIn;
  const out = join(tmp, `seg-${i}.mp4`);
  const d = await dims(seg.src);
  const speed = seg.speed || 1;
  const avail = (d.duration - (seg.start || 0)) / speed;
  const dur = Math.min(seg.dur || avail, avail);
  const brightness = seg.brightness ?? -0.2;
  const pts = speed !== 1 ? `setpts=${(1 / speed).toFixed(4)}*PTS,` : '';
  let filter;
  if ((seg.fit || 'band') === 'cover' || d.aspect < 1) {
    filter = `[0:v]${pts}scale=${FRAME_W}:${FRAME_H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${FRAME_W}:${FRAME_H},fps=${FPS},setsar=1,format=yuv420p[out]`;
  } else {
    const cw = Math.min(d.w, Math.round(d.h * band.aspect)), ch = Math.min(d.h, Math.round(d.w / band.aspect));
    filter = [
      `[0:v]${pts}fps=${FPS},split[a][b]`,
      `[a]scale=${FRAME_W}:${FRAME_H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${FRAME_W}:${FRAME_H},boxblur=42:2,eq=brightness=${brightness}:saturation=0.72[bg]`,
      `[b]crop=${cw}:${ch}:${Math.round((d.w - cw) / 2)}:${Math.round((d.h - ch) / 2)},scale=${FRAME_W}:${band.height}:flags=lanczos[band]`,
      `[bg][band]overlay=(W-w)/2:${band.y},setsar=1,format=yuv420p[out]`,
    ].join(';');
  }
  await ffmpeg(['-ss', String(seg.start || 0), '-i', seg.src, '-filter_complex', filter, '-map', '[out]', '-t', String(dur),
    '-r', String(FPS), '-an', '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', out]);
  return { file: out, dur, src: `${d.w}×${d.h} ${d.duration.toFixed(1)}s` };
}

/** Duas bandas empilhadas (antes/depois), Ken Burns sincronizado, fundo = "depois" desfocado. */
export async function renderSplit(seg, band, tmp, i) {
  if (!band.split) throw new Error(`segmento ${i}: split exige "band": {"split": true} no spec`);
  const out = join(tmp, `seg-${i}.mp4`);
  const frames = Math.round(seg.dur * FPS);
  const [zf, zt] = seg.kenburns || [1, 1.04];
  const bg = join(tmp, `seg-${i}-bg.png`), top = join(tmp, `seg-${i}-top.png`), bot = join(tmp, `seg-${i}-bot.png`);
  await backdrop(seg.bottom, bg, seg.brightness ?? -0.24);
  const cropT = await bandPng(seg.top, top, band.aspect, band.bandW * 2, band.bandH * 2);
  const cropB = await bandPng(seg.bottom, bot, band.aspect, band.bandW * 2, band.bandH * 2);
  const x = even((FRAME_W - band.bandW) / 2);
  const line = join(tmp, `seg-${i}-line.png`);
  await ffmpeg(['-f', 'lavfi', '-i', `color=c=white@0.35:s=${band.bandW}x2`, '-frames:v', '1', line]);
  await ffmpeg(['-loop', '1', '-framerate', String(FPS), '-t', String(seg.dur), '-i', bg, '-i', top, '-i', bot, '-i', line,
    '-filter_complex', [
      `[1:v]${zoompan(zf, zt, frames, band.bandW, band.bandH)}[t]`,
      `[2:v]${zoompan(zf, zt, frames, band.bandW, band.bandH)}[b]`,
      `[0:v]fps=${FPS}[bg]`,
      `[bg][t]overlay=${x}:${band.y}[s1]`,
      `[s1][b]overlay=${x}:${band.y + band.bandH + band.gap}[s2]`,
      `[s2][3:v]overlay=${x}:${band.y + band.bandH + Math.round(band.gap / 2) - 1},setsar=1,format=yuv420p[out]`,
    ].join(';'),
    '-map', '[out]', '-t', String(seg.dur), '-r', String(FPS), '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', out]);
  return { file: out, dur: seg.dur, crop: `top ${cropT} · bottom ${cropB}` };
}

export async function renderCardSegment(seg, cardPng, tmp, i) {
  const out = join(tmp, `seg-${i}.mp4`);
  await ffmpeg(['-loop', '1', '-framerate', String(FPS), '-t', String(seg.dur), '-i', cardPng,
    '-vf', `fps=${FPS},setsar=1,format=yuv420p`, '-t', String(seg.dur), '-r', String(FPS), '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', out]);
  return { file: out, dur: seg.dur };
}

// -------------------------------------------------------------- TIMELINE ----
/** Tempo global de início de cada segmento e duração total, dadas as transições. */
export function timeline(durs, transitions) {
  const starts = [0];
  let total = durs[0];
  for (let k = 0; k < durs.length - 1; k++) {
    const t = transitions[k] || { type: 'cut' };
    const td = t.type === 'cut' ? 0 : t.dur;
    starts.push(total - td);
    total = total - td + durs[k + 1];
  }
  return { starts, total };
}

// ---------------------------------------------------------------- RENDER ----
export async function renderReel(spec, { repo, tmpRoot }) {
  const outDir = join(repo, 'marketing/output', spec.slug);
  const tmp = join(tmpRoot, spec.slug);
  // Um render interrompido deixa segmentos truncados e cards pela metade aqui; a
  // execução seguinte reutilizaria esse lixo e falharia com erros ilegíveis
  // ("Error splitting the input into NAL units"). O TEMP é sempre descartável.
  await rm(tmp, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await mkdir(tmp, { recursive: true });

  // banda: aspecto fixo do spec ou o menor aspecto entre os stills/vídeos em modo band
  let aspect = spec.band?.aspect;
  if (!aspect) {
    const as = [];
    for (const s of spec.segments) {
      if ((s.type === 'still' || s.type === 'video') && (s.fit || 'band') === 'band') as.push((await dims(s.src)).aspect);
      if (s.type === 'split') as.push((await dims(s.top)).aspect, (await dims(s.bottom)).aspect);
    }
    aspect = as.length ? Math.min(...as) : 16 / 9;
  }
  const band = spec.band?.split ? splitGeometry(aspect) : bandGeometry(aspect, spec.band || {});
  console.log(band.split
    ? `  split: 2 bandas ${band.bandW}×${band.bandH} em y=${band.y} (aspect ${band.aspect.toFixed(3)})`
    : `  banda ${FRAME_W}×${band.height} em y=${band.y} (aspect ${band.aspect.toFixed(3)})`);

  // cards
  const htmls = {};
  for (const [name, c] of Object.entries(spec.cards || {})) htmls[name] = cardFromSpec(c, band, { accent: spec.accent });
  const cards = Object.keys(htmls).length ? await captureCards(htmls, join(tmp, 'cards'), join(tmp, 'html')) : {};

  // segmentos
  const segs = [];
  for (let i = 0; i < spec.segments.length; i++) {
    const s = spec.segments[i];
    if (s.type === 'still') segs.push(await renderStill(s, band, tmp, i));
    else if (s.type === 'video') segs.push(await renderVideo(s, band, tmp, i));
    else if (s.type === 'split') segs.push(await renderSplit(s, band, tmp, i));
    else if (s.type === 'card') segs.push(await renderCardSegment(s, cards[s.card], tmp, i));
    else throw new Error(`segmento ${i}: tipo desconhecido ${s.type}`);
    console.log(`  seg ${i} ${s.type} ${segs[i].dur.toFixed(2)}s ${segs[i].crop || segs[i].src || ''}`);
  }
  const transitions = spec.transitions || [];
  if (transitions.length !== segs.length - 1) throw new Error(`transitions: esperava ${segs.length - 1} entradas (segments - 1), recebi ${transitions.length}`);
  transitions.forEach((t, k) => {
    if (t.type === 'cut') return;
    const limit = Math.min(segs[k].dur, segs[k + 1].dur);
    if (!(t.dur > 0) || t.dur > limit) throw new Error(`transição ${k} (${t.type} ${t.dur}s) mais longa que um dos segmentos vizinhos (${segs[k].dur}s / ${segs[k + 1].dur}s): o xfade precisa de dur ≤ ${limit.toFixed(2)}s — alongue o segmento ou encurte a transição`);
  });
  const tl = timeline(segs.map((s) => s.dur), transitions);
  console.log(`  timeline: ${tl.starts.map((t, i) => `seg${i}@${t.toFixed(2)}`).join(' · ')} · total ${tl.total.toFixed(2)}s`);

  // junção: xfade/concat encadeados
  const inputs = [];
  segs.forEach((s) => inputs.push('-i', s.file));
  const f = [];
  let cur = '[0:v]';
  let acc = segs[0].dur;
  let rulerExprs = [];
  for (let k = 0; k < segs.length - 1; k++) {
    const t = transitions[k] || { type: 'cut' };
    const next = `[${k + 1}:v]`;
    const lbl = `[j${k}]`;
    if (t.type === 'cut') {
      f.push(`${cur}${next}concat=n=2:v=1:a=0${lbl}`);
      acc += segs[k + 1].dur;
    } else {
      const offset = acc - t.dur;
      // `settb=AVTB` nos dois ramos: um segmento que veio de `concat` sai com timebase
      // 1/1000000 e o xfade recusa juntar com o 1/15360 dos demais ("do not match").
      f.push(`${cur}settb=AVTB[xa${k}]`);
      f.push(`${next}settb=AVTB[xb${k}]`);
      f.push(`[xa${k}][xb${k}]xfade=transition=${t.type}:duration=${t.dur}:offset=${offset.toFixed(3)}${lbl}`);
      if (t.ruler) rulerExprs.push({ type: t.type, from: offset, dur: t.dur });
      acc = offset + segs[k + 1].dur;
    }
    cur = lbl;
  }
  // overlays globais
  let n = segs.length;
  const overlays = spec.overlays || [];
  for (const o of overlays) {
    if (!cards[o.card]) throw new Error(`overlay: card "${o.card}" não existe`);
    inputs.push('-loop', '1', '-framerate', String(FPS), '-t', String(tl.total), '-i', cards[o.card]);
    const lbl = `[o${n}]`;
    f.push(`${cur}[${n}:v]overlay=0:0:enable='between(t,${o.from},${o.to})'${lbl}`);
    cur = lbl; n++;
  }
  // régua do wipe (vertical para wipeleft/right, horizontal para wipeup/down)
  if (rulerExprs.length) {
    const LW = 6;
    const vline = join(tmp, 'line-v.png'), hline = join(tmp, 'line-h.png');
    await ffmpeg(['-f', 'lavfi', '-i', `color=c=white:s=${LW}x${FRAME_H}`, '-frames:v', '1', vline]);
    await ffmpeg(['-f', 'lavfi', '-i', `color=c=white:s=${FRAME_W}x${LW}`, '-frames:v', '1', hline]);
    for (const r of rulerExprs) {
      const p = `clip((t-${r.from.toFixed(3)})/${r.dur},0,1)`;
      const horizontal = r.type === 'wipeup' || r.type === 'wipedown';
      const pos = r.type === 'wipeleft' ? `x='${FRAME_W}*(1-${p})-${LW / 2}':y=0`
        : r.type === 'wiperight' ? `x='${FRAME_W}*${p}-${LW / 2}':y=0`
        : r.type === 'wipedown' ? `x=0:y='${FRAME_H}*${p}-${LW / 2}'`
        : r.type === 'wipeup' ? `x=0:y='${FRAME_H}*(1-${p})-${LW / 2}'` : null;
      if (!pos) continue;
      inputs.push('-loop', '1', '-framerate', String(FPS), '-t', String(tl.total), '-i', horizontal ? hline : vline);
      const lbl = `[r${n}]`;
      f.push(`${cur}[${n}:v]overlay=${pos}:enable='between(t,${r.from.toFixed(3)},${(r.from + r.dur).toFixed(3)})'${lbl}`);
      cur = lbl; n++;
    }
  }
  f.push(`${cur}setsar=1,format=yuv420p[out]`);

  const reel = join(outDir, `${spec.slug}.mp4`);
  await ffmpeg([...inputs, '-filter_complex', f.join(';'), '-map', '[out]', '-an',
    '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', reel]);

  // QA
  const qa = (spec.qa || tl.starts.map((s, i) => s + segs[i].dur / 2)).map((t) => Math.max(0, Math.min(Number(t), tl.total - 0.1)));
  const framesDir = join(outDir, 'qa-frames');
  await mkdir(framesDir, { recursive: true });
  const frames = [];
  for (const t of qa) {
    const p = join(framesDir, `t${t.toFixed(2)}s.png`);
    await ffmpeg(['-ss', String(t), '-i', reel, '-frames:v', '1', p]);
    if (existsSync(p)) frames.push(p);
  }
  // Folha de QA: todos os frames lado a lado (uma leitura só para revisar a peça inteira)
  let qaSheet = null;
  try {
    const { default: sharp } = await import('sharp');
    const TW = 324, TH = 576;
    const comps = [];
    for (let k = 0; k < frames.length; k++) {
      comps.push({ input: await sharp(frames[k]).resize(TW, TH).toBuffer(), left: k * (TW + 8) + 8, top: 8 });
      comps.push({ input: Buffer.from(`<svg width="${TW}" height="26"><rect width="100%" height="100%" fill="#000" opacity="0.7"/><text x="6" y="18" font-family="Arial" font-size="15" fill="#fff">t=${Number(qa[k]).toFixed(2)}s</text></svg>`), left: k * (TW + 8) + 8, top: 8 });
    }
    qaSheet = join(outDir, 'qa-sheet.jpg');
    await sharp({ create: { width: frames.length * (TW + 8) + 8, height: TH + 16, channels: 3, background: '#222' } }).composite(comps).jpeg({ quality: 85 }).toFile(qaSheet);
  } catch (e) { console.warn('qa-sheet indisponível:', e.message); }

  const meta = await probe(reel);
  const v = meta.streams[0];
  const report = {
    slug: spec.slug, reel, banda: `${FRAME_W}×${band.height} @ y=${band.y}`,
    segments: segs.map((s, i) => ({ i, type: spec.segments[i].type, dur: Number(s.dur.toFixed(2)), start: Number(tl.starts[i].toFixed(2)), crop: s.crop || s.src || null })),
    width: v.width, height: v.height, fps: v.r_frame_rate, pix_fmt: v.pix_fmt, codec: v.codec_name,
    duration: Number(meta.format.duration).toFixed(2), sizeMB: (Number(meta.format.size) / 1e6).toFixed(2),
    esperado: { width: FRAME_W, height: FRAME_H, fps: `${FPS}/1`, duration: tl.total.toFixed(2) },
    qaFrames: frames, qaSheet,
  };
  await writeFile(join(outDir, 'probe.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(outDir, 'spec.json'), JSON.stringify(spec, null, 2), 'utf8');
  return report;
}

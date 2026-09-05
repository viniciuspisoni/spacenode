import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { FRAME_H, FRAME_W, SAFE_BOTTOM, SAFE_TOP, cardHtml } from './cards.mjs';
import { accentuate } from './roteiros.mjs';

const BRAND_DIR = resolve(import.meta.dirname, '../../brand');

const HOOK_SIZE = 72;
const HOOK_LEADING = 1.18;
const HOOK_MAX_LINES = 3;
const GAP_ABOVE_BAND = 76;
const GAP_BELOW_BAND = 64;
const SUB_HEIGHT = 64;

/** Mesma regra do Reel v1: banda entre 4:3 e 16:9, centrada. */
export function bandGeometry(aspectAntes, aspectDepois) {
  const aspect = Math.min(Math.max(Math.min(aspectAntes, aspectDepois), 4 / 3), 16 / 9);
  const height = Math.round(FRAME_W / aspect / 2) * 2;
  const y = Math.round((FRAME_H - height) / 2 / 2) * 2;

  const hookTop = y - GAP_ABOVE_BAND - Math.ceil(HOOK_SIZE * HOOK_LEADING * HOOK_MAX_LINES);
  const subBottom = y + height + GAP_BELOW_BAND + SUB_HEIGHT;
  if (hookTop < SAFE_TOP) throw new Error(`hook fora da zona segura (y=${hookTop} < ${SAFE_TOP})`);
  if (subBottom > SAFE_BOTTOM) throw new Error(`sub fora da zona segura (y=${subBottom} > ${SAFE_BOTTOM})`);

  return { aspect, height, y, hookTop, subBottom };
}

/**
 * O fundo agora é a própria imagem desfocada em full-bleed, então o texto precisa de
 * scrim para manter contraste — é a regra de "scrim sobre imagem" do design system,
 * não um gradiente decorativo. O scrim termina exatamente na borda da banda nítida.
 */
const css = (band) => `
.scrim-top, .scrim-bottom { position: absolute; left: 0; right: 0; }
.scrim-top {
  top: 0; height: ${band.y}px;
  background: linear-gradient(180deg, rgba(10,10,10,0.96) 0%, rgba(10,10,10,0.90) 62%, rgba(10,10,10,0.58) 100%);
}
.scrim-bottom {
  top: ${band.y + band.height}px; height: ${FRAME_H - band.y - band.height}px;
  background: linear-gradient(0deg, rgba(10,10,10,0.96) 0%, rgba(10,10,10,0.90) 62%, rgba(10,10,10,0.58) 100%);
}
.hook {
  position: absolute;
  bottom: ${FRAME_H - (band.y - GAP_ABOVE_BAND)}px; left: 80px; width: 920px;
  font-size: ${HOOK_SIZE}px; font-weight: 600; line-height: ${HOOK_LEADING}; letter-spacing: -0.025em;
  text-align: center; text-wrap: balance;
}
.sub {
  position: absolute;
  top: ${band.y + band.height + GAP_BELOW_BAND}px; left: 80px; width: 920px;
  text-align: center;
}
.eyebrow {
  font-size: 26px; font-weight: 500; text-transform: uppercase;
  letter-spacing: 0.16em; color: #A1A1A6;
}
.payoff { font-size: 44px; font-weight: 500; letter-spacing: -0.015em; }
`;

const logoSvg = () =>
  readFileSync(join(BRAND_DIR, 'spacenode-logo-horizontal.svg'), 'utf8')
    .replace("font-family=\"Geist, 'Geist Sans', -apple-system, sans-serif\"", 'font-family="GeistLocal"');

export function buildCards(roteiro, band) {
  const shared = css(band);

  return {
    // Camada própria, aplicada SEMPRE. Se o scrim morasse dentro dos cards de texto,
    // esconder o texto no corte seco levaria o scrim embora e o quadro ficaria lavado.
    'card-scrim': cardHtml({
      css: shared,
      body: '<div class="scrim-top"></div><div class="scrim-bottom"></div>',
    }),

    'card-antes': cardHtml({
      css: shared,
      body: `
        <div class="hook">${accentuate(roteiro.hookAntes)}</div>
        <div class="sub"><span class="eyebrow">Modelo SketchUp</span></div>`,
    }),

    'card-depois': cardHtml({
      css: shared,
      body: `
        <div class="hook">${accentuate(roteiro.hookDepois)}</div>
        <div class="sub"><span class="payoff">${accentuate(roteiro.sub)}</span></div>`,
    }),

    'card-final': cardHtml({
      transparent: false,
      css: `
        .final {
          position: absolute; inset: 0;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 44px;
        }
        .final svg { width: 460px; height: auto; }
        .final .url { font-size: 34px; font-weight: 400; letter-spacing: 0.02em; color: #A1A1A6; }`,
      body: `<div class="final">${logoSvg()}<div class="url">spacenode.app</div></div>`,
    }),
  };
}

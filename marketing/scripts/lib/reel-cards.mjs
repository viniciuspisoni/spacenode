import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { FRAME_H, FRAME_W, SAFE_BOTTOM, SAFE_TOP, cardHtml } from './cards.mjs';
import { accentuate } from './roteiros.mjs';

const BRAND_DIR = resolve(import.meta.dirname, '../../brand');

const HOOK_SIZE = 62;
const HOOK_LEADING = 1.22;
const HOOK_MAX_LINES = 3;
const GAP_ABOVE_BAND = 70;
const GAP_BELOW_BAND = 60;
const SUB_HEIGHT = 60;

/**
 * A banda nunca fica mais fina que 16:9 nem mais alta que 4:3: os pares vão de
 * 1,54 (banheiro) a 2,60 (panorâmicos), e sem esse limite o panorâmico virava uma
 * tira de 415px perdida no meio do frame.
 */
export function bandGeometry(aspectAntes, aspectDepois) {
  const aspect = Math.min(Math.max(Math.min(aspectAntes, aspectDepois), 4 / 3), 16 / 9);
  const height = Math.round(FRAME_W / aspect / 2) * 2;
  const y = Math.round((FRAME_H - height) / 2 / 2) * 2;

  // Texto ancorado na banda — precisa caber na zona segura do Instagram.
  const hookTop = y - GAP_ABOVE_BAND - Math.ceil(HOOK_SIZE * HOOK_LEADING * HOOK_MAX_LINES);
  const subBottom = y + height + GAP_BELOW_BAND + SUB_HEIGHT;
  if (hookTop < SAFE_TOP) {
    throw new Error(`hook invadiria a zona segura do topo (y=${hookTop} < ${SAFE_TOP})`);
  }
  if (subBottom > SAFE_BOTTOM) {
    throw new Error(`subtexto invadiria a zona segura da base (y=${subBottom} > ${SAFE_BOTTOM})`);
  }

  return { aspect, height, y, hookTop, subBottom };
}

const baseCss = (band) => `
.hook {
  position: absolute;
  bottom: ${FRAME_H - (band.y - GAP_ABOVE_BAND)}px; left: 90px; width: 900px;
  font-size: ${HOOK_SIZE}px; font-weight: 600; line-height: ${HOOK_LEADING}; letter-spacing: -0.02em;
  text-align: center; text-wrap: balance;
}
.sub {
  position: absolute;
  top: ${band.y + band.height + GAP_BELOW_BAND}px; left: 90px; width: 900px;
  text-align: center;
}
.eyebrow {
  font-size: 26px; font-weight: 500; text-transform: uppercase;
  letter-spacing: 0.16em; color: #A1A1A6;
}
.payoff { font-size: 42px; font-weight: 500; letter-spacing: -0.01em; }
`;

const logoSvg = () =>
  readFileSync(join(BRAND_DIR, 'spacenode-logo-horizontal.svg'), 'utf8')
    // O wordmark do SVG referencia "Geist"; no card a família local é GeistLocal.
    .replace("font-family=\"Geist, 'Geist Sans', -apple-system, sans-serif\"", 'font-family="GeistLocal"');

export function buildCards(roteiro, band) {
  const css = baseCss(band);
  return {
    'card-antes': cardHtml({
      css,
      body: `
        <div class="hook">${accentuate(roteiro.hookAntes)}</div>
        <div class="sub"><span class="eyebrow">Modelo SketchUp</span></div>`,
    }),

    'card-depois': cardHtml({
      css,
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
        .final .url {
          font-size: 34px; font-weight: 400; letter-spacing: 0.02em; color: #A1A1A6;
        }`,
      body: `<div class="final">${logoSvg()}<div class="url">spacenode.app</div></div>`,
    }),
  };
}

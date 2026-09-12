import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { FRAME_H, FRAME_W, SAFE_BOTTOM, SAFE_TOP, cardHtml } from './cards.mjs';
import { accentuate } from './roteiros.mjs';

const BRAND_DIR = resolve(import.meta.dirname, '../../brand');

const HOOK_SIZE = 64;
const HOOK_LEADING = 1.18;
const GAP_ABOVE = 76;
const GAP_BELOW = 60;

/** A banda é o vídeo escalado para 1080 de largura, centrado. */
export function bandGeometry(srcW, srcH) {
  const height = Math.round((FRAME_W * srcH) / srcW / 2) * 2;
  const y = Math.round((FRAME_H - height) / 2 / 2) * 2;
  const hookTop = y - GAP_ABOVE - Math.ceil(HOOK_SIZE * HOOK_LEADING * 3);
  if (hookTop < SAFE_TOP) throw new Error(`hook fora da zona segura (${hookTop} < ${SAFE_TOP})`);
  if (y + height + GAP_BELOW + 60 > SAFE_BOTTOM) throw new Error('rótulo fora da zona segura');
  return { height, y, hookTop };
}

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
  bottom: ${FRAME_H - (band.y - GAP_ABOVE)}px; left: 80px; width: 920px;
  font-size: ${HOOK_SIZE}px; font-weight: 600; line-height: ${HOOK_LEADING}; letter-spacing: -0.025em;
  text-align: center; text-wrap: balance;
}
/* Selo de velocidade: o vídeo é acelerado, e isso tem que estar na tela.
   Fica no scrim ACIMA da banda — dentro da banda ele cobria a UI do produto. */
.selo {
  position: absolute; top: 244px; right: 48px;
  font-size: 24px; font-weight: 600; letter-spacing: 0.04em;
  color: #FFFFFF; background: rgba(10,10,10,0.62);
  border: 0.5px solid rgba(255,255,255,0.16); border-radius: 999px;
  padding: 8px 16px;
}
.rotulo {
  position: absolute;
  top: ${band.y + band.height + GAP_BELOW}px; left: 80px; width: 920px;
  text-align: center;
  font-size: 38px; font-weight: 500; letter-spacing: -0.01em;
}
.passo {
  font-size: 26px; font-weight: 500; text-transform: uppercase;
  letter-spacing: 0.16em; color: #A1A1A6; display: block; margin-bottom: 14px;
}
`;

const logoSvg = () =>
  readFileSync(join(BRAND_DIR, 'spacenode-logo-horizontal.svg'), 'utf8')
    .replace("font-family=\"Geist, 'Geist Sans', -apple-system, sans-serif\"", 'font-family="GeistLocal"');

export function buildCards({ hook, velocidade, marcas }, band) {
  const shared = css(band);
  const cards = {
    'card-base': cardHtml({
      css: shared,
      body: `
        <div class="scrim-top"></div><div class="scrim-bottom"></div>
        <div class="hook">${accentuate(hook)}</div>
        <div class="selo">${velocidade}×</div>`,
    }),

    'card-final': cardHtml({
      transparent: false,
      css: `
        .final { position: absolute; inset: 0; display: flex; flex-direction: column;
                 align-items: center; justify-content: center; gap: 44px; }
        .final svg { width: 460px; height: auto; }
        .final .url { font-size: 34px; font-weight: 400; letter-spacing: 0.02em; color: #A1A1A6; }`,
      body: `<div class="final">${logoSvg()}<div class="url">spacenode.app</div></div>`,
    }),
  };

  marcas.forEach((m, i) => {
    cards[`rotulo-${String(i).padStart(2, '0')}`] = cardHtml({
      css: shared,
      body: `<div class="rotulo"><span class="passo">Passo ${i + 1}</span>${accentuate(m.label)}</div>`,
    });
  });

  return cards;
}

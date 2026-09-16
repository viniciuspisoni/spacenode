import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

import { ffmpeg } from './tools.mjs';

export const FRAME_W = 1080;
export const FRAME_H = 1920;

/** Zona segura do Instagram: 220px no topo, 320px na base (BRIEF.md). */
export const SAFE_TOP = 220;
export const SAFE_BOTTOM = FRAME_H - 320; // 1600

const BRAND_DIR = resolve(import.meta.dirname, '../../brand');

const fontFace = (file, ext = false) => `
@font-face {
  font-family: 'GeistLocal';
  src: url('${pathToFileURL(join(BRAND_DIR, file)).href}') format('woff2');
  font-weight: 100 900;
  font-style: normal;
  font-display: block;
  ${ext ? "unicode-range: U+0100-024F, U+0259, U+1E00-1EFF, U+2020, U+20A0-20AB, U+20AD-20CF, U+2113, U+2C60-2C7F, U+A720-A7FF;" : ''}
}`;

/**
 * Envelope HTML padrão dos cards: 1080×1920, Geist local, sem emoji, sem gradiente.
 * `transparent: true` deixa o fundo vazio para overlay em cima do vídeo.
 */
export function cardHtml({ body, css = '', transparent = true }) {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><style>
${fontFace('geist-latin.woff2')}
${fontFace('geist-latin-ext.woff2', true)}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: ${FRAME_W}px; height: ${FRAME_H}px; }
body {
  background: ${transparent ? 'transparent' : '#0A0A0A'};
  font-family: 'GeistLocal', sans-serif;
  color: #FFFFFF;
  -webkit-font-smoothing: antialiased;
  position: relative;
  overflow: hidden;
}
.accent { color: #30D158; }
${css}
</style></head><body>${body}</body></html>`;
}

/**
 * Captura em deviceScaleFactor 2 (2160×3840) e reduz para 1080×1920 com lanczos —
 * supersampling, porque texto é o que mais sofre em vídeo comprimido (BRIEF.md).
 */
export async function captureCards(cards, outDir, tmpDir) {
  await mkdir(outDir, { recursive: true });
  await mkdir(tmpDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: FRAME_W, height: FRAME_H },
    deviceScaleFactor: 2,
  });

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

      await ffmpeg(['-i', bigPath, '-vf', `scale=${FRAME_W}:${FRAME_H}:flags=lanczos`, finalPath]);
      results[name] = finalPath;
    }
  } finally {
    await browser.close();
  }
  return results;
}

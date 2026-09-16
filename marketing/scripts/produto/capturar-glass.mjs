// Captura o site publicado (Glass Mode) em PNG para os takes de interface.
// Só páginas públicas — nada de login. Saída: marketing/output/2026-09-11-campanha/src/site/
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const REPO = 'C:/Users/Pisoni/spacenode';
const OUT = join(REPO, 'marketing/output/2026-09-11-campanha/src/site');
const APP = 'https://spacenode.app';

const CSS = `
  *, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important;
    transition-duration: 0s !important; transition-delay: 0s !important; caret-color: transparent !important; }
  [data-nextjs-toast], nextjs-portal { display: none !important; }
`;

async function estabilizar(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.addStyleTag({ content: CSS }).catch(() => {});
  // força o carregamento de imagens lazy rolando a página inteira
  await page.evaluate(async () => {
    const h = document.body.scrollHeight;
    for (let y = 0; y < h; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(800);
}

const browser = await chromium.launch({ headless: true });
await mkdir(OUT, { recursive: true });
const meta = [];

async function rodada(nome, viewport, dsf) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf, locale: 'pt-BR', colorScheme: 'dark' });
  const page = await ctx.newPage();

  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await estabilizar(page);
  await page.screenshot({ path: join(OUT, `${nome}-landing-hero.png`) });
  await page.screenshot({ path: join(OUT, `${nome}-landing-full.png`), fullPage: true });
  const alturaTotal = await page.evaluate(() => document.documentElement.scrollHeight);
  const secoes = {};
  for (const id of ['projetos', 'sketchup', 'produto', 'planos']) {
    const el = page.locator(`#${id}`).first();
    if (await el.count()) {
      const box = await el.boundingBox();
      const scrollY = await page.evaluate(() => window.scrollY);
      secoes[id] = box ? { x: box.x, y: box.y + scrollY, w: box.width, h: box.height } : null;
      await el.scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      await page.screenshot({ path: join(OUT, `${nome}-landing-${id}.png`) });
      await el.screenshot({ path: join(OUT, `${nome}-el-${id}.png`) });
    }
  }
  // Primeira célula de projeto (cozinha · muda arquitetura) isolada
  const cel = page.locator('.spn-projects-item').first();
  if (await cel.count()) {
    await cel.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await cel.screenshot({ path: join(OUT, `${nome}-el-projeto-cozinha.png`) });
    const b = await cel.boundingBox();
    const sy = await page.evaluate(() => window.scrollY);
    secoes['projeto-cozinha'] = b ? { x: b.x, y: b.y + sy, w: b.width, h: b.height } : null;
  }

  await page.goto(`${APP}/sketchup`, { waitUntil: 'domcontentloaded' });
  await estabilizar(page);
  await page.screenshot({ path: join(OUT, `${nome}-sketchup-hero.png`) });
  await page.screenshot({ path: join(OUT, `${nome}-sketchup-full.png`), fullPage: true });

  meta.push({ nome, viewport, dsf, alturaTotal, secoes });
  await ctx.close();
  console.log('ok', nome);
}

await rodada('desktop', { width: 1440, height: 900 }, 2);
await rodada('mobile', { width: 430, height: 932 }, 3);

await writeFile(join(OUT, 'meta.json'), JSON.stringify(meta, null, 1), 'utf8');
await browser.close();
console.log('saída:', OUT);

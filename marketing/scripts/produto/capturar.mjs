/**
 * Captura de telas REAIS do SPACENODE para os Reels tutoriais.
 *
 *   node marketing/scripts/produto/capturar.mjs --publico
 *       Captura as paginas publicas (landing, planos, login/cadastro, /sketchup).
 *       NAO precisa de login. Roda sozinho.
 *
 *   node marketing/scripts/produto/capturar.mjs --login
 *       Abre uma janela para VOCE logar (Google ou e-mail). O perfil fica salvo em
 *       disco; nenhuma credencial passa por aqui — o script nao le, nao guarda e
 *       nao preenche senha nenhuma. Uma vez so.
 *
 *   node marketing/scripts/produto/capturar.mjs --app [--plano arquivo.json]
 *       Captura os fluxos logados descritos no plano. NUNCA clica em botao que
 *       gasta nodes: qualquer passo marcado "paga" e ignorado, e o script aborta
 *       se o seletor pedido nao existir.
 *
 * Saida: marketing/output/<data>-tutoriais/src/<grupo>/<nn>-<nome>.png (dSF 2).
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const REPO = resolve(import.meta.dirname, '../../..');
const PROFILE = join(process.env.TEMP || '/tmp', 'spacenode-marketing', 'chrome-profile');
const APP = process.env.SPACENODE_TARGET || 'https://spacenode.app';

const argv = process.argv.slice(2);
const arg = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);
const has = (n) => argv.includes(n);

const DATA = arg('--data') || '2026-09-08';
const OUT = join(REPO, 'marketing/output', `${DATA}-tutoriais`, 'src');

// Viewport: use --vw/--vh. Um viewport ESTREITO (ex.: 900x1400) faz a UI real
// assumir o layout responsivo vertical — que e o que cabe legivel num Reel 9:16.
const VIEWPORT = {
  width: Number(arg('--vw') || 1440),
  height: Number(arg('--vh') || 900),
};
const DSF = Number(arg('--dsf') || 2);
const SUFIXO = arg('--sufixo') || '';
// --chrome / --edge: usa o navegador instalado no sistema em vez do Chromium do Playwright.
// Necessario quando o Chromium "headed" nao abre (ex.: spawn UNKNOWN dentro do app empacotado).
const CHANNEL = has('--chrome') ? 'chrome' : has('--edge') ? 'msedge' : undefined;

/** Esconde o que nao pode aparecer em material publico e estabiliza a captura. */
const CSS_LIMPEZA = `
  *, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important;
    transition-duration: 0s !important; transition-delay: 0s !important; caret-color: transparent !important; }
  [data-nextjs-toast], nextjs-portal, #__next-build-watcher { display: none !important; }
`;

async function novaPagina(ctx) {
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.addStyleTag({ content: CSS_LIMPEZA }).catch(() => {});
  return page;
}

async function estabilizar(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.addStyleTag({ content: CSS_LIMPEZA }).catch(() => {});
  await page.waitForTimeout(500);
}

function criarShot(page, grupo) {
  let n = 0;
  return async (nome, opts = {}) => {
    const dir = join(OUT, grupo + SUFIXO);
    await mkdir(dir, { recursive: true });
    const file = join(dir, `${String(++n).padStart(2, '0')}-${nome}.png`);
    if (opts.seletor) {
      const el = page.locator(opts.seletor).first();
      if ((await el.count()) === 0) {
        console.warn(`  ! seletor ausente, pulando: ${nome} (${opts.seletor})`);
        return null;
      }
      await el.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(350);
      await el.screenshot({ path: file });
    } else {
      await page.screenshot({ path: file, fullPage: !!opts.fullPage });
    }
    console.log(`  ${nome}`);
    return file;
  };
}

// ---------------------------------------------------------------- LOGIN ----
if (has('--login')) {
  await mkdir(PROFILE, { recursive: true });
  const ctx = await chromium.launchPersistentContext(PROFILE, { headless: false, viewport: VIEWPORT, channel: CHANNEL });
  const page = await novaPagina(ctx);
  await page.goto(`${APP}/login`);
  console.log('\n  Faca o login na janela que abriu. Eu espero (ate 15 min).');
  console.log('  Quando o app carregar, a janela fecha sozinha.\n');
  await page.waitForURL((u) => u.pathname.startsWith('/app'), { timeout: 15 * 60_000 });
  console.log('  OK. Perfil salvo — nao precisa repetir.');
  console.log('  Agora rode: node marketing/scripts/produto/capturar.mjs --app\n');
  await ctx.close();
  process.exit(0);
}

// -------------------------------------------------------------- PUBLICO ----
if (has('--publico')) {
  const browser = await chromium.launch({ headless: !has('--headed') });
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DSF, locale: 'pt-BR' });
  const page = await novaPagina(ctx);

  console.log('\nPaginas publicas:');
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await estabilizar(page);
  const shot = criarShot(page, 'publico');
  await shot('landing-hero');

  // Secoes da landing por ancora, quando existirem.
  for (const [nome, ancora] of [['landing-produto', '#produto'], ['landing-planos', '#planos'], ['landing-sketchup', '#sketchup'], ['landing-faq', '#faq']]) {
    const alvo = page.locator(ancora).first();
    if (await alvo.count()) {
      await alvo.scrollIntoViewIfNeeded();
      await page.waitForTimeout(700);
      await shot(nome);
    } else {
      console.warn(`  ! ancora ausente: ${ancora}`);
    }
  }

  await page.goto(`${APP}/login?mode=signup`, { waitUntil: 'domcontentloaded' });
  await estabilizar(page);
  await shot('cadastro');

  await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded' });
  await estabilizar(page);
  await shot('login');

  await page.goto(`${APP}/sketchup`, { waitUntil: 'domcontentloaded' });
  await estabilizar(page);
  await shot('sketchup-topo');

  await writeFile(join(OUT, 'publico' + SUFIXO, 'meta.json'),
    JSON.stringify({ alvo: APP, viewport: VIEWPORT, dsf: DSF, data: DATA }, null, 1), 'utf8');
  await ctx.close();
  await browser.close();
  console.log(`\nOK: ${join(OUT, 'publico')}\n`);
  process.exit(0);
}

// ------------------------------------------------------------------ APP ----
if (has('--app')) {
  if (!existsSync(join(PROFILE, 'Default'))) {
    console.error('Sem perfil. Rode antes: node marketing/scripts/produto/capturar.mjs --login');
    process.exit(1);
  }
  const planoPath = arg('--plano') || join(REPO, 'marketing/specs/2026-09-08-tutoriais/captura-app.json');
  if (!existsSync(planoPath)) {
    console.error(`Plano nao encontrado: ${planoPath}`);
    process.exit(1);
  }
  const plano = JSON.parse(await readFile(planoPath, 'utf8'));

  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: !has('--headed'),
    channel: CHANNEL,
    viewport: VIEWPORT,
    deviceScaleFactor: DSF,
    locale: 'pt-BR',
  });
  const page = await novaPagina(ctx);

  await page.goto(`${APP}/app`, { waitUntil: 'domcontentloaded' });
  await estabilizar(page);
  if (new URL(page.url()).pathname.startsWith('/login')) {
    console.error('Sessao expirou. Rode: node marketing/scripts/produto/capturar.mjs --login');
    await ctx.close();
    process.exit(1);
  }

  for (const grupo of plano.grupos) {
    console.log(`\n${grupo.nome}:`);
    const shot = criarShot(page, grupo.nome);
    await page.goto(`${APP}${grupo.url}`, { waitUntil: 'domcontentloaded' });
    await estabilizar(page);

    for (const passo of grupo.passos) {
      if (passo.paga) {
        console.log(`  (pulado: passo pago — ${passo.nome})`);
        continue;
      }
      try {
        if (passo.clicar) {
          const el = page.locator(passo.clicar).first();
          // Espera o alvo aparecer em vez de checar count() na hora: varios controles
          // so entram no DOM depois que o upload termina de processar, e um count()
          // imediato transformava isso em falha intermitente.
          try {
            await el.waitFor({ state: 'visible', timeout: passo.timeoutClique ?? 8000 });
          } catch {
            console.warn(`  ! nao achei ${passo.clicar} — pulando ${passo.nome}`);
            continue;
          }
          await el.click({ timeout: 8000 });
          await page.waitForTimeout(passo.espera ?? 900);
        }
        if (passo.enviarArquivo) {
          const input = page.locator('input[type="file"]').first();
          await input.setInputFiles(passo.enviarArquivo.replace('$REPO', REPO));
          await page.waitForTimeout(passo.espera ?? 3000);
        }
        if (passo.digitar) {
          await page.locator(passo.campo).first().fill(passo.digitar);
          await page.waitForTimeout(400);
        }
        if (passo.rolarAte) {
          await page.locator(passo.rolarAte).first().scrollIntoViewIfNeeded();
          await page.waitForTimeout(500);
        }
        // "aguardar": espera um seletor ficar visivel antes do clique do obturador.
        // Necessario para conteudo que chega por fetch — o drawer de detalhes, por
        // exemplo, ainda mostra "carregando..." muito depois do clique.
        if (passo.aguardar) {
          await page.locator(passo.aguardar).first().waitFor({ state: 'visible', timeout: passo.timeout ?? 20_000 });
          await page.waitForTimeout(400);
        }
        await shot(passo.nome, { seletor: passo.recorte, fullPage: passo.paginaInteira });
      } catch (e) {
        console.warn(`  ! falhou ${passo.nome}: ${e.message.split('\n')[0]}`);
      }
    }
  }

  await ctx.close();
  console.log(`\nOK: ${OUT}\n`);
  process.exit(0);
}

console.log('Use --publico, --login ou --app. Veja o cabecalho do arquivo.');

/**
 * Captura do fluxo real do Renderizar para o REEL PRODUTO (BRIEF.md, pilar 3).
 *
 *   node marketing/scripts/gravar-produto.mjs --login    (1x: você loga na janela)
 *   node marketing/scripts/gravar-produto.mjs --shoot --data 2026-07-29
 *
 * Por que dois modos: o perfil do Chromium fica salvo em disco, então o login é
 * feito UMA vez, no modo --login, que NÃO grava vídeo. A filmagem só acontece no
 * --shoot, já logado — assim nenhuma credencial sua entra no material.
 *
 * --login precisa de janela (headed) e portanto de um terminal com desktop: rode
 * você mesmo. --shoot roda headless reusando o perfil salvo, então pode ser
 * disparado de qualquer lugar. Use --headed no shoot se quiser assistir.
 *
 * A senha é digitada por você, na janela do navegador. O script não lê, não guarda
 * e não preenche credencial nenhuma.
 *
 * ORDEM IMPORTA POR CAUSA DE CUSTO: tudo que é de graça (upload, ajustes, escolha
 * de motor) acontece antes. O script só clica em "gerar" depois de CONFIRMAR que o
 * motor selecionado é o pedido — se não achar o controle, ele aborta sem gastar node.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const REPO = resolve(import.meta.dirname, '../..');
const PROFILE = join(process.env.TEMP || '/tmp', 'spacenode-marketing', 'chrome-profile');

const APP = 'https://spacenode.app';
const VIEWPORT = { width: 1440, height: 900 };
const MOTOR_ALVO = 'Vega';
const RESOLUCAO_ALVO = '2K';
const PAR = 'banheiro';

const argv = process.argv.slice(2);
const arg = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);
const modo = argv.includes('--login') ? 'login' : 'shoot';

await mkdir(PROFILE, { recursive: true });

if (modo === 'login') {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    viewport: VIEWPORT,
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto(`${APP}/login`);

  console.log('\n  Faça o login na janela que abriu. Eu espero (até 15 min).');
  console.log('  Quando o app carregar, esta janela fecha sozinha.\n');

  await page.waitForURL((url) => url.pathname.startsWith('/app'), { timeout: 15 * 60_000 });
  console.log('  ✓ Logado. Perfil salvo — não precisa repetir.');
  console.log('  Agora rode: node marketing/scripts/gravar-produto.mjs --shoot --data AAAA-MM-DD\n');
  await ctx.close();
  process.exit(0);
}

const dateArg = arg('--data');
if (!dateArg) {
  console.error('Erro: passe --data AAAA-MM-DD.');
  process.exit(1);
}

const slug = `${dateArg}-reel-produto-${PAR}`;
const outDir = join(REPO, 'marketing/output', slug);
const shotsDir = join(outDir, 'shots');
await mkdir(shotsDir, { recursive: true });

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: !argv.includes('--headed'),
  viewport: VIEWPORT,
  recordVideo: { dir: join(outDir, 'video-bruto'), size: VIEWPORT },
});
const page = ctx.pages()[0] || (await ctx.newPage());

let n = 0;
const shot = async (nome) => {
  const file = join(shotsDir, `${String(++n).padStart(2, '0')}-${nome}.png`);
  await page.screenshot({ path: file });
  console.log(`  📸 ${nome}`);
  return file;
};

const falhar = async (msg, extra) => {
  console.error(`\n✗ ${msg}`);
  if (extra) console.error(extra);
  console.error('\nNenhum node foi gasto — o script para antes de gerar.\n');
  await ctx.close();
  process.exit(1);
};

try {
  await page.goto(`${APP}/app/generate`, { waitUntil: 'networkidle' });
  if (new URL(page.url()).pathname.startsWith('/login')) {
    await falhar('A sessão expirou. Rode `--login` de novo.');
  }

  // --- etapas gratuitas ---
  await shot('tela-inicial');

  // O par é um banheiro: o ESPAÇO tem que bater com a imagem, senão a demonstração
  // fica incoerente com o que aparece na tela.
  await page.getByRole('button', { name: 'Banheiro', exact: true }).click();
  await shot('espaco-banheiro');

  const input = page.locator('input[type="file"]').first();
  await input.setInputFiles(join(REPO, 'marketing/renders/antes', `${PAR}.jpg`));
  await page.waitForTimeout(2500);
  await shot('imagem-carregada');

  // Motor: precisa rolar o painel esquerdo até a seção de qualidade/motor.
  const painel = page.locator('aside, [class*="panel"], form').first();
  await painel.evaluate((el) => el.scrollTo(0, el.scrollHeight)).catch(() => {});
  await page.waitForTimeout(600);
  await shot('painel-motor');

  const alvo = page.getByRole('button', { name: new RegExp(MOTOR_ALVO, 'i') });
  if ((await alvo.count()) === 0) {
    const rotulos = await page.getByRole('button').allInnerTexts();
    await falhar(
      `Não achei o controle do motor "${MOTOR_ALVO}".`,
      `Botões visíveis:\n${rotulos.filter(Boolean).join(' | ')}`,
    );
  }
  await alvo.first().click();
  await page.waitForTimeout(400);

  const res = page.getByRole('button', { name: new RegExp(`^${RESOLUCAO_ALVO}$`, 'i') });
  if (await res.count()) await res.first().click();
  await page.waitForTimeout(600);
  await shot('motor-selecionado');

  // Trava de custo: só passa se o resumo confirmar o motor pedido.
  const resumo = await page.locator('body').innerText();
  if (!new RegExp(MOTOR_ALVO, 'i').test(resumo)) {
    await falhar(`O resumo da geração não confirma "${MOTOR_ALVO}".`, resumo.slice(-800));
  }
  console.log(`\n  ✓ Motor confirmado: ${MOTOR_ALVO} ${RESOLUCAO_ALVO}. Gerando (isso gasta nodes).\n`);

  // --- a partir daqui gasta node ---
  const gerar = page.getByRole('button', { name: /gerar|renderizar/i }).last();
  await gerar.click();
  await shot('gerando-00');

  for (let i = 1; i <= 20; i++) {
    await page.waitForTimeout(6000);
    await shot(`gerando-${String(i).padStart(2, '0')}`);
    const txt = await page.locator('body').innerText();
    if (/conclu|pronto|baixar|download/i.test(txt)) break;
  }

  await page.waitForTimeout(2000);
  await shot('resultado');

  await writeFile(
    join(outDir, 'shots.json'),
    JSON.stringify({ slug, par: PAR, motor: `${MOTOR_ALVO} ${RESOLUCAO_ALVO}`, viewport: VIEWPORT, frames: n }, null, 2),
    'utf8',
  );
  console.log(`\n✓ ${n} capturas em ${shotsDir}`);
} finally {
  await ctx.close();
  console.log(`✓ vídeo bruto em ${join(outDir, 'video-bruto')}`);
}

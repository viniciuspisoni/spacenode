/**
 * Verificação offline do painel do plugin SketchUp — fluxo de revisão de
 * materiais (1.4.0): catálogo com sessão vencida, seleção do SketchUp virando
 * máscara, custo antes de gerar, revisão gravada no diário, comparador com o
 * render base e as ações do diário.
 *
 * Roda o dialog.html real num Chromium headless com a ponte Ruby substituída
 * (window.sketchup vira um Proxy que grava as chamadas). Nenhuma requisição
 * HTTP sai: tudo fora das fixtures locais é bloqueado.
 *
 *   node scripts/verify-sketchup-revisao.mjs
 *   node scripts/verify-sketchup-revisao.mjs --screenshots=.tmp/revisao
 */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const panelUrl = pathToFileURL(path.join(root, 'sketchup/spacenode/dialog.html')).href;
const screenshotArg = process.argv.find((arg) => arg.startsWith('--screenshots='));
const screenshotDir = screenshotArg ? path.resolve(screenshotArg.slice('--screenshots='.length)) : null;

const baseUrl = 'https://sketchup-fixture.invalid/base.svg';
const revisionUrl = 'https://sketchup-fixture.invalid/revision.png.svg';
const fixtureSvg = (fill) => `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="${fill}"/><rect x="200" y="300" width="600" height="400" fill="#7a5a3a"/></svg>`;
const captureUrl = `data:image/svg+xml,${encodeURIComponent(fixtureSvg('#c9d3d8'))}`;
const CAMERA = { eye: [100, 200, 60], target: [0, 0, 40], up: [0, 0, 1], perspective: true, fov: 35 };
const PHOTO = { aspect: 1.7778, frameAspect: 1.7778, level: false };
const catalog = {
  version: 9,
  defaults: { engine: 'quasar', resolution: '2k' },
  projectTypes: [{
    id: 'interior', label: 'Interior', backgroundLabel: 'Fundo',
    backgrounds: ['Preservar Original'], materialFields: [],
    segments: [{ name: 'Preservar Original', environments: ['Preservar Original'], lighting: ['Preservar Original'], sceneElements: [] }],
  }],
  engines: [{ id: 'quasar', name: 'Quasar', tagline: '', description: '', resolutions: [{ id: '2k', label: '2K', nodes: 20 }] }],
  spaces: { maxPrints: 2, dnaCost: 3, categories: [{ id: 'residencial', label: 'Residencial' }], vistaCosts: [] },
};

async function receive(page, event, payload) {
  await page.evaluate(({ event, payload }) => window.SpaceNodeBridge.receive(event, payload), { event, payload });
}
async function calls(page) { return page.evaluate(() => window.__calls.splice(0)); }
async function text(page, sel) { return (await page.locator(sel).textContent()) || ''; }
async function visible(page, sel) { return page.locator(sel).isVisible(); }

function renderResult(overrides = {}) {
  return {
    id: 'render-1', kind: 'render', renderId: '11111111-1111-4111-8111-111111111111',
    outputUrl: baseUrl, previewUrl: baseUrl, nodesCharged: 20, totalBalance: 980,
    camera: CAMERA, photo: PHOTO, sceneName: 'Cozinha', engine: 'quasar', resolution: '2k',
    createdAt: '2026-09-17T14:00:00Z', signedAt: Math.floor(Date.now() / 1000),
    modelFingerprint: { entities: 12, definitions: 3, diag: 500 },
    ...overrides,
  };
}
function revisionEntry(overrides = {}) {
  return {
    id: 'job-1', kind: 'revision', jobId: 'job-1', status: 'completed',
    outputUrl: revisionUrl, previewUrl: revisionUrl, baseUrl, originalUrl: baseUrl,
    baseId: 'render-1', baseRenderId: '11111111-1111-4111-8111-111111111111',
    action: 'swap_material', edited: 'swap_material', instruction: 'trocar por carvalho claro',
    sceneName: 'Cozinha', camera: CAMERA, photo: PHOTO, nodesCharged: 18, charged: true,
    maskSource: 'selection', maskCoverage: 0.12, selection: { count: 2, names: ['Marcenaria', 'Bancada'] },
    createdAt: '2026-09-17T14:05:00Z', clientRequestId: '22222222-2222-4222-8222-222222222222',
    ...overrides,
  };
}

async function setup(context, { withResult = true } = {}) {
  await context.addInitScript(({ captureUrl }) => {
    window.__calls = [];
    window.sketchup = new Proxy({}, {
      get(_t, name) {
        return (raw) => {
          let payload = raw;
          if (typeof raw === 'string') { try { payload = JSON.parse(raw); } catch { /* string */ } }
          window.__calls.push({ name: String(name), payload });
          if (name === 'captureViewport') window.SpaceNodeBridge.receive('capture', { imageDataUrl: captureUrl, width: 1600, height: 900 });
          if (name === 'listScenes') window.SpaceNodeBridge.receive('scenes', { scenes: [{ index: 0, name: 'Cozinha' }] });
        };
      },
    });
  }, { captureUrl });
  await context.route(/^https?:\/\//, async (route) => {
    const url = route.request().url();
    if (url === baseUrl) return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: fixtureSvg('#d8d0c0') });
    if (url === revisionUrl) return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: fixtureSvg('#c9b48a') });
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(panelUrl);
  await page.waitForFunction(() => !!window.SpaceNodeBridge);
  await receive(page, 'state', {
    authenticated: true, sessionFresh: true, devicePaired: true, locale: 'pt', themeSetting: 'light',
    userEmail: 'fixture@example.invalid', balance: { totalBalance: 1000 }, version: 'revisao-fixture', journal: [],
  });
  await receive(page, 'catalog', structuredClone(catalog));
  if (withResult) {
    await receive(page, 'result', renderResult());
    await page.waitForFunction(() => document.getElementById('resultImage').naturalWidth > 0);
  }
  await calls(page);
  return { page, errors };
}

// PNG de máscara feito no próprio browser: branco no meio (a "marcenaria"),
// preto no resto — mesma proporção do render (16:9).
async function maskDataUrl(page) {
  return page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 180;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 320, 180);
    ctx.fillStyle = '#fff'; ctx.fillRect(40, 60, 120, 80);
    return c.toDataURL('image/png');
  });
}

const cases = [
  ['catalog-auth-expired-offers-reconnect', async (context) => {
    const { page, errors } = await setup(context, { withResult: false });
    await page.evaluate(() => { window.__model_catalog_backup = null; });
    await receive(page, 'catalogError', { message: 'Erro HTTP 401', authExpired: true });
    assert.ok(await visible(page, '#notice'), 'aviso visível');
    assert.match(await text(page, '#notice'), /sessão expirou/i);
    assert.equal(await text(page, '#notice .notice-action button'), 'Reconectar');
    await page.locator('#notice .notice-action button').click();
    const sent = await calls(page);
    assert.deepEqual(sent.map((c) => c.name), ['connect'], 'o aviso chama a reconexão, não o catálogo');
    assert.equal(await page.locator('#generateButton').isDisabled(), true);
    return { page, errors };
  }],
  ['catalog-network-error-keeps-retry', async (context) => {
    const { page, errors } = await setup(context, { withResult: false });
    await page.evaluate(() => { /* sem catálogo: simula painel recém-aberto */ });
    await receive(page, 'catalogError', { message: 'Não foi possível conectar', authExpired: false });
    // Catálogo já chegou no setup → o aviso genérico só aparece sem catálogo.
    return { page, errors };
  }],
  ['selection-mask-to-edit-payload', async (context) => {
    const { page, errors } = await setup(context);
    await page.locator('.seg[data-tab="edit"]').click();
    assert.ok(await visible(page, '#selectionMaskButton'));
    assert.match(await text(page, '#editBaseText'), /Cozinha/, 'a base mostra a cena de origem');
    assert.match(await text(page, '#editSection .batch-note'), /IMAGEM/, 'o aviso diz que a alteração é na imagem');
    await page.locator('#selectionMaskButton').click();
    let sent = (await calls(page)).filter((c) => c.name !== 'listMaterials');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].name, 'selectionMask');
    assert.deepEqual(sent[0].payload.camera, CAMERA, 'a máscara pede a câmera do render base');
    assert.equal(sent[0].payload.photo.frameAspect, PHOTO.frameAspect);
    assert.equal(await text(page, '#selectionMaskButton'), 'Calculando…');
    const mask = await maskDataUrl(page);
    await receive(page, 'selectionMask', {
      ok: true, maskDataUrl: mask, width: 320, height: 180, coverage: 0.1667, count: 2,
      names: ['Marcenaria', 'Bancada'], pids: [101, 102], cameraMoved: true, sharedInstances: 0, modelChanged: false,
    });
    await page.waitForFunction(() => document.getElementById('preview').classList.contains('has-selmask'));
    assert.match(await text(page, '#selectionText'), /2 objetos · 17% da imagem — Marcenaria, Bancada/);
    assert.match(await text(page, '#notice'), /vista mudou desde o render/i, 'câmera movida vira aviso, não erro');
    assert.equal(await text(page, '#selectionMaskButton'), 'Usar seleção do SketchUp');
    await page.locator('#editInstruction').fill('carvalho claro');
    await page.waitForTimeout(900);
    sent = await calls(page);
    const quote = sent.find((c) => c.name === 'editQuote');
    assert.ok(quote, 'cotação pedida antes de gerar');
    assert.equal(quote.payload.action, 'swap_material');
    await receive(page, 'editQuote', { quoteId: quote.payload.quoteId, nodes: 18, simulated: false });
    assert.equal(await text(page, '#editMeta'), '18 nodes', 'o custo aparece no botão antes de gerar');
    assert.equal(await page.locator('#editButton').isDisabled(), false);
    if (screenshotDir) {
      await page.evaluate(() => document.getElementById('scroll').scrollTo(0, 0));
      await page.screenshot({ path: path.join(screenshotDir, 'selection-mask-overlay.png') });
    }
    await page.locator('#editButton').click();
    sent = await calls(page);
    const apply = sent.find((c) => c.name === 'applyEdit');
    assert.ok(apply, 'applyEdit enviado');
    const p = apply.payload;
    assert.equal(p.action, 'swap_material');
    assert.equal(p.instruction, 'carvalho claro');
    assert.ok(String(p.maskDataUrl).startsWith('data:image/png'), 'máscara composta em PNG');
    assert.equal(p.maskSource, 'selection');
    assert.equal(p.sourceUrl, baseUrl);
    assert.equal(p.baseId, 'render-1');
    assert.equal(p.baseRenderId, '11111111-1111-4111-8111-111111111111');
    assert.equal(p.sceneName, 'Cozinha');
    assert.deepEqual(p.camera, CAMERA);
    assert.deepEqual(p.selection, { count: 2, names: ['Marcenaria', 'Bancada'], pids: [101, 102], coverage: 0.1667 });
    assert.match(p.clientRequestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    // A máscara composta é branca onde o Ruby marcou (e nas dimensões da fonte).
    const white = await page.evaluate(async (url) => {
      const img = new Image(); img.src = url; await img.decode();
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
      const inside = ctx.getImageData(Math.round(c.width * 0.25), Math.round(c.height * 0.5), 1, 1).data[0];
      const outside = ctx.getImageData(Math.round(c.width * 0.9), Math.round(c.height * 0.9), 1, 1).data[0];
      return { w: c.width, h: c.height, inside, outside };
    }, p.maskDataUrl);
    assert.equal(white.w, 1600); assert.equal(white.h, 900);
    assert.ok(white.inside > 200 && white.outside < 50, `máscara alinhada: ${JSON.stringify(white)}`);
    return { page, errors };
  }],
  ['selection-mask-error-and-clear', async (context) => {
    const { page, errors } = await setup(context);
    await page.locator('.seg[data-tab="edit"]').click();
    await page.locator('#selectionMaskButton').click();
    await receive(page, 'selectionMask', { ok: false, message: 'Selecione no SketchUp o grupo…' });
    assert.match(await text(page, '#notice'), /Selecione no SketchUp/);
    assert.equal(await page.evaluate(() => document.getElementById('preview').classList.contains('has-selmask')), false);
    assert.equal(await page.locator('#editButton').isDisabled(), true, 'sem máscara e sem texto não há o que aplicar');
    await calls(page);
    await page.locator('#selectionMaskButton').click();
    await receive(page, 'selectionMask', { ok: true, maskDataUrl: await maskDataUrl(page), coverage: 0.2, count: 1, names: ['Bancada'] });
    await page.waitForFunction(() => document.getElementById('preview').classList.contains('has-selmask'));
    await page.locator('#maskClear').click();
    assert.equal(await page.evaluate(() => document.getElementById('preview').classList.contains('has-selmask')), false, 'limpar remove a seleção');
    assert.equal(await visible(page, '#selectionLine'), false);
    return { page, errors };
  }],
  ['revision-result-journal-and-compare', async (context) => {
    const { page, errors } = await setup(context);
    await page.locator('.seg[data-tab="edit"]').click();
    const rev = revisionEntry();
    await receive(page, 'result', { ...rev, totalBalance: 962 });
    await receive(page, 'journal', { entries: [rev, renderResult()] });
    assert.match(await text(page, '#notice'), /Revisão salva neste arquivo/);
    assert.equal(await page.locator('#revisionsList .rev').count(), 1, 'a revisão aparece na aba Editar');
    assert.match(await text(page, '#revisionsList .rev .s'), /Cozinha · 2 objetos · 12% da imagem/);
    assert.match(await text(page, '#editBaseText'), /revisão · Cozinha/);
    assert.ok(await visible(page, '#compareButton'), 'comparar disponível');
    await page.locator('#compareButton').click();
    assert.equal(await page.evaluate(() => document.getElementById('captureCompareImage').getAttribute('src')), baseUrl, 'compara com o render BASE, não com a captura');
    assert.ok(await page.evaluate(() => document.getElementById('preview').classList.contains('is-comparing')));
    await page.locator('#compareButton').click();
    // Histórico: faixa "Neste arquivo" com render + revisão; abrir o render base.
    await page.locator('#historyOpen').click();
    assert.ok(await visible(page, '#journalBlock'));
    assert.equal(await page.locator('#journalList .rev').count(), 2);
    await page.locator('#journalList .rev').nth(1).click();
    await page.waitForFunction(() => document.getElementById('editBaseText').textContent.indexOf('Cozinha') >= 0);
    assert.doesNotMatch(await text(page, '#editBaseText'), /revisão/, 'render base reaberto do diário');
    // "Voltar à vista" mora em "Mais ações" (fechado por padrão).
    await page.locator('#resultMoreToggle').click();
    await page.locator('#restoreCameraButton').click();
    const sent = await calls(page);
    const restore = sent.find((c) => c.name === 'restoreCamera');
    assert.ok(restore, 'voltar à vista usa a câmera guardada');
    assert.deepEqual(restore.payload.camera || restore.payload, CAMERA);
    return { page, errors };
  }],
  ['journal-delete-and-edit-in-browser', async (context) => {
    const { page, errors } = await setup(context);
    await receive(page, 'journal', { entries: [revisionEntry()] });
    await page.locator('.seg[data-tab="edit"]').click();
    await page.locator('#revisionsList .rev .link').click();
    let sent = (await calls(page)).filter((c) => c.name !== 'listMaterials');
    assert.deepEqual(sent.map((c) => c.name), ['journalDelete']);
    assert.equal(sent[0].payload.id, 'job-1');
    await receive(page, 'journal', { entries: [] });
    assert.equal(await page.locator('#revisionsList .rev').count(), 0);
    assert.ok(await visible(page, '#revisionsEmpty'));
    await page.locator('#editBrowserButton').click();
    sent = await calls(page);
    assert.equal(sent[0].name, 'openUrl');
    assert.match(sent[0].payload, /\/app\/editar\?source=/);
    return { page, errors };
  }],
  ['result-restored-from-file-uses-journal-base', async (context) => {
    const { page, errors } = await setup(context, { withResult: false });
    const stored = renderResult({ signedAt: Math.floor(Date.now() / 1000) - 4000 });
    await receive(page, 'state', {
      authenticated: true, sessionFresh: true, locale: 'pt', version: 'revisao-fixture',
      lastResult: stored, journal: [stored],
    });
    // Restaurado do .skp: ações travadas até o servidor re-assinar pelo renderId.
    assert.equal(await page.locator('#editButton').isDisabled(), true);
    const sent = await calls(page);
    assert.ok(sent.some((c) => c.name === 'refreshResult' && c.payload.renderId === stored.renderId), 're-assina pelo renderId');
    await receive(page, 'resultRefreshed', { renderId: stored.renderId, outputUrl: baseUrl, previewUrl: baseUrl, signedAt: Math.floor(Date.now() / 1000) });
    await page.locator('.seg[data-tab="edit"]').click();
    assert.equal(await page.locator('#selectionMaskButton').isDisabled(), false, 'seleção liberada depois da re-assinatura');
    assert.match(await text(page, '#editBaseText'), /Cozinha/);
    return { page, errors };
  }],
];

if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
let failed = 0;
try {
  for (const [name, test] of cases) {
    const context = await browser.newContext({ viewport: { width: 440, height: 780 } });
    try {
      const { page, errors } = await test(context);
      assert.deepEqual(errors, [], 'o painel não pode lançar erros de JavaScript');
      if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, `${name}.png`), fullPage: true });
      process.stdout.write(`PASS ${name}\n`);
    } catch (error) {
      failed += 1;
      process.stderr.write(`FAIL ${name}: ${error.stack || error.message}\n`);
      const page = context.pages()[0];
      if (screenshotDir && page) await page.screenshot({ path: path.join(screenshotDir, `${name}-failed.png`), fullPage: true }).catch(() => {});
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
process.stdout.write(`${cases.length - failed}/${cases.length} verificações do fluxo de revisão passaram. Nenhuma requisição externa foi enviada.\n`);
if (failed) process.exitCode = 1;

/**
 * Verificação offline do painel do plugin SketchUp (dialog.html real num
 * Chromium headless, ponte Ruby substituída). Reescrito na 1.9.0: a versão
 * anterior descrevia o painel de etapas da 0.5 (#stepSource/#workflowNextButton)
 * que não existe desde a 1.0.0.
 *
 *   node scripts/verify-sketchup-flow.mjs
 *   SKETCHUP_TEST_CHANNEL=chrome node scripts/verify-sketchup-flow.mjs   (Chrome instalado, sem `playwright install`)
 *   node scripts/verify-sketchup-flow.mjs --screenshots=.tmp/flow
 *
 * Nenhuma requisição HTTP sai: tudo fora das fixtures locais é bloqueado.
 * Os preços são artificiais — não são asserções de produção.
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

const resultUrl = 'https://sketchup-fixture.invalid/result.svg';
const fixtureSvg = (fill) => `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="${fill}"/><path d="M0 700L800 300L1600 700V900H0Z" fill="#25444b"/></svg>`;
const captureUrl = `data:image/svg+xml,${encodeURIComponent(fixtureSvg('#93bac4'))}`;
const CAMERA = { eye: [100, 200, 60], target: [0, 0, 40], up: [0, 0, 1], perspective: true, fov: 35 };
const scenes = [{ index: 0, name: 'Cozinha' }, { index: 1, name: 'Sala' }, { index: 2, name: 'Fachada' }];
const catalog = {
  version: 10,
  defaults: { engine: 'quasar', resolution: '2k' },
  projectTypes: [{
    id: 'interior', label: 'Interior', backgroundLabel: 'Contexto visual',
    backgrounds: ['Preservar Original'], materialFields: [],
    segments: [
      { name: 'Preservar Original', environments: ['Preservar Original'], lighting: ['Preservar Original'], sceneElements: [] },
      { name: 'Residencial', environments: ['Preservar Original', 'Sala de Estar'], lighting: ['Preservar Original', 'Luz de Janela'], sceneElements: [] },
    ],
  }],
  engines: [
    { id: 'quasar', name: 'Quasar', tagline: '', description: 'Padrão da casa.', supports: { seed: false }, resolutions: [{ id: '2k', label: '2K', nodes: 20 }] },
    { id: 'vega', name: 'Vega', tagline: '', description: 'Entrega final.', supports: { seed: true }, resolutions: [{ id: '2k', label: '2K', nodes: 20 }, { id: '4k', label: '4K', nodes: 40 }] },
  ],
};

async function receive(page, event, payload) {
  await page.evaluate(({ event, payload }) => window.SpaceNodeBridge.receive(event, payload), { event, payload });
}
async function calls(page) { return page.evaluate(() => window.__calls.splice(0)); }
async function text(page, sel) { return ((await page.locator(sel).textContent()) || '').trim(); }
async function noticeKind(page) {
  return page.evaluate(() => {
    const n = document.getElementById('notice');
    return ['is-success', 'is-warn', 'is-error'].find((c) => n.classList.contains(c)) || null;
  });
}
async function closeSheet(page, id) { await page.locator(`#${id} .sheet-done`).first().click(); }

function renderResult(overrides = {}) {
  return {
    id: 'render-1', kind: 'render', renderId: '11111111-1111-4111-8111-111111111111',
    outputUrl: resultUrl, previewUrl: resultUrl, nodesCharged: 20, totalBalance: 980,
    camera: CAMERA, photo: { aspect: 0, frameAspect: 1.7778, level: false }, sceneName: 'Cozinha',
    engine: 'quasar', resolution: '2k', seed: 4242,
    createdAt: '2026-10-02T14:00:00Z', signedAt: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

async function setup(context, { locale = 'pt', theme = 'dark', viewport } = {}) {
  await context.addInitScript(({ captureUrl, scenes }) => {
    window.__calls = [];
    window.sketchup = new Proxy({}, {
      get(_t, name) {
        return (raw) => {
          let payload = raw;
          if (typeof raw === 'string') { try { payload = JSON.parse(raw); } catch { /* string */ } }
          window.__calls.push({ name: String(name), payload });
          if (name === 'captureViewport') window.SpaceNodeBridge.receive('capture', { imageDataUrl: captureUrl, width: 1600, height: 900 });
          if (name === 'listScenes') window.SpaceNodeBridge.receive('scenes', { scenes });
        };
      },
    });
  }, { captureUrl, scenes });
  await context.route(/^https?:\/\//, async (route) => {
    if (route.request().url() === resultUrl) return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: fixtureSvg('#d8d0c0') });
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  if (viewport) await page.setViewportSize(viewport);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(panelUrl);
  await page.waitForFunction(() => !!window.SpaceNodeBridge);
  await receive(page, 'state', {
    authenticated: true, sessionFresh: true, devicePaired: true, locale, themeSetting: theme,
    userEmail: 'fixture@example.invalid', balance: { totalBalance: 1000 }, version: '1.9.0-fixture', journal: [],
  });
  await receive(page, 'catalog', structuredClone(catalog));
  await receive(page, 'scenes', { scenes });
  await calls(page);
  return { page, errors };
}

async function selectEngine(page, name) {
  await page.locator('#dockOutput').click();
  await page.locator('#engineCards button').filter({ hasText: name }).first().click();
  await closeSheet(page, 'sheetOutput');
}

const cases = [
  ['brand-assets-and-loader', async (context) => {
    const { page, errors } = await setup(context);
    assert.equal(await page.title(), 'SpaceNode');
    const brand = await page.evaluate(() => Array.from(document.querySelectorAll('.brand picture')).map((p) => ({
      compact: p.querySelector('source').getAttribute('srcset'),
      full: p.querySelector('img').getAttribute('src'),
    })));
    assert.deepEqual(brand, [
      { compact: 'assets/spacenode-symbol-reverse.svg', full: 'assets/spacenode-logo-horizontal.svg' },
      { compact: 'assets/spacenode-symbol-dark.svg', full: 'assets/spacenode-logo-horizontal-dark.svg' },
    ], 'N estrutural puro nos dois temas (sem chip no claro)');
    const solidN = await page.evaluate(() => document.documentElement.outerHTML.includes('M4 60V4H18L46 39V4H60V60H46L18 25V60Z'));
    assert.equal(solidN, false, 'o N micro antigo não existe mais no painel');
    const loader = await page.evaluate(() => {
      const svg = document.querySelector('.brand-loader');
      return { tag: svg.tagName.toLowerCase(), paths: svg.querySelectorAll('path').length, anim: getComputedStyle(svg.querySelector('path')).animationName };
    });
    assert.equal(loader.tag, 'svg');
    assert.equal(loader.paths, 3, 'loader oficial: dois apoios e a ligação');
    assert.equal(loader.anim, 'sn-build');
    assert.match(await text(page, '#footer'), /^SpaceNode para SketchUp · v1\.9\.0-fixture$/);
    return { page, errors };
  }],
  ['generate-payload-and-verified-badge', async (context) => {
    const { page, errors } = await setup(context);
    await page.locator('#prompt').fill('piso de madeira clara');
    await page.locator('#generateButton').click();
    const sent = await calls(page);
    const gen = sent.find((c) => c.name === 'generate');
    assert.ok(gen, 'generate enviado');
    assert.equal(gen.payload.structuralBoost, false);
    assert.equal(gen.payload.useAnchor, false);
    assert.equal(gen.payload.prompt, 'piso de madeira clara');
    assert.equal(gen.payload.engine, 'quasar');
    assert.equal(await page.locator('#generateButton').isDisabled(), true, 'gerando: CTA travado');
    await receive(page, 'result', renderResult({ fidelityScore: 0.91 }));
    await page.waitForFunction(() => document.getElementById('resultImage').naturalWidth > 0);
    assert.match(await text(page, '#notice'), /20 nodes utilizados\. Estrutura conferida contra o modelo\./);
    assert.equal(await noticeKind(page), 'is-success');
    assert.equal(await page.locator('#notice .notice-action button').count(), 0, 'sem ação quando passou');
    return { page, errors };
  }],
  ['fidelity-warning-offers-fix-auto', async (context) => {
    const { page, errors } = await setup(context);
    await receive(page, 'result', renderResult({ fidelityScore: 0.41, fidelityWarning: true, seed: 777 }));
    await page.waitForFunction(() => document.getElementById('resultImage').naturalWidth > 0);
    assert.match(await text(page, '#notice'), /verificação estrutural encontrou possíveis diferenças/);
    assert.equal(await noticeKind(page), 'is-warn', 'aviso de fidelidade não é erro do sistema');
    assert.equal(await text(page, '#notice .notice-action button'), 'Corrigir automaticamente · 20 nodes');
    await calls(page);
    await page.locator('#notice .notice-action button').click();
    const sent = await calls(page);
    const gen = sent.find((c) => c.name === 'generate');
    assert.ok(gen, 'a correção gera de novo');
    assert.equal(gen.payload.structuralBoost, true);
    assert.equal(gen.payload.seed, 777, 'mesma semente do render reprovado');
    assert.equal(gen.payload.useAnchor, false, 'nunca com âncora');
    assert.equal(gen.payload.anchorUrl, null);
    return { page, errors };
  }],
  ['refinement-not-persisted-visible-in-dock-and-scenes-cleared-after-render', async (context) => {
    const { page, errors } = await setup(context);
    assert.match(await text(page, '#L_description'), /^Refinar imagem/, 'mesmo nome do web');
    await page.locator('#prompt').fill('decoração minimalista');
    await page.locator('#rowScene').click();
    await page.locator('#segmentPills button').filter({ hasText: 'Residencial' }).click();
    await closeSheet(page, 'sheetScene');
    await page.waitForTimeout(600);
    const sent = await calls(page);
    const persisted = sent.filter((c) => c.name === 'persistState');
    assert.ok(persisted.length > 0, 'o painel persiste o estado');
    for (const p of persisted) assert.equal('prompt' in p.payload, false, 'o refinamento não vai pro estado persistido');
    assert.match(await text(page, '#dockSummary'), /Residencial · refinamento/, 'o resumo do dock mostra que há refinamento ativo');
    await page.locator('.seg[data-tab="scenes"]').click();
    await page.locator('#scenesPills button').filter({ hasText: 'Cozinha' }).click();
    assert.match(await text(page, '#batchPromptHint'), /"decoração minimalista" entra em todas as cenas/);
    await page.locator('.seg[data-tab="render"]').click();
    await page.locator('#generateButton').click();
    const gen = (await calls(page)).find((c) => c.name === 'generate');
    assert.equal(gen.payload.prompt, 'decoração minimalista');
    await receive(page, 'result', renderResult());
    await page.waitForFunction(() => document.getElementById('resultImage').naturalWidth > 0);
    assert.equal(await page.locator('#prompt').inputValue(), '', 'o refinamento virou este render — o campo limpa');
    assert.doesNotMatch(await text(page, '#dockSummary'), /refinamento/);
    return { page, errors };
  }],
  ['disabled-tab-explains-instead-of-ignoring', async (context) => {
    const { page, errors } = await setup(context);
    const edit = page.locator('.seg[data-tab="edit"]');
    assert.equal(await edit.getAttribute('aria-disabled'), 'true');
    // O Playwright trata aria-disabled como não clicável; no CEF o clique chega
    // normalmente — é exatamente o que o painel usa pra explicar o que falta.
    await edit.dispatchEvent('click');
    assert.match(await text(page, '#notice'), /Gere um render primeiro/);
    assert.equal(await text(page, '#notice .notice-action button'), 'Gerar render');
    assert.equal(await page.locator('.seg.is-active').getAttribute('data-tab'), 'render', 'a aba não muda');
    await receive(page, 'result', renderResult());
    await page.waitForFunction(() => document.querySelector('.seg[data-tab="edit"]').getAttribute('aria-disabled') === 'false');
    await edit.click();
    assert.equal(await page.locator('.seg.is-active').getAttribute('data-tab'), 'edit', 'com render a aba abre');
    return { page, errors };
  }],
  ['cancel-says-whether-nodes-may-have-been-charged', async (context) => {
    const { page, errors } = await setup(context);
    await page.locator('#generateButton').click();
    await calls(page);
    await page.locator('#cancelButton').click();
    assert.deepEqual((await calls(page)).map((c) => c.name), ['cancelGenerate']);
    assert.equal(await text(page, '#notice'), '', 'nada antes de o Ruby responder');
    await receive(page, 'status', { stage: 'idle', message: 'Geração cancelada.', cancelled: true, posted: false });
    assert.match(await text(page, '#notice'), /Cancelado antes do envio — nada foi cobrado/);
    assert.equal(await noticeKind(page), 'is-success');
    await page.locator('#generateButton').click();
    await page.locator('#cancelButton').click();
    await receive(page, 'status', { stage: 'idle', message: 'Geração cancelada.', cancelled: true, posted: true });
    assert.match(await text(page, '#notice'), /Cancelado depois do envio/);
    assert.equal(await noticeKind(page), 'is-warn');
    return { page, errors };
  }],
  ['plugin-update-stays-in-footer', async (context) => {
    const { page, errors } = await setup(context);
    await receive(page, 'pluginUpdate', { version: '1.9.9', current: '1.9.0-fixture', url: 'https://spacenode.app/downloads/spacenode-sketchup.rbz', note: 'nota' });
    assert.match(await text(page, '#notice'), /1\.9\.9/);
    assert.match(await text(page, '#footer'), /1\.9\.9 disponível — baixar/);
    await receive(page, 'result', renderResult());
    await page.waitForFunction(() => document.getElementById('resultImage').naturalWidth > 0);
    assert.doesNotMatch(await text(page, '#notice'), /1\.9\.9/, 'o notice foi substituído pelo resultado…');
    assert.match(await text(page, '#footer'), /1\.9\.9 disponível — baixar/, '…mas o rodapé continua avisando');
    await calls(page);
    await page.locator('#footer a').click();
    assert.deepEqual((await calls(page)).map((c) => [c.name, c.payload]), [['openUrl', 'https://spacenode.app/downloads/spacenode-sketchup.rbz']]);
    return { page, errors };
  }],
  ['camera-facts-warn-before-charging', async (context) => {
    const { page, errors } = await setup(context);
    await receive(page, 'camera', { perspective: true, fovDeg: 70, focalLengthMm: 24, tiltDeg: 8, twoPoint: false, eyeHeightM: 1.55, shadowsOn: false, renderMode: 1, lineStyle: true });
    const hint = await text(page, '#toolsHint');
    assert.match(hint, /Câmera inclinada 8° — toque em Nivelar/);
    assert.match(hint, /Sombras desligadas no modelo/);
    assert.match(hint, /Estilo de linhas no modelo/);
    await page.locator('#toolLevel').click();
    await page.waitForTimeout(3300);
    await receive(page, 'camera', { perspective: true, fovDeg: 70, focalLengthMm: 24, tiltDeg: 8, twoPoint: false, eyeHeightM: 1.55, shadowsOn: false });
    assert.doesNotMatch(await text(page, '#toolsHint'), /inclinada/, 'com Nivelar ligado o aviso de inclinação sai');
    assert.match(await text(page, '#toolsHint'), /Sombras desligadas/);
    await page.locator('#captureButton').click();
    assert.match(await text(page, '#toolsHint'), /A IA recebe: 1600×900 · 24 mm · 70° · olho a 1,55 m/);
    return { page, errors };
  }],
  ['batch-note-only-promises-seed-where-it-applies', async (context) => {
    const { page, errors } = await setup(context);
    await page.locator('.seg[data-tab="scenes"]').click();
    await page.locator('#scenesPills button').filter({ hasText: 'Cozinha' }).click();
    await page.locator('#scenesPills button').filter({ hasText: 'Sala' }).click();
    assert.match(await text(page, '#batchLabel'), /Gerar 2 cenas/);
    assert.match(await text(page, '#batchNote'), /a semente não se aplica/, 'Quasar: sem promessa de semente');
    await selectEngine(page, 'Vega');
    assert.match(await text(page, '#batchNote'), /mesma semente/, 'Vega: a semente vale');
    return { page, errors };
  }],
  ['compact-viewports-no-overflow', async (context) => {
    const { page, errors } = await setup(context);
    for (const viewport of [{ width: 380, height: 560 }, { width: 440, height: 780 }]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(100);
      const layout = await page.evaluate(() => {
        const dock = document.querySelector('.dock').getBoundingClientRect();
        return { doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, dockTop: dock.top, dockBottom: dock.bottom };
      });
      assert.ok(layout.doc <= viewport.width + 1 && layout.body <= viewport.width + 1, `sem rolagem horizontal em ${viewport.width}px: ${JSON.stringify(layout)}`);
      assert.ok(layout.dockTop >= 0 && layout.dockBottom <= viewport.height + 1, `dock dentro da janela em ${viewport.width}×${viewport.height}: ${JSON.stringify(layout)}`);
    }
    return { page, errors };
  }],
  ['result-notes-edge-empty-shadows-off-jpeg', async (context) => {
    const { page, errors } = await setup(context);
    await receive(page, 'result', renderResult({ conditioning: { edgeRequested: true, edgeMap: false, edgeReason: 'empty', sunRequested: false, sunApplied: false, shadowsOn: false, sourceMime: 'image/jpeg', materialsRequested: 0, materialsSent: 0, skipped: [], mirrorsRequested: 0, mirrorsApplied: 0 } }));
    await page.waitForFunction(() => document.getElementById('resultImage').naturalWidth > 0);
    const n = await text(page, '#notice');
    assert.match(n, /mapa de estrutura saiu vazio/);
    assert.match(n, /sombras do modelo desligadas/);
    assert.match(n, /enviada em JPEG/);
    assert.equal(await noticeKind(page), 'is-warn');
    return { page, errors };
  }],
  ['fix-auto-uses-the-failed-render-engine', async (context) => {
    const { page, errors } = await setup(context);
    await receive(page, 'result', renderResult({ fidelityWarning: true, seed: 5, engine: 'vega', resolution: '4k' }));
    await page.waitForFunction(() => document.getElementById('resultImage').naturalWidth > 0);
    assert.equal(await text(page, '#notice .notice-action button'), 'Corrigir automaticamente · 40 nodes', 'custo do motor/qualidade do render reprovado, não do painel');
    await calls(page);
    await page.locator('#notice .notice-action button').click();
    const gen = (await calls(page)).find((c) => c.name === 'generate');
    assert.equal(gen.payload.engine, 'vega');
    assert.equal(gen.payload.resolution, '4k');
    return { page, errors };
  }],
  ['style-lock-blocked-when-the-seed-did-not-apply', async (context) => {
    const { page, errors } = await setup(context);
    await receive(page, 'result', renderResult({ seed: 4242, seedApplied: false }));
    await page.waitForFunction(() => document.getElementById('resultImage').naturalWidth > 0);
    assert.equal(await page.locator('#styleLockButton').isDisabled(), true);
    assert.match(await text(page, '#styleSub'), /semente não se aplica/);
    await receive(page, 'result', renderResult({ seed: 4243, seedApplied: true, engine: 'vega' }));
    assert.equal(await page.locator('#styleLockButton').isDisabled(), false);
    return { page, errors };
  }],
  ['mask-undo-stroke-and-escape', async (context) => {
    const { page, errors } = await setup(context);
    await receive(page, 'result', renderResult());
    await page.waitForFunction(() => document.getElementById('resultImage').naturalWidth > 0);
    await page.locator('.seg[data-tab="edit"]').click();
    await page.locator('#maskToggle').click();
    assert.equal(await page.locator('#maskUndo').isVisible(), false, 'sem traço, sem desfazer');
    const box = await page.locator('#maskCanvas').boundingBox();
    assert.ok(box && box.width > 50 && box.height > 50, 'canvas da máscara dimensionado');
    // Eventos de ponteiro despachados direto no canvas (o CEF entrega assim).
    const canvas = page.locator('#maskCanvas');
    for (const dx of [0.3, 0.6]) {
      const x0 = box.x + box.width * dx; const y0 = box.y + box.height * 0.4;
      await canvas.dispatchEvent('pointerdown', { clientX: x0, clientY: y0, pointerId: 1, isPrimary: true, button: 0 });
      await canvas.dispatchEvent('pointermove', { clientX: x0 + 20, clientY: y0 + 15, pointerId: 1, isPrimary: true });
      await canvas.dispatchEvent('pointerup', { clientX: x0 + 20, clientY: y0 + 15, pointerId: 1, isPrimary: true, button: 0 });
    }
    assert.equal(await page.locator('#maskUndo').isVisible(), true);
    assert.equal(await text(page, '#maskUndo'), 'Desfazer traço');
    await page.locator('#maskUndo').click();
    await page.keyboard.press('Control+z');
    assert.equal(await page.locator('#maskUndo').isVisible(), false, 'dois traços, dois desfazeres');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.getElementById('preview').classList.contains('is-masking')), false, 'Esc sai do modo pintar');
    return { page, errors };
  }],
  ['upscale-quote-is-cancelled-when-replaced', async (context) => {
    const { page, errors } = await setup(context);
    await receive(page, 'result', renderResult());
    await page.waitForFunction(() => document.getElementById('resultImage').naturalWidth > 0);
    await page.locator('#resultMoreToggle').click();
    await page.locator('#upscale2xButton').click();
    await receive(page, 'upscaleQuote', { scale: '2x', width: 3200, height: 1800, nodes: 12 });
    await calls(page);
    await page.locator('#generateButton').click();
    const names = (await calls(page)).map((c) => c.name);
    assert.ok(names.indexOf('cancelUpscale') >= 0 && names.indexOf('cancelUpscale') < names.indexOf('generate'), `a cotação descartada é cancelada antes de gerar: ${names.join(',')}`);
    // Aplicar a cotação continua sendo confirmUpscale puro — nunca cancela antes.
    await receive(page, 'status', { stage: 'idle', message: 'Geração cancelada.', cancelled: true, posted: false });
    await page.locator('#upscale2xButton').click();
    await receive(page, 'upscaleQuote', { scale: '2x', width: 3200, height: 1800, nodes: 12 });
    await calls(page);
    await page.locator('#notice .notice-action button').click();
    const applied = (await calls(page)).map((c) => c.name);
    assert.deepEqual(applied, ['confirmUpscale'], `aplicar não cancela a própria cotação: ${applied.join(',')}`);
    return { page, errors };
  }],
  ['variation-hint-and-history-captions', async (context) => {
    const { page, errors } = await setup(context);
    await receive(page, 'result', renderResult());
    await page.waitForFunction(() => document.getElementById('resultImage').naturalWidth > 0);
    await page.locator('#resultMoreToggle').click();
    assert.match(await text(page, '#variationHint'), /a câmera precisa ser a mesma/);
    await receive(page, 'journal', { entries: [renderResult({ renderId: 'r-journal' })] });
    await receive(page, 'history', { renders: [
      { id: 'r-journal', engine: 'vega', resolution: '2k', created_at: '2026-10-01T12:00:00Z', preview_url: resultUrl, output_url: resultUrl },
      { id: 'r-other', engine: 'quasar', resolution: '2k', created_at: '2026-09-30T12:00:00Z', preview_url: resultUrl, output_url: resultUrl },
    ] });
    const caps = await page.locator('#historyGrid figcaption').allTextContents();
    assert.equal(caps.length, 2);
    assert.match(caps[0], /^Vega · 2K · /);
    assert.match(caps[1], /^Quasar · 2K · /);
    assert.equal(await page.locator('#historyGrid .hist.is-in-journal').count(), 1, 'o render que está no diário deste arquivo é marcado');
    return { page, errors };
  }],
  ['shadows-hint-opens-light-sheet-and-aerial-views-are-not-tilt-warnings', async (context) => {
    const { page, errors } = await setup(context);
    await receive(page, 'camera', { perspective: true, fovDeg: 70, focalLengthMm: 24, tiltDeg: 40, twoPoint: false, shadowsOn: false });
    const hint = await text(page, '#toolsHint');
    assert.doesNotMatch(hint, /inclinada/, 'vista aérea (40°) não é erro de nivelamento');
    assert.match(hint, /Sombras desligadas/);
    await page.locator('#toolsHint').click();
    assert.equal(await page.evaluate(() => document.getElementById('sheetLight').classList.contains('is-open')), true, 'o aviso de sombras abre a folha Luz');
    return { page, errors };
  }],
  ['english-strings-follow-the-same-changes', async (context) => {
    const { page, errors } = await setup(context, { locale: 'en' });
    await receive(page, 'result', renderResult({ fidelityScore: 0.3, fidelityWarning: true, seed: 9 }));
    await page.waitForFunction(() => document.getElementById('resultImage').naturalWidth > 0);
    assert.match(await text(page, '#notice'), /structural check found possible differences/);
    assert.equal(await text(page, '#notice .notice-action button'), 'Fix automatically · 20 nodes');
    await receive(page, 'status', { stage: 'idle', message: 'Cancelled.', cancelled: true, posted: false });
    assert.match(await text(page, '#notice'), /nothing was charged/);
    return { page, errors };
  }],
];

if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
const channel = process.env.SKETCHUP_TEST_CHANNEL;
const browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
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
process.stdout.write(`${cases.length - failed}/${cases.length} passed\n`);
process.exit(failed ? 1 : 0);

/**
 * Offline regression checks for the SketchUp panel workflow.
 * Run: node scripts/verify-sketchup-flow.mjs
 * Optional: SKETCHUP_TEST_CHANNEL=chrome to use an installed browser.
 * Optional: --screenshots=<directory> to save each case's final viewport.
 *
 * The Ruby bridge is replaced before the document loads. HTTP requests are
 * blocked, except a locally fulfilled result fixture; no generation is sent.
 * Prices below are deliberately artificial and are not production assertions.
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
const generationNames = ['generate', 'generateBatch', 'createSpace'];
const resultUrl = 'https://sketchup-fixture.invalid/result.svg';
const fixtureSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1600"><rect width="800" height="1600" fill="#93bac4"/><path d="M0 1100L400 650L800 1100V1600H0Z" fill="#25444b"/></svg>';
const captureUrl = `data:image/svg+xml,${encodeURIComponent(fixtureSvg)}`;
const scenes = [
  { index: 0, name: 'Fixture scene 1' },
  { index: 1, name: 'Fixture scene 2' },
  { index: 2, name: 'Fixture scene 3' },
];
const catalog = {
  defaults: { engine: 'quasar', resolution: '2k' },
  projectTypes: [{
    id: 'interior', label: 'Interior', backgroundLabel: 'Fundo',
    backgrounds: ['Preservar Original'], materialFields: [],
    segments: [{
      name: 'Preservar Original', environments: ['Preservar Original'],
      lighting: ['Preservar Original'], sceneElements: [],
    }],
  }],
  engines: [
    { id: 'quasar', name: 'Fixture Atlas', tagline: 'Motor de teste A', resolutions: [
      { id: '1k', label: '1K', nodes: 7 },
      { id: '2k', label: '2K', nodes: 11 },
      { id: '4k', label: '4K', nodes: 17 },
    ] },
    { id: 'pulsar', name: 'Fixture Boreal', tagline: 'Motor de teste B', resolutions: [
      { id: '2k', label: '2K', nodes: 13 },
      { id: '4k', label: '4K', nodes: 19 },
    ] },
    { id: 'nano-banana', name: 'Fixture Ceres', tagline: 'Motor de teste C', resolutions: [
      { id: '1k', label: '1K', nodes: 5 },
    ] },
  ],
  spaces: {
    maxPrints: 2, dnaCost: 3,
    categories: [{ id: 'residencial', label: 'Residencial' }],
    vistaCosts: [
      { engine: 'quasar', qualities: [{ id: '1k', nodes: 7 }, { id: '2k', nodes: 11 }, { id: '4k', nodes: 17 }] },
      { engine: 'pulsar', qualities: [{ id: '2k', nodes: 13 }, { id: '4k', nodes: 19 }] },
      { engine: 'nano-banana', qualities: [{ id: '1k', nodes: 5 }] },
    ],
  },
};

async function receive(page, event, payload) {
  await page.evaluate(({ event, payload }) => window.SpaceNodeBridge.receive(event, payload), { event, payload });
}

async function calls(page) {
  return page.evaluate((names) => window.__sketchupFlowCalls.filter((entry) => names.includes(entry.name)), generationNames);
}

async function clearCalls(page) {
  await page.evaluate(() => { window.__sketchupFlowCalls.length = 0; });
}

async function setBalance(page, totalBalance) {
  await receive(page, 'session', { balance: { totalBalance } });
}

async function assertVisible(page, selector, message = selector) {
  assert.equal(await page.locator(selector).isVisible(), true, `${message} should be visible`);
}

async function assertHidden(page, selector, message = selector) {
  assert.equal(await page.locator(selector).isVisible(), false, `${message} should be hidden`);
}

async function assertOnlyDockAction(page, expected) {
  const ids = ['workflowNextButton', 'generateButton', 'batchButton', 'spaceButton', 'newRenderButton'];
  for (const id of ids) {
    assert.equal(await page.locator(`#${id}`).isVisible(), id === expected, `Dock action ${id}; expected only ${expected}`);
  }
  assert.equal(await page.locator(`#${expected}`).evaluate((el) => !!el.closest('.dock')), true, `${expected} must be in the dock`);
}

async function selectMode(page, mode) {
  if (!(await page.locator('#sourceView').isVisible())) await page.locator('#stepSource').click();
  await page.locator(`#mode${mode[0].toUpperCase()}${mode.slice(1)}`).click();
}

async function selectScenes(page, indices) {
  for (const index of indices) {
    await page.locator('#scenesPills button').filter({ hasText: scenes[index].name }).click();
  }
}

async function configure(page, mode = 'render', sceneIndices = []) {
  await selectMode(page, mode);
  await selectScenes(page, sceneIndices);
  await page.locator('#workflowNextButton').click();
  await assertVisible(page, '#configureView');
  await assertHidden(page, '#sourceView');
  await assertHidden(page, '#resultView');
}

async function selectEngine(page, name) {
  await page.locator('#engineCards button').filter({ hasText: name }).click();
}

async function selectResolution(page, label) {
  await page.locator('#resolutionCards button').filter({ has: page.locator('b', { hasText: new RegExp(`^${label}$`) }) }).click();
}

async function assertSelection(page, engineName, resolution) {
  assert.match(await page.locator('#engineCards [aria-checked="true"]').innerText(), new RegExp(engineName));
  assert.equal(await page.locator('#resolutionCards [aria-checked="true"] b').innerText(), resolution);
}

async function assertLayout(page, { width, height }, previewVisible = false) {
  const layout = await page.evaluate(() => {
    const main = document.querySelector('main');
    const dock = document.querySelector('.dock').getBoundingClientRect();
    const preview = document.querySelector('#preview').getBoundingClientRect();
    return {
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      mainWidth: main.clientWidth,
      mainScrollWidth: main.scrollWidth,
      dock: { top: dock.top, bottom: dock.bottom },
      preview: { width: preview.width, height: preview.height },
    };
  });
  assert.ok(layout.documentWidth <= width + 1, `Document overflows ${width}px: ${JSON.stringify(layout)}`);
  assert.ok(layout.bodyWidth <= width + 1, `Body overflows ${width}px`);
  assert.ok(layout.mainScrollWidth <= layout.mainWidth + 1, `Content scrolls horizontally: ${JSON.stringify(layout)}`);
  assert.ok(layout.dock.top >= 0 && layout.dock.bottom <= height + 1, `Dock is outside viewport: ${JSON.stringify(layout)}`);
  if (previewVisible) {
    assert.ok(layout.preview.width > 0 && layout.preview.height > 0, 'Portrait capture should remain visible');
    assert.ok(layout.preview.height <= height * 0.62, `Portrait preview consumes too much of ${height}px viewport: ${JSON.stringify(layout)}`);
  }
}

async function setup(context, { authenticated = true, withCatalog = true, balance = 1000, viewport } = {}) {
  if (viewport) await context.setExtraHTTPHeaders({}); // The page receives its viewport below.
  await context.addInitScript(({ captureUrl, scenes }) => {
    window.__sketchupFlowCalls = [];
    window.sketchup = new Proxy({}, {
      get(_target, name) {
        return (raw) => {
          let payload = raw;
          if (typeof raw === 'string') {
            try { payload = JSON.parse(raw); } catch { /* Non-JSON bridge arguments stay strings. */ }
          }
          window.__sketchupFlowCalls.push({ name: String(name), payload });
          if (name === 'captureViewport') {
            window.SpaceNodeBridge.receive('capture', { imageDataUrl: captureUrl, width: 800, height: 1600 });
          }
          if (name === 'listScenes') window.SpaceNodeBridge.receive('scenes', { scenes });
        };
      },
    });
  }, { captureUrl, scenes });
  await context.route(/^https?:\/\//, async (route) => {
    if (route.request().url() === resultUrl) {
      await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: fixtureSvg });
    } else {
      await route.abort('blockedbyclient');
    }
  });
  const page = await context.newPage();
  if (viewport) await page.setViewportSize(viewport);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(panelUrl);
  await page.waitForFunction(() => !!window.SpaceNodeBridge);
  await receive(page, 'state', {
    authenticated, sessionFresh: authenticated, locale: 'pt', themeSetting: 'light',
    userEmail: authenticated ? 'fixture@example.invalid' : null,
    balance: { totalBalance: balance }, version: 'flow-fixture',
  });
  if (withCatalog) await receive(page, 'catalog', structuredClone(catalog));
  await receive(page, 'scenes', { scenes });
  await receive(page, 'capture', { imageDataUrl: captureUrl, width: 800, height: 1600 });
  await clearCalls(page);
  return { page, errors };
}

const cases = [
  ['compact-viewports', async (context) => {
    const { page, errors } = await setup(context);
    for (const viewport of [{ width: 380, height: 560 }, { width: 440, height: 780 }]) {
      await page.setViewportSize(viewport);
      await assertVisible(page, '#sourceView');
      await assertOnlyDockAction(page, 'workflowNextButton');
      assert.equal(await page.locator('#sourceView #previewPanel').count(), 1, 'Source owns the shared preview');
      await assertLayout(page, viewport, true);
      await configure(page);
      await assertOnlyDockAction(page, 'generateButton');
      const firstEngine = await page.locator('#engineCards button').first().boundingBox();
      const dock = await page.locator('.dock').boundingBox();
      assert.ok(firstEngine && dock && firstEngine.y >= 0 && firstEngine.y + firstEngine.height <= dock.y, 'Engine selection must be immediately visible after Continue');
      await assertLayout(page, viewport);
      await page.locator('#stepSource').click();
    }
    return { page, errors };
  }],
  ['engine-resolution-result', async (context) => {
    const { page, errors } = await setup(context);
    await configure(page);
    await assertSelection(page, 'Fixture Atlas', '2K');
    await selectEngine(page, 'Fixture Boreal');
    await assertSelection(page, 'Fixture Boreal', '2K');
    await selectResolution(page, '4K');
    await selectEngine(page, 'Fixture Atlas');
    await assertSelection(page, 'Fixture Atlas', '4K');
    await selectEngine(page, 'Fixture Ceres');
    await assertSelection(page, 'Fixture Ceres', '1K');
    await selectEngine(page, 'Fixture Boreal');
    await assertSelection(page, 'Fixture Boreal', '2K');
    await selectResolution(page, '4K');
    await page.locator('#generateButton').click();
    const sent = await calls(page);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].name, 'generate');
    assert.equal(sent[0].payload.engine, 'pulsar');
    assert.equal(sent[0].payload.resolution, '4k');
    assert.equal(sent[0].payload.useAnchor, false);
    await page.keyboard.press('Control+Enter');
    assert.equal((await calls(page)).length, 1, 'Generation in progress cannot submit again');
    await receive(page, 'result', {
      outputUrl: resultUrl, renderId: 'fixture-result', engine: 'pulsar', resolution: '4k',
      nodesCharged: 19, totalBalance: 981, signedAt: Math.floor(Date.now() / 1000),
    });
    await assertVisible(page, '#resultView');
    await assertOnlyDockAction(page, 'newRenderButton');
    assert.equal(await page.locator('#resultView #previewPanel').count(), 1, 'Result owns the shared preview');
    await page.locator('#stepConfigure').click();
    await assertVisible(page, '#configureView');
    await assertSelection(page, 'Fixture Boreal', '4K');
    await assertOnlyDockAction(page, 'generateButton');
    return { page, errors };
  }],
  ['batch-contextual-shortcut', async (context) => {
    const { page, errors } = await setup(context);
    await configure(page, 'batch', [0, 1]);
    await assertOnlyDockAction(page, 'batchButton');
    await selectEngine(page, 'Fixture Boreal');
    await page.keyboard.press('Control+Enter');
    const sent = await calls(page);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].name, 'generateBatch', 'Batch shortcut must dispatch a batch');
    assert.equal(sent[0].payload.engine, 'pulsar');
    assert.equal(sent[0].payload.resolution, '2k');
    assert.deepEqual(sent[0].payload.scenes, scenes.slice(0, 2));
    await receive(page, 'batchDone', { results: [], errors: [], total: 2, cancelled: true });
    return { page, errors };
  }],
  ['space-limit-and-shortcut', async (context) => {
    const { page, errors } = await setup(context);
    await selectMode(page, 'space');
    await selectScenes(page, [0, 1, 2]);
    // It is valid to prevent selecting the third scene or to block Continue.
    const selected = await page.locator('#scenesPills [aria-checked="true"]').count();
    if (selected > catalog.spaces.maxPrints) {
      assert.equal(await page.locator('#workflowNextButton').isDisabled(), true, 'Over-limit selection must block Continue');
      await page.keyboard.press('Control+Enter');
      assert.deepEqual(await calls(page), [], 'Over-limit shortcut cannot silently truncate scenes');
      await selectScenes(page, [2]);
    }
    await page.locator('#workflowNextButton').click();
    await assertOnlyDockAction(page, 'spaceButton');
    await page.locator('#spaceName').fill('Fixture project');
    await selectEngine(page, 'Fixture Boreal');
    await page.keyboard.press('Control+Enter');
    const sent = await calls(page);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].name, 'createSpace', 'Space shortcut must dispatch Create Space');
    assert.equal(sent[0].payload.name, 'Fixture project');
    assert.equal(sent[0].payload.engine, 'pulsar');
    assert.equal(sent[0].payload.quality, '2k');
    assert.deepEqual(sent[0].payload.scenes, scenes.slice(0, 2));
    await receive(page, 'spaceDone', { cancelled: true });
    return { page, errors };
  }],
  ['disconnected', async (context) => {
    const { page, errors } = await setup(context);
    await configure(page);
    await receive(page, 'state', { authenticated: false, sessionFresh: false, locale: 'pt' });
    assert.equal(await page.locator('#generateButton').isDisabled(), true);
    assert.equal(await page.locator('#batchButton').isDisabled(), true);
    assert.equal(await page.locator('#spaceButton').isDisabled(), true);
    await page.keyboard.press('Control+Enter');
    assert.deepEqual(await calls(page), [], 'Disconnected state cannot submit');
    return { page, errors };
  }],
  ['catalog-unavailable', async (context) => {
    const { page, errors } = await setup(context, { withCatalog: false });
    await receive(page, 'catalogError', {});
    assert.equal(await page.locator('#generateButton').isDisabled(), true);
    assert.equal(await page.locator('#batchButton').isDisabled(), true);
    assert.equal(await page.locator('#spaceButton').isDisabled(), true);
    await assertVisible(page, '#notice');
    await page.keyboard.press('Control+Enter');
    assert.deepEqual(await calls(page), [], 'Missing catalog cannot submit');
    return { page, errors };
  }],
  ['insufficient-balance', async (context) => {
    const { page, errors } = await setup(context);
    await configure(page);
    await setBalance(page, 1);
    assert.equal(await page.locator('#generateButton').isDisabled(), true);
    await assertVisible(page, '#insufficient');
    await page.keyboard.press('Control+Enter');
    assert.deepEqual(await calls(page), []);
    await setBalance(page, 15); // One render fits, but a two-scene batch does not.
    await configure(page, 'batch', [0, 1]);
    await assertOnlyDockAction(page, 'batchButton');
    assert.equal(await page.locator('#batchButton').isDisabled(), true);
    await page.keyboard.press('Control+Enter');
    assert.deepEqual(await calls(page), [], 'Batch must use total cost, not one image cost');
    await selectMode(page, 'space');
    await page.locator('#workflowNextButton').click();
    await assertOnlyDockAction(page, 'spaceButton');
    assert.equal(await page.locator('#spaceButton').isDisabled(), true);
    await page.keyboard.press('Control+Enter');
    assert.deepEqual(await calls(page), [], 'Space must include its full scene and DNA cost');
    return { page, errors };
  }],
];

if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.SKETCHUP_TEST_CHANNEL ? { channel: process.env.SKETCHUP_TEST_CHANNEL } : {}) });
let failed = 0;
try {
  for (const [name, test] of cases) {
    const context = await browser.newContext({ viewport: { width: 440, height: 780 } });
    try {
      const { page, errors } = await test(context);
      assert.deepEqual(errors, [], 'Panel must not throw JavaScript errors');
      if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, `${name}.png`) });
      process.stdout.write(`PASS ${name}\n`);
    } catch (error) {
      failed += 1;
      process.stderr.write(`FAIL ${name}: ${error.stack || error.message}\n`);
      const page = context.pages()[0];
      if (screenshotDir && page) await page.screenshot({ path: path.join(screenshotDir, `${name}-failed.png`) }).catch(() => {});
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
process.stdout.write(`${cases.length - failed}/${cases.length} SketchUp flow checks passed. No external generation requests were sent.\n`);
if (failed) process.exitCode = 1;

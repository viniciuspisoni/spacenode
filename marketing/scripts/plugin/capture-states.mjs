// Captura o painel REAL do plugin (sketchup/spacenode/dialog.html) em estados
// Uso: node marketing/scripts/plugin/capture-states.mjs → $ACERVO/plugin/shots/*.png
// Os estados são
// injetados pela ponte Ruby→JS (window.SpaceNodeBridge.receive). Catálogo com os presets e
// custos reais de lib/engines.ts e lib/prompts.ts. Imagens: print #560 → render #559 do Space
// "Projeto SketchUp 01/09" (feito de dentro do plugin).
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url'; import path from 'node:path'; import fs from 'node:fs';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^/([A-Za-z]:)/, '$1')), '../../..');
const ROOT = process.env.SPACENODE_ACERVO || path.join(REPO, '..', 'acervo');
const OUT = path.join(ROOT, 'plugin/shots'); fs.mkdirSync(OUT, { recursive: true });
const html = pathToFileURL(path.join(REPO, 'sketchup/spacenode/dialog.html')).href; // o painel real, direto do repo
const F = (f) => pathToFileURL(path.join(ROOT, 'assets', f)).href;
const PRINT = F('0560-vista-before.png'), RENDER = F('0559-vista-after.png');
const PRINT2 = F('0561-vista-after.png');

const engines = [
  { id: 'vega', name: 'Vega', tagline: 'Premium', resolutions: [{ id: '2k', label: '2K', nodes: 20 }, { id: '4k', label: '4K', nodes: 40 }] },
  { id: 'pulsar', name: 'Pulsar', tagline: 'Rápido', resolutions: [{ id: 'hd', label: 'HD', nodes: 10 }, { id: '2k', label: '2K', nodes: 15 }, { id: '4k', label: '4K', nodes: 25 }] },
  { id: 'quasar', name: 'Quasar', tagline: 'Especial', resolutions: [{ id: '2k', label: '2K', nodes: 28 }, { id: '4k', label: '4K', nodes: 56 }] },
];
const seg = (name, environments, lighting, sceneElements) => ({ name, environments, lighting, sceneElements });
const LIGHT_RES = ['Preservar Original', 'Clara e Natural', 'Natural Suave', 'Luz de Janela', 'Nublado', 'Quente e Aconchegante', 'Entardecer Quente', 'Noturna Aconchegante', 'Sofisticada e Cênica'];
const catalog = {
  projectTypes: [
    { id: 'interior', label: 'Interior', backgroundLabel: 'Contexto visual',
      backgrounds: ['Preservar Original', 'Clean / Neutro', 'Premium', 'Urbano', 'Natural', 'Minimalista', 'Comercial', 'Corporativo', 'Aconchegante'],
      segments: [
        seg('Residencial', ['Sala de Estar', 'Sala de Jantar', 'Cozinha', 'Cozinha Gourmet', 'Suíte Master', 'Quarto', 'Quarto Infantil', 'Banheiro', 'Lavabo', 'Home Office', 'Área de Serviço', 'Varanda Gourmet', 'Closet', 'Hall de Entrada', 'Área de Lazer'], LIGHT_RES, ['Decoração', 'Pessoas', 'Vegetação', 'Luzes Acesas', 'Raios de Sol']),
        seg('Corporativo', ['Escritório Corporativo', 'Open Space', 'Sala de Reunião', 'Sala de Diretoria', 'Recepção Corporativa', 'Coworking', 'Escritório Privativo', 'Sala de Treinamento', 'Lounge Corporativo', 'Copa / Descompressão', 'Auditório', 'Espaço Colaborativo', 'Work Café'], ['Preservar Original', 'Clara e Natural', 'Luz de Janela', 'Nublado', 'Sofisticada e Cênica'], ['Pessoas Trabalhando', 'Computadores', 'Mesas de Trabalho', 'Branding Sutil', 'Divisórias de Vidro', 'Vegetação Interna', 'Luminárias Técnicas', 'Telas / Monitores']),
        seg('Comercial', ['Loja em Shopping', 'Loja de Rua', 'Showroom', 'Boutique', 'Loja de Moda'], ['Preservar Original', 'Clara e Natural', 'Luz de Janela'], ['Decoração', 'Pessoas', 'Vegetação', 'Luzes Acesas']),
        seg('Gastronomia', ['Restaurante', 'Café', 'Cafeteria', 'Bistrô', 'Bar'], ['Preservar Original', 'Clara e Natural', 'Quente e Aconchegante'], ['Decoração', 'Pessoas', 'Vegetação', 'Luzes Acesas']),
      ] },
    { id: 'exterior', label: 'Exterior', backgroundLabel: 'Entorno', backgrounds: ['Preservar Original', 'Urbano', 'Suburbano c/ Mata', 'Rural / Sítio', 'Praia'],
      segments: [seg('Residencial', ['Fachada Residencial', 'Casa Térrea', 'Sobrado'], ['Preservar Original', 'Diurno', 'Entardecer', 'Blue Hour', 'Noturno', 'Nublado', 'Chuva'], ['Vegetação', 'Pessoas', 'Carros', 'Luzes Acesas'])] },
  ],
  engines,
  spaces: { dnaCost: 8, maxPrints: 10, categories: [{ id: 'residencial', label: 'Residencial' }, { id: 'comercial', label: 'Comercial' }, { id: 'conceito', label: 'Conceito' }],
    vistaCosts: [{ engine: 'vega', qualities: [{ id: '2k', nodes: 20 }, { id: '4k', nodes: 40 }] }, { engine: 'pulsar', qualities: [{ id: 'hd', nodes: 10 }, { id: '2k', nodes: 15 }, { id: '4k', nodes: 25 }] }, { engine: 'quasar', qualities: [{ id: '2k', nodes: 28 }, { id: '4k', nodes: 56 }] }] },
  defaults: { projectType: 'interior', segment: 'Corporativo', environment: 'Escritório Corporativo', lighting: 'Preservar Original', engine: 'vega', resolution: '2k' },
  animar: { engines: [], videoTypes: [], scenes: [], defaults: { videoType: 'cinematic' }, limits: { aspectMin: 0.4, aspectMax: 2.5 }, endFrame: false },
};

const state = { authenticated: true, sessionFresh: true, version: '0.7.0', userEmail: 'conta conectada', locale: 'pt-BR', balance: { totalBalance: 750 }, apiBaseUrl: 'https://spacenode.app',
  panelState: { projectType: 'interior', segment: 'Corporativo', environment: 'Escritório Corporativo', lighting: 'Preservar Original', engine: 'vega', resolution: '2k' } };
const scenes = { scenes: [{ index: 0, name: 'P1' }, { index: 1, name: 'Cena2' }, { index: 2, name: 'Cena3' }], selectedIndex: 0 };
const result = { outputUrl: RENDER, previewUrl: RENDER, renderId: 'r-0559', nodesCharged: 20, totalBalance: 730, seed: 41, sceneName: 'P1', camera: { eye: [0, 0, 0] } };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 440, height: 780 }, deviceScaleFactor: 2 });
await page.addInitScript(() => { window.sketchup = new Proxy({}, { get: () => () => {} }); });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
const rx = (ev, p) => page.evaluate(([e, q]) => window.SpaceNodeBridge.receive(e, q), [ev, p]);
const shot = async (name) => { await page.waitForTimeout(250); const f = path.join(OUT, `${name}.png`); await page.screenshot({ path: f }); console.log('shot', name); };

await page.goto(html); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(300);

// S1 conectado + catálogo
await rx('state', state); await rx('catalog', catalog); await rx('scenes', scenes);
await shot('s1-conectado');

// S2 vista capturada
await rx('capture', { imageDataUrl: PRINT, width: 3072, height: 1193 });
await shot('s2-capturada');

// S3 gerando (clica em Gerar; a ponte é stub, o overlay real aparece)
await page.click('#generateButton').catch(async () => { console.log('generateButton?'); });
await rx('status', { message: 'Gerando render…', stage: 'generate' });
await page.waitForTimeout(1200);
await shot('s3-gerando');

// S4 resultado (render real do mesmo print)
await rx('result', result);
await page.waitForTimeout(400);
await shot('s4-resultado');

// S4b comparador do próprio painel em 50%
await page.click('#compareButton').catch(() => console.log('compareButton?'));
await page.evaluate(() => { const r = document.getElementById('compareRange'); if (r) { r.value = 50; r.dispatchEvent(new Event('input', { bubbles: true })); } });
await shot('s4b-comparar');
await page.evaluate(() => { const r = document.getElementById('compareRange'); if (r) { r.value = 28; r.dispatchEvent(new Event('input', { bubbles: true })); } });
await shot('s4c-comparar-28');
await page.evaluate(() => { const r = document.getElementById('compareRange'); if (r) { r.value = 72; r.dispatchEvent(new Event('input', { bubbles: true })); } });
await shot('s4d-comparar-72');
await page.click('#compareButton').catch(() => {});

// S5 lote: abre "Cenas do modelo", seleciona as 3 e mostra o progresso
await page.evaluate(() => { document.getElementById('scenesSection').open = true; });
for (const n of ['P1', 'Cena2', 'Cena3']) await page.click(`#scenesPills button:has-text("${n}")`).catch(() => console.log('pill?', n));
await page.evaluate(() => document.getElementById('scenesSection').scrollIntoView({ block: 'start' }));
await shot('s5-lote-selecionado');
await rx('batchStart', { total: 3 });
await rx('batchProgress', { sceneName: 'P1', status: 'generating', done: 0, total: 3 });
await rx('batchProgress', { sceneName: 'P1', status: 'done', done: 1, total: 3, result });
await rx('batchProgress', { sceneName: 'Cena2', status: 'generating', done: 1, total: 3 });
await page.waitForTimeout(300);
await page.evaluate(() => document.getElementById('scenesSection').scrollIntoView({ block: 'start' }));
await shot('s5b-lote-andamento');
await rx('batchProgress', { sceneName: 'Cena2', status: 'done', done: 2, total: 3, result: { ...result, outputUrl: PRINT2, previewUrl: PRINT2 } });
await rx('batchProgress', { sceneName: 'Cena3', status: 'done', done: 3, total: 3, result });
await rx('batchDone', { total: 3, done: 3, failed: 0 });
await page.waitForTimeout(300);
await page.evaluate(() => document.getElementById('scenesSection').scrollIntoView({ block: 'start' }));
await shot('s5c-lote-concluido');

// S6 criar Space das cenas
await page.evaluate(() => { const sp = document.getElementById('spaceSection'); sp.open = true; document.getElementById('spaceName').value = 'Projeto SketchUp 01/09'; sp.scrollIntoView({ block: 'start' }); });
await page.click('#spaceCategoryPills button:has-text("Comercial")').catch(() => {});
await shot('s6-space');

await browser.close();

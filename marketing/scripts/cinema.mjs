/**
 * Renderiza o FILME de apresentação a partir de um spec JSON (ver lib/cinema-kit.mjs).
 *
 *   node marketing/scripts/cinema.mjs caminho/spec.json              # master 16:9
 *   node marketing/scripts/cinema.mjs caminho/spec.json --vertical   # corte 9:16 (aplica spec.vertical)
 *   node marketing/scripts/cinema.mjs caminho/spec.json --plan       # só a timeline, sem renderizar
 *   node marketing/scripts/cinema.mjs --exemplo                      # spec de exemplo comentado
 *
 * Saída: marketing/output/<slug>/<slug>.mp4 + qa-frames/ + probe.json + spec.json
 *
 * O corte vertical não é outro spec: é um PATCH declarado dentro do mesmo arquivo
 * (`"vertical": { ... }`), para que master e corte nunca saiam de sincronia. O patch
 * pode trocar slug, quadro, letterbox, cards e overlays inteiros, e ajustar segmentos
 * individuais por índice em `segmentPatch` (recorte diferente, hold diferente, cena fora).
 */
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { dims, renderFilm, timeline } from './lib/cinema-kit.mjs';

const REPO = resolve(import.meta.dirname, '../..');
const TMP = join(process.env.TEMP || '/tmp', 'spacenode-marketing');

const argv = process.argv.slice(2);

if (argv.includes('--exemplo')) {
  console.log(JSON.stringify({
    slug: '2026-09-09-filme-exemplo',
    frame: { w: 1920, h: 1080 },
    segments: [
      { type: 'black', dur: 0.8 },
      { type: 'still', src: '$REPO/marketing/renders/depois/casa.jpg', dur: 5, fit: 'cover', zoom: [1.06, 1] },
      { type: 'still', src: '$REPO/marketing/output/.../renderizar/05-motor-vega.png', dur: 4, fit: 'contain', zoom: [1, 1.03] },
      { type: 'card', card: 'final', dur: 3 },
    ],
    transitions: [{ type: 'fade', dur: 0.6 }, { type: 'fade', dur: 0.7 }, { type: 'fade', dur: 0.8 }],
    cards: {
      scrim: { layout: 'scrim' },
      abre: { layout: 'line', eyebrow: 'spacenode', big: 'o projeto é seu.<br>[o render também.]' },
      motor: { layout: 'lower', label: 'renderizar', text: 'vega · 2k · 20 nodes' },
      final: { layout: 'final', cta: 'Teste com um projeto real', micro: '80 nodes grátis · sem cartão · em português' },
    },
    overlays: [
      { card: 'scrim', from: 0.8, to: 5.8, fade: 0.6 },
      { card: 'abre', from: 1.4, to: 5.4, fade: 0.7 },
      { card: 'motor', from: 6.2, to: 9.4, fade: 0.5 },
    ],
    vertical: {
      slug: '2026-09-09-filme-exemplo-vertical',
      frame: { w: 1080, h: 1920 },
      segmentPatch: { 1: { dur: 4 } },
    },
  }, null, 2));
  process.exit(0);
}

const specPath = argv.find((a) => !a.startsWith('--'));
if (!specPath) {
  console.error('uso: node marketing/scripts/cinema.mjs spec.json [--vertical] [--plan]');
  process.exit(1);
}

// Mesma convenção do reel-spec.mjs: `$REPO` é a raiz do repositório e `$ACERVO` a
// raiz do acervo baixado do banco (SPACENODE_ACERVO, default ../acervo).
const ACERVO = (process.env.SPACENODE_ACERVO || join(REPO, '..', 'acervo')).replace(/\\/g, '/');
const raw = (await readFile(specPath, 'utf8'))
  .replaceAll('$ACERVO', ACERVO)
  .replaceAll('$REPO', REPO.replace(/\\/g, '/'));
let spec = JSON.parse(raw);

if (argv.includes('--vertical')) {
  const v = spec.vertical;
  if (!v) { console.error('este spec não declara um bloco "vertical"'); process.exit(1); }
  const { segmentPatch = {}, ...rest } = v;
  const segments = spec.segments
    .map((s, i) => (segmentPatch[i] === null ? null : { ...s, ...(segmentPatch[i] || {}) }))
    .filter(Boolean);
  // Cortar uma cena muda a contagem de transições: o patch precisa trazer a lista nova.
  if (segments.length !== spec.segments.length && !rest.transitions) {
    console.error(`o patch vertical removeu ${spec.segments.length - segments.length} cena(s) — declare "transitions" novas (${segments.length - 1} entradas)`);
    process.exit(1);
  }
  spec = { ...spec, ...rest, segments, cards: { ...spec.cards, ...(rest.cards || {}) } };
  delete spec.vertical;
}

if (argv.includes('--plan')) {
  const durs = [];
  for (const s of spec.segments) {
    if (s.type === 'video' && !s.dur) {
      const d = await dims(s.src);
      durs.push((d.duration - (s.start || 0)) / (s.speed || 1));
    } else durs.push(s.dur);
  }
  const tl = timeline(durs, spec.transitions || []);
  spec.segments.forEach((s, i) => {
    const src = (s.src || s.card || '').split('/').slice(-2).join('/');
    console.log(`seg ${String(i).padStart(2)} ${s.type.padEnd(5)} ${tl.starts[i].toFixed(2).padStart(6)}s → ${(tl.starts[i] + durs[i]).toFixed(2).padStart(6)}s  ${src}`);
  });
  for (const o of spec.overlays || []) console.log(`      texto  ${o.from.toFixed(2).padStart(6)}s → ${o.to.toFixed(2).padStart(6)}s  ${o.card}`);
  console.log(`total ${tl.total.toFixed(2)}s · ${spec.frame?.w || 1920}×${spec.frame?.h || 1080}`);
  process.exit(0);
}

console.log(`→ ${spec.slug}`);
const report = await renderFilm(spec, { repo: REPO, tmpRoot: TMP });
console.log(JSON.stringify({ mp4: report.mp4, total: report.total, frame: report.frame }, null, 2));

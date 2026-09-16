/**
 * Renderiza um Reel a partir de um spec JSON (ver lib/reel-kit.mjs).
 *
 *   node marketing/scripts/reel-spec.mjs caminho/spec.json          # renderiza
 *   node marketing/scripts/reel-spec.mjs caminho/spec.json --plan   # só imprime a timeline
 *   node marketing/scripts/reel-spec.mjs --exemplo                  # imprime um spec de exemplo
 *
 * Saída: marketing/output/<slug>/<slug>.mp4 + qa-frames/ + probe.json + spec.json
 */
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { dims, renderReel, timeline } from './lib/reel-kit.mjs';

const REPO = resolve(import.meta.dirname, '../..');
const TMP = join(process.env.TEMP || '/tmp', 'spacenode-marketing');

const argv = process.argv.slice(2);
if (argv.includes('--exemplo')) {
  console.log(JSON.stringify({
    slug: '2026-09-04-reel-exemplo',
    band: { aspect: 16 / 9 },
    segments: [
      { type: 'still', src: 'C:/caminho/antes.jpg', dur: 1.7, kenburns: [1, 1.0], brightness: -0.14 },
      { type: 'still', src: 'C:/caminho/depois.jpg', dur: 5.5, kenburns: [1, 1.08] },
      { type: 'video', src: 'C:/caminho/animar.mp4', dur: 4, fit: 'band' },
      { type: 'card', card: 'final', dur: 1.2 },
    ],
    transitions: [{ type: 'wipeleft', dur: 0.5, ruler: true }, { type: 'fade', dur: 0.3 }, { type: 'cut' }],
    cards: {
      scrim: { layout: 'scrim' },
      antes: { layout: 'hook-sub', hook: 'Seu cliente não entende isso…', eyebrow: 'Modelo SketchUp' },
      depois: { layout: 'hook-sub', hook: '…mas entende isso.', sub: 'Gerado em {minutos}.' },
      chipVideo: { layout: 'chip', text: 'Animar · vídeo do render' },
      final: { layout: 'final', cta: 'Teste com um projeto real', url: 'spacenode.app' },
    },
    overlays: [
      { card: 'scrim', from: 0, to: 11.4 },
      { card: 'antes', from: 0, to: 2.2 },
      { card: 'depois', from: 2.2, to: 7.4 },
      { card: 'chipVideo', from: 7.4, to: 11.4 },
    ],
  }, null, 2));
  process.exit(0);
}

const specPath = argv.find((a) => !a.startsWith('--'));
if (!specPath) { console.error('uso: node marketing/scripts/reel-spec.mjs spec.json [--plan]'); process.exit(1); }

// Os specs versionados em marketing/specs/ apontam para o acervo baixado do banco (fora do
// repo) como `$ACERVO/assets/...`. A raiz vem de SPACENODE_ACERVO; sem ela, ../acervo.
// `$REPO` expande para a raiz do repositório (recortes pré-processados de algumas peças e o
// símbolo da marca usado em cards HTML).
const ACERVO = (process.env.SPACENODE_ACERVO || join(REPO, '..', 'acervo')).replace(/\\/g, '/');
const spec = JSON.parse((await readFile(specPath, 'utf8')).replaceAll('$ACERVO', ACERVO).replaceAll('$REPO', REPO.replace(/\\/g, '/')));

if (argv.includes('--plan')) {
  const durs = [];
  for (const s of spec.segments) {
    if (s.type === 'video' && !s.dur) { const d = await dims(s.src); durs.push((d.duration - (s.start || 0)) / (s.speed || 1)); }
    else durs.push(s.dur);
  }
  const tl = timeline(durs, spec.transitions || []);
  spec.segments.forEach((s, i) => console.log(`seg ${i} ${s.type.padEnd(5)} ${tl.starts[i].toFixed(2)}s → ${(tl.starts[i] + durs[i]).toFixed(2)}s  ${s.src || s.card || ''}`));
  console.log(`total ${tl.total.toFixed(2)}s`);
  process.exit(0);
}

console.log(`→ ${spec.slug}`);
const report = await renderReel(spec, { repo: REPO, tmpRoot: TMP });
console.log(JSON.stringify(report, null, 2));

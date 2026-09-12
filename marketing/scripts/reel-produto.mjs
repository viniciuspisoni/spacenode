/**
 * REEL PRODUTO (BRIEF.md, pilar 3) — monta o Reel a partir da filmagem crua do
 * Playwright gravada por gravar-produto.mjs.
 *
 *   node marketing/scripts/reel-produto.mjs --slug 2026-07-29-reel-produto-banheiro
 *   node marketing/scripts/reel-produto.mjs --video <arquivo.webm> --saida <dir>
 *
 * Tratamento igual ao dos Reels de impacto já validados: fundo full-bleed desfocado,
 * scrim, banda central com a composição inteira. O vídeo é acelerado e o selo "N×"
 * fica na tela o tempo todo — acelerar sem dizer seria mentir sobre o tempo real.
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import { FRAME_H, FRAME_W, captureCards } from './lib/cards.mjs';
import { bandGeometry, buildCards } from './lib/produto-cards.mjs';
import { ffmpeg, probe } from './lib/tools.mjs';

const REPO = resolve(import.meta.dirname, '../..');
const TMP = join(process.env.TEMP || '/tmp', 'spacenode-marketing');

const FPS = 30;
const T_FINAL = 1.2;
const DEFAULT_HOOK = 'Do modelo ao render, sem pular nada.';

const argv = process.argv.slice(2);
const arg = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);

const slug = arg('--slug');
const velocidade = Number(arg('--velocidade') || 2);
const hook = arg('--hook') || DEFAULT_HOOK;

let videoPath = arg('--video');
let outDir = arg('--saida');

if (slug) {
  outDir = outDir || join(REPO, 'marketing/output', slug);
  if (!videoPath) {
    const brutoDir = join(outDir, 'video-bruto');
    if (!existsSync(brutoDir)) {
      console.error(`Erro: não achei ${brutoDir}. Rode gravar-produto.mjs --shoot antes.`);
      process.exit(1);
    }
    const webm = (await readdir(brutoDir)).find((f) => f.endsWith('.webm'));
    if (!webm) {
      console.error(`Erro: nenhum .webm em ${brutoDir}.`);
      process.exit(1);
    }
    videoPath = join(brutoDir, webm);
  }
}
if (!videoPath || !outDir) {
  console.error('Erro: passe --slug, ou --video e --saida.');
  process.exit(1);
}

// Marcas de capítulo: [{ t: <segundos na timeline FINAL>, label: "..." }]
let marcas = [];
const marcasPath = arg('--marcas') || join(outDir, 'marcas.json');
if (existsSync(marcasPath)) {
  marcas = JSON.parse(await readFile(marcasPath, 'utf8'));
  console.log(`  ${marcas.length} marcas de capítulo carregadas`);
}

await mkdir(outDir, { recursive: true });
const tmpDir = join(TMP, `edit-${basename(outDir)}`);
await mkdir(tmpDir, { recursive: true });
const f = (n) => join(tmpDir, n);

const meta = await probe(videoPath);
const src = meta.streams[0];
const srcDur = Number(meta.format.duration);
const finalDur = srcDur / velocidade;
console.log(`→ fonte ${src.width}×${src.height} · ${srcDur.toFixed(1)}s → ${finalDur.toFixed(1)}s a ${velocidade}×`);

const geo = bandGeometry(src.width, src.height);
console.log(`  banda ${FRAME_W}×${geo.height} em y=${geo.y}`);

// Fundo: um quadro representativo (30% do vídeo), desfocado e escurecido.
await ffmpeg([
  '-ss', String(srcDur * 0.3), '-i', videoPath, '-frames:v', '1',
  '-vf', [
    `scale=${FRAME_W}:${FRAME_H}:force_original_aspect_ratio=increase:flags=lanczos`,
    `crop=${FRAME_W}:${FRAME_H}`,
    'boxblur=42:2',
    'eq=brightness=-0.24:saturation=0.70',
  ].join(','),
  f('bg.png'),
]);

console.log('→ capturando cards');
const cards = await captureCards(buildCards({ hook, velocidade, marcas }, geo), f('cards'), f('html'));

console.log('→ montando');
const reel = join(outDir, `${basename(outDir)}.mp4`);

const inputs = [
  '-i', videoPath,
  '-loop', '1', '-framerate', String(FPS), '-t', String(finalDur), '-i', f('bg.png'),
  '-loop', '1', '-framerate', String(FPS), '-t', String(finalDur), '-i', cards['card-base'],
];
const chain = [
  `[0:v]setpts=PTS/${velocidade},fps=${FPS},scale=${FRAME_W}:-2:flags=lanczos,setsar=1[band]`,
  `[1:v]fps=${FPS}[bg]`,
  `[bg][band]overlay=(W-w)/2:${geo.y}:shortest=1[v0]`,
  `[v0][2:v]overlay=0:0[v1]`,
];

let last = 'v1';
marcas.forEach((m, i) => {
  const key = `rotulo-${String(i).padStart(2, '0')}`;
  const idx = 3 + i;
  inputs.push('-loop', '1', '-framerate', String(FPS), '-t', String(finalDur), '-i', cards[key]);
  const fim = i + 1 < marcas.length ? marcas[i + 1].t : finalDur;
  chain.push(`[${last}][${idx}:v]overlay=0:0:enable='between(t,${m.t},${fim})'[r${i}]`);
  last = `r${i}`;
});

const finalIdx = 3 + marcas.length;
inputs.push('-loop', '1', '-framerate', String(FPS), '-t', String(T_FINAL), '-i', cards['card-final']);
chain.push(`[${last}]setsar=1,format=yuv420p[main]`);
chain.push(`[${finalIdx}:v]fps=${FPS},setsar=1,format=yuv420p[fin]`);
chain.push(`[main][fin]concat=n=2:v=1:a=0[out]`);

await ffmpeg([
  ...inputs,
  '-filter_complex', chain.join(';'),
  '-map', '[out]',
  '-an',
  '-c:v', 'libx264', '-crf', '18', '-preset', 'slow',
  '-pix_fmt', 'yuv420p', '-r', String(FPS),
  '-movflags', '+faststart',
  reel,
]);

console.log('→ QA: extraindo frames');
const framesDir = join(outDir, 'qa-frames');
await mkdir(framesDir, { recursive: true });
const total = finalDur + T_FINAL;
for (const p of [0.1, 0.35, 0.6, 0.85, 0.98]) {
  const t = Math.min(total * p, total - 0.1);
  await ffmpeg(['-ss', String(t), '-i', reel, '-frames:v', '1', join(framesDir, `t${t.toFixed(2)}s.png`)]);
}

const out = await probe(reel);
const v = out.streams[0];
const report = {
  slug: basename(outDir),
  fonte: `${src.width}×${src.height} · ${srcDur.toFixed(1)}s`,
  velocidade,
  marcas: marcas.length,
  banda: `${FRAME_W}×${geo.height} @ y=${geo.y}`,
  width: v.width,
  height: v.height,
  fps: v.r_frame_rate,
  pix_fmt: v.pix_fmt,
  duration: Number(out.format.duration).toFixed(2),
  sizeMB: (Number(out.format.size) / 1e6).toFixed(2),
  alvoBrief: '20–30s para screen recording',
};
await writeFile(join(outDir, 'probe.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));

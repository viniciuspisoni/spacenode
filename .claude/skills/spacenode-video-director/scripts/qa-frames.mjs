#!/usr/bin/env node
/**
 * qa-frames.mjs — extrai frames e confere o container, pro QA de fidelidade.
 *
 * Resolve o ffmpeg/ffprobe por marketing/scripts/lib/tools.mjs (instalado por
 * winget, pode não estar no PATH do shell atual). Não chame ffmpeg cru.
 *
 * Depois de rodar, ABRA os PNGs com a ferramenta Read. Um QA que não olhou a
 * imagem não aconteceu.
 *
 * Uso:
 *   node qa-frames.mjs take.mp4                        # 6 frames distribuídos
 *   node qa-frames.mjs take.mp4 --at 0.1,1.5,3,4.9     # segundos escolhidos
 *   node qa-frames.mjs take.mp4 --n 10 --out ./qa      # nº e destino
 *   node qa-frames.mjs take.mp4 --expect 1080x1920@30  # falha se divergir
 */

import { existsSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { basename, dirname, extname, join, resolve } from 'node:path';

import { repoRoot } from './lib/plan.mjs';

// tools.mjs resolve o binário do winget; importa pela raiz do repo, não por
// caminho relativo (a skill pode ser movida ou linkada).
const { FFMPEG, FFPROBE, run } = await import(
  pathToFileURL(join(repoRoot(), 'marketing', 'scripts', 'lib', 'tools.mjs')).href
);

function parseArgs(argv) {
  const out = { file: null, n: 6, at: null, outDir: null, expect: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--n') out.n = Number(argv[++i]);
    else if (a === '--at') out.at = argv[++i].split(',').map(Number);
    else if (a === '--out') out.outDir = argv[++i];
    else if (a === '--expect') out.expect = argv[++i];
    else if (a === '--json') out.json = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a.startsWith('--')) throw new Error(`flag desconhecida: ${a}`);
    else out.file = a;
  }
  return out;
}

const HELP = [
  'qa-frames.mjs — extrai frames + confere container (nada é gerado, custo zero)',
  '',
  '  node qa-frames.mjs <video.mp4> [--n 6 | --at 0.1,1.5,3] [--out DIR]',
  '                     [--expect 1080x1920@30] [--json]',
  '',
  'Depois: abra os PNGs com a ferramenta Read e preencha o bloco ARQUITETURA do QA.md.',
].join('\n');

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.file) {
  console.log(HELP);
  process.exit(args.file ? 0 : 2);
}

const file = resolve(args.file);
if (!existsSync(file)) {
  console.error(`erro: arquivo não existe — ${file}`);
  process.exit(2);
}

// --- container ---
let info;
try {
  const { stdout } = await run(FFPROBE, [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate,pix_fmt,codec_name',
    '-show_entries', 'format=duration,size',
    '-of', 'json',
    file,
  ]);
  info = JSON.parse(stdout);
} catch (err) {
  console.error('erro: ffprobe falhou — o arquivo pode estar CORROMPIDO mesmo existindo em disco.');
  console.error(err.message);
  process.exit(1);
}

const stream = info.streams?.[0] || {};
const duration = Number(info.format?.duration);
const [num, den] = String(stream.r_frame_rate || '0/1').split('/').map(Number);
const fps = den ? num / den : 0;

const problems = [];
if (!Number.isFinite(duration) || duration <= 0) problems.push('duração inválida');
if (stream.pix_fmt && stream.pix_fmt !== 'yuv420p')
  problems.push(`pix_fmt ${stream.pix_fmt} (esperado yuv420p — outros quebram em player de rede social)`);

if (args.expect) {
  const m = /^(\d+)x(\d+)(?:@(\d+(?:\.\d+)?))?$/.exec(args.expect);
  if (!m) {
    console.error('erro: --expect precisa ser no formato 1080x1920@30');
    process.exit(2);
  }
  const [, w, h, f] = m;
  if (Number(w) !== stream.width || Number(h) !== stream.height)
    problems.push(`resolução ${stream.width}x${stream.height}, esperado ${w}x${h}`);
  if (f && Math.abs(fps - Number(f)) > 0.01)
    problems.push(`fps ${fps.toFixed(2)}, esperado ${f}`);
}

// --- frames ---
const outDir = args.outDir ? resolve(args.outDir) : join(dirname(file), 'qa-frames');
mkdirSync(outDir, { recursive: true });

const stem = basename(file, extname(file));
const times = args.at
  ? args.at
  // distribui evitando o primeiro e o último frame exatos (bordas costumam ser pretas)
  : Array.from({ length: args.n }, (_, i) => +(0.05 + (duration - 0.1) * (i / (args.n - 1))).toFixed(2));

const frames = [];
for (const t of times) {
  if (!Number.isFinite(t) || t < 0 || t > duration) {
    problems.push(`tempo ${t}s fora do vídeo (0–${duration.toFixed(2)}s) — pulado`);
    continue;
  }
  const out = join(outDir, `${stem}_${String(t).replace('.', 'p')}s.png`);
  await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(t), '-i', file, '-frames:v', '1', out]);
  frames.push({ t, path: out });
}

if (args.json) {
  console.log(JSON.stringify({
    file,
    container: {
      width: stream.width, height: stream.height, fps, pix_fmt: stream.pix_fmt,
      codec: stream.codec_name, duration, size: Number(info.format?.size) || null,
    },
    frames, problems, ok: problems.length === 0,
  }, null, 2));
  process.exit(problems.length ? 1 : 0);
}

console.log(`\nQA FRAMES — ${basename(file)}`);
console.log('='.repeat(72));
console.log(`  container  ${stream.width}x${stream.height} · ${fps.toFixed(2)}fps · ${stream.pix_fmt} · ${stream.codec_name}`);
console.log(`  duração    ${duration.toFixed(2)}s`);
console.log(`  frames     ${frames.length} em ${outDir}`);
for (const f of frames) console.log(`             ${f.t}s  ${basename(f.path)}`);

if (problems.length) {
  console.log(`\n  PROBLEMAS (${problems.length}):`);
  for (const p of problems) console.log(`   ✗ ${p}`);
}

console.log('\n' + '='.repeat(72));
console.log('  AGORA ABRA OS PNGs COM A FERRAMENTA Read.');
console.log('  Bloco ARQUITETURA de references/qa.md: geometria, mobiliário, materiais,');
console.log('  esquadrias, linhas retas, perspectiva, morphing, hallucination.');
console.log('  Qualquer defeito fatal reprova o take — não monte em cima dele.\n');

process.exit(problems.length ? 1 : 0);

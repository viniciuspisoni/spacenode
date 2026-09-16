/**
 * REEL TRANSFORMAÇÃO (BRIEF.md) — 10s, 1080×1920, 30fps, sem áudio.
 *
 *   node marketing/scripts/reel-transformacao.mjs --roteiro entrega --data 2026-07-29
 *   node marketing/scripts/reel-transformacao.mjs --par living --roteiro entrega --data 2026-07-29
 *
 * Linha do tempo:
 *   0.0–1.5s  modelo SketchUp + hook
 *   1.5–1.8s  wipeleft para o render
 *   1.8–8.5s  render com Ken Burns (zoom 1.00→1.08) + payoff
 *   8.5–10.0s card final (logo + spacenode.app)
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { bandGeometry, buildCards } from './lib/reel-cards.mjs';
import { FRAME_H, FRAME_W, captureCards } from './lib/cards.mjs';
import { ROTEIROS } from './lib/roteiros.mjs';
import { ffmpeg, probe } from './lib/tools.mjs';

const REPO = resolve(import.meta.dirname, '../..');
const TMP = join(process.env.TEMP || '/tmp', 'spacenode-marketing');

// --- timeline (segundos) ---
const T_ANTES = 1.8;
const T_XFADE = 0.3;
const XFADE_AT = 1.5;
const T_DEPOIS = 7.0;
const T_FINAL = 1.5;
const FPS = 30;
const TOTAL = T_ANTES + T_DEPOIS - T_XFADE + T_FINAL; // 10.0

const argv = process.argv.slice(2);
const arg = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);

const roteiroName = arg('--roteiro') || 'base';
const roteiro = ROTEIROS[roteiroName];
if (!roteiro) {
  console.error(`Erro: roteiro "${roteiroName}" não existe. Disponíveis: ${Object.keys(ROTEIROS).join(', ')}`);
  process.exit(1);
}
const par = arg('--par') || roteiro.par;
const dateArg = arg('--data');
if (!dateArg) {
  console.error('Erro: passe --data AAAA-MM-DD (o nome do diretório de output depende dela).');
  process.exit(1);
}

const antes = join(REPO, 'marketing/renders/antes', `${par}.jpg`);
const depois = join(REPO, 'marketing/renders/depois', `${par}.jpg`);
for (const f of [antes, depois]) {
  if (!existsSync(f)) {
    console.error(`Erro: par incompleto — não encontrei ${f}`);
    process.exit(1);
  }
}

const slug = `${dateArg}-reel-transformacao-${par}`;
const outDir = join(REPO, 'marketing/output', slug);
const tmpDir = join(TMP, slug);
await mkdir(outDir, { recursive: true });
await mkdir(tmpDir, { recursive: true });

async function dimensions(src) {
  const { streams } = await probe(src);
  return { w: streams[0].width, h: streams[0].height };
}

/** Recorte central no MESMO aspecto nos dois lados — sem isso a imagem "salta" na transição. */
async function band(src, dest, aspect, scale) {
  const { w, h } = await dimensions(src);
  const cw = Math.min(w, Math.round(h * aspect));
  const ch = Math.min(h, Math.round(w / aspect));
  const x = Math.round((w - cw) / 2);
  const y = Math.round((h - ch) / 2);
  await ffmpeg([
    '-i', src,
    '-vf', `crop=${cw}:${ch}:${x}:${y},scale=${scale.w}:${scale.h}:flags=lanczos`,
    dest,
  ]);
  return `${w}×${h} → ${cw}×${ch}+${x}+${y}`;
}

console.log(`→ roteiro "${roteiroName}" · par "${par}"`);

const dimA = await dimensions(antes);
const dimB = await dimensions(depois);
const geo = bandGeometry(dimA.w / dimA.h, dimB.w / dimB.h);
console.log(`  banda ${FRAME_W}×${geo.height} (aspect ${geo.aspect.toFixed(3)}) em y=${geo.y}`);

const bandAntes = join(tmpDir, 'band-antes.png');
const bandDepois = join(tmpDir, 'band-depois.png');
const cropInfo = {
  antes: await band(antes, bandAntes, geo.aspect, { w: FRAME_W, h: geo.height }),
  // 2× para o Ken Burns: o zoompan só faz downsample, nunca estica pixel.
  depois: await band(depois, bandDepois, geo.aspect, { w: FRAME_W * 2, h: geo.height * 2 }),
};
console.log(`  crop antes  ${cropInfo.antes}`);
console.log(`  crop depois ${cropInfo.depois}`);

console.log('→ capturando cards de texto (Playwright, dSF 2 → lanczos 1080×1920)');
const cards = await captureCards(buildCards(roteiro, geo), join(tmpDir, 'cards'), join(tmpDir, 'html'));

console.log('→ montando vídeo (ffmpeg)');
const zoomFrames = Math.round(T_DEPOIS * FPS); // 210
const reel = join(outDir, `${slug}.mp4`);

const filter = [
  // segmento ANTES: banda estática sobre #0A0A0A + card de hook
  `color=c=0x0A0A0A:s=${FRAME_W}x${FRAME_H}:r=${FPS}:d=${T_ANTES}[bgA]`,
  `[0:v]fps=${FPS}[bandA]`,
  `[bgA][bandA]overlay=(W-w)/2:${geo.y}:shortest=1[a0]`,
  `[a0][2:v]overlay=0:0:shortest=1,format=yuv420p[segA]`,

  // segmento DEPOIS: Ken Burns lento (zoom máx. 1.08, BRIEF.md) + card de payoff
  `[1:v]zoompan=z='1+0.08*on/${zoomFrames - 1}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${zoomFrames}:s=${FRAME_W}x${geo.height}:fps=${FPS}[bandB]`,
  `color=c=0x0A0A0A:s=${FRAME_W}x${FRAME_H}:r=${FPS}:d=${T_DEPOIS}[bgB]`,
  `[bgB][bandB]overlay=(W-w)/2:${geo.y}:shortest=1[b0]`,
  `[b0][3:v]overlay=0:0:shortest=1,format=yuv420p[segB]`,

  `[segA][segB]xfade=transition=wipeleft:duration=${T_XFADE}:offset=${XFADE_AT}[main]`,
  `[4:v]fps=${FPS},format=yuv420p[segF]`,
  `[main][segF]concat=n=2:v=1:a=0[out]`,
].join(';');

await ffmpeg([
  '-loop', '1', '-framerate', String(FPS), '-t', String(T_ANTES), '-i', bandAntes,
  '-i', bandDepois,
  // Cards são PNG de 1 frame: sem -loop/-t o `shortest=1` do overlay corta o segmento.
  '-loop', '1', '-framerate', String(FPS), '-t', String(T_ANTES), '-i', cards['card-antes'],
  '-loop', '1', '-framerate', String(FPS), '-t', String(T_DEPOIS), '-i', cards['card-depois'],
  '-loop', '1', '-framerate', String(FPS), '-t', String(T_FINAL), '-i', cards['card-final'],
  '-filter_complex', filter,
  '-map', '[out]',
  '-an',
  '-c:v', 'libx264', '-crf', '18', '-preset', 'slow',
  '-pix_fmt', 'yuv420p', '-r', String(FPS),
  '-movflags', '+faststart',
  reel,
]);

console.log('→ QA: extraindo frames');
const qaFrames = [0.7, 2.5, 6.0, 9.2];
const framesDir = join(outDir, 'qa-frames');
await mkdir(framesDir, { recursive: true });
for (const t of qaFrames) {
  await ffmpeg(['-ss', String(t), '-i', reel, '-frames:v', '1', join(framesDir, `t${t.toFixed(1)}s.png`)]);
}

const meta = await probe(reel);
const v = meta.streams[0];
const report = {
  slug,
  roteiro: roteiroName,
  par,
  reel,
  banda: `${FRAME_W}×${geo.height} @ y=${geo.y} (aspect ${geo.aspect.toFixed(3)})`,
  crop: cropInfo,
  width: v.width,
  height: v.height,
  fps: v.r_frame_rate,
  pix_fmt: v.pix_fmt,
  codec: v.codec_name,
  duration: Number(meta.format.duration).toFixed(2),
  sizeMB: (Number(meta.format.size) / 1e6).toFixed(2),
  esperado: { width: FRAME_W, height: FRAME_H, fps: `${FPS}/1`, duration: TOTAL.toFixed(2) },
};
await writeFile(join(outDir, 'probe.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));

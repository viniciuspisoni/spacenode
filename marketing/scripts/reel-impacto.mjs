/**
 * REEL TRANSFORMAÇÃO — versão IMPACTO. 8,6s, 1080×1920, 30fps, sem áudio.
 *
 *   node marketing/scripts/reel-impacto.mjs --roteiro base --data 2026-07-29
 *
 * Diferenças em relação ao reel-transformacao.mjs (v1):
 *  1. Full-bleed: o fundo é a própria imagem desfocada e escurecida, não preto morto.
 *     A banda nítida continua com a composição inteira do arquiteto (nada de cortar
 *     um 16:9 em 9:16 e destruir o enquadramento do projeto).
 *  2. A revelação é uma régua vertical que atravessa a tela — o formato de
 *     antes/depois que o público de archviz já conhece — e ela revela a imagem E o
 *     texto de payoff de uma vez.
 *  3. Batida dupla: depois de ver o render, dá um corte seco de 0,2s de volta ao
 *     SketchUp e revela outra vez. É o que faz reassistir.
 *  4. 8,6s em vez de 10s (taxa de conclusão maior) e hook em 72px.
 *
 * Linha do tempo:
 *   0.00–1.20  SketchUp full-bleed + hook
 *   1.20–1.70  régua atravessa revelando o render + payoff
 *   1.70–5.30  render com Ken Burns
 *   5.30–5.50  corte seco de volta ao SketchUp
 *   5.50–7.40  render de novo (o zoom continua de onde parou)
 *   7.40–8.60  card final
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { FRAME_H, FRAME_W, captureCards } from './lib/cards.mjs';
import { bandGeometry, buildCards } from './lib/impacto-cards.mjs';
import { ROTEIROS } from './lib/roteiros.mjs';
import { ffmpeg, probe } from './lib/tools.mjs';

const REPO = resolve(import.meta.dirname, '../..');
const TMP = join(process.env.TEMP || '/tmp', 'spacenode-marketing');

// --- timeline (segundos) ---
const T_HOLD = 1.2;      // SketchUp na tela antes da revelação
const T_REVEAL = 0.5;    // duração da passagem da régua
const T_SNAP_AT = 5.3;   // corte seco de volta ao SketchUp
const T_SNAP = 0.2;
const T_BASE = 7.4;      // duração do trecho principal
const T_FINAL = 1.2;
const FPS = 30;
const TOTAL = T_BASE + T_FINAL;
const LINE_W = 6;

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
  console.error('Erro: passe --data AAAA-MM-DD.');
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

const slug = `${dateArg}-reel-impacto-${par}`;
const outDir = join(REPO, 'marketing/output', slug);
const tmpDir = join(TMP, slug);
await mkdir(outDir, { recursive: true });
await mkdir(tmpDir, { recursive: true });

async function dimensions(src) {
  const { streams } = await probe(src);
  return { w: streams[0].width, h: streams[0].height };
}

async function bandPng(src, dest, aspect, scale) {
  const { w, h } = await dimensions(src);
  const cw = Math.min(w, Math.round(h * aspect));
  const ch = Math.min(h, Math.round(w / aspect));
  await ffmpeg([
    '-i', src,
    '-vf', `crop=${cw}:${ch}:${Math.round((w - cw) / 2)}:${Math.round((h - ch) / 2)},scale=${scale.w}:${scale.h}:flags=lanczos`,
    dest,
  ]);
  return `${w}×${h} → ${cw}×${ch}`;
}

/**
 * Fundo full-bleed: cobre 1080×1920 e desfoca forte. O contraste do texto vem do
 * scrim do card, não daqui — então o modelo do SketchUp, que já é escuro, quase não
 * é escurecido (senão o fundo vira preto chapado e não sobra textura nenhuma).
 */
async function backdropPng(src, dest, brightness) {
  await ffmpeg([
    '-i', src,
    '-vf', [
      `scale=${FRAME_W}:${FRAME_H}:force_original_aspect_ratio=increase:flags=lanczos`,
      `crop=${FRAME_W}:${FRAME_H}`,
      'boxblur=42:2',
      `eq=brightness=${brightness}:saturation=0.72`,
    ].join(','),
    dest,
  ]);
}

console.log(`→ roteiro "${roteiroName}" · par "${par}" · versão IMPACTO`);

const dimA = await dimensions(antes);
const dimB = await dimensions(depois);
const geo = bandGeometry(dimA.w / dimA.h, dimB.w / dimB.h);
console.log(`  banda ${FRAME_W}×${geo.height} em y=${geo.y} (aspect ${geo.aspect.toFixed(3)})`);

const f = (name) => join(tmpDir, name);
const cropInfo = {
  antes: await bandPng(antes, f('band-antes.png'), geo.aspect, { w: FRAME_W, h: geo.height }),
  depois: await bandPng(depois, f('band-depois.png'), geo.aspect, { w: FRAME_W * 2, h: geo.height * 2 }),
};
// O modelo do SketchUp é cinza médio e o render é escuro: para os dois lados terem
// luminância parecida (o corte seco não pode dar um flash claro), o "antes" leva
// escurecimento menor que o "depois", mas não zero.
await backdropPng(antes, f('bg-antes.png'), -0.14);
await backdropPng(depois, f('bg-depois.png'), -0.22);
console.log(`  crop antes  ${cropInfo.antes}`);
console.log(`  crop depois ${cropInfo.depois}`);

console.log('→ capturando cards (Playwright, dSF 2 → lanczos)');
const cards = await captureCards(buildCards(roteiro, geo), f('cards'), f('html'));

// Régua da revelação: hairline branca de altura cheia.
await ffmpeg(['-f', 'lavfi', '-i', `color=c=white:s=${LINE_W}x${FRAME_H}`, '-frames:v', '1', f('line.png')]);

// O quadro do "antes" é estático: achata fundo + banda num PNG só. SEM texto — o wipe
// atravessa a imagem, mas o texto NÃO pode ser wipado: as duas frases ficam na mesma
// altura e no meio da passagem viram uma sopa ("ententende isso."). O texto troca em
// corte seco, sobreposto depois do wipe.
console.log('→ achatando o quadro do SketchUp');
await ffmpeg([
  '-i', f('bg-antes.png'),
  '-i', f('band-antes.png'),
  '-filter_complex', `[0:v][1:v]overlay=(W-w)/2:${geo.y}[out]`,
  '-map', '[out]', '-frames:v', '1',
  f('frame-antes.png'),
]);

console.log('→ montando vídeo (ffmpeg)');
const T_SEG_ANTES = T_HOLD + T_REVEAL;              // 1.7
const T_SEG_DEPOIS = T_BASE - T_HOLD;               // 6.2 (o xfade come 0.5 de sobreposição)
const zoomFrames = Math.round(T_SEG_DEPOIS * FPS);
const reel = join(outDir, `${slug}.mp4`);

// `xfade=wipeleft` é um wipe de verdade: as duas imagens ficam paradas e só a borda
// anda. Ele é linear, então a régua também tem que ser linear (nada de ease-out).
const REVEAL_P = `clip((t-${T_HOLD})/${T_REVEAL},0,1)`;
const SNAP = `between(t,${T_SNAP_AT},${T_SNAP_AT + T_SNAP})`;

const T_SWAP = T_HOLD + T_REVEAL; // texto troca quando o wipe termina

const filter = [
  // quadro do SketchUp (sem texto), parado, pelos primeiros 1,7s
  `[0:v]fps=${FPS},setsar=1,format=yuv420p[segA]`,

  // render full-bleed (sem texto) com Ken Burns na banda
  `[2:v]zoompan=z='1+0.08*on/${zoomFrames - 1}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${zoomFrames}:s=${FRAME_W}x${geo.height}:fps=${FPS}[band]`,
  `[1:v]fps=${FPS}[bg]`,
  `[bg][band]overlay=(W-w)/2:${geo.y},setsar=1,format=yuv420p[segB]`,

  `[segA][segB]xfade=transition=wipeleft:duration=${T_REVEAL}:offset=${T_HOLD}[wiped]`,

  // corte seco de volta ao SketchUp (o Ken Burns segue correndo por baixo)
  `[wiped][3:v]overlay=x=0:y=0:enable='${SNAP}'[snapped]`,

  // scrim sempre presente, independente do texto
  `[snapped][4:v]overlay=0:0[scrimmed]`,

  // texto por cima, trocando em corte — nunca wipado. No corte seco de volta ao
  // SketchUp o texto sai de cena: "…mas entende isso." em cima do modelo cinza se
  // contradiz, e sem texto a piscada fica mais seca.
  `[scrimmed][5:v]overlay=0:0:enable='lt(t,${T_SWAP})'[txt1]`,
  `[txt1][6:v]overlay=0:0:enable='gte(t,${T_SWAP})*(1-${SNAP})'[txt2]`,

  // régua acompanhando a borda do wipe
  `[txt2][7:v]overlay=x='${FRAME_W}*(1-${REVEAL_P})-${LINE_W / 2}':y=0:enable='between(t,${T_HOLD},${T_SWAP})',setsar=1,format=yuv420p[main]`,

  `[8:v]fps=${FPS},setsar=1,format=yuv420p[fin]`,
  `[main][fin]concat=n=2:v=1:a=0[out]`,
].join(';');

await ffmpeg([
  '-loop', '1', '-framerate', String(FPS), '-t', String(T_SEG_ANTES), '-i', f('frame-antes.png'),
  '-loop', '1', '-framerate', String(FPS), '-t', String(T_SEG_DEPOIS), '-i', f('bg-depois.png'),
  '-i', f('band-depois.png'),
  '-loop', '1', '-framerate', String(FPS), '-t', String(T_BASE), '-i', f('frame-antes.png'),
  '-loop', '1', '-framerate', String(FPS), '-t', String(T_BASE), '-i', cards['card-scrim'],
  '-loop', '1', '-framerate', String(FPS), '-t', String(T_BASE), '-i', cards['card-antes'],
  '-loop', '1', '-framerate', String(FPS), '-t', String(T_BASE), '-i', cards['card-depois'],
  '-loop', '1', '-framerate', String(FPS), '-t', String(T_BASE), '-i', f('line.png'),
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
const qaFrames = [0.6, 1.45, 3.0, 5.4, 6.5, 8.0];
const framesDir = join(outDir, 'qa-frames');
await mkdir(framesDir, { recursive: true });
for (const t of qaFrames) {
  await ffmpeg(['-ss', String(t), '-i', reel, '-frames:v', '1', join(framesDir, `t${t.toFixed(2)}s.png`)]);
}

const meta = await probe(reel);
const v = meta.streams[0];
const report = {
  slug,
  versao: 'impacto',
  roteiro: roteiroName,
  par,
  banda: `${FRAME_W}×${geo.height} @ y=${geo.y}`,
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

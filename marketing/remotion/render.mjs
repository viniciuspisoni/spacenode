// Renderiza a campanha inteira (com áudio e muda) para marketing/output/2026-09-11-campanha/.
//
//   node marketing/remotion/render.mjs            # tudo
//   node marketing/remotion/render.mjs V3         # só as composições cujo id contém "V3"
//   node marketing/remotion/render.mjs --half     # QA rápido a 540x960
//
// A versão MUDA sai por `-an` do ffmpeg sobre o arquivo com áudio (vídeo copiado bit a bit):
// os Reels orgânicos entram mudos no Instagram (BRIEF.md), o áudio fica para anúncio e site.
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { FFMPEG } from '../scripts/lib/tools.mjs';

const HERE = resolve(import.meta.dirname);
const REPO = resolve(HERE, '../..');
const OUT = join(REPO, 'marketing/output/2026-09-11-campanha');
const PUBLIC = join(HERE, 'public');

const argv = process.argv.slice(2);
const half = argv.includes('--half');
const filter = argv.find((a) => !a.startsWith('--'));

const COMPS = [
  ['V1-seu-projeto-em-cena', 'v1-seu-projeto-em-cena'],
  ['V1-abertura-A', 'v1-seu-projeto-em-cena-abertura-A'],
  ['V1-abertura-B', 'v1-seu-projeto-em-cena-abertura-B'],
  ['V2-a-vista-que-voce-escolheu', 'v2-a-vista-que-voce-escolheu'],
  ['V3-olhe-para-as-linhas', 'v3-olhe-para-as-linhas'],
].filter(([id]) => !filter || id.includes(filter));

mkdirSync(OUT, { recursive: true });

for (const [id, name] of COMPS) {
  const raw = join(OUT, `${name}${half ? '-half' : ''}-raw.mp4`);
  const withAudio = join(OUT, `${name}${half ? '-half' : ''}.mp4`);
  const mute = join(OUT, `${name}${half ? '-half' : ''}-mudo.mp4`);
  console.log(`\n→ ${id}`);
  execFileSync(
    'npx',
    [
      'remotion', 'render', 'src/index.ts', id, raw,
      '--public-dir', PUBLIC,
      '--codec', 'h264', '--crf', half ? '20' : '17',
      '--pixel-format', 'yuv420p',
      '--color-space', 'bt709',
      '--audio-codec', 'aac', '--audio-bitrate', '256k',
      '--concurrency', '4', '--log', 'error', '--overwrite',
      ...(half ? ['--scale', '0.5'] : []),
    ],
    { cwd: HERE, stdio: 'inherit', shell: true },
  );
  // Loudness: o mix sintetizado sai baixo (~-25 LUFS). Normaliza para -16 LUFS / -1,5 dBTP
  // (alvo de sound-design.md) só no áudio — o vídeo é copiado bit a bit, sem reencode.
  execFileSync(
    FFMPEG,
    ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-c:v', 'copy', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=9', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', withAudio],
    { stdio: 'inherit' },
  );
  execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-an', '-c:v', 'copy', '-movflags', '+faststart', mute], { stdio: 'inherit' });
  rmSync(raw);
  console.log(`  ${withAudio}\n  ${mute}`);
}

if (!existsSync(OUT)) process.exit(1);
console.log('\npronto:', OUT);

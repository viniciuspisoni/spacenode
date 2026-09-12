/**
 * Índice da rodada de Reels: varre marketing/output/<data>-reel-* e escreve
 * um README.md com a lista das peças (duração, specs técnicas, gancho, CTA,
 * hashtags, arquivos) + uma folha de contato com um frame de cada peça.
 *
 *   node marketing/scripts/indice-reels.mjs 2026-09-04
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';

import { ffmpeg, probe } from './lib/tools.mjs';

const REPO = resolve(import.meta.dirname, '../..');
const OUT = join(REPO, 'marketing/output');
const date = process.argv[2] || '2026-09-04';

const dirs = readdirSync(OUT)
  .filter((d) => d.startsWith(`${date}-reel-`) && !d.endsWith('-ad'))
  .filter((d) => statSync(join(OUT, d)).isDirectory())
  .sort();

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);

/** Primeira linha não vazia da legenda = gancho; última linha com # = hashtags. */
function parseCaption(txt) {
  if (!txt) return {};
  const lines = txt.split(/\r?\n/);
  const hook = lines.find((l) => l.trim() && !/^#{1,3}\s/.test(l) && !/^(VERSÃO|VARIANTE)/i.test(l))?.trim();
  const tags = [...txt.matchAll(/^([^\n]*#\w[^\n]*)$/gm)].map((m) => m[1].trim()).find((l) => (l.match(/#/g) || []).length >= 3);
  const cta = ['Renderize seu projeto', 'Teste com um projeto real', 'Comece agora', 'Veja no seu próprio projeto', 'Comece grátis']
    .filter((c) => txt.includes(c));
  return { hook, tags, cta: cta[cta.length - 1] };
}

const rows = [];
for (const d of dirs) {
  const dir = join(OUT, d);
  const mp4 = join(dir, `${d}.mp4`);
  if (!existsSync(mp4)) continue;
  let meta;
  try {
    meta = await probe(mp4);
  } catch {
    rows.push({ slug: d.replace(`${date}-reel-`, ''), dir, mp4, broken: true });
    continue;
  }
  const v = meta.streams[0];
  const adDir = join(OUT, `${d}-ad`);
  const adMp4 = join(adDir, `${d}-ad.mp4`);
  let ad = null;
  if (existsSync(adMp4)) { try { ad = await probe(adMp4); } catch { ad = null; } }
  const caption = parseCaption(read(join(dir, 'caption.txt')));
  rows.push({
    slug: d.replace(`${date}-reel-`, ''),
    dir, mp4,
    width: v.width, height: v.height, fps: v.r_frame_rate, codec: v.codec_name, pix: v.pix_fmt,
    dur: Number(meta.format.duration),
    sizeMB: Number(meta.format.size) / 1e6,
    ad: ad ? { mp4: adMp4, dur: Number(ad.format.duration), sizeMB: Number(ad.format.size) / 1e6 } : null,
    caption,
    hasCaption: existsSync(join(dir, 'caption.txt')),
    hasQA: existsSync(join(dir, 'QA.md')),
    sheet: existsSync(join(dir, 'qa-sheet.jpg')) ? join(dir, 'qa-sheet.jpg') : null,
  });
}

const ok = (b) => (b ? 'sim' : '—');
const fmt = (n, d = 1) => n.toFixed(d).replace('.', ',');

let md = `# Reels · rodada ${date}\n\n`;
md += `${rows.length} peças em \`marketing/output/\`. Todas 1080×1920, 30 fps, H.264, sem áudio `;
md += `(a trilha entra no app do Instagram na hora de publicar).\n\n`;
md += `| # | peça | duração | versão paga | legenda | QA | arquivo |\n|---|---|---|---|---|---|---|\n`;
rows.forEach((r, i) => {
  if (r.broken) { md += `| ${i + 1} | ${r.slug} | **arquivo inválido** | — | — | — | \`${basename(r.mp4)}\` |\n`; return; }
  md += `| ${i + 1} | ${r.slug} | ${fmt(r.dur)} s | ${r.ad ? fmt(r.ad.dur) + ' s' : '—'} | ${ok(r.hasCaption)} | ${ok(r.hasQA)} | \`${basename(r.mp4)}\` |\n`;
});

md += `\n## Peça a peça\n`;
for (const r of rows) {
  if (r.broken) { md += `\n### ${r.slug}\n\n- **Vídeo inválido** — precisa re-renderizar a partir de \`spec-src.json\`.\n`; continue; }
  md += `\n### ${r.slug}\n\n`;
  if (r.caption.hook) md += `> ${r.caption.hook}\n\n`;
  md += `- **Vídeo:** \`${r.mp4.replace(REPO + '\\', '').replace(/\\/g, '/')}\` — ${fmt(r.dur)} s · ${r.width}×${r.height} · ${r.fps} · ${r.codec}/${r.pix} · ${fmt(r.sizeMB, 2)} MB\n`;
  if (r.ad) md += `- **Versão paga:** \`${r.ad.mp4.replace(REPO + '\\', '').replace(/\\/g, '/')}\` — ${fmt(r.ad.dur)} s · ${fmt(r.ad.sizeMB, 2)} MB\n`;
  if (r.caption.cta) md += `- **CTA:** ${r.caption.cta}\n`;
  if (r.caption.tags) md += `- **Hashtags:** ${r.caption.tags}\n`;
  md += `- **Legenda:** \`caption.txt\` · **QA:** \`QA.md\` · **Frames:** \`qa-sheet.jpg\` + \`qa-frames/\`\n`;
}

md += `\n## Como publicar\n\n`;
md += `1. Abrir o mp4 no Instagram, escolher a trilha na biblioteca do app (os arquivos saem sem áudio de propósito — Reels com áudio da biblioteca distribuem melhor).\n`;
md += `2. Colar a legenda de \`caption.txt\` (o gancho é a 1ª linha, o que aparece antes do "mais").\n`;
md += `3. Capa: usar um frame do render, sem texto.\n`;
md += `4. Para tráfego pago: usar a versão \`-ad\` quando existir e as três variações de copy do bloco "VERSÃO PAGA" da legenda.\n`;

writeFileSync(join(OUT, `${date}-slate`, 'README.md'), md, 'utf8');

// Folha de contato: 1 frame por peça
const sheetsDir = join(OUT, `${date}-slate`);
const tiles = [];
for (const r of rows) {
  const fdir = join(r.dir, 'qa-frames');
  const frames = existsSync(fdir) ? readdirSync(fdir).filter((f) => f.endsWith('.png')) : [];
  if (!frames.length) continue;
  // O PNG mais pesado é o frame com mais detalhe: descarta cards finais (fundo liso)
  // e meios de wipe/fade (imagem lavada), que é onde a escolha "do meio" caía.
  const best = frames
    .map((f) => ({ f, bytes: statSync(join(fdir, f)).size }))
    .sort((a, b) => b.bytes - a.bytes)[0];
  tiles.push({ slug: r.slug, file: join(fdir, best.f) });
}
if (tiles.length) {
  const inputs = tiles.flatMap((t) => ['-i', t.file]);
  const COLS = Math.min(5, tiles.length);
  const ROWS = Math.ceil(tiles.length / COLS);
  const TW = 300, TH = 533;
  const scale = tiles.map((_, i) => `[${i}:v]scale=${TW}:${TH}[s${i}]`).join(';');
  const grid = tiles.map((_, i) => `[s${i}]`).join('') + `xstack=inputs=${tiles.length}:layout=` +
    tiles.map((_, i) => `${(i % COLS) * TW}_${Math.floor(i / COLS) * TH}`).join('|') + ':fill=black[out]';
  try {
    await ffmpeg([...inputs, '-filter_complex', `${scale};${grid}`, '-map', '[out]', '-frames:v', '1',
      join(sheetsDir, 'contact-sheet.jpg')]);
    console.log('contact sheet:', join(sheetsDir, 'contact-sheet.jpg'), `(${COLS}×${ROWS})`);
    console.log('ordem:', tiles.map((t) => t.slug).join(' · '));
  } catch (e) {
    console.warn('contact sheet falhou:', e.message.split('\n')[0]);
  }
}

console.log('README:', join(sheetsDir, 'README.md'));
console.log(`${rows.length} peças · ${rows.filter((r) => r.ad).length} com versão paga · ${rows.filter((r) => r.hasCaption).length} com legenda · ${rows.filter((r) => r.hasQA).length} com QA`);

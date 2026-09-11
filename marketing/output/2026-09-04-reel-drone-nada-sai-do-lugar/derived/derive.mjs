// Deriva os "antes" para o quadro exato do "depois" (cover-resize, como manda o slate)
// e gera blends/grades para medir as cantoneiras. Só material auxiliar desta peça.
import sharp from 'sharp';
import { join } from 'node:path';
const A = 'C:/Users/Pisoni/AppData/Local/Temp/claude/C--Users-Pisoni-spacenode/19988837-c924-4b30-b28f-e9e7dc6696fa/scratchpad/assets/';
const D = 'C:/Users/Pisoni/spacenode/marketing/output/2026-09-04-reel-drone-nada-sai-do-lugar/derived/';
const W = 944, H = 1120;
for (const f of ['0442-render-before.jpg','0441-render-after.jpg','0444-render-before.jpg','0443-render-after.jpg']) {
  const m = await sharp(A + f).metadata(); console.log(f, m.width, m.height);
}
// pares: depois recortado/escala p/ 944x1120; antes cover-resize p/ 944x1120
await sharp(A + '0441-render-after.jpg').resize(W, H, { fit: 'cover', position: 'centre' }).jpeg({ quality: 96 }).toFile(D + 'p1-depois.jpg');
await sharp(A + '0442-render-before.jpg').resize(W, H, { fit: 'cover', position: 'centre' }).jpeg({ quality: 96 }).toFile(D + 'p1-antes.jpg');
await sharp(A + '0443-render-after.jpg').resize(W, H, { fit: 'cover', position: 'centre' }).jpeg({ quality: 96 }).toFile(D + 'p2-depois.jpg');
await sharp(A + '0444-render-before.jpg').resize(W, H, { fit: 'cover', position: 'centre' }).jpeg({ quality: 96 }).toFile(D + 'p2-antes.jpg');
// blends 50/50 para checar alinhamento
for (const p of ['p1','p2']) {
  const a = await sharp(D + `${p}-antes.jpg`).ensureAlpha(0.5).png().toBuffer();
  await sharp(D + `${p}-depois.jpg`).composite([{ input: a, blend: 'over' }]).jpeg({ quality: 90 }).toFile(D + `${p}-blend.jpg`);
}
// grade rotulada a cada 50px (rótulo a cada 100) sobre p1-depois e p1-antes
const grid = () => {
  let s = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  for (let x = 0; x < W; x += 50) s += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${x%100?'#ff0':'#f00'}" stroke-width="${x%100?0.6:1}" opacity="0.8"/>` + (x%100?'':`<text x="${x+2}" y="12" font-size="12" fill="#f00" font-family="Arial">${x}</text>`);
  for (let y = 0; y < H; y += 50) s += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${y%100?'#ff0':'#f00'}" stroke-width="${y%100?0.6:1}" opacity="0.8"/>` + (y%100?'':`<text x="2" y="${y-2}" font-size="12" fill="#f00" font-family="Arial">${y}</text>`);
  return Buffer.from(s + '</svg>');
};
for (const f of ['p1-depois','p1-antes']) await sharp(D + f + '.jpg').composite([{ input: grid() }]).png().toFile(D + f + '-grid.png');
console.log('ok');

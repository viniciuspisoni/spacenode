// Folhas de comparação do A/B fotorrealista + métrica de "traço preto".
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const AB = 'C:/Users/Pisoni/Desktop/spacenode-ab';
const OUT = path.join(AB, 'entrega');
mkdirSync(OUT, { recursive: true });

// Região da torre principal, em fração da imagem — mesma janela em qualquer escala.
const FRAC = { x: 0.375, y: 0.07, w: 0.25, h: 0.6 };

async function crop(file) {
  const img = sharp(file);
  const m = await img.metadata();
  return {
    left: Math.round(m.width * FRAC.x),
    top: Math.round(m.height * FRAC.y),
    width: Math.round(m.width * FRAC.w),
    height: Math.round(m.height * FRAC.h),
  };
}

async function darkRatio(file) {
  const region = await crop(file);
  const raw = await sharp(file).extract(region).removeAlpha().raw().toBuffer();
  let sum = 0, dark = 0;
  const n = raw.length / 3;
  for (let i = 0; i < raw.length; i += 3) {
    const l = 0.299 * raw[i] + 0.587 * raw[i + 1] + 0.114 * raw[i + 2];
    sum += l;
    if (l < 70) dark++;
  }
  return { luminancia: +(sum / n).toFixed(1), pctEscuro: +((dark / n) * 100).toFixed(1) };
}

async function sheet(files, outName, width) {
  const gap = 10;
  const tiles = [];
  for (const f of files) {
    tiles.push(await sharp(f).resize({ width }).png().toBuffer());
  }
  const metas = await Promise.all(tiles.map((b) => sharp(b).metadata()));
  const H = metas.reduce((a, m) => a + m.height + gap, 0);
  await sharp({ create: { width, height: H, channels: 3, background: '#f2f2f2' } })
    .composite(tiles.map((input, i) => ({
      input,
      left: 0,
      top: metas.slice(0, i).reduce((a, m) => a + m.height + gap, 0),
    })))
    .png()
    .toFile(path.join(OUT, outName));
  return path.join(OUT, outName);
}

async function detailSheet(files, outName) {
  const tiles = [];
  for (const f of files) {
    const region = await crop(f);
    tiles.push(await sharp(f).extract(region).resize({ width: 620 }).png().toBuffer());
  }
  const metas = await Promise.all(tiles.map((b) => sharp(b).metadata()));
  const gap = 10;
  const W = 620 * tiles.length + gap * (tiles.length - 1);
  const H = Math.max(...metas.map((m) => m.height));
  await sharp({ create: { width: W, height: H, channels: 3, background: '#f2f2f2' } })
    .composite(tiles.map((input, i) => ({ input, left: i * (620 + gap), top: 0 })))
    .png()
    .toFile(path.join(OUT, outName));
  return path.join(OUT, outName);
}

const entradas = [`${AB}/iso/a-base-atual.png`, `${AB}/ao/a-base.png`];
const resultados = [
  `${AB}/render/R1-captura-atual-prompt-antigo.png`,
  `${AB}/render/R2-captura-preparada-prompt-antigo.png`,
  `${AB}/render/R3-captura-preparada-prompt-novo.png`,
];

const rows = [];
for (const [rotulo, f] of [
  ['entrada · captura ATUAL', entradas[0]],
  ['entrada · captura PREPARADA', entradas[1]],
  ['R1 · captura atual + prompt antigo', resultados[0]],
  ['R2 · captura preparada + prompt antigo', resultados[1]],
  ['R3 · captura preparada + prompt novo', resultados[2]],
]) {
  rows.push({ item: rotulo, ...(await darkRatio(f)) });
}
console.table(rows);

console.log(await sheet(entradas, 'entradas.png', 1400));
console.log(await sheet(resultados, 'resultados.png', 1400));
console.log(await detailSheet(entradas, 'entradas-detalhe.png'));
console.log(await detailSheet(resultados, 'resultados-detalhe.png'));

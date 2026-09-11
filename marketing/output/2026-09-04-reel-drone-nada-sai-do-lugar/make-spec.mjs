// Gera spec-src.json (orgânico 11,5 s) e o cutdown de 6 s (-ad) desta peça.
// Cards "html" próprios: faixas #1a1a1a, cantoneiras, scrims, hook/sub/CTA ancorados na caixa 4:5.
import { writeFile } from 'node:fs/promises';
const OUT = 'C:/Users/Pisoni/spacenode/marketing/output/';
const D = OUT + '2026-09-04-reel-drone-nada-sai-do-lugar/derived/';
// caixa "contain" para 944×1120: 1080×1282 em y=320 (bottom 1602)
const BOX_Y = 320, BOX_B = 1602;

const faixas = `<div style='position:absolute;left:0;right:0;top:0;height:${BOX_Y}px;background:#1a1a1a'></div>
<div style='position:absolute;left:0;right:0;top:${BOX_B}px;bottom:0;background:#1a1a1a'></div>`;

const scrimTop = `<div style='position:absolute;left:0;right:0;top:${BOX_Y}px;height:280px;background:linear-gradient(180deg,rgba(26,26,26,0.86) 0%,rgba(26,26,26,0.62) 45%,rgba(26,26,26,0) 100%)'></div>`;
const scrimBottom = `<div style='position:absolute;left:0;right:0;top:${BOX_B - 380}px;height:380px;background:linear-gradient(0deg,rgba(26,26,26,0.90) 0%,rgba(26,26,26,0.70) 40%,rgba(26,26,26,0) 100%)'></div>`;

// cantoneiras (medidas na grade do original 944×1120 → quadro)
const corner = ({ left, top, w, h, arm }, op) => {
  const c = `position:absolute;width:${arm}px;height:${arm}px;border:0 solid rgba(255,255,255,${op});`;
  return `<div style='position:absolute;left:${left}px;top:${top}px;width:${w}px;height:${h}px'>
    <i style='${c}left:0;top:0;border-top-width:1.5px;border-left-width:1.5px'></i>
    <i style='${c}right:0;top:0;border-top-width:1.5px;border-right-width:1.5px'></i>
    <i style='${c}left:0;bottom:0;border-bottom-width:1.5px;border-left-width:1.5px'></i>
    <i style='${c}right:0;bottom:0;border-bottom-width:1.5px;border-right-width:1.5px'></i></div>`;
};
const marcas = (op) => [
  { left: 235, top: 520, w: 675, h: 710, arm: 34 },   // três espreguiçadeiras
  { left: 252, top: 1047, w: 183, h: 240, arm: 26 },  // escada da piscina
  { left: 97, top: 806, w: 97, h: 86, arm: 18 },      // pote da planta
].map((b) => corner(b, op)).join('');

const hook = `<div style='position:absolute;left:80px;width:920px;top:372px;text-align:center;font-size:64px;font-weight:500;line-height:1.12;letter-spacing:-0.035em;color:#f5f5f7'>nada sai do lugar.</div>`;
const sub = `<div style='position:absolute;left:80px;width:920px;bottom:${1920 - 1560}px;text-align:center;font-size:38px;font-weight:400;line-height:1.3;letter-spacing:-0.02em;color:#f5f5f7;text-wrap:balance'>espreguiçadeiras, escada e planta:<br>onde você modelou.</div>`;
const cta = `<div style='position:absolute;left:80px;width:920px;bottom:${1920 - 1560}px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:26px'>
  <span style='display:inline-block;padding-bottom:14px;border-bottom:2px solid #30d158;font-size:54px;font-weight:500;letter-spacing:-0.03em;line-height:1.1;color:#f5f5f7'>Comece grátis</span>
  <span style='font-size:26px;font-weight:400;letter-spacing:0.01em;color:#a1a1a6'>80 nodes grátis · sem cartão · em português</span></div>`;

const cards = {
  faixas: { layout: 'html', body: faixas },
  marcas50: { layout: 'html', body: marcas(0.5) },
  marcas: { layout: 'html', body: marcas(0.94) },
  scrimTop: { layout: 'html', body: scrimTop },
  scrimBottom: { layout: 'html', body: scrimBottom },
  hook: { layout: 'html', body: hook },
  sub: { layout: 'html', body: sub },
  cta: { layout: 'html', body: cta },
  final: { layout: 'final', cta: 'Comece grátis' },
};

const still = (src, dur, kb = [1, 1]) => ({ type: 'still', src, dur, fit: 'contain', kenburns: kb, brightness: -0.3 });

const organico = {
  slug: '2026-09-04-reel-drone-nada-sai-do-lugar',
  segments: [
    still(D + 'p1-antes.jpg', 2.3),            // 0,0 → 2,3 (wipe 1,4–2,3)
    still(D + 'p1-depois.jpg', 4.1),           // 1,4 → 5,5 (parado: as cantoneiras ficam encaixadas)
    still(D + 'p2-antes.jpg', 1.34),           // 5,46 → 6,8 ("corte" = fade de 1 frame: o kit não aceita xfade após concat; wipe 6,0–6,8)
    still(D + 'p2-depois.jpg', 4.4, [1, 1.05]), // 6,0 → 10,4 (push-in; fade p/ card 10,0–10,4)
    { type: 'card', card: 'final', dur: 1.5 }, // 10,0 → 11,5
  ],
  transitions: [
    { type: 'wiperight', dur: 0.9, ruler: true },
    { type: 'fade', dur: 0.04 },
    { type: 'wiperight', dur: 0.8, ruler: true },
    { type: 'fade', dur: 0.4 },
  ],
  cards,
  overlays: [
    { card: 'faixas', from: 0, to: 11.5 },
    { card: 'marcas50', from: 0.55, to: 0.7 },
    { card: 'marcas', from: 0.7, to: 4.6 },
    { card: 'marcas50', from: 4.6, to: 4.75 },
    { card: 'scrimTop', from: 2.3, to: 5.5 },
    { card: 'scrimBottom', from: 2.3, to: 5.5 },
    { card: 'hook', from: 2.4, to: 5.5 },
    { card: 'sub', from: 3.4, to: 5.5 },
    { card: 'scrimBottom', from: 6.8, to: 10.0 },
    { card: 'cta', from: 8.0, to: 10.0 },
  ],
  qa: [0.3, 0.9, 1.85, 2.2, 3.0, 4.2, 5.2, 5.7, 6.4, 7.4, 8.6, 9.8, 10.2, 11.0],
};

// cutdown 6 s (placements curtos): cenas 1–3, CTA aos 4,0 s sobre o render do drone; sem par do chão, sem card (slate)
const ad = {
  slug: '2026-09-04-reel-drone-nada-sai-do-lugar-ad',
  segments: [still(D + 'p1-antes.jpg', 2.3), still(D + 'p1-depois.jpg', 4.6)],
  transitions: [{ type: 'wiperight', dur: 0.9, ruler: true }],
  cards,
  overlays: [
    { card: 'faixas', from: 0, to: 6.0 },
    { card: 'marcas50', from: 0.55, to: 0.7 },
    { card: 'marcas', from: 0.7, to: 6.0 },
    { card: 'scrimTop', from: 2.3, to: 6.0 },
    { card: 'scrimBottom', from: 2.3, to: 6.0 },
    { card: 'hook', from: 2.4, to: 6.0 },
    { card: 'cta', from: 4.0, to: 6.0 },
  ],
  qa: [0.9, 1.85, 3.0, 4.8, 5.8],
};

await writeFile(OUT + organico.slug + '/spec-src.json', JSON.stringify(organico, null, 2), 'utf8');
await writeFile(OUT + ad.slug + '/spec-src.json', JSON.stringify(ad, null, 2), 'utf8');
console.log('specs escritos');

/** Gera spec-src.json (orgânico 12 s) e spec-ad-src.json (pago 9 s) para o reel-spec.mjs. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = import.meta.dirname;
const BED = (m) => join(OUT, `bed-${m}.mp4`).split(String.fromCharCode(92)).join('/');
const logo = readFileSync(join(OUT, '../../brand/spacenode-logo-horizontal.svg'), 'utf8')
  .replace("font-family=\"Geist, 'Geist Sans', -apple-system, sans-serif\"", 'font-family="GeistLocal"');

// Caixa da imagem: y 320–1602. Texto só dentro da zona segura (220–1600) e sempre sobre scrim próprio.
const css = `
.r9-scrim-top { position:absolute; left:0; right:0; top:0; height:700px;
  background: linear-gradient(180deg, rgba(26,26,26,0.94) 0%, rgba(26,26,26,0.90) 36%, rgba(26,26,26,0.62) 62%, rgba(26,26,26,0) 100%); }
.r9-scrim-bottom { position:absolute; left:0; right:0; bottom:0; height:700px;
  background: linear-gradient(0deg, rgba(26,26,26,0.94) 0%, rgba(26,26,26,0.90) 34%, rgba(26,26,26,0.70) 64%, rgba(26,26,26,0) 100%); }
.r9-hook { position:absolute; left:60px; width:960px; top:372px; text-align:center; text-wrap:balance;
  font-size:60px; font-weight:500; line-height:1.12; letter-spacing:-0.035em; color:#f5f5f7; }
.r9-sub { position:absolute; left:80px; width:920px; bottom:392px; text-align:center; }
.r9-sub .payoff { display:block; margin-top:26px; font-size:42px; font-weight:400; line-height:1.3; letter-spacing:-0.02em; color:#f5f5f7; text-wrap:balance; }
.r9-sub .payoff .dim { color:#c7c7cc; }
/* QA 2026-09-04: o eyebrow cinza do kit (#a1a1a6) desaparecia sobre a água clara da piscina. */
.r9-sub .eyebrow { color:#f5f5f7; }
.r9-sub .eyebrow i { background: rgba(255,255,255,0.42); }
.r9-close { position:absolute; left:0; right:0; top:352px; display:flex; flex-direction:column; align-items:center; gap:30px; }
.r9-close svg { width:340px; height:auto; margin-bottom:10px; }
.r9-close .cta { display:inline-flex; align-items:center; gap:18px; padding:24px 46px; border-radius:999px;
  background:#f5f5f7; color:#1a1a1a; font-size:36px; font-weight:500; letter-spacing:-0.01em; }
.r9-close .micro { font-size:24px; font-weight:400; letter-spacing:0.01em; color:#c7c7cc; }
`;

const eyebrow = (t) => `<span class="eyebrow"><i></i>${t}<i></i></span>`;
const cards = {
  hook: { layout: 'html', css, body: `<div class="r9-scrim-top"></div><div class="r9-hook">um print. uma imagem. um vídeo.</div>` },
  apoio: { layout: 'html', css, body: `<div class="r9-scrim-bottom"></div><div class="r9-sub">${eyebrow('render')}<span class="payoff">piscina, deck e espreguiçadeiras<br><span class="dim">onde você desenhou.</span></span></div>` },
  fecho: { layout: 'html', css, body: `<div class="r9-scrim-top"></div><div class="r9-close">${logo}<div class="cta">Comece grátis<span>→</span></div><div class="micro">80 nodes grátis · sem cartão · em português</div></div>` },
};

const organico = {
  slug: '2026-09-04-reel-print-render-video-piscina',
  segments: [{ type: 'video', src: BED('organico'), dur: 12.0, fit: 'cover' }],
  transitions: [],
  cards,
  overlays: [
    { card: 'hook', from: 0, to: 4.0 },
    { card: 'apoio', from: 4.2, to: 5.58 },
    { card: 'fecho', from: 9.0, to: 12.0 },
  ],
  qa: [0.6, 2.4, 2.9, 3.8, 4.9, 5.55, 5.8, 7.5, 9.5, 11.5],
};

const ad = {
  slug: '2026-09-04-reel-print-render-video-piscina-ad',
  segments: [
    { type: 'video', src: BED('ad'), dur: 7.4, fit: 'cover' },
    { type: 'card', card: 'final', dur: 2.0 },
  ],
  transitions: [{ type: 'fade', dur: 0.4 }],
  cards: {
    hook: cards.hook,
    agua: { layout: 'html', css, body: `<div class="r9-scrim-bottom"></div><div class="r9-sub">${eyebrow('animar')}<span class="payoff">a água se mexe.<br><span class="dim">o projeto, não.</span></span></div>` },
    final: { layout: 'final', cta: 'Comece grátis' },
  },
  overlays: [
    { card: 'hook', from: 0, to: 3.2 },
    { card: 'agua', from: 3.9, to: 7.0 },
  ],
  qa: [0.6, 1.8, 2.9, 3.35, 3.6, 5.5, 6.9, 8.2],
};

writeFileSync(join(OUT, 'spec-src.json'), JSON.stringify(organico, null, 2));
writeFileSync(join(OUT, 'spec-ad-src.json'), JSON.stringify(ad, null, 2));
console.log('ok');

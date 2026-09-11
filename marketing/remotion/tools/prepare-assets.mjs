// Monta public/assets a partir do material real já existente no repo/saída.
// Não gera nada por IA. Reexecutável; sobrescreve.
//
//   node marketing/remotion/tools/prepare-assets.mjs
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ffmpeg } from '../../scripts/lib/tools.mjs';

const HERE = resolve(import.meta.dirname, '..');
const REPO = resolve(HERE, '../..');
const P = join(HERE, 'public/assets');
mkdirSync(P, { recursive: true });

const need = (p) => {
  if (!existsSync(p)) throw new Error(`fonte ausente: ${p}`);
  return p;
};

// 1. Par principal (landing) — ampliado 2x com Lanczos só para o recorte 9:16 não sair mole.
for (const side of ['base', 'render']) {
  await ffmpeg([
    '-i', need(join(REPO, `public/proj-cozinha-ceramica-${side}.jpg`)),
    '-vf', 'scale=3200:1690:flags=lanczos,unsharp=5:5:0.4:5:5:0', '-q:v', '2',
    join(P, `cozinha-${side}-2x.jpg`),
  ]);
}

// 2. Plugin real (07/09): viewport, estados mascarados do painel e o time-lapse.
const PLUG = join(REPO, 'marketing/output/2026-09-07-reel-plugin-no-sketchup/src');
for (const f of ['su-43-center.png', 'su-169-center.png', 'gerando-timelapse-sem-saldo.mp4']) copyFileSync(need(join(PLUG, f)), join(P, f));
for (const f of ['panel-00-estado-inicial', 'panel-01-apos-capturar', 'panel-07-fotografia', 'panel-11-resultado-novo', 'panel-12-comparar2-100', 'panel-13-comparar2-050', 'panel-14-comparar2-000']) {
  copyFileSync(need(join(PLUG, 'masked', `${f}.png`)), join(P, `${f}.png`));
}
// Par da sala (renders.input_url / output_url da geração de716672), reduzido a 2400 de largura.
await ffmpeg(['-i', need(join(PLUG, 'sala-de71-antes.png')), '-vf', 'scale=2400:-1:flags=lanczos', '-q:v', '2', join(P, 'sala-base.jpg')]);
await ffmpeg(['-i', need(join(PLUG, 'sala-de71-depois.png')), '-vf', 'scale=2400:-1:flags=lanczos', '-q:v', '2', join(P, 'sala-render.jpg')]);

// 3. Site publicado em Glass Mode (marketing/scripts/produto/capturar-glass.mjs) — só o topo da
//    página mobile (hero → projetos → diferenciais); o PNG inteiro tem 25k px de altura.
const SITE = join(REPO, 'marketing/output/2026-09-11-campanha/src/site');
await ffmpeg(['-i', need(join(SITE, 'mobile-landing-full.png')), '-vf', 'crop=1290:6600:0:0', join(P, 'site-mobile-top.png')]);
copyFileSync(need(join(SITE, 'mobile-sketchup-hero.png')), join(P, 'site-mobile-sketchup.png'));

// 4. App logado em Glass Mode a 900x1400 @2x, já mascarado (mascarar.mjs + mascaras-app-vert.json).
const APP = join(REPO, 'marketing/output/2026-09-11-campanha-app-vert-tutoriais/src');
copyFileSync(need(join(APP, 'renderizar/masked/02-referencia-carregada.png')), join(P, 'app-renderizar.png'));
copyFileSync(need(join(APP, 'spaces/masked/01-lista.png')), join(P, 'app-spaces.png'));

console.log('ok:', P);

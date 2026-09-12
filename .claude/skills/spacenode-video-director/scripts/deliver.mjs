#!/usr/bin/env node
/**
 * deliver.mjs — monta a pasta de entrega de uma peça.
 *
 * Cria marketing/output/<slug>/ com QA.md (os 5 blocos de references/qa.md já
 * em forma de checklist), caption.txt e cópia do plano + ledger. Não renderiza
 * nada e não sobrescreve o que já existe sem --force.
 *
 * Uso:
 *   node deliver.mjs <plan.json> [--force] [--json]
 */

import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadPlan, planHash, validate } from './lib/plan.mjs';

const argv = process.argv.slice(2);
const force = argv.includes('--force');
const json = argv.includes('--json');
const planPath = argv.find((a) => !a.startsWith('--'));

if (!planPath || argv.includes('--help') || argv.includes('-h')) {
  console.log('uso: node deliver.mjs <plan.json> [--force] [--json]');
  process.exit(planPath ? 0 : 2);
}

const { plan, dir, repo } = loadPlan(planPath);
const { errors } = validate(plan);
if (errors.length) {
  console.error('RECUSADO — plano inválido. Rode plan-lint.mjs:\n');
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(2);
}

const outDir = join(repo, 'marketing', 'output', plan.slug);
mkdirSync(outDir, { recursive: true });

const created = [];
const skipped = [];

function put(name, content) {
  const target = join(outDir, name);
  if (existsSync(target) && !force) {
    skipped.push(name);
    return;
  }
  writeFileSync(target, content, 'utf8');
  created.push(name);
}

const shots = plan.shots || [];
const paid = shots.filter((s) => s.generate);
const fmt = plan.format || {};

const check = (items) => items.map((i) => `- [ ] ${i}`).join('\n');

const qa = `# QA — ${plan.slug}

Plano: \`${planPath}\`  ·  hash \`${planHash(plan)}\`
Formato alvo: ${fmt.width}x${fmt.height} · ${fmt.fps ?? 30}fps · ${plan.duration}s
Shots: ${shots.length} (${paid.length} pago${paid.length === 1 ? '' : 's'})
Tipo: ${plan.kind || 'organic'}

> Um QA que não olhou a imagem não aconteceu. Extraia os frames, abra os PNGs
> com a ferramenta Read, e só então marque. Descrever o que "deveria" estar lá
> não substitui ver.

## Container

\`\`\`
ffprobe -v error -show_entries stream=width,height,r_frame_rate,pix_fmt \\
        -show_entries format=duration -of default=nw=1 <peca>.mp4
\`\`\`

Esperado: ${fmt.width}x${fmt.height} · ${fmt.fps ?? 30}/1 · yuv420p · ${plan.duration}s

- [ ] ffprobe roda e bate com o esperado

## 1. ARQUITETURA (fatal reprova o take)

${check([
  'geometria preservada do primeiro ao último frame',
  'mobiliário preservado — nada nasceu, nada sumiu',
  'materiais preservados — madeira continua madeira',
  'esquadrias, batentes e rodapés íntegros',
  'linhas retas longas continuam retas (junção piso/parede, peitoril)',
  'perspectiva coerente — linhas de fuga ainda convergem',
  'sem morphing, sem "respiração", sem texture swim',
  'sem hallucination (objeto que não existe no projeto)',
])}

## 2. VÍDEO

${check([
  'consistência temporal dentro do take',
  'movimento de câmera suave, sem solavanco',
  'sem artefato de compressão visível',
  'sem ghosting de interpolação',
  'sem flash claro no corte (erro mais comum em xfade)',
  'a banda fica alinhada durante o wipe',
  'primeiro frame é uma boa thumbnail',
])}

## 3. DESIGN

${check([
  'tipografia Geist, pesos corretos',
  'alinhamento e hierarquia — uma ideia por tela',
  'zona segura: nada acima de y=220 nem abaixo de y=1600',
  'verde só na palavra marcada — no máximo uma por card',
  'logo presente, monocromático, no card final',
  'consistência visual entre shots',
  'texto legível sobre a imagem (scrim onde precisa)',
  'sem emoji dentro da arte',
])}

## 4. PERFORMANCE${plan.kind === 'paid' ? ' (obrigatório — peça paga)' : ' (recomendado)'}

${check([
  'o hook é claro nos primeiros 2 segundos',
  'o benefício é compreensível com o som desligado',
  'o CTA é claro',
  'o pacing segura — nada parado por mais de 3s',
  'funciona para quem nunca ouviu falar da SpaceNode',
])}

## 5. MARCA

${check([
  'parece SpaceNode: premium, arquitetônico, tecnológico, minimal',
  'nenhum item da lista de proibições do brand.md',
  'voz certa — "nodes" e não "créditos", sem hype de IA',
  'nenhum dado do produto desatualizado (preço, plano, nodes)',
  'LEI 3: todo output do produto mostrado saiu da SpaceNode de verdade',
])}

## Frames olhados

| arquivo | segundo | veredito |
|---|---|---|
|  |  |  |

## Correções aplicadas

-
`;

const hashtags = '#arquitetura #sketchup #render #arquiteturaeinteriores #projetoarquitetonico';
const caption = `${plan.hook || '<hook>'}

${plan.concept || ''}

${plan.cta || 'Teste grátis no link da bio'}

${hashtags}
`;

put('QA.md', qa);
put('caption.txt', caption);

// cópias do que gerou a peça
for (const [src, name] of [[planPath, 'plan.json'], [join(dir, 'ledger.json'), 'ledger.json']]) {
  if (!existsSync(src)) continue;
  const target = join(outDir, name);
  if (existsSync(target) && !force) { skipped.push(name); continue; }
  copyFileSync(src, target);
  created.push(name);
}

if (json) {
  console.log(JSON.stringify({ outDir, created, skipped }, null, 2));
} else {
  console.log(`\nENTREGA — ${plan.slug}`);
  console.log('='.repeat(72));
  console.log(`  pasta     ${outDir}`);
  if (created.length) console.log(`  criados   ${created.join(', ')}`);
  if (skipped.length) console.log(`  mantidos  ${skipped.join(', ')}   (use --force pra sobrescrever)`);
  console.log('\n  Falta colocar aqui: o(s) .mp4 final(is).');
  console.log('  marketing/output/ está no .gitignore — o artefato versionável é o');
  console.log('  plan.json em marketing/specs/, não o mp4.\n');
}

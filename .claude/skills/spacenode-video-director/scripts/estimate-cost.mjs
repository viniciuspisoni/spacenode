#!/usr/bin/env node
/**
 * estimate-cost.mjs — estimativa de custo de geração antes do portão de aprovação.
 *
 * Consulta `genmedia pricing <endpoint> --json` AO VIVO (comando gratuito) e aplica
 * a unidade de cobrança correta. Não gera nada, não gasta crédito.
 *
 * Dois modos:
 *
 *   1) A PARTIR DO PLANO (preferido — sem redigitar shot list):
 *        node estimate-cost.mjs --plan marketing/specs/<slug>/plan.json --brl 5.40
 *
 *   2) Shots avulsos (exploração rápida, antes de existir plano):
 *        node estimate-cost.mjs \
 *          --shot "id=s01,endpoint=fal-ai/kling-video/v3/pro/image-to-video,seconds=5" \
 *          --shot "id=capa,endpoint=fal-ai/nano-banana-pro/edit,images=1" \
 *          --takes 2
 *
 * Campos do --shot (separados por vírgula, sem espaço):
 *   id, endpoint (obrigatório), seconds, res, aspect, fps, images, count, takes
 *
 * Flags:
 *   --plan P    lê os shots pagos de um plan.json (imprime também o HASH do plano)
 *   --takes N   tentativas esperadas por shot (default 2)
 *   --brl R     cotação para mostrar o total em reais (ex.: --brl 5.40)
 *   --json      saída estruturada
 */

import { estimate } from './lib/pricing.mjs';
import { loadPlan, planHash, shotsToEstimate, validate } from './lib/plan.mjs';

function parseShot(raw) {
  const shot = {};
  for (const pair of raw.split(',')) {
    const idx = pair.indexOf('=');
    if (idx === -1) throw new Error(`campo sem "=" em --shot: ${pair}`);
    shot[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  if (!shot.endpoint) throw new Error(`--shot sem endpoint: ${raw}`);
  return shot;
}

function parseArgs(argv) {
  const out = { shots: [], takes: 2, brl: null, json: false, plan: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--shot') out.shots.push(parseShot(argv[++i]));
    else if (a === '--plan') out.plan = argv[++i];
    else if (a === '--takes') out.takes = Number(argv[++i]);
    else if (a === '--brl') out.brl = Number(argv[++i]);
    else if (a === '--json') out.json = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else throw new Error(`flag desconhecida: ${a}`);
  }
  return out;
}

const HELP = [
  'estimate-cost.mjs — estimativa de custo (nao gera nada)',
  '',
  'a partir do plano (preferido):',
  '  node estimate-cost.mjs --plan marketing/specs/<slug>/plan.json [--brl 5.40] [--json]',
  '',
  'shots avulsos:',
  '  node estimate-cost.mjs --shot "id=s01,endpoint=<id>,seconds=5,res=720p,aspect=9x16" [--shot ...]',
  '                        [--takes 2] [--brl 5.40] [--json]',
  '',
  'campos do shot: id, endpoint, seconds, res, aspect, fps, images, count, takes',
].join('\n');

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`erro: ${err.message}\n`);
    process.exit(2);
  }

  if (args.help || (args.shots.length === 0 && !args.plan)) {
    console.log(HELP);
    process.exit(args.help ? 0 : 2);
  }

  let shots = args.shots;
  let takes = args.takes;
  let planInfo = null;

  if (args.plan) {
    const { plan } = loadPlan(args.plan);
    const { errors } = validate(plan);
    if (errors.length) {
      console.error('plano INVÁLIDO — rode plan-lint.mjs antes de estimar:\n');
      for (const e of errors) console.error(`  - ${e}`);
      process.exit(2);
    }
    shots = [...shotsToEstimate(plan), ...args.shots];
    takes = plan.takes ?? args.takes;
    planInfo = { slug: plan.slug, hash: planHash(plan), duration: plan.duration, kind: plan.kind };

    if (shots.length === 0) {
      const payload = {
        plan: planInfo, rows: [], total_usd: 0, incomplete: false, warnings: [], takes,
      };
      if (args.json) console.log(JSON.stringify(payload, null, 2));
      else {
        console.log(`\nPlano ${plan.slug} — nenhum shot pago.`);
        console.log('TOTAL ESTIMADO: US$ 0,00  (peça inteira em reel-kit / captura real)');
        console.log(`Hash do plano: ${planInfo.hash}\n`);
      }
      return;
    }
  }

  const { rows, total, incomplete, warnings } = await estimate(shots, takes);

  if (args.json) {
    console.log(JSON.stringify(
      { plan: planInfo, rows, total_usd: total, incomplete, warnings, takes }, null, 2,
    ));
    return;
  }

  console.log('\nESTIMATIVA DE CUSTO DE GERAÇÃO');
  console.log('='.repeat(72));
  if (planInfo) {
    console.log(`  plano     ${planInfo.slug}  (${planInfo.kind || 'organic'}, ${planInfo.duration}s)`);
    console.log(`  hash      ${planInfo.hash}`);
  }
  for (const r of rows) {
    console.log(`\n  ${r.id}`);
    console.log(`    endpoint  ${r.endpoint}`);
    if (r.unit) console.log(`    preço     ${r.unit}`);
    if (r.basis) console.log(`    base      ${r.basis}`);
    console.log(`    chamadas  ${r.calls}  (count x takes)`);
    if (typeof r.cost === 'number') {
      console.log(`    subtotal  US$ ${r.cost.toFixed(4)}  (US$ ${r.unitCost.toFixed(4)} por chamada)`);
    } else {
      console.log(`    subtotal  ??? — ${r.note}`);
    }
  }
  console.log('\n' + '='.repeat(72));
  const label = incomplete ? 'TOTAL PARCIAL (há itens sem preço calculável)' : 'TOTAL ESTIMADO';
  console.log(`  ${label}: US$ ${total.toFixed(2)}`);
  if (args.brl) console.log(`  ~ R$ ${(total * args.brl).toFixed(2)}  (cotação ${args.brl})`);
  console.log(`  tentativas assumidas por shot: ${takes}`);
  if (warnings.length) {
    console.log('\n  AVISOS:');
    for (const w of warnings) console.log(`   - ${w}`);
  }
  console.log('\n  Preços consultados ao vivo em genmedia pricing. Nada foi gerado.');
  if (planInfo) {
    console.log(`  Apresente este número ao dono. Depois do "pode gerar":`);
    console.log(`    node run-plan.mjs <plano> --approve ${planInfo.hash}`);
  } else {
    console.log('  Apresente este número ao dono e aguarde aprovação explícita.');
  }
  console.log('');
}

main().catch((err) => {
  console.error(`falhou: ${err.message}`);
  process.exit(1);
});

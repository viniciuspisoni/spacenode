#!/usr/bin/env node
/**
 * run-plan.mjs — executa as gerações PAGAS de um plano aprovado. LEI 2, mecânica.
 *
 * Duas travas independentes, as duas obrigatórias pra gastar:
 *
 *   1) --approve <hash>   o hash tem que bater com o do plano NESTE momento.
 *                         O hash cobre só o material de geração (endpoint, inputs,
 *                         duração, resolução, takes). Editar um prompt ou trocar
 *                         de endpoint muda o hash e ANULA a aprovação anterior.
 *   2) --execute          sem ela o script é dry-run: imprime o comando exato de
 *                         cada chamada e não gasta um centavo.
 *
 * Mais um freio: teto de 1,2x a estimativa. Estourou, para na hora (LEI 2).
 *
 * O ledger registra o custo COMPUTADO com o preço vigente no momento da chamada.
 * Não é fatura da fal — é a mesma conta do estimador, aplicada ao que rodou.
 *
 * Uso:
 *   node run-plan.mjs <plan.json> --approve <hash>              # dry-run
 *   node run-plan.mjs <plan.json> --approve <hash> --execute    # gasta
 *   node run-plan.mjs <plan.json> --approve <hash> --shot s01_hero --execute
 */

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { loadPlan, planHash, shotsToEstimate, validate } from './lib/plan.mjs';
import { costOf, estimate, priceOf } from './lib/pricing.mjs';

const exec = promisify(execFile);
const CEILING_FACTOR = 1.2;
const POLL_MS = 6000;
const POLL_MAX = 150; // 15 min por take

function parseArgs(argv) {
  const out = { plan: null, approve: null, execute: false, shot: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--approve') out.approve = argv[++i];
    else if (a === '--shot') out.shot = argv[++i];
    else if (a === '--execute') out.execute = true;
    else if (a === '--json') out.json = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a.startsWith('--')) throw new Error(`flag desconhecida: ${a}`);
    else out.plan = a;
  }
  return out;
}

const HELP = [
  'run-plan.mjs — executa as gerações pagas de um plano APROVADO',
  '',
  '  node run-plan.mjs <plan.json> --approve <hash>             # dry-run (não gasta)',
  '  node run-plan.mjs <plan.json> --approve <hash> --execute   # gasta de verdade',
  '',
  'flags: --shot <id>  roda só um shot     --json  saída estruturada',
  '',
  'O hash sai de plan-lint.mjs ou estimate-cost.mjs --plan.',
].join('\n');

/** Serializa um valor de input pro formato de flag do genmedia. */
function flagsFor(key, value) {
  if (Array.isArray(value)) return value.flatMap((v) => [`--${key}`, String(v)]);
  if (value && typeof value === 'object') return [`--${key}`, JSON.stringify(value)];
  return [`--${key}`, String(value)];
}

const uploadCache = new Map();

async function uploadSource(path) {
  if (uploadCache.has(path)) return uploadCache.get(path);
  const { stdout } = await exec('genmedia', ['upload', path, '--json'], { maxBuffer: 8 * 1024 * 1024 });
  const url = JSON.parse(stdout)?.url;
  if (!url) throw new Error(`upload não devolveu url para ${path}`);
  uploadCache.set(path, url);
  return url;
}

/** Troca "@source" pelo URL do CDN, em qualquer profundidade dos inputs. */
function resolveInputs(inputs, sourceUrl) {
  const walk = (v) => {
    if (typeof v === 'string') return v === '@source' ? sourceUrl : v.replaceAll('@source', sourceUrl ?? '@source');
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, walk(val)]));
    }
    return v;
  };
  return walk(inputs);
}

const DONE = new Set(['COMPLETED', 'OK', 'SUCCESS', 'SUCCEEDED', 'FINISHED']);
const PENDING = new Set(['IN_QUEUE', 'IN_PROGRESS', 'PENDING', 'RUNNING', 'QUEUED', 'SUBMITTED', 'PROCESSING']);

async function pollUntilDone(endpoint, requestId) {
  for (let i = 0; i < POLL_MAX; i++) {
    const { stdout } = await exec('genmedia', ['status', endpoint, requestId, '--json'], {
      maxBuffer: 8 * 1024 * 1024,
    });
    let parsed;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      throw new Error(`status devolveu JSON inválido: ${stdout.slice(0, 200)}`);
    }
    const raw = String(parsed.status ?? parsed.state ?? '').toUpperCase();
    if (DONE.has(raw)) return parsed;
    if (!PENDING.has(raw)) {
      throw new Error(`status inesperado "${raw || '(vazio)'}" — resposta: ${JSON.stringify(parsed).slice(0, 300)}`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error(`timeout: ${endpoint}/${requestId} não completou em ${(POLL_MS * POLL_MAX) / 60000} min`);
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`erro: ${err.message}\n`);
    process.exit(2);
  }

  if (args.help || !args.plan) {
    console.log(HELP);
    process.exit(args.help ? 0 : 2);
  }

  const { plan, dir } = loadPlan(args.plan);

  // --- trava 0: o plano precisa ser válido ---
  const { errors } = validate(plan);
  if (errors.length) {
    console.error('RECUSADO — plano inválido. Rode plan-lint.mjs:\n');
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(2);
  }

  // --- trava 1: hash de aprovação ---
  const hash = planHash(plan);
  if (!args.approve) {
    console.error(`RECUSADO — falta --approve.\n\n  hash atual do plano: ${hash}\n`);
    console.error('  Só passe esse hash depois de um "pode gerar" explícito do dono,');
    console.error('  com o custo estimado na frente dele.\n');
    process.exit(2);
  }
  if (args.approve !== hash) {
    console.error('RECUSADO — o plano mudou depois da aprovação.\n');
    console.error(`  aprovado:  ${args.approve}`);
    console.error(`  atual:     ${hash}\n`);
    console.error('  Alguma coisa que custa dinheiro mudou (endpoint, prompt, duração,');
    console.error('  resolução ou takes). Volte ao portão de custo com o plano novo.\n');
    process.exit(2);
  }

  let paid = (plan.shots || []).filter((s) => s.generate);
  if (args.shot) {
    paid = paid.filter((s) => s.id === args.shot);
    if (!paid.length) {
      console.error(`RECUSADO — shot "${args.shot}" não existe ou não é pago neste plano.`);
      process.exit(2);
    }
  }

  if (!paid.length) {
    console.log('Nenhum shot pago neste plano. Nada a gerar — pode montar direto.');
    return;
  }

  // --- orçamento ---
  const est = await estimate(shotsToEstimate(plan), plan.takes ?? 2);
  const ceiling = est.total * CEILING_FACTOR;

  const takesDir = join(dir, 'takes');
  const ledgerPath = join(dir, 'ledger.json');
  const ledger = existsSync(ledgerPath)
    ? JSON.parse(readFileSync(ledgerPath, 'utf8'))
    : { plan: plan.slug, hash, estimate_usd: est.total, ceiling_usd: ceiling, calls: [], spent_usd: 0 };

  ledger.hash = hash;
  ledger.estimate_usd = est.total;
  ledger.ceiling_usd = ceiling;

  const mode = args.execute ? 'EXECUÇÃO (gasta dinheiro)' : 'DRY-RUN (não gasta nada)';
  console.log(`\nRUN PLAN — ${plan.slug}`);
  console.log('='.repeat(72));
  console.log(`  modo        ${mode}`);
  console.log(`  hash        ${hash}  (aprovado)`);
  console.log(`  shots pagos ${paid.length}`);
  console.log(`  estimativa  US$ ${est.total.toFixed(2)}`);
  console.log(`  teto (1,2x) US$ ${ceiling.toFixed(2)}`);
  if (ledger.spent_usd > 0) console.log(`  já gasto    US$ ${ledger.spent_usd.toFixed(2)} (ledger anterior)`);
  if (est.incomplete) {
    console.log('\n  AVISO: há shot sem preço calculável — o teto não cobre a peça inteira.');
    for (const w of est.warnings) console.log(`   ! ${w}`);
  }
  console.log('');

  if (args.execute) mkdirSync(takesDir, { recursive: true });

  const defaultTakes = plan.takes ?? 2;

  for (const shot of paid) {
    const g = shot.generate;
    const takes = Number(g.takes ?? defaultTakes);
    // preço é consulta grátis — vale também no dry-run, pra o custo aparecer antes de gastar
    const price = await priceOf(g.endpoint).catch(() => null);
    const per = price
      ? costOf({ ...g, aspect: g.aspect ?? plan.format?.aspect }, price)
      : { error: `sem preço para ${g.endpoint}` };

    for (let take = 1; take <= takes; take++) {
      const callCost = typeof per.cost === 'number' ? per.cost : null;

      // --- freio de 20% ---
      if (callCost != null && ledger.spent_usd + callCost > ceiling) {
        console.log('\n' + '='.repeat(72));
        console.log('  PARADA — o teto de 1,2x a estimativa seria estourado.');
        console.log(`  gasto até aqui US$ ${ledger.spent_usd.toFixed(2)} + US$ ${callCost.toFixed(2)} > US$ ${ceiling.toFixed(2)}`);
        console.log('  Reporte ao dono antes de continuar (LEI 2).');
        console.log('='.repeat(72) + '\n');
        writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
        process.exit(3);
      }

      let sourceUrl = null;
      const usesSource = JSON.stringify(g.inputs).includes('@source');

      if (usesSource && args.execute) sourceUrl = await uploadSource(shot.source);

      const inputs = resolveInputs(g.inputs, sourceUrl ?? '<URL-DO-UPLOAD>');
      const runArgs = [
        'run', g.endpoint,
        ...Object.entries(inputs).flatMap(([k, v]) => flagsFor(k, v)),
        '--async', '--json',
      ];

      const label = `${shot.id} take ${take}/${takes}`;
      console.log(`  ${label}`);
      console.log(`    custo/chamada  ${callCost != null ? `US$ ${callCost.toFixed(4)}` : '??? (unidade não calculável)'}`);
      if (per.basis) console.log(`    base           ${per.basis}`);
      // aspas no que tem espaço: a linha impressa tem que ser copiável pro terminal
      const shown = runArgs.map((a) => (/[\s"]/.test(a) ? JSON.stringify(a) : a)).join(' ');
      console.log(`    comando        genmedia ${shown}`);

      if (!args.execute) {
        console.log('    → dry-run, nada enviado\n');
        continue;
      }

      const entry = {
        shot: shot.id, take, endpoint: g.endpoint,
        cost_usd: callCost, basis: per.basis ?? null,
        status: 'submitting', at: new Date().toISOString(),
      };
      ledger.calls.push(entry);
      writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2)); // grava ANTES: crash deixa rastro

      try {
        const { stdout } = await exec('genmedia', runArgs, { maxBuffer: 16 * 1024 * 1024 });
        const submitted = JSON.parse(stdout);
        const requestId = submitted.request_id;
        const endpoint = submitted.endpoint_id || g.endpoint;
        entry.request_id = requestId;
        entry.status = 'queued';
        console.log(`    request_id     ${requestId}`);

        await pollUntilDone(endpoint, requestId);

        const template = join(takesDir, `${shot.id}_t${take}_{index}.{ext}`);
        const { stdout: dl } = await exec(
          'genmedia',
          ['status', endpoint, requestId, '--result', `--download=${template}`, '--json'],
          { maxBuffer: 64 * 1024 * 1024 },
        );
        let files = [];
        try {
          const res = JSON.parse(dl);
          files = res.downloaded || res.files || res.paths || [];
        } catch { /* download ok, json ruidoso */ }

        entry.status = 'completed';
        entry.files = files;
        if (callCost != null) ledger.spent_usd += callCost;
        console.log(`    ✓ baixado em   ${takesDir}`);
        console.log(`    gasto acumul.  US$ ${ledger.spent_usd.toFixed(2)}\n`);
      } catch (err) {
        entry.status = 'failed';
        entry.error = err.message;
        // 5xx não é cobrado; 422 é. Não debita o que não sabemos ter sido cobrado.
        console.log(`    ✗ FALHOU: ${err.message}\n`);
      }

      writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
    }
  }

  if (args.execute) {
    writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
    console.log('='.repeat(72));
    console.log(`  gasto total (computado)  US$ ${ledger.spent_usd.toFixed(2)}  de US$ ${est.total.toFixed(2)} estimados`);
    console.log(`  ledger                   ${ledgerPath}`);
    console.log(`  takes                    ${takesDir}`);
    console.log('\n  Próximo passo: QA de fidelidade NOS TAKES CRUS, antes de montar.');
    console.log('  Extraia frames e OLHE (references/qa.md, bloco ARQUITETURA).\n');
  } else {
    console.log('='.repeat(72));
    console.log('  DRY-RUN — nada foi enviado, nada foi cobrado.');
    console.log('  Confira cada comando acima contra `genmedia schema <endpoint> --json`');
    console.log('  (um 422 por campo errado É cobrado). Depois rode com --execute.\n');
  }
}

main().catch((err) => {
  console.error(`falhou: ${err.message}`);
  process.exit(1);
});

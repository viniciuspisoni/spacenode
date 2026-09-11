#!/usr/bin/env node
/**
 * plan-lint.mjs — valida um plan.json contra as regras de plan-schema.md.
 *
 * Checa mecanicamente o que antes dependia de o agente lembrar:
 *   - nenhum "source" inventado (confere no disco, com $ACERVO/$REPO expandidos)
 *   - a soma das durações bate com "duration", sem buraco nem sobreposição
 *   - "model" explícito em TODO shot, inclusive os grátis
 *   - coerência entre model e o bloco generate
 *   - regras de hook/CTA quando a peça é paga
 *
 * Não gera nada, não consulta preço, não custa nada.
 *
 * Uso:
 *   node plan-lint.mjs marketing/specs/<slug>/plan.json [--json]
 */

import { loadPlan, planHash, validate } from './lib/plan.mjs';

const argv = process.argv.slice(2);
const json = argv.includes('--json');
const planPath = argv.find((a) => !a.startsWith('--'));

if (!planPath || argv.includes('--help') || argv.includes('-h')) {
  console.log('uso: node plan-lint.mjs <plan.json> [--json]');
  process.exit(planPath ? 0 : 2);
}

let plan;
try {
  ({ plan } = loadPlan(planPath));
} catch (err) {
  if (json) console.log(JSON.stringify({ ok: false, errors: [err.message], warnings: [] }, null, 2));
  else console.error(`erro: ${err.message}`);
  process.exit(2);
}

const { errors, warnings } = validate(plan);
const hash = planHash(plan);
const paid = (plan.shots || []).filter((s) => s.generate);
const ok = errors.length === 0;

if (json) {
  console.log(JSON.stringify({
    ok,
    slug: plan.slug,
    hash,
    duration: plan.duration,
    shots: (plan.shots || []).length,
    paid_shots: paid.length,
    errors,
    warnings,
  }, null, 2));
  process.exit(ok ? 0 : 1);
}

console.log(`\nPLAN LINT — ${plan.slug || '(sem slug)'}`);
console.log('='.repeat(72));
console.log(`  duração     ${plan.duration ?? '?'}s`);
console.log(`  shots       ${(plan.shots || []).length}  (${paid.length} pago${paid.length === 1 ? '' : 's'})`);
console.log(`  montagem    ${plan.assembly?.kit || '(não declarada)'}`);
console.log(`  hash        ${hash}`);

if (errors.length) {
  console.log(`\n  ERROS (${errors.length}) — bloqueiam geração:`);
  for (const e of errors) console.log(`   ✗ ${e}`);
}
if (warnings.length) {
  console.log(`\n  AVISOS (${warnings.length}):`);
  for (const w of warnings) console.log(`   ! ${w}`);
}

console.log('\n' + '='.repeat(72));
if (ok) {
  console.log('  PLANO VÁLIDO.');
  if (paid.length) {
    console.log('  Próximo passo — estimar o custo antes de pedir aprovação:');
    console.log(`    node estimate-cost.mjs --plan ${planPath} --brl 5.40`);
  } else {
    console.log('  Nenhum shot pago: custo US$ 0,00. Pode montar direto.');
  }
} else {
  console.log('  PLANO INVÁLIDO — corrija os erros acima. Nada pode ser gerado.');
}
console.log('');

process.exit(ok ? 0 : 1);

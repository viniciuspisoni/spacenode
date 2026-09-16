#!/usr/bin/env node
/**
 * test-plan.mjs — prova que o validador REPROVA o que tem que reprovar.
 *
 * Um validador que nunca reprovou não foi testado. Cada caso mutila o plano de
 * exemplo de um jeito diferente e exige pelo menos um erro. Também trava a
 * semântica do hash, que é o que faz a LEI 2 valer.
 *
 * Não gera nada, não consulta preço, não custa nada.
 *
 *   node scripts/test-plan.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expand, planHash, validate } from './lib/plan.mjs';

const EXAMPLE = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'plan.example.json');
const base = () => JSON.parse(expand(readFileSync(EXAMPLE, 'utf8')));

const cases = [
  ['source inventado', (p) => { p.shots[0].source = '/caminho/que/nao/existe.jpg'; }],
  ['buraco na timeline', (p) => { p.shots[1].start = 4; }],
  ['duração não soma', (p) => { p.duration = 15; }],
  ['model ausente', (p) => { delete p.shots[0].model; }],
  ['endpoint sem generate', (p) => { delete p.shots[2].generate; }],
  ['model e generate.endpoint divergem', (p) => { p.shots[2].generate.endpoint = 'fal-ai/outro/coisa'; }],
  ['generate sem seconds nem images', (p) => { delete p.shots[2].generate.seconds; }],
  ['@source sem source', (p) => { delete p.shots[2].source; }],
  ['id duplicado', (p) => { p.shots[1].id = p.shots[0].id; }],
  ['inputs vazio', (p) => { p.shots[2].generate.inputs = {}; }],
  ['primeiro shot não começa em 0', (p) => { p.shots[0].start = 1; }],
  ['kit de montagem inválido', (p) => { p.assembly.kit = 'premiere'; }],
  // os dois que o próprio pipeline pegou quando foi testado:
  ['seconds diverge de inputs.duration', (p) => { p.shots[2].generate.seconds = 4; }],
  ['take não preenche o corte', (p) => {
    p.shots[2].generate.seconds = 2;
    p.shots[2].generate.inputs.duration = '2';
  }],
];

let failures = 0;

// o exemplo tem que passar limpo, senão os casos negativos não provam nada
const { errors: baseErrors } = validate(base());
if (baseErrors.length) {
  console.log('FALHA  o plano de exemplo deveria passar limpo:');
  for (const e of baseErrors) console.log(`         ${e}`);
  failures++;
} else {
  console.log('OK     plano de exemplo passa limpo');
}
console.log('');

for (const [name, mutate] of cases) {
  const p = base();
  mutate(p);
  const { errors } = validate(p);
  const caught = errors.length > 0;
  if (!caught) failures++;
  console.log(`${caught ? 'OK   ' : 'FALHA'}  ${name.padEnd(38)} ${caught ? errors[0].slice(0, 68) : '<<< NAO FOI PEGO >>>'}`);
}

// --- semântica do hash: é o que faz a LEI 2 valer ---
console.log('');
const a = base();
const prosa = base(); prosa.objective = 'outro objetivo qualquer';
const prompt = base(); prompt.shots[2].generate.inputs.prompt = 'prompt diferente';
const takes = base(); takes.shots[2].generate.takes = 3;

const hashChecks = [
  ['editar prosa NAO invalida aprovacao', planHash(a) === planHash(prosa)],
  ['editar prompt INVALIDA aprovacao', planHash(a) !== planHash(prompt)],
  ['mudar takes INVALIDA aprovacao', planHash(a) !== planHash(takes)],
];
for (const [name, ok] of hashChecks) {
  if (!ok) failures++;
  console.log(`${ok ? 'OK   ' : 'FALHA'}  ${name}`);
}

const total = 1 + cases.length + hashChecks.length;
console.log(`\n${total - failures}/${total} checks`);
process.exit(failures === 0 ? 0 : 1);

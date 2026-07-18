#!/usr/bin/env node
// scripts/smoke-nodi-v2.mjs
//
// SMOKE PAGO do orquestrador Nodi V2 com Gemini REAL (function calling).
// Valida o loop de verdade: contexto → modelo → tools server-side → resposta,
// com os limites/breaker de produção. Sem visão (custo ~zero: 2 cenários de
// texto no gemini-2.5-flash ≈ < US$0,01) e SEM dados reais de usuário — o
// userId é sintético, então toda query eq(user_id) volta vazia.
//
// SEGURANÇA DE CUSTO: por padrão DRY-RUN (imprime o pré-voo e sai).
//   node --import ./scripts/_qa-alias-register.mjs scripts/smoke-nodi-v2.mjs --approve-paid-call
//
// Requer: GEMINI_API_KEY no .env.local (a mesma do DNA/briefing).

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const ROOT = path.resolve(import.meta.dirname, '..')
const APPROVED = process.argv.includes('--approve-paid-call')

function loadEnvLocal() {
  const p = path.join(ROOT, '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m || line.trim().startsWith('#')) continue
    let val = m[2]
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!(m[1] in process.env)) process.env[m[1]] = val
  }
}

loadEnvLocal()

// Flags da V2 SÓ neste processo (não toca .env.local): texto-apenas.
process.env.NODI_ENABLED = '1'
process.env.NODI_V2_ENABLED = '1'
process.env.NODI_INTERNAL_USERS_ONLY = '0'
process.env.NODI_MULTIMODAL_ENABLED = '0'
process.env.NODI_PROJECT_MEMORY_ENABLED = '0'
process.env.NODI_SUPERVISED_ACTIONS_ENABLED = '1'

const SCENARIOS = [
  {
    name: 'consulta técnica (engines + custo)',
    route: '/app/generate',
    message: 'Estou com um print do meu modelo. Qual motor uso para entrega final em 4K e quanto custa por imagem?',
    expect: (a) => a.usage?.toolCalls?.length > 0 && /vega/i.test(a.text) && /40/.test(a.text),
  },
  {
    name: 'ação supervisionada (pré-voo de geração)',
    route: '/app/generate',
    message: 'Prepara uma geração no Vega em 4K com luz de fim de tarde suave. Pode deixar pronto pra eu confirmar.',
    // Duas saídas coerentes (o user sintético tem saldo 0): propor o pré-voo
    // com custo 40 + risco de saldo, OU recusar com honestidade citando custo
    // e saldo. As duas provam que o agente consultou custo/saldo e decidiu.
    expect: (a) =>
      ((a.proposals?.some(p => p.type === 'start_generation' && p.preflight?.estimatedNodes === 40)) ?? false) ||
      (/40/.test(a.text) && /(saldo|nodes)/i.test(a.text)),
  },
]

console.log('── Smoke Nodi V2 (orquestrador + Gemini real) ─────────────────────')
console.log(`modelo: ${process.env.NODI_V2_MODEL ?? 'gemini-2.5-flash'} · cenários: ${SCENARIOS.length} · custo estimado: < US$0,01`)
for (const s of SCENARIOS) console.log(`  · ${s.name} — "${s.message.slice(0, 60)}…"`)

if (!APPROVED) {
  console.log('\nDRY-RUN: nada foi chamado. Para executar de verdade:')
  console.log('  node --import ./scripts/_qa-alias-register.mjs scripts/smoke-nodi-v2.mjs --approve-paid-call')
  process.exit(0)
}
if (!process.env.GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY ausente no .env.local — abortando.')
  process.exit(1)
}

const { runNodiV2 } = await import('@/lib/nodi/v2/orchestrator')
const { createAdminClient } = await import('@/lib/supabase/admin')
const { capabilitiesFor } = await import('@/lib/nodi/v2/flags')

const admin = createAdminClient()
const fakeUserId = randomUUID() // sintético: nenhuma linha real casa com eq(user_id)
let failures = 0

for (const scenario of SCENARIOS) {
  console.log(`\n▶ ${scenario.name}`)
  const started = Date.now()
  const answer = await runNodiV2({
    supabase: admin, // no smoke o "client do usuário" é o admin com userId sintético (0 linhas)
    admin,
    userId: fakeUserId,
    route: scenario.route,
    message: scenario.message,
    history: [],
    attachment: null,
    capabilities: capabilitiesFor(true),
  })
  if (!answer) {
    failures++
    console.error('  ✗ orquestrador devolveu null (fallback) — ver logs acima')
    continue
  }
  const ok = scenario.expect(answer)
  console.log(`  texto: ${answer.text.slice(0, 160)}${answer.text.length > 160 ? '…' : ''}`)
  console.log(`  tools: [${answer.usage?.toolCalls.join(', ')}] · tokens in/out: ${answer.usage?.inputTokens}/${answer.usage?.outputTokens} · ${Date.now() - started}ms`)
  if (answer.proposals?.length) {
    for (const p of answer.proposals) {
      console.log(`  proposta: ${p.type} · custo ${p.preflight?.estimatedNodes ?? '—'} nodes · riscos: ${p.preflight?.risks.length ?? 0}`)
    }
  }
  console.log(ok ? '  ✓ expectativa atendida' : '  ✗ expectativa NÃO atendida')
  if (!ok) failures++
}

console.log(`\n${failures === 0 ? '✓ SMOKE OK' : `✗ SMOKE com ${failures} falha(s)`}`)
process.exit(failures === 0 ? 0 : 1)

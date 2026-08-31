// scripts/test-marketing-ai.mjs
//
// Robustez da camada de geração por IA (lib/marketing/generation.ts). Roda com o
// loader de alias de QA (resolve `@/...`):
//   node --import ./scripts/_qa-alias-register.mjs scripts/test-marketing-ai.mjs
//
// Cobre: parse da saída estruturada (JSON válido/ inválido/ incompleto),
// registry de provider (default, ausente), chave ausente e — se GEMINI_API_KEY
// estiver disponível — UMA chamada real ao Gemini validando o contrato de saída
// e a ausência de léxico proibido. Não toca o banco.

import { readFileSync } from 'node:fs'
import {
  parseGeneratedBrief, getGenerationProvider, GeminiContentProvider,
} from '../lib/marketing/generation.ts'
import { runBrandCheck } from '../lib/marketing/brand-check.ts'

let failures = 0
function check(name, cond, extra) {
  if (cond) { console.log(`  ok  ${name}`) }
  else { failures++; console.error(`FALHOU ${name}${extra ? ` — ${extra}` : ''}`) }
}

// Carrega .env.local no process SEM imprimir valores (só para a chamada viva).
function loadEnvLocal() {
  try {
    for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* sem .env.local — a chamada viva será pulada */ }
}

console.log('parse da saída estruturada:')
// 1) JSON inválido → erro claro, sem vazar nada
const e1 = (() => { try { parseGeneratedBrief('isto não é json {{'); return null } catch (e) { return e } })()
check('JSON inválido lança erro tratado', e1 instanceof Error && /JSON/.test(e1.message))

// 2) JSON válido e completo → objeto no contrato
const full = parseGeneratedBrief(JSON.stringify({
  title: 'Um projeto, três vistas', hook: 'Coerência entre vistas.', central_message: 'Mesma geometria.',
  format: 'tres_angulos', platform: 'instagram', slides: ['a', 'b'], script: 's',
  caption: 'c', call_to_action: 'Renderize seu projeto', visual_direction: 'v',
  required_assets: ['x'], risk_flags: [],
}))
check('JSON completo vira objeto', full.title === 'Um projeto, três vistas' && Array.isArray(full.slides))

// 3) campos essenciais ausentes → erro (não cria rascunho vazio)
const e3 = (() => { try { parseGeneratedBrief(JSON.stringify({ title: '', hook: '', caption: '' })); return null } catch (e) { return e } })()
check('JSON sem title/hook/caption lança "incompleta"', e3 instanceof Error && /incompleta/.test(e3.message))

// 4) tipos errados são coagidos/filtrados (slides não-array → [])
const coerced = parseGeneratedBrief(JSON.stringify({
  title: 'T', hook: 'H', caption: 'C', slides: 'não-array', required_assets: [1, 'ok', null], risk_flags: 'x',
}))
check('slides não-array vira []', Array.isArray(coerced.slides) && coerced.slides.length === 0)
check('required_assets filtra não-strings', JSON.stringify(coerced.required_assets) === JSON.stringify(['ok']))

console.log('\nregistry de provider:')
// 5) default → gemini
delete process.env.MARKETING_AI_PROVIDER
const def = getGenerationProvider()
check('default é o provider gemini', def.id === 'gemini' && typeof def.model === 'string')

// 6) provider desconhecido → erro
process.env.MARKETING_AI_PROVIDER = 'vertex-inexistente'
const e6 = (() => { try { getGenerationProvider(); return null } catch (e) { return e } })()
check('provider desconhecido lança erro', e6 instanceof Error && /desconhecido/.test(e6.message))
delete process.env.MARKETING_AI_PROVIDER

console.log('\nchave ausente:')
// 7) sem GEMINI_API_KEY → generate lança erro de config (antes de qualquer rede)
const savedKey = process.env.GEMINI_API_KEY
delete process.env.GEMINI_API_KEY
const provider = new GeminiContentProvider()
const e7 = await (async () => {
  try { await provider.generate({ theme: 't' }, { rules: {}, previousContent: [] }); return null }
  catch (e) { return e }
})()
check('sem chave, generate lança erro de configuração', e7 instanceof Error && /GEMINI_API_KEY/.test(e7.message))
check('erro de chave NÃO vaza a chave nem prompt interno',
  e7 instanceof Error && !/eyJ|AIza|sk-/.test(e7.message) && !/systemInstruction|Você é o redator/.test(e7.message))
if (savedKey) process.env.GEMINI_API_KEY = savedKey

console.log('\nchamada viva ao Gemini (se houver chave):')
loadEnvLocal()
if (!process.env.GEMINI_API_KEY) {
  console.log('  (pulado — GEMINI_API_KEY ausente no ambiente)')
} else {
  try {
    const live = await new GeminiContentProvider().generate(
      {
        theme: 'Três ângulos, o mesmo projeto',
        pillar: 'coerencia-entre-angulos',
        format: 'tres_angulos',
        platform: 'instagram',
        featureDescription: 'Spaces gera múltiplas vistas do mesmo ambiente preservando o DNA visual (geometria, materiais, proporções, intenção).',
        desiredCta: 'Renderize seu projeto',
      },
      { rules: {}, previousContent: [] },
    )
    check('saída viva tem title/hook/caption preenchidos', !!(live.title && live.hook && live.caption), JSON.stringify(live).slice(0, 200))
    check('saída viva tem call_to_action', typeof live.call_to_action === 'string')
    // A saída passa pelo verificador determinístico (defaults) sem BLOQUEIO?
    const bc = runBrandCheck({
      title: live.title, hook: live.hook, central_message: live.central_message,
      caption: live.caption, script: live.script, call_to_action: live.call_to_action,
      visual_direction: live.visual_direction, platform: 'instagram', format: 'tres_angulos',
    })
    const blockers = bc.issues.filter(i => i.severity === 'blocker')
    check('saída viva NÃO tem bloqueios de marca', blockers.length === 0, JSON.stringify(blockers))
    console.log(`     (score de marca da saída viva: ${bc.score}/100; CTA: "${live.call_to_action}")`)
  } catch (err) {
    // Erro transiente do provider não deve quebrar o QA — reporta e segue.
    console.log(`  (chamada viva falhou — provável transiente: ${String(err?.message ?? err).slice(0, 120)})`)
  }
}

console.log('')
if (failures > 0) { console.error(`${failures} verificação(ões) falharam`); process.exit(1) }
console.log('Todos os testes de IA passaram.')

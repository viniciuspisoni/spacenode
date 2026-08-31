// scripts/test-marketing-brand-check.mjs
//
// Smoke test do verificador de marca (lib/marketing/brand-check.ts — módulo
// auto-contido, sem dependências). Roda com Node ≥ 22.6 (type stripping):
//   node scripts/test-marketing-brand-check.mjs
// Sem framework de teste no repo (convenção scripts/test-*.mjs). Zero rede,
// zero banco — só a lógica pura do checker.

import { runBrandCheck, DEFAULT_BRAND_RULES, toBrandCheckRules } from '../lib/marketing/brand-check.ts'

let failures = 0
function check(name, cond, extra) {
  if (cond) {
    console.log(`  ok  ${name}`)
  } else {
    failures++
    console.error(`FALHOU ${name}${extra ? ` — ${extra}` : ''}`)
  }
}

// ── Caso 1: peça dentro da marca deve aprovar ──────────────────────────────────
const good = runBrandCheck({
  title: 'Linhas de fuga no lugar',
  hook: 'O render preserva a perspectiva do seu projeto — a régua confirma.',
  central_message: 'Geometria, proporção e perspectiva preservadas no render final.',
  caption: [
    'O render preserva a perspectiva do seu projeto — a régua confirma.',
    '',
    'Mesmo projeto, mesmo ponto de fuga. O pé-direito continua o que você especificou.',
    'Renderize seu projeto.',
    '#arquitetura #archviz #visualizacaoarquitetonica',
  ].join('\n'),
  call_to_action: 'Renderize seu projeto',
  visual_direction: 'Antes/depois do mesmo living com linhas de fuga sobrepostas em traço fino.',
})
check('peça correta aprova', good.approved, JSON.stringify(good.issues))
check('peça correta com score alto', good.score >= 80, `score=${good.score}`)

// ── Caso 2: léxico proibido bloqueia ──────────────────────────────────────────
const banned = runBrandCheck({
  title: 'IA revolucionária para renders incríveis',
  hook: 'Transforme suas ideias em renderizações incríveis com inteligência artificial.',
  caption: 'A mágica da IA a serviço da arquitetura 🚀',
  call_to_action: 'Comece agora',
})
check('léxico proibido reprova', !banned.approved)
check('detecta palavra proibida', banned.issues.some(i => i.code === 'prohibited_lexicon'))
check('detecta frase-molde', banned.issues.some(i => i.code === 'prohibited_phrase'))
check('detecta emoji proibido', banned.issues.some(i => i.code === 'prohibited_emoji'))
check('só issues com severidade válida', banned.issues.every(i => i.severity === 'blocker' || i.severity === 'warning'))

// ── Caso 3: claim falso bloqueia ───────────────────────────────────────────────
const claim = runBrandCheck({
  title: 'Importe direto do SketchUp',
  hook: 'Importação direta do seu modelo, sem sair do SketchUp.',
  call_to_action: 'Comece grátis',
})
check('claim falso reprova', !claim.approved)
check('detecta claim falso', claim.issues.some(i => i.code === 'false_claim'))

// ── Caso 4: CTA fora da lista bloqueia ────────────────────────────────────────
const cta = runBrandCheck({
  title: 'Render com fidelidade geométrica',
  hook: 'Perspectiva preservada no render.',
  call_to_action: 'Clique já e aproveite',
})
check('CTA não aprovado reprova', cta.issues.some(i => i.code === 'cta_not_approved' && i.severity === 'blocker'))

// ── Caso 5: gancho longo bloqueia; promessas sem prova avisam ─────────────────
const long = runBrandCheck({
  title: 'Render fiel',
  hook: 'x'.repeat(130),
  caption: 'Dobre suas aprovações: 90% mais rápido, garantido.',
  call_to_action: 'Comece agora',
})
check('gancho >125 chars bloqueia', long.issues.some(i => i.code === 'hook_too_long'))
check('promessa sem prova avisa', long.issues.some(i => i.code === 'unproven_promise'))

// ── Caso 6: módulo desativado bloqueia ────────────────────────────────────────
const mod = runBrandCheck({
  title: 'Prancha IA no seu fluxo',
  hook: 'Monte a prancha do projeto com o módulo Prancha IA.',
  call_to_action: 'Comece agora',
})
check('módulo desativado bloqueia', mod.issues.some(i => i.code === 'disabled_module'))

// ── Caso 7: mensagem abstrata avisa; risco de repetição avisa ─────────────────
const vague = runBrandCheck({
  title: 'Uma nova forma de trabalhar',
  hook: 'Descubra uma nova forma de trabalhar todos os dias com mais qualidade.',
  caption: 'Uma solução completa para o seu dia a dia ficar melhor e mais organizado.',
  call_to_action: 'Comece agora',
  similar_titles: ['Uma nova forma de trabalhar (v1)'],
})
check('mensagem abstrata avisa', vague.issues.some(i => i.code === 'no_concrete_message'))
check('repetição avisa', vague.issues.some(i => i.code === 'repetition_risk'))

// ── Caso 7b: excesso de adjetivos de hype → aviso ─────────────────────────────
const adjs = runBrandCheck({
  title: 'Render perfeito e impressionante',
  hook: 'Um resultado perfeito, impressionante e deslumbrante para seu projeto.',
  central_message: 'Qualidade extraordinária e maravilhosa em cada render.',
  call_to_action: 'Comece agora',
})
check('excesso de adjetivos avisa', adjs.issues.some(i => i.code === 'adjective_excess'))

// ── Caso 7c: texto genérico de "IA" como assunto → aviso ──────────────────────
const aiGeneric = runBrandCheck({
  title: 'A IA que projeta por você',
  hook: 'A inteligência artificial que cria o render com um clique.',
  central_message: 'Deixe a IA trabalhar: a IA entende e a IA resolve o seu projeto.',
  caption: 'Nossa IA faz tudo. A melhor plataforma de IA para arquitetura.',
  call_to_action: 'Comece agora',
})
check('linguagem genérica avisa', aiGeneric.issues.some(i => i.code === 'generic_language'))
check('"IA" como assunto avisa', aiGeneric.issues.some(i => i.code === 'ai_as_subject'))

// ── Caso 7d: LIMITAÇÃO documentada — funcionalidade INVENTADA (não um módulo
//    desativado conhecido) NÃO é pega pelo verificador determinístico. É barrada
//    pelo prompt da geração + revisão humana. O teste fixa essa expectativa.
const invented = runBrandCheck({
  title: 'Novidade: renderização em realidade virtual imersiva',
  hook: 'Agora com exportação direta para óculos VR e tour holográfico.',
  central_message: 'Recurso que não existe no produto.',
  call_to_action: 'Comece agora',
})
check('LIMITAÇÃO: feature inventada NÃO gera bloqueio determinístico (só léxico/módulos-off são pegos)',
  !invented.issues.some(i => i.severity === 'blocker'))

// ── Caso 8: toBrandCheckRules — merge com defaults ────────────────────────────
const merged = toBrandCheckRules({
  prohibited_lexicon: { palavras: ['teste-proibido'] },
  copy_limits: { gancho_legenda_chars: 100 },
})
check('regras do banco substituem palavras', merged.prohibitedWords.length === 1 && merged.prohibitedWords[0] === 'teste-proibido')
check('limite do banco substitui default', merged.limits.hookChars === 100)
check('campo ausente cai no default', merged.approvedCtas.length === DEFAULT_BRAND_RULES.approvedCtas.length)
const custom = runBrandCheck({ title: 'Peça com teste-proibido', hook: 'ok', call_to_action: 'Comece agora' }, merged)
check('regra customizada é aplicada', custom.issues.some(i => i.code === 'prohibited_lexicon'))

// ── Resultado ──────────────────────────────────────────────────────────────────
console.log('')
if (failures > 0) {
  console.error(`${failures} verificação(ões) falharam`)
  process.exit(1)
}
console.log('Todos os casos passaram.')

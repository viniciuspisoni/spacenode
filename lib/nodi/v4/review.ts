// ── Nodi V4 — avaliação visual pós-geração e decisão de próximo passo ────────
//
// Após cada execução, a comparação original × resultado (visão) vira uma
// DECISÃO determinística: aprovar, editar localmente, melhorar, regenerar ou
// devolver ao usuário. Regra de ouro do produto: não regenerar a imagem
// inteira quando uma correção localizada resolve.

import { geminiMultiVisionJson } from '@/lib/gemini'
import { parseVisionReport } from '../v2/tools/vision-tools'
import type { AnalysisReport } from '../v2/types'

export type ReviewDecision = 'aprovar' | 'editar_local' | 'melhorar' | 'regenerar' | 'decidir'

export interface ReviewOutcome {
  decision: ReviewDecision
  reason: string
}

// dimensões estruturais (erro aqui compromete o projeto → regenerar)
const STRUCTURAL = /geometri|perspectiv|propor|escala|abertura|deforma|linhas de fuga/i
// dimensões locais (corrigíveis no Editar sem perder o resto)
const LOCAL = /materia|ilumina|sombra|reflexo|vegeta|mobili|artefato|textura|exposi/i

export function decideNextStep(report: AnalysisReport): ReviewOutcome {
  const problems = report.findings.filter(f => f.severity === 'problema')
  const warnings = report.findings.filter(f => f.severity === 'atencao')
  const structural = problems.filter(f => STRUCTURAL.test(f.dimension))
  const local = problems.filter(f => LOCAL.test(f.dimension) && !STRUCTURAL.test(f.dimension))

  if (structural.length && local.length) {
    return { decision: 'decidir', reason: 'Há problema estrutural E pontual — regenerar corrige tudo, mas descarta o que já está bom. Sua escolha.' }
  }
  if (structural.length || report.blame === 'entrada') {
    return { decision: 'regenerar', reason: `Problema estrutural (${structural[0]?.dimension ?? 'imagem de entrada'}) — correção localizada não resolve.` }
  }
  if (local.length) {
    return { decision: 'editar_local', reason: `Problema pontual em ${local.map(f => f.dimension).join(', ')} — o Editar corrige sem regenerar o resto.` }
  }
  if (warnings.length >= 2) {
    return { decision: 'melhorar', reason: 'Sem problemas, mas com pontos de atenção — vale um refino ou ampliação antes de apresentar.' }
  }
  return { decision: 'aprovar', reason: 'Fidelidade e qualidade dentro do esperado — pronta para o próximo passo.' }
}

const REVIEW_SCHEMA = `Responda JSON puro: {"resumo": string (≤2 frases), "culpa": "entrada"|"prompt"|"configuracao"|"engine"|"tecnica"|"nenhum", "achados": [{"dimensao": string, "gravidade": "ok"|"atencao"|"problema", "nota": string}], "preservado": string[], "alterado": string[], "veredito": string}`

/** Comparação original × resultado (1 chamada de visão). null em falha — a
 *  avaliação nunca derruba uma execução que deu certo. */
export async function runAutoReview(
  inputUrl: string,
  outputUrl: string,
  timeoutMs: number,
): Promise<{ report: AnalysisReport; outcome: ReviewOutcome } | null> {
  try {
    const raw = await geminiMultiVisionJson({
      system:
        'Avalie como um arquiteto sênior: a primeira imagem é o ORIGINAL (autoridade do projeto); a segunda é o RESULTADO gerado. ' +
        'Dimensões pertinentes: fidelidade geométrica, proporções e aberturas, perspectiva, enquadramento, iluminação e exposição, sombras e reflexos, materiais e escala de texturas, vegetação e mobiliário, deformações/artefatos, realismo, prontidão para apresentação a cliente. ' +
        'Aponte SÓ o que está visível.\n' + REVIEW_SCHEMA,
      user: 'Compare o original com o resultado e avalie a prontidão.',
      imageUrls: [inputUrl, outputUrl],
      temperature: 0.1,
      maxTokens: 1100,
      timeoutMs,
    })
    const report = parseVisionReport(raw, 'Avaliação automática (original × resultado)', true)
    return { report, outcome: decideNextStep(report) }
  } catch (err) {
    console.warn('[nodi-v4] auto-review falhou (não fatal):', (err as Error)?.message?.slice(0, 120))
    return null
  }
}

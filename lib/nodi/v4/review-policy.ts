import type { AnalysisReport, NodiReview } from '../v2/types'

export type ReviewDecision = 'aprovar' | 'editar_local' | 'melhorar' | 'regenerar' | 'decidir' | 'preparar_entrada'
export interface ReviewOutcome { decision: ReviewDecision; reason: string }

const STRUCTURAL = /fidelidade|geometri|perspectiv|propor|escala|abertura|deforma|linhas de fuga/i
const LOCAL = /materia|ilumina|sombra|reflexo|vegeta|mobili|artefato|textura|exposi/i

function structuralDimension(dimension: string): boolean {
  const label = dimension.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const withoutTextureScale = label.replace(/escala\s+(?:de\s+|das?\s+)?texturas?|texturas?\s+(?:e|em)\s+escala/gi, 'textura')
  return STRUCTURAL.test(withoutTextureScale)
}

export function decideNextStep(report: AnalysisReport): ReviewOutcome {
  if (!report.findings.length) {
    return { decision: 'decidir', reason: 'A avaliação não trouxe evidência suficiente. Revise o original e o resultado antes de decidir.' }
  }
  if (report.blame === 'entrada') {
    return { decision: 'preparar_entrada', reason: 'Confira enquadramento, perspectiva e legibilidade da entrada antes de gastar nodes em outra geração.' }
  }
  const problems = report.findings.filter(f => f.severity === 'problema')
  const warnings = report.findings.filter(f => f.severity === 'atencao')
  const structural = problems.filter(f => structuralDimension(f.dimension))
  const local = problems.filter(f => LOCAL.test(f.dimension) && !structuralDimension(f.dimension))
  const unknown = problems.filter(f => !structuralDimension(f.dimension) && !LOCAL.test(f.dimension))
  if (unknown.length || (structural.length && local.length)) {
    return { decision: 'decidir', reason: 'Há pontos que precisam da sua revisão. Compare com o projeto antes de escolher entre ajuste pontual e nova geração.' }
  }
  if (structural.length) {
    return { decision: 'regenerar', reason: `Foi identificado um problema em ${structural[0].dimension}. Confira a entrada e planeje uma nova versão com custo explícito.` }
  }
  if (local.length) {
    return { decision: 'editar_local', reason: `Priorize um ajuste pontual em ${local.map(f => f.dimension).join(', ')} para preservar o restante da imagem.` }
  }
  if (warnings.length) {
    return { decision: 'melhorar', reason: 'Confira os pontos de atenção e escolha um ajuste específico antes de apresentar; ampliar não corrige geometria ou materiais.' }
  }
  if (!report.findings.some(f => f.severity === 'ok' && structuralDimension(f.dimension))) {
    return { decision: 'decidir', reason: 'A fidelidade ao projeto ainda não foi confirmada pela análise. Compare original e resultado antes de apresentar.' }
  }
  return { decision: 'aprovar', reason: 'Não foram identificados problemas nos itens avaliados. A aprovação final e a apresentação continuam com você.' }
}

/** Identical, validated review envelope for automatic and requested comparisons. */
export function reviewSummary(report: AnalysisReport): NodiReview {
  const outcome = decideNextStep(report)
  return { summary: report.summary, ...outcome, findings: report.findings, comparison: report.comparison }
}

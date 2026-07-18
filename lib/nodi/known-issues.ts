// ── Problemas conhecidos ──────────────────────────────────────────────────────
//
// Mapeia o erro/status bruto de uma geração para uma explicação de produto na
// voz do Nodi: causa provável + o que tentar + prioridade sugerida se virar
// chamado. O texto BRUTO do provider nunca sai daqui pro usuário — só o id do
// problema e as mensagens curadas (mesma linha do /api/history/detail, que
// esconde generation_log/error_message de quem não é staff).
//
// Fonte das mensagens: strings reais das rotas (generate/edits/video) e do
// adapter Vertex. Ao criar um erro novo no produto, adicione o padrão aqui —
// tests/nodi/known-issues.test.ts cobre os principais.

import type { KnownIssue } from './types'

interface KnownIssuePattern extends KnownIssue {
  /** Padrões testados contra a mensagem de erro bruta (case-insensitive). */
  patterns: RegExp[]
}

const KNOWN_ISSUES: KnownIssuePattern[] = [
  {
    id: 'insufficient_balance',
    patterns: [/nodes? insuficientes?/i, /saldo insuficiente/i, /insufficient_balance/i],
    cause: 'A geração pedia mais nodes do que o saldo disponível na bolsa do pagador (em equipe, o saldo é o do dono do workspace).',
    suggestion: 'Confira o saldo no anel do avatar, na barra lateral. Dá para recarregar com Lumens ou ajustar o plano em Planos.',
    priority: 'low',
  },
  {
    id: 'timeout',
    patterns: [/demorou mais que o esperado/i, /timeout/i, /timed? ?out/i],
    cause: 'O motor de geração demorou além do limite — costuma ser instabilidade momentânea do provedor, não um problema do seu arquivo.',
    suggestion: 'Tente de novo em alguns minutos. Se a geração falhou depois de debitar, os nodes são estornados automaticamente.',
    priority: 'normal',
  },
  {
    id: 'rate_limit',
    patterns: [/limite de requisi/i, /rate.?limit/i, /\b429\b/],
    cause: 'Muitas requisições em sequência num intervalo curto.',
    suggestion: 'Aguarde alguns segundos e tente novamente.',
    priority: 'low',
  },
  {
    id: 'invalid_params',
    patterns: [/par[âa]metros inv[áa]lidos/i, /aspect ratio/i, /propor[çc][ãa]o/i, /\b422\b/],
    cause: 'A combinação enviada (motor, resolução ou proporção da imagem) não é aceita pelo motor selecionado.',
    suggestion: 'Ajuste a proporção ou a resolução e tente de novo. No Animar, a proporção da imagem precisa ficar entre 0.4 e 2.5.',
    priority: 'normal',
  },
  {
    id: 'content_policy',
    patterns: [/pol[íi]tica de conte[úu]do/i, /filtrou o v[íi]deo/i, /content.?policy/i, /\bsafety\b/i, /rai.?media.?filtered/i],
    cause: 'O filtro de conteúdo do provedor bloqueou o resultado — às vezes dispara por engano com pessoas, obras de arte ou reflexos na cena.',
    suggestion: 'Ajuste a imagem de entrada ou a direção criativa e tente novamente. Se a cena é claramente de arquitetura, vale registrar um chamado.',
    priority: 'normal',
  },
  {
    id: 'quality_gate_no_change',
    patterns: [/n[ãa]o produziu mudan[çc]a percept[íi]vel/i],
    cause: 'A edição rodou, mas o resultado não mudou de forma perceptível a área selecionada — o controle de qualidade descartou e você não foi cobrado.',
    suggestion: 'Descreva a mudança de forma mais direta ou amplie um pouco a seleção.',
    priority: 'low',
  },
  {
    id: 'quality_gate_not_preserved',
    patterns: [/n[ãa]o preservou bem a imagem/i, /rejected_quality_gate/i],
    cause: 'O resultado alterava partes da imagem fora da área pedida. O controle de qualidade descartou e você não foi cobrado.',
    suggestion: 'Tente de novo com uma seleção mais precisa; edições menores preservam melhor o restante da imagem.',
    priority: 'normal',
  },
  {
    id: 'mask_mismatch',
    patterns: [/sele[çc][ãa]o n[ãa]o corresponde/i, /mask.*mismatch/i],
    cause: 'A seleção foi feita sobre uma versão anterior da imagem — depois de uma edição, a seleção antiga deixa de valer.',
    suggestion: 'Refaça a seleção sobre a imagem atual e repita a edição.',
    priority: 'low',
  },
  {
    id: 'upload_too_large',
    patterns: [/imagem muito grande/i, /\b413\b/, /payload too large/i],
    cause: 'O arquivo passou do limite aceito no envio.',
    suggestion: 'Reduza a resolução ou exporte em JPG/WebP com menos peso e envie de novo.',
    priority: 'low',
  },
]

/** Tenta mapear um erro bruto (texto) + status para um problema conhecido. */
export function matchKnownIssue(
  rawError: string | null | undefined,
  status?: string | null,
): KnownIssue | null {
  const text = (rawError ?? '').trim()
  if (text) {
    for (const issue of KNOWN_ISSUES) {
      if (issue.patterns.some(p => p.test(text))) {
        return { id: issue.id, cause: issue.cause, suggestion: issue.suggestion, priority: issue.priority }
      }
    }
  }
  // Sem texto de erro: só o status. 'failed' sem causa mapeada → desconhecido
  // (null) — o fluxo oferece o chamado.
  void status
  return null
}

/** Lista dos ids conhecidos (telemetria/testes). */
export function knownIssueIds(): string[] {
  return KNOWN_ISSUES.map(i => i.id)
}

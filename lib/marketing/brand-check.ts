// lib/marketing/brand-check.ts
//
// Verificador de marca — validação automática de briefings ANTES da revisão
// humana (nunca no lugar dela). Analisa léxico proibido, linguagem genérica,
// promessas sem prova, excesso de adjetivos, concretude, posicionamento, CTA,
// limites de copy e risco de repetição, e devolve { approved, score, issues,
// suggestions }.
//
// PROPOSITALMENTE AUTO-CONTIDO (zero imports): roda em qualquer runtime JS —
// testável com `node` puro (scripts/test-marketing-brand-check.mjs) e portável
// para um nó de código do n8n na integração futura. As regras vêm da tabela
// marketing.brand_rules (via service.getBrandRules → toBrandCheckRules); os
// DEFAULTS abaixo espelham a seed e servem de fallback se o banco não
// responder. Fonte editorial: content-factory/brand-rules.md §2–4 +
// docs/marketing/prohibited-content.md.

export interface BrandCheckInput {
  title?: string | null
  hook?: string | null
  central_message?: string | null
  caption?: string | null
  script?: string | null
  call_to_action?: string | null
  visual_direction?: string | null
  platform?: string | null
  format?: string | null
  target_audience?: string | null
  /** Títulos de conteúdos anteriores similares (vindos de findSimilarContent). */
  similar_titles?: string[]
}

export interface BrandCheckRules {
  prohibitedWords: string[]
  prohibitedPhrases: string[]
  prohibitedEmojis: string[]
  falseClaims: string[]
  preferredWords: string[]
  approvedCtas: string[]
  disabledModules: string[]
  limits: {
    hookChars: number
    headlineWords: number
    hashtagsMin: number
    hashtagsMax: number
    adTitleChars: number
    adDescriptionChars: number
  }
}

export type IssueSeverity = 'blocker' | 'warning'

export interface BrandCheckIssue {
  severity: IssueSeverity
  /** Código estável para máquina: prohibited_lexicon, generic_language, … */
  code: string
  message: string
  field?: string
}

export interface BrandCheckResult {
  approved: boolean
  score: number
  issues: BrandCheckIssue[]
  suggestions: string[]
}

// ── Defaults (espelho da seed 20260713000001_marketing_seed.sql) ───────────────

export const DEFAULT_BRAND_RULES: BrandCheckRules = {
  prohibitedWords: [
    'revolucionário', 'revolucionaria', 'revolucionária', 'revolucionario',
    'incrível', 'incrivel', 'incríveis', 'incriveis',
    'mágico', 'magico', 'mágica', 'magica', 'magia',
    'alucinante', 'alucinantes',
    'transforme', 'transformador', 'transformadora', 'potencialize',
    'surreal', 'insano', 'insana', 'chocante', 'inacreditável', 'inacreditavel',
    'game changer', 'game-changer', 'disruptivo', 'disruptiva',
    'o futuro chegou', 'vai mudar tudo', 'segredo', 'hack', 'truque',
    'turbine', 'alavanque', 'desbloqueie', 'imperdível', 'imperdivel',
  ],
  prohibitedPhrases: [
    'transforme suas ideias', 'potencialize sua criatividade', 'eleve seus projetos',
    'tecnologia do futuro', 'resultados mágicos', 'resultados magicos',
    'deixe a ia criar por você', 'deixe a ia criar por voce',
  ],
  prohibitedEmojis: ['🚀', '🔥', '🤯', '✨'],
  falseClaims: [
    'importação direta', 'importacao direta', 'plugin do sketchup',
    'histórico de 30 dias', 'historico de 30 dias',
    'histórico ilimitado', 'historico ilimitado',
  ],
  preferredWords: [
    'fidelidade', 'geometria', 'proporção', 'proporcao', 'perspectiva',
    'linhas de fuga', 'ponto de fuga', 'pé-direito', 'pe-direito', 'planta',
    'corte', 'fachada', 'vista', 'prancha', 'escala', 'setorização', 'setorizacao',
    'especificação', 'especificacao', 'coerência', 'coerencia', 'prazo',
    'apresentação', 'apresentacao', 'controle', 'precisão', 'precisao',
    'iteração', 'iteracao', 'revisão', 'revisao', 'aprovação', 'aprovacao',
    'esquadria', 'render', 'projeto',
  ],
  approvedCtas: [
    'Renderize seu projeto',
    'Teste com um projeto real',
    'Comece agora',
    'Veja no seu próprio projeto',
    'Comece grátis',
  ],
  disabledModules: ['isométricas', 'isometricas', 'prancha ia', 'moodboard'],
  limits: {
    hookChars: 125,
    headlineWords: 8,
    hashtagsMin: 3,
    hashtagsMax: 5,
    adTitleChars: 40,
    adDescriptionChars: 30,
  },
}

// ── Padrões internos (heurísticas de qualidade, não configuráveis por banco) ───

/** Frases-molde de marketing genérico — a peça vira "qualquer SaaS". */
const GENERIC_PATTERNS = [
  'com um clique', 'em um clique', 'de forma simples e rápida', 'de forma rapida e facil',
  'não perca', 'nao perca', 'venha conhecer', 'confira já', 'confira ja',
  'a melhor plataforma', 'a melhor ferramenta', 'líder de mercado', 'lider de mercado',
  'número 1', 'numero 1', 'sem esforço', 'sem esforco', 'em segundos',
  'você não vai acreditar', 'voce nao vai acreditar', 'nunca foi tão fácil', 'nunca foi tao facil',
]

/** Promessas quantitativas/garantias — exigem dado real conferido antes. */
const UNPROVEN_PROMISE_RE = [
  /\b\d{1,3}\s*%/u,                       // "90% mais rápido"
  /\b\d+\s*x\s+(mais|menos)/iu,           // "10x mais rápido"
  /\bdobr\w+/iu,                          // dobre/dobra/dobrar
  /\btripliqu\w+|\btriplic\w+/iu,
  /\bgarantid\w+|\bgarantimos\b/iu,
  /\b(feche|ganhe)\s+mais\s+(clientes|contratos|projetos)\b/iu,
]

/** Adjetivos de hype — mais de 2 no texto todo = inflado. */
const HYPE_ADJECTIVES = [
  'perfeito', 'perfeita', 'espetacular', 'maravilhoso', 'maravilhosa',
  'fantástico', 'fantastico', 'fantástica', 'fantastica', 'sensacional',
  'extraordinário', 'extraordinario', 'extraordinária', 'extraordinaria',
  'impressionante', 'deslumbrante', 'infinito', 'infinita', 'ilimitado', 'ilimitada',
]

/** Campos de texto analisados, com label para as mensagens. */
const TEXT_FIELDS: Array<{ key: keyof BrandCheckInput; label: string }> = [
  { key: 'title',            label: 'título' },
  { key: 'hook',             label: 'gancho' },
  { key: 'central_message',  label: 'mensagem central' },
  { key: 'caption',          label: 'legenda' },
  { key: 'script',           label: 'roteiro' },
  { key: 'call_to_action',   label: 'CTA' },
  { key: 'visual_direction', label: 'direção visual' },
]

const BLOCKER_PENALTY = 25
const WARNING_PENALTY = 7
const MIN_APPROVED_SCORE = 80

// ── Helpers ────────────────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.toLowerCase().normalize('NFC')
}

/** Match por fronteira de palavra (unicode); termos com espaço viram busca de frase. */
function containsTerm(text: string, term: string): boolean {
  const t = norm(term)
  if (!t) return false
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  try {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'iu')
    return re.test(text)
  } catch {
    return text.includes(t)
  }
}

function words(text: string): string[] {
  return text.split(/[^\p{L}\p{N}-]+/u).filter(Boolean)
}

// ── Verificador ────────────────────────────────────────────────────────────────

export function runBrandCheck(
  input: BrandCheckInput,
  rules: BrandCheckRules = DEFAULT_BRAND_RULES,
): BrandCheckResult {
  const issues: BrandCheckIssue[] = []
  const suggestions: string[] = []

  const fields = TEXT_FIELDS
    .map(f => ({ ...f, raw: (input[f.key] as string | null | undefined) ?? '' }))
    .filter(f => f.raw.trim().length > 0)
    .map(f => ({ ...f, text: norm(f.raw) }))

  const allText = fields.map(f => f.text).join('\n')
  const allRaw = fields.map(f => f.raw).join('\n')

  // 1. Léxico proibido, frases-molde proibidas e claims falsos → BLOCKER
  for (const f of fields) {
    for (const word of rules.prohibitedWords) {
      if (containsTerm(f.text, word)) {
        issues.push({
          severity: 'blocker', code: 'prohibited_lexicon', field: f.label,
          message: `Palavra proibida "${word}" no campo ${f.label}.`,
        })
      }
    }
    for (const phrase of rules.prohibitedPhrases) {
      if (f.text.includes(norm(phrase))) {
        issues.push({
          severity: 'blocker', code: 'prohibited_phrase', field: f.label,
          message: `Frase-molde proibida "${phrase}" no campo ${f.label}.`,
        })
      }
    }
    for (const claim of rules.falseClaims) {
      if (f.text.includes(norm(claim))) {
        issues.push({
          severity: 'blocker', code: 'false_claim', field: f.label,
          message: `Claim falso/proibido "${claim}" no campo ${f.label} — ver docs/marketing/prohibited-content.md §2.`,
        })
      }
    }
  }
  if (issues.some(i => i.code === 'prohibited_lexicon' || i.code === 'prohibited_phrase')) {
    suggestions.push(
      'Troque o entusiasmo por especificidade: o que é preservado (geometria, proporção, perspectiva), quanto tempo se ganha, o que o cliente vê.',
    )
  }

  // 2. Emojis proibidos (qualquer campo) → BLOCKER
  for (const emoji of rules.prohibitedEmojis) {
    if (allRaw.includes(emoji)) {
      issues.push({
        severity: 'blocker', code: 'prohibited_emoji',
        message: `Emoji proibido ${emoji} — nunca usar, em nenhum contexto.`,
      })
    }
  }
  // Emoji em título/headline (qualquer emoji) → blocker (arte/headline não leva emoji)
  const titleRaw = input.title ?? ''
  if (/\p{Extended_Pictographic}/u.test(titleRaw)) {
    issues.push({
      severity: 'blocker', code: 'emoji_in_headline', field: 'título',
      message: 'Emoji em headline/título não é permitido (tolerado apenas pontual em legenda orgânica).',
    })
  }

  // 3. Módulos desativados → BLOCKER (não promover recurso off)
  for (const mod of rules.disabledModules) {
    if (containsTerm(allText, mod)) {
      issues.push({
        severity: 'blocker', code: 'disabled_module',
        message: `Módulo desativado citado ("${mod}") — só comunicar recursos ativos (conferir lib/nav/modules-config.ts).`,
      })
    }
  }

  // 4. CTA fora da lista aprovada → BLOCKER; ausente → WARNING
  const cta = (input.call_to_action ?? '').trim()
  if (cta) {
    const ok = rules.approvedCtas.some(a => norm(a) === norm(cta))
    if (!ok) {
      issues.push({
        severity: 'blocker', code: 'cta_not_approved', field: 'CTA',
        message: `CTA "${cta}" fora da lista aprovada.`,
      })
      suggestions.push(`Use um CTA aprovado: ${rules.approvedCtas.join(' · ')}.`)
    }
  } else {
    issues.push({
      severity: 'warning', code: 'cta_missing', field: 'CTA',
      message: 'Briefing sem CTA definido.',
    })
  }

  // 5. Limites de copy
  const hook = (input.hook ?? '').trim()
  if (hook.length > rules.limits.hookChars) {
    issues.push({
      severity: 'blocker', code: 'hook_too_long', field: 'gancho',
      message: `Gancho com ${hook.length} caracteres (máx. ${rules.limits.hookChars} — é o que aparece antes do "mais").`,
    })
  }
  const titleWords = words(titleRaw)
  if (titleWords.length > rules.limits.headlineWords) {
    issues.push({
      severity: 'warning', code: 'headline_too_long', field: 'título',
      message: `Título com ${titleWords.length} palavras — headline de arte pede no máximo ${rules.limits.headlineWords}.`,
    })
  }
  const caption = input.caption ?? ''
  const hashtags = caption.match(/#[\p{L}\p{N}_]+/gu) ?? []
  if (hashtags.length > 0) {
    if (hashtags.length < rules.limits.hashtagsMin || hashtags.length > rules.limits.hashtagsMax) {
      issues.push({
        severity: 'warning', code: 'hashtag_count', field: 'legenda',
        message: `${hashtags.length} hashtags — o padrão é ${rules.limits.hashtagsMin} a ${rules.limits.hashtagsMax}, técnicas, na última linha.`,
      })
    }
    const hypeTags = hashtags.filter(h =>
      /#(ai|ia|inteligenciaartificial|futuro|tech|love|instagood)$/iu.test(norm(h)),
    )
    if (hypeTags.length > 0) {
      issues.push({
        severity: 'warning', code: 'hashtag_hype', field: 'legenda',
        message: `Hashtag de hype/genérica (${hypeTags.join(', ')}) — usar hashtags técnicas de nicho.`,
      })
    }
  }

  // 6. Linguagem genérica de marketing → WARNING
  for (const pattern of GENERIC_PATTERNS) {
    if (allText.includes(norm(pattern))) {
      issues.push({
        severity: 'warning', code: 'generic_language',
        message: `Linguagem genérica de marketing: "${pattern}".`,
      })
    }
  }

  // 7. Promessas não comprovadas → WARNING (vira blocker na revisão se não houver dado)
  for (const re of UNPROVEN_PROMISE_RE) {
    const m = allRaw.match(re)
    if (m) {
      issues.push({
        severity: 'warning', code: 'unproven_promise',
        message: `Possível promessa/número sem prova: "${m[0]}" — conferir o dado real antes de aprovar (nunca inventar métrica).`,
      })
    }
  }

  // 8. Excesso de adjetivos de hype → WARNING
  const hypeCount = HYPE_ADJECTIVES.reduce(
    (acc, adj) => acc + (containsTerm(allText, adj) ? 1 : 0), 0,
  )
  if (hypeCount > 2) {
    issues.push({
      severity: 'warning', code: 'adjective_excess',
      message: `${hypeCount} adjetivos de hype no texto — a confiança vem da especificidade, não do entusiasmo.`,
    })
  }

  // 9. Ausência de mensagem concreta → WARNING
  //    Nenhum termo do vocabulário do ofício em gancho+mensagem+legenda = peça vaga.
  const coreText = norm([input.hook, input.central_message, input.caption, input.title].filter(Boolean).join('\n'))
  if (coreText.length > 40) {
    const concrete = rules.preferredWords.filter(w => containsTerm(coreText, w))
    if (concrete.length === 0) {
      issues.push({
        severity: 'warning', code: 'no_concrete_message',
        message: 'Nenhum termo específico do ofício (geometria, proporção, perspectiva, prazo…) — a mensagem está abstrata.',
      })
      suggestions.push('Ancore a peça em algo verificável: o que é preservado, o fluxo real na tela, o tempo medido.')
    }
  }

  // 10. Posicionamento: "IA" como assunto → WARNING
  const iaMentions = (allText.match(/(^|[^\p{L}])(ia|inteligência artificial|inteligencia artificial)([^\p{L}]|$)/giu) ?? []).length
  if (iaMentions > 2) {
    issues.push({
      severity: 'warning', code: 'ai_as_subject',
      message: `"IA" citada ${iaMentions} vezes — a tecnologia é meio; o assunto é o projeto do arquiteto (risco de soar gerador genérico).`,
    })
  }

  // 11. Público errado → WARNING ("para todos" ≠ arquitetos/designers)
  if (/\bpara\s+(todos|qualquer\s+pessoa|todo\s+mundo)\b/iu.test(allText)) {
    issues.push({
      severity: 'warning', code: 'audience_mismatch',
      message: 'Peça falando com "todos/qualquer pessoa" — o público é arquiteto/designer de interiores.',
    })
  }

  // 12. Risco de repetição (dados vindos do serviço de similaridade) → WARNING
  const similar = input.similar_titles ?? []
  if (similar.length > 0) {
    issues.push({
      severity: 'warning', code: 'repetition_risk',
      message: `Conteúdo semelhante já existe: ${similar.slice(0, 3).map(t => `"${t}"`).join(', ')} — variar ângulo, exemplo ou formato.`,
    })
  }

  // 13. Limites de anúncio quando a plataforma é mídia paga
  if ((input.platform ?? '') === 'meta_ads') {
    if (titleRaw.length > rules.limits.adTitleChars) {
      issues.push({
        severity: 'warning', code: 'ad_title_too_long', field: 'título',
        message: `Título com ${titleRaw.length} caracteres — anúncio Meta pede ≤${rules.limits.adTitleChars}.`,
      })
    }
  }

  // ── Score e veredito ─────────────────────────────────────────────────────────
  const blockers = issues.filter(i => i.severity === 'blocker').length
  const warnings = issues.filter(i => i.severity === 'warning').length
  const score = Math.max(0, 100 - blockers * BLOCKER_PENALTY - warnings * WARNING_PENALTY)
  const approved = blockers === 0 && score >= MIN_APPROVED_SCORE

  if (!approved && suggestions.length === 0) {
    suggestions.push('Revise os pontos apontados e rode a verificação de novo antes de enviar para revisão humana.')
  }

  return { approved, score, issues, suggestions }
}

/** Converte as linhas de marketing.brand_rules (key → value jsonb) para o shape
 *  do verificador, caindo nos defaults campo a campo quando a chave faltar. */
export function toBrandCheckRules(rows: Record<string, unknown>): BrandCheckRules {
  const d = DEFAULT_BRAND_RULES
  const lex = (rows['prohibited_lexicon'] ?? {}) as Record<string, unknown>
  const pref = (rows['preferred_lexicon'] ?? {}) as Record<string, unknown>
  const ctas = (rows['approved_ctas'] ?? {}) as Record<string, unknown>
  const limits = (rows['copy_limits'] ?? {}) as Record<string, unknown>
  const modules = (rows['safe_modules'] ?? {}) as Record<string, unknown>

  const strArr = (v: unknown, fallback: string[]): string[] =>
    Array.isArray(v) && v.every(x => typeof x === 'string') && v.length > 0 ? (v as string[]) : fallback
  const num = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback

  return {
    prohibitedWords: strArr(lex['palavras'], d.prohibitedWords),
    prohibitedPhrases: strArr(lex['frases'], d.prohibitedPhrases),
    prohibitedEmojis: strArr(lex['emojis'], d.prohibitedEmojis),
    falseClaims: strArr(lex['claims_falsos'], d.falseClaims),
    preferredWords: strArr(pref['palavras'], d.preferredWords),
    approvedCtas: strArr(ctas['organico'], d.approvedCtas),
    disabledModules: strArr(
      (modules['desativados_nao_promover'] as unknown[]),
      d.disabledModules,
    ).map(m => m.toLowerCase()),
    limits: {
      hookChars: num(limits['gancho_legenda_chars'], d.limits.hookChars),
      headlineWords: num(limits['headline_arte_palavras'], d.limits.headlineWords),
      hashtagsMin: num(limits['hashtags_min'], d.limits.hashtagsMin),
      hashtagsMax: num(limits['hashtags_max'], d.limits.hashtagsMax),
      adTitleChars: num(limits['titulo_anuncio_chars'], d.limits.adTitleChars),
      adDescriptionChars: num(limits['descricao_anuncio_chars'], d.limits.adDescriptionChars),
    },
  }
}

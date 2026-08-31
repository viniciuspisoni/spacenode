// lib/marketing/generation.ts
//
// Geração assistida de briefing por IA — camada PROVIDER-AGNÓSTICA.
//
// Desenho: ContentGenerationProvider é a interface; GeminiContentProvider é a
// implementação atual (reusa lib/gemini.ts — gemini-2.5-flash com JSON forçado
// e retry de transiente). Trocar/adicionar provider (Vertex etc.) = implementar
// a interface e registrar em PROVIDERS; a escolha vem de MARKETING_AI_PROVIDER
// (default: gemini). Nenhuma dependência rígida com um único modelo.
//
// Guard-rails (Etapa 6 do sprint):
//   • regras da marca (marketing.brand_rules) entram no prompt E a saída passa
//     pelo verificador determinístico (brand-check) — risk_flags agrega os dois;
//   • conteúdos anteriores entram no prompt para reduzir repetição;
//   • só módulos ativos podem ser citados; proibido inventar recurso, dado,
//     métrica ou depoimento — instruído no prompt e vigiado pelo verificador;
//   • saída estruturada validada campo a campo (parseGeneratedBrief);
//   • toda execução registra modelo, data, entrada e saída em automation_runs.
//
// A saída da IA entra SEMPRE como rascunho — nunca pula a revisão humana.

import type { SupabaseClient } from '@supabase/supabase-js'
import { geminiTextJson, GEMINI_MODEL } from '@/lib/gemini'
import { runBrandCheck, toBrandCheckRules, type BrandCheckResult } from './brand-check'
import { findSimilarContent, getBrandRules, listBriefs, recordAutomationRun } from './service'

// ── Contratos ──────────────────────────────────────────────────────────────────

export interface ContentGenerationInput {
  /** Tema/pauta da peça (obrigatório). */
  theme: string
  pillar?: string | null
  format?: string | null
  platform?: string | null
  objective?: string | null
  targetAudience?: string | null
  /** Descrição da funcionalidade/assunto — só o que existe de verdade. */
  featureDescription?: string | null
  /** CTA desejado (precisa estar na lista aprovada; senão o provider escolhe um aprovado). */
  desiredCta?: string | null
  /** Descrições das imagens disponíveis para a peça. */
  availableAssets?: string[]
  extraContext?: string | null
}

/** Shape estruturado exigido pelo sprint (Etapa 6). */
export interface GeneratedBriefContent {
  title: string
  hook: string
  central_message: string
  format: string
  platform: string
  slides: string[]
  script: string
  caption: string
  call_to_action: string
  visual_direction: string
  required_assets: string[]
  risk_flags: string[]
}

export interface ContentGenerationContext {
  /** Regras da marca (marketing.brand_rules: key → value). */
  rules: Record<string, unknown>
  /** Títulos/ganchos recentes — o provider deve evitar repetição. */
  previousContent: string[]
}

export interface ContentGenerationProvider {
  readonly id: string
  readonly model: string
  generate(input: ContentGenerationInput, ctx: ContentGenerationContext): Promise<GeneratedBriefContent>
}

// ── Validação da saída estruturada ─────────────────────────────────────────────

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string').map(s => s.trim()).filter(Boolean)
}

/** Valida/coage o JSON do modelo para o shape do contrato. Campos essenciais
 *  vazios = erro (o modelo devolveu algo fora do contrato — melhor falhar do
 *  que criar rascunho vazio). */
export function parseGeneratedBrief(raw: string): GeneratedBriefContent {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('A IA devolveu uma resposta fora do formato JSON esperado')
  }
  const o = (parsed ?? {}) as Record<string, unknown>

  const content: GeneratedBriefContent = {
    title: str(o.title),
    hook: str(o.hook),
    central_message: str(o.central_message),
    format: str(o.format),
    platform: str(o.platform),
    slides: strArray(o.slides),
    script: str(o.script),
    caption: str(o.caption),
    call_to_action: str(o.call_to_action),
    visual_direction: str(o.visual_direction),
    required_assets: strArray(o.required_assets),
    risk_flags: strArray(o.risk_flags),
  }

  if (!content.title || !content.hook || !content.caption) {
    throw new Error('Resposta da IA incompleta (title/hook/caption vazios) — tente novamente')
  }
  return content
}

// ── Provider: Gemini ───────────────────────────────────────────────────────────

function jsonBlock(v: unknown): string {
  try { return JSON.stringify(v, null, 1) } catch { return '{}' }
}

function buildSystemPrompt(rules: Record<string, unknown>): string {
  const voice = rules['voice'] ?? {}
  const prohibited = rules['prohibited_lexicon'] ?? {}
  const preferred = rules['preferred_lexicon'] ?? {}
  const ctas = rules['approved_ctas'] ?? {}
  const limits = rules['copy_limits'] ?? {}
  const modules = rules['safe_modules'] ?? {}

  return [
    'Você é o redator editorial do SpaceNode — plataforma brasileira de visualização arquitetônica com IA, criada por arquiteto para arquitetos e designers de interiores. Posicionamento: "Visualização arquitetônica que respeita seu projeto." Diferenciais: fidelidade ao projeto (geometria, proporções, perspectiva preservadas), coerência entre vistas, linguagem de arquiteto, produtividade sem tirar a autoria.',
    '',
    'VOZ (obrigatório seguir): ' + jsonBlock(voice),
    'LÉXICO PROIBIDO (nunca usar nenhum item): ' + jsonBlock(prohibited),
    'LÉXICO PREFERIDO (ancorar a peça nestes termos): ' + jsonBlock(preferred),
    'CTAs APROVADOS (call_to_action DEVE ser exatamente um destes): ' + jsonBlock(ctas),
    'LIMITES DE COPY (respeitar todos): ' + jsonBlock(limits),
    'MÓDULOS (só citar os ativos; NUNCA citar os desativados): ' + jsonBlock(modules),
    '',
    'REGRAS INEGOCIÁVEIS:',
    '1. Português brasileiro. Tom de arquiteto sênior falando com arquiteto: direto, técnico, específico, seco no bom sentido. Frases curtas, voz ativa.',
    '2. NUNCA inventar funcionalidade, dado, número, métrica, depoimento ou caso. Se o tema pedir um número que você não tem, escreva a peça sem número.',
    '3. Não alterar informações do produto. Não prometer plugin/importação direta (o insumo é upload de imagem/print do modelo), nem retenção de histórico por plano.',
    '4. A tecnologia é meio: não fazer da "IA" o assunto — o assunto é o projeto do arquiteto.',
    '5. Sem emoji em título/roteiro/anúncio. Hashtags: 3 a 5, técnicas, na última linha da legenda.',
    '6. Não repetir os conteúdos anteriores listados — variar ângulo, exemplo e formato.',
    '7. Preencher risk_flags com autocrítica honesta: qualquer claim que precise de conferência humana, dependência de material real, ou risco de fugir da marca.',
    '',
    'FORMATO DE SAÍDA — responda APENAS com JSON válido neste shape:',
    '{ "title": string (headline ≤8 palavras), "hook": string (≤125 caracteres), "central_message": string, "format": string, "platform": string, "slides": string[] (vazio se não for carrossel), "script": string (roteiro cena a cena se vídeo; senão ""), "caption": string (gancho + corpo + CTA + hashtags), "call_to_action": string, "visual_direction": string (imagem real a usar, enquadramento, uso do verde funcional), "required_assets": string[], "risk_flags": string[] }',
  ].join('\n')
}

function buildUserPrompt(input: ContentGenerationInput, ctx: ContentGenerationContext): string {
  const lines = [
    `TEMA DA PEÇA: ${input.theme}`,
    input.pillar ? `PILAR: ${input.pillar}` : null,
    input.format ? `FORMATO DESEJADO: ${input.format}` : null,
    input.platform ? `PLATAFORMA: ${input.platform}` : null,
    input.objective ? `OBJETIVO: ${input.objective}` : null,
    input.targetAudience ? `PÚBLICO: ${input.targetAudience}` : null,
    input.featureDescription ? `DESCRIÇÃO REAL DA FUNCIONALIDADE (única fonte de verdade sobre o produto): ${input.featureDescription}` : null,
    input.desiredCta ? `CTA DESEJADO (usar se estiver na lista aprovada): ${input.desiredCta}` : null,
    input.availableAssets?.length
      ? `IMAGENS DISPONÍVEIS (basear a direção visual nelas, sem inventar outras): ${input.availableAssets.join(' | ')}`
      : 'IMAGENS DISPONÍVEIS: nenhuma listada — required_assets deve descrever o que precisa ser produzido/selecionado.',
    input.extraContext ? `CONTEXTO ADICIONAL: ${input.extraContext}` : null,
    ctx.previousContent.length
      ? `CONTEÚDOS ANTERIORES (NÃO repetir tema/ângulo/título): ${ctx.previousContent.slice(0, 30).map(t => `"${t}"`).join(', ')}`
      : null,
  ]
  return lines.filter(Boolean).join('\n')
}

export class GeminiContentProvider implements ContentGenerationProvider {
  readonly id = 'gemini'
  readonly model = GEMINI_MODEL

  async generate(
    input: ContentGenerationInput,
    ctx: ContentGenerationContext,
  ): Promise<GeneratedBriefContent> {
    const raw = await geminiTextJson({
      system: buildSystemPrompt(ctx.rules),
      user: buildUserPrompt(input, ctx),
      temperature: 0.55,
      maxTokens: 2400,
      timeoutMs: 45_000,
    })
    return parseGeneratedBrief(raw)
  }
}

// ── Registry de providers ──────────────────────────────────────────────────────

const PROVIDERS: Record<string, () => ContentGenerationProvider> = {
  gemini: () => new GeminiContentProvider(),
  // vertex: () => new VertexContentProvider(),  ← futuro (integration-roadmap §5)
}

export function getGenerationProvider(): ContentGenerationProvider {
  const id = (process.env.MARKETING_AI_PROVIDER ?? 'gemini').trim().toLowerCase()
  const factory = PROVIDERS[id]
  if (!factory) {
    throw new Error(`Provider de geração desconhecido: "${id}" (disponíveis: ${Object.keys(PROVIDERS).join(', ')})`)
  }
  return factory()
}

// ── Orquestração ───────────────────────────────────────────────────────────────

export interface GenerationOutcome {
  content: GeneratedBriefContent
  brandCheck: BrandCheckResult
  provider: string
  model: string
}

/** Gera conteúdo de briefing com contexto de marca + anti-repetição, valida com
 *  o verificador determinístico e registra a execução. O caller decide aplicar
 *  ao briefing (sempre como rascunho + nova versão). */
export async function generateBriefContent(
  admin: SupabaseClient,
  input: ContentGenerationInput,
  userId: string,
  briefId?: string | null,
): Promise<GenerationOutcome> {
  if (!input.theme?.trim()) throw new Error('Tema é obrigatório')
  const started = Date.now()
  const provider = getGenerationProvider()

  // Contexto: regras da marca + conteúdo recente (anti-repetição).
  const [rules, recentBriefs, similar] = await Promise.all([
    getBrandRules(admin).catch(() => ({}) as Record<string, unknown>),
    listBriefs(admin).catch(() => []),
    findSimilarContent(admin, { title: input.theme }, briefId ?? undefined).catch(() => []),
  ])
  const previousContent = [
    ...similar.map(s => s.title),
    ...recentBriefs.slice(0, 30).map(b => b.title),
  ].filter((t, i, arr) => arr.indexOf(t) === i)

  try {
    const content = await provider.generate(input, { rules, previousContent })

    // Validação determinística da saída (léxico, CTA, limites, repetição).
    const brandCheck = runBrandCheck(
      {
        title: content.title,
        hook: content.hook,
        central_message: content.central_message,
        caption: content.caption,
        script: content.script,
        call_to_action: content.call_to_action,
        visual_direction: content.visual_direction,
        platform: content.platform || input.platform,
        format: content.format || input.format,
        similar_titles: similar.map(s => s.title),
      },
      toBrandCheckRules(rules),
    )

    // risk_flags agrega autocrítica do modelo + issues do verificador.
    const flagged = new Set(content.risk_flags)
    for (const issue of brandCheck.issues) flagged.add(`[${issue.severity}] ${issue.message}`)
    content.risk_flags = [...flagged]

    await recordAutomationRun(admin, {
      run_type: 'generate_brief',
      status: 'succeeded',
      provider: provider.id,
      model: provider.model,
      brief_id: briefId ?? null,
      input: { theme: input.theme, pillar: input.pillar, format: input.format, platform: input.platform },
      output: { title: content.title, brand_check_score: brandCheck.score, approved: brandCheck.approved },
      duration_ms: Date.now() - started,
      created_by: userId,
    })

    return { content, brandCheck, provider: provider.id, model: provider.model }
  } catch (err) {
    await recordAutomationRun(admin, {
      run_type: 'generate_brief',
      status: 'failed',
      provider: provider.id,
      model: provider.model,
      brief_id: briefId ?? null,
      input: { theme: input.theme, pillar: input.pillar, format: input.format, platform: input.platform },
      error: String((err as Error)?.message ?? err).slice(0, 500),
      duration_ms: Date.now() - started,
      created_by: userId,
    })
    throw err
  }
}

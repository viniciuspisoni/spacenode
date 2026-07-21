// lib/marketing/ads/generation.ts
//
// Gerador IA de brief de ANÚNCIO — espelho de lib/marketing/generation.ts
// (camada provider-agnóstica; Gemini via lib/gemini.ts é a implementação
// atual; trocar provider = implementar a interface e registrar em PROVIDERS).
//
// Guard-rails:
//   • regras da marca (marketing.brand_rules) entram no prompt E a saída passa
//     pelo verificador determinístico (brand-check) — risk_flags agrega os dois;
//   • limites DUROS do Meta validados campo a campo pós-parse — estourou,
//     NUNCA truncamos (truncar muda a mensagem sem revisão): erro pede
//     regeneração;
//   • anúncios e briefings recentes entram no prompt (anti-repetição);
//   • toda execução (sucesso e falha) registra automation_run;
//   • a saída entra SEMPRE como rascunho no fluxo editorial (content_briefs) e,
//     quando vinculada a campanha, como anúncio draft — revisão humana
//     obrigatória antes de qualquer publicação (workflow.ts garante o resto).

import type { SupabaseClient } from '@supabase/supabase-js'
import { geminiTextJson, GEMINI_MODEL } from '@/lib/gemini'
import { runBrandCheck, toBrandCheckRules } from '@/lib/marketing/brand-check'
import {
  createBrief,
  getBrandRules,
  listBriefs,
  recordAutomationRun,
  updateBrief,
} from '@/lib/marketing/service'
import { createAd, getCampaign, listAds } from './service'
import { buildIdentifier, parseIdentifier, sanitizeSegment } from './naming'
import type { Ad, AdCampaign, CampaignFront, GeneratedAdBrief } from './types'

// ── Contratos ──────────────────────────────────────────────────────────────────

export interface AdBriefInput {
  /** Campanha de destino — quando presente, também cria o anúncio rascunho. */
  campaign_id?: string | null
  front: 'problema' | 'demonstracao' | 'produto' | 'conversao'
  persona: string
  pain?: string
  promise?: string
  format?: string
  funnel_stage?: string
  extra_context?: string
}

export const AD_BRIEF_FRONTS: readonly CampaignFront[] = [
  'problema', 'demonstracao', 'produto', 'conversao',
]

export function isAdBriefFront(v: unknown): v is CampaignFront {
  return typeof v === 'string' && (AD_BRIEF_FRONTS as readonly string[]).includes(v)
}

/** Limites duros do Meta — estourar qualquer um invalida a resposta. */
export const META_HEADLINE_MAX_CHARS = 40
export const META_DESCRIPTION_MAX_CHARS = 30
export const META_PRIMARY_FIRST_LINE_MAX_CHARS = 125

export const AD_CTA_BUTTONS = ['SIGN_UP', 'LEARN_MORE'] as const

export interface AdBriefGenerationContext {
  /** Regras da marca (marketing.brand_rules: key → value). */
  rules: Record<string, unknown>
  /** Headlines/títulos recentes — o provider deve evitar repetição. */
  previousHeadlines: string[]
}

export interface AdBriefGenerationProvider {
  readonly id: string
  readonly model: string
  generate(input: AdBriefInput, ctx: AdBriefGenerationContext): Promise<GeneratedAdBrief>
}

export interface AdBriefGenerationResult {
  brief: GeneratedAdBrief
  /** Rascunho criado no fluxo editorial (content_briefs). */
  briefId: string
  /** Anúncio rascunho criado quando input.campaign_id foi informado. */
  adId?: string
}

// ── Validação da saída estruturada ─────────────────────────────────────────────

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string').map(s => s.trim()).filter(Boolean)
}

/** Primeira linha do primary_text — é o que o Meta mostra antes do "ver mais". */
export function adPrimaryFirstLine(primaryText: string): string {
  return primaryText.split(/\r?\n/)[0]?.trim() ?? ''
}

/** Valida o JSON do modelo campo a campo. Limite estourado ou campo essencial
 *  vazio = erro pedindo regeneração — NUNCA truncar (truncagem muda a mensagem
 *  sem revisão humana). */
export function parseGeneratedAdBrief(raw: string): GeneratedAdBrief {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('A IA devolveu uma resposta fora do formato JSON esperado — gere novamente')
  }
  const o = (parsed ?? {}) as Record<string, unknown>

  const brief: GeneratedAdBrief = {
    hypothesis: str(o.hypothesis),
    audience: str(o.audience),
    funnel_stage: str(o.funnel_stage),
    concept: str(o.concept),
    script: str(o.script),
    primary_text: str(o.primary_text),
    headline: str(o.headline),
    description: str(o.description),
    cta_button: str(o.cta_button),
    visual_direction: str(o.visual_direction),
    format: str(o.format),
    utm_content_hint: str(o.utm_content_hint),
    success_criteria: str(o.success_criteria),
    risk_flags: strArray(o.risk_flags),
  }

  if (!brief.headline) {
    throw new Error('Resposta da IA sem headline — gere novamente')
  }
  if (brief.headline.length > META_HEADLINE_MAX_CHARS) {
    throw new Error(`Headline com ${brief.headline.length} caracteres (máx. ${META_HEADLINE_MAX_CHARS}) — gere novamente`)
  }
  if (brief.description.length > META_DESCRIPTION_MAX_CHARS) {
    throw new Error(`Description com ${brief.description.length} caracteres (máx. ${META_DESCRIPTION_MAX_CHARS}) — gere novamente`)
  }
  if (!brief.primary_text) {
    throw new Error('Resposta da IA sem primary_text — gere novamente')
  }
  const firstLine = adPrimaryFirstLine(brief.primary_text)
  if (firstLine.length > META_PRIMARY_FIRST_LINE_MAX_CHARS) {
    throw new Error(`Primeira linha do primary_text com ${firstLine.length} caracteres (máx. ${META_PRIMARY_FIRST_LINE_MAX_CHARS}) — gere novamente`)
  }
  if (!(AD_CTA_BUTTONS as readonly string[]).includes(brief.cta_button)) {
    throw new Error(`cta_button "${brief.cta_button}" fora dos aprovados (${AD_CTA_BUTTONS.join(', ')}) — gere novamente`)
  }
  if (!brief.hypothesis || !brief.concept || !brief.visual_direction) {
    throw new Error('Resposta da IA incompleta (hypothesis/concept/visual_direction vazios) — gere novamente')
  }
  return brief
}

// ── Provider: Gemini ───────────────────────────────────────────────────────────

function jsonBlock(v: unknown): string {
  try { return JSON.stringify(v, null, 1) } catch { return '{}' }
}

/** Orientação por frente estratégica (plano de aquisição — 4 frentes). */
const FRONT_GUIDE: Record<CampaignFront, string> = {
  problema:
    'problema: nomear a dor real do arquiteto (horas esperando render, retrabalho, cliente que não entende planta técnica) — a dor vem primeiro, a solução só depois. Topo de funil.',
  demonstracao:
    'demonstracao: mostrar o produto em uso real — antes/depois, fluxo na tela, resultado concreto de um projeto real. A direção visual DEVE se basear em material real disponível; nunca inventar case.',
  produto:
    'produto: apresentar um módulo específico ATIVO e o que ele faz de verdade, sem promessa vaga. Meio de funil.',
  conversao:
    'conversao: fundo de funil/remarketing — oferta real e objetiva ("40 nodes grátis, sem cartão"; "planos a partir de R$ 89/mês"), fricção mínima, cta_button SIGN_UP.',
}

function buildSystemPrompt(rules: Record<string, unknown>): string {
  const voice = rules['voice'] ?? {}
  const prohibited = rules['prohibited_lexicon'] ?? {}
  const preferred = rules['preferred_lexicon'] ?? {}
  const limits = rules['copy_limits'] ?? {}
  const modules = rules['safe_modules'] ?? {}

  return [
    'Você é o redator de mídia paga da SpaceNode — plataforma brasileira de visualização arquitetônica com IA, criada por arquiteto para arquitetos e designers de interiores. Posicionamento: "Visualização arquitetônica que respeita seu projeto." Diferenciais: fidelidade ao projeto (geometria, proporções e perspectiva preservadas), coerência entre vistas, linguagem de arquiteto, produtividade sem tirar a autoria.',
    '',
    'VOZ (obrigatório seguir): ' + jsonBlock(voice),
    'LÉXICO PROIBIDO (nunca usar nenhum item): ' + jsonBlock(prohibited),
    'LÉXICO PREFERIDO (ancorar a copy nestes termos): ' + jsonBlock(preferred),
    'LIMITES DE COPY DA MARCA: ' + jsonBlock(limits),
    'MÓDULOS (só citar os ativos; NUNCA citar os desativados): ' + jsonBlock(modules),
    '',
    'MÓDULOS CITÁVEIS (ativos): Renderizar, Spaces, Editar, Ampliar, Finalizar, Animar, Planta Humanizada.',
    'MÓDULOS DESATIVADOS (NUNCA citar): Isométricas, Prancha IA, Moodboard.',
    '',
    'AS 4 FRENTES (a frente pedida define ângulo e estágio):',
    ...AD_BRIEF_FRONTS.map(f => `- ${FRONT_GUIDE[f]}`),
    '',
    'LIMITES DUROS DO META (estourar QUALQUER um invalida a resposta):',
    `- headline: no máximo ${META_HEADLINE_MAX_CHARS} caracteres.`,
    `- description: no máximo ${META_DESCRIPTION_MAX_CHARS} caracteres.`,
    `- primary_text: a PRIMEIRA linha em até ${META_PRIMARY_FIRST_LINE_MAX_CHARS} caracteres (é o que aparece antes do "ver mais"); total de até ~300 caracteres.`,
    `- cta_button: exatamente "${AD_CTA_BUTTONS[0]}" ou "${AD_CTA_BUTTONS[1]}".`,
    '',
    'PROIBIÇÕES ABSOLUTAS:',
    '1. NUNCA inventar número, métrica, depoimento, case, cliente ou funcionalidade. Sem dado real conferido, escreva a peça sem número.',
    '2. Léxico e emojis proibidos acima — nunca usar. Anúncio não leva emoji.',
    '3. Nunca prometer "plugin" ou "importação direta" — o insumo é o print/imagem exportada do SketchUp/Revit/Archicad.',
    '4. Fatos reais permitidos sem conferência extra: "40 nodes grátis, sem cartão"; "planos a partir de R$ 89/mês"; "preserva geometria, proporções e perspectiva"; "aceita prints de SketchUp/Revit/Archicad como imagem base". Qualquer outro claim exige conferência humana — sinalize em risk_flags.',
    '5. Português brasileiro, tom de arquiteto sênior falando com arquiteto: direto, técnico, específico. A IA é meio, não assunto.',
    '6. Não repetir as headlines/títulos anteriores listados — variar ângulo, dor e promessa.',
    '7. Preencher risk_flags com autocrítica honesta: claims a conferir, dependência de material real, risco de fugir da marca.',
    '',
    'FORMATO DE SAÍDA — responda APENAS com JSON válido neste shape:',
    '{ "hypothesis": string (o que este anúncio testa e por quê), "audience": string (quem vê), "funnel_stage": string (topo|meio|fundo|remarketing), "concept": string (conceito do criativo em 2-3 frases), "script": string (roteiro cena a cena se vídeo; senão ""), "primary_text": string, "headline": string, "description": string, "cta_button": "SIGN_UP" | "LEARN_MORE", "visual_direction": string (material real a usar, enquadramento), "format": string, "utm_content_hint": string (sufixo CRIATIVO_COPY sugerido, ex.: "VIDEO01_COPY01"), "success_criteria": string (critério mensurável, ex.: "CTR ≥ 1% com 1000 impressões"), "risk_flags": string[] }',
  ].join('\n')
}

function buildUserPrompt(input: AdBriefInput, ctx: AdBriefGenerationContext): string {
  const lines = [
    `FRENTE: ${input.front}`,
    `PERSONA: ${input.persona}`,
    input.pain ? `DOR CENTRAL: ${input.pain}` : null,
    input.promise ? `PROMESSA A TESTAR: ${input.promise}` : null,
    input.format ? `FORMATO DESEJADO: ${input.format}` : null,
    input.funnel_stage ? `ESTÁGIO DE FUNIL: ${input.funnel_stage}` : null,
    input.extra_context ? `CONTEXTO ADICIONAL: ${input.extra_context}` : null,
    ctx.previousHeadlines.length
      ? `HEADLINES/TÍTULOS ANTERIORES (NÃO repetir ângulo nem texto): ${ctx.previousHeadlines.slice(0, 40).map(t => `"${t}"`).join(', ')}`
      : null,
  ]
  return lines.filter(Boolean).join('\n')
}

export class GeminiAdBriefProvider implements AdBriefGenerationProvider {
  readonly id = 'gemini'
  readonly model = GEMINI_MODEL

  async generate(input: AdBriefInput, ctx: AdBriefGenerationContext): Promise<GeneratedAdBrief> {
    const raw = await geminiTextJson({
      system: buildSystemPrompt(ctx.rules),
      user: buildUserPrompt(input, ctx),
      temperature: 0.5,
      maxTokens: 2000,
      timeoutMs: 45_000,
    })
    return parseGeneratedAdBrief(raw)
  }
}

// ── Registry de providers ──────────────────────────────────────────────────────

const PROVIDERS: Record<string, () => AdBriefGenerationProvider> = {
  gemini: () => new GeminiAdBriefProvider(),
}

export function getAdBriefProvider(): AdBriefGenerationProvider {
  const id = (process.env.MARKETING_AI_PROVIDER ?? 'gemini').trim().toLowerCase()
  const factory = PROVIDERS[id]
  if (!factory) {
    throw new Error(`Provider de geração desconhecido: "${id}" (disponíveis: ${Object.keys(PROVIDERS).join(', ')})`)
  }
  return factory()
}

// ── Orquestração ───────────────────────────────────────────────────────────────

/** Extrai sufixos CRIATIVO/COPY do utm_content_hint da IA ("VIDEO01_COPY01").
 *  Parse conservador: segmento começando com COPY vira copy_variant; o primeiro
 *  dos demais vira creative_label; nada casou = null (o service resolve). */
function parseUtmContentHint(hint: string): { creative: string | null; copy: string | null } {
  const segments = hint.split(/[^a-zA-Z0-9]+/).map(s => sanitizeSegment(s)).filter(Boolean)
  const copy = segments.find(s => s.startsWith('COPY')) ?? null
  const creative = segments.find(s => s !== copy) ?? null
  return { creative, copy }
}

/** Gera o brief de anúncio, valida limites + marca, salva como RASCUNHO no
 *  fluxo editorial e (com campanha) cria o anúncio draft. Nada aqui publica ou
 *  ativa gasto — o workflow de aprovação humana cuida do resto. */
export async function generateAdBrief(
  admin: SupabaseClient,
  input: AdBriefInput,
  userId: string,
): Promise<AdBriefGenerationResult> {
  if (!isAdBriefFront(input.front)) {
    throw new Error('Frente inválida — use problema, demonstracao, produto ou conversao')
  }
  const persona = input.persona?.trim()
  if (!persona) throw new Error('Persona é obrigatória')

  const started = Date.now()
  const provider = getAdBriefProvider()

  // Campanha validada ANTES de gastar tokens (erro claro se id não existir).
  const campaign: AdCampaign | null = input.campaign_id
    ? await getCampaign(admin, input.campaign_id)
    : null

  // Contexto: regras da marca + anti-repetição (anúncios e briefings recentes).
  const [rules, recentAds, recentBriefs] = await Promise.all([
    getBrandRules(admin).catch(() => ({}) as Record<string, unknown>),
    listAds(admin).catch(() => [] as Ad[]),
    listBriefs(admin).catch(() => []),
  ])
  const previousHeadlines = [
    ...recentAds.map(a => a.headline).filter((h): h is string => Boolean(h)).slice(0, 30),
    ...recentBriefs.slice(0, 30).map(b => b.title),
  ].filter((t, i, arr) => arr.indexOf(t) === i).slice(0, 40)

  const effectiveInput: AdBriefInput = {
    ...input,
    persona,
    funnel_stage: input.funnel_stage ?? campaign?.funnel_stage ?? undefined,
  }
  const runInput = {
    front: input.front,
    persona,
    campaign_id: input.campaign_id ?? null,
    format: input.format ?? null,
  }

  // Hoisted p/ o registro de falha rastrear brief meio-salvo (createBrief ok,
  // passo seguinte falhou) — o rascunho órfão fica visível em automation_runs.
  let briefId: string | null = null

  try {
    const content = await provider.generate(effectiveInput, { rules, previousHeadlines })

    // Verificação determinística de marca sobre a copy (headline como título,
    // 1ª linha como gancho, primary_text como legenda). call_to_action fica de
    // fora de propósito: SIGN_UP/LEARN_MORE são botões do Meta, não CTAs de
    // copy orgânica — passariam por "CTA fora da lista aprovada" à toa.
    const firstLine = adPrimaryFirstLine(content.primary_text)
    const brandCheck = runBrandCheck(
      {
        title: content.headline,
        hook: firstLine,
        caption: content.primary_text,
        platform: 'meta_ads',
      },
      toBrandCheckRules(rules),
    )
    const flagged = new Set(content.risk_flags)
    for (const issue of brandCheck.issues) flagged.add(`[${issue.severity}] ${issue.message}`)
    content.risk_flags = [...flagged]

    // Rascunho no fluxo editorial (revisão humana obrigatória).
    const briefRow = await createBrief(admin, {
      title: content.headline,
      platform: 'meta_ads',
      format: input.format ?? 'video_anuncio',
      pillar: null,
      target_audience: persona,
    }, userId)
    briefId = briefRow.id
    const script = content.script
      ? `CONCEITO:\n${content.concept}\n\nROTEIRO:\n${content.script}`
      : `CONCEITO:\n${content.concept}`
    await updateBrief(admin, briefRow.id, {
      caption: content.primary_text,
      script,
      call_to_action: content.cta_button,
      visual_direction: content.visual_direction,
      hook: firstLine,
    })

    // Com campanha: cria o anúncio RASCUNHO vinculado ao brief. A IA sugere os
    // sufixos, mas quem garante unicidade do identificador (chave de
    // atribuição) é o código: default determinístico + bump do COPY em colisão.
    let adId: string | undefined
    if (campaign) {
      const { creative, copy } = parseUtmContentHint(content.utm_content_hint)
      const parsedCamp = parseIdentifier(campaign.identifier)
      if (!parsedCamp) throw new Error(`Identificador da campanha fora da convenção: ${campaign.identifier}`)

      const campaignAds = await listAds(admin, { campaignId: campaign.id }).catch(() => [] as Ad[])
      const taken = new Set(campaignAds.map(a => a.identifier.toUpperCase()))

      const creativeLabel = creative ?? 'CRIATIVO01'
      let copyVariant = copy ?? 'COPY01'
      const buildCandidate = () => buildIdentifier({
        channel: parsedCamp.channel,
        objective: parsedCamp.objective,
        persona: parsedCamp.persona,
        promise: input.promise ?? undefined,
        creative: creativeLabel,
        copy: copyVariant,
      })
      let candidate = buildCandidate()
      for (let bump = 2; (taken.has(candidate) || candidate === campaign.identifier) && bump < 100; bump++) {
        const m = copyVariant.match(/^COPY(\d+)$/)
        copyVariant = `COPY${String(m ? Number(m[1]) + 1 : bump).padStart(2, '0')}`
        candidate = buildCandidate()
      }

      const ad = await createAd(admin, {
        campaign_id: campaign.id,
        brief_id: briefRow.id,
        persona,
        pain: input.pain ?? null,
        promise: input.promise ?? null,
        format: input.format ?? (content.format || 'video_anuncio'),
        creative_label: creativeLabel,
        copy_variant: copyVariant,
        primary_text: content.primary_text,
        headline: content.headline,
        description: content.description || null,
        cta_button: content.cta_button,
      }, userId)
      adId = ad.id
    }

    await recordAutomationRun(admin, {
      run_type: 'generate_ad_brief',
      status: 'succeeded',
      provider: provider.id,
      model: provider.model,
      brief_id: briefRow.id,
      input: runInput,
      output: {
        headline: content.headline,
        brand_check_score: brandCheck.score,
        approved: brandCheck.approved,
        ad_id: adId ?? null,
      },
      duration_ms: Date.now() - started,
      created_by: userId,
    })

    return { brief: content, briefId: briefRow.id, ...(adId ? { adId } : {}) }
  } catch (err) {
    await recordAutomationRun(admin, {
      run_type: 'generate_ad_brief',
      status: 'failed',
      provider: provider.id,
      model: provider.model,
      brief_id: briefId,
      input: runInput,
      error: String((err as Error)?.message ?? err).slice(0, 500),
      duration_ms: Date.now() - started,
      created_by: userId,
    })
    throw err
  }
}

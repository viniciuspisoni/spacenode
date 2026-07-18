// ── Tools de ação: artefatos e propostas supervisionadas ─────────────────────
//
// Nenhuma executa nada: produzem ARTEFATOS validados (recomendação, prompt,
// plano, chamado, proposta de ação, memória) que o painel renderiza e o
// usuário confirma. Iniciar geração vira um PRÉ-VOO com custo calculado pelas
// tabelas reais + saldo real do pagador + riscos — nunca nodes silenciosos.

import { ENGINE_ORDER, isValidCombination, getNodesCost, type EngineId, type Resolution } from '@/lib/engines'
import { signIntent } from '../../v3/intents'
import { resolveGenerationImages } from '../images'
import { getVideoModel, listAvailableVideoModels } from '@/lib/video/models'
import { getEnabledModules } from '@/lib/nav/modules-config'
import { getPayerBalance } from '@/lib/workspaces/balance'
import { TICKET_CATEGORY_LABEL } from '../../tickets'
import { sanitizeUserText, clampText } from '../../redact'
import { validateObject, ID_SPEC } from '../validate'
import { sanitizeMemoryPatch, memoryPatchIsEmpty } from '../memory'
import type { TicketCategory, TicketDraft } from '../../types'
import type {
  ConfigRecommendation, GenerationPlan, GenerationPreflight, PlanStep,
  PromptSuggestion, SupervisedAction, SupervisedActionType,
} from '../types'
import type { NodiTool, ToolContext } from './registry'

const MODULE_IDS = ['renderizar', 'spaces', 'editar', 'ampliar', 'animar', 'finalizar', 'planta_humanizada'] as const
const ACTION_TYPES: SupervisedActionType[] = ['navigate', 'fill_prompt', 'apply_settings', 'start_generation']
const CATEGORIES: TicketCategory[] = ['generation_failed', 'unexpected_result', 'billing', 'access', 'question', 'other']

let actionSeq = 0
const actionId = () => `a${Date.now().toString(36)}${(actionSeq++).toString(36)}`

/** Rotas internas que uma proposta de navegação pode apontar. */
export function allowedRoutes(): Set<string> {
  return new Set([
    '/app', '/app/history', '/app/billing', '/app/conta', '/app/equipe', '/app/spaces',
    ...getEnabledModules().map(m => m.href),
  ])
}

function moduleLabel(moduleId: string): string {
  return getEnabledModules().find(m => m.id === moduleId)?.label ?? moduleId
}

/** Custo real de uma combinação módulo+settings, quando computável. */
export function estimateCost(moduleId: string, settings: Record<string, string>): number | null {
  try {
    if (moduleId === 'renderizar' || moduleId === 'spaces') {
      const engine = settings.engine as EngineId
      const resolution = (settings.resolution ?? '2k') as Resolution
      if (engine && isValidCombination(engine, resolution)) return getNodesCost(engine, resolution)
      return null
    }
    if (moduleId === 'animar') {
      const model = settings.model ? getVideoModel(settings.model) : undefined
      const duration = settings.duration
      if (model && duration && model.costInNodes[duration] !== undefined) return model.costInNodes[duration]
      return null
    }
  } catch {}
  return null
}

/** Riscos honestos do pré-voo — mecânicos, sem opinião do modelo. */
export function preflightRisks(preflight: Omit<GenerationPreflight, 'risks'>): string[] {
  const risks: string[] = []
  if (preflight.estimatedNodes === null) {
    risks.push('Custo exato definido na ferramenta antes de confirmar (não estimável aqui).')
  } else if (preflight.balance !== null && preflight.estimatedNodes > preflight.balance) {
    risks.push(`Saldo insuficiente: custo ${preflight.estimatedNodes} nodes × saldo ${preflight.balance}.`)
  } else if (preflight.estimatedNodes >= 100) {
    risks.push('Custo alto — confira duração/resolução antes de confirmar.')
  }
  if (preflight.moduleId === 'animar') {
    risks.push('Vídeo pode ser bloqueado pelo filtro de conteúdo do provedor; nodes são estornados em falha.')
  }
  if (!preflight.imageLabel) {
    risks.push('Nenhuma imagem de partida definida — a ferramenta vai pedir o upload.')
  }
  return risks
}

async function buildPreflight(
  ctx: ToolContext,
  moduleId: string,
  settings: Record<string, string>,
  prompt: string | undefined,
  imageLabel: string | undefined,
): Promise<GenerationPreflight> {
  const payer = await getPayerBalance(ctx.admin, ctx.userId).catch(() => null)
  const base = {
    moduleId,
    moduleLabel: moduleLabel(moduleId),
    engine: settings.engine ?? settings.model,
    settings,
    prompt,
    imageLabel,
    estimatedNodes: estimateCost(moduleId, settings),
    balance: payer?.totalBalance ?? null,
  }
  return { ...base, risks: preflightRisks(base) }
}

export const actionTools: NodiTool[] = [
  {
    name: 'recomendar_configuracao',
    description: 'Registra a recomendação de módulo+engine+configurações para o objetivo do usuário (vira card no painel). Consulte engines/custos antes.',
    spec: {
      module_id: { type: 'string', required: true, enum: MODULE_IDS },
      engine: { type: 'string', required: false, maxLen: 80 },
      settings: { type: 'record', required: false, maxKeys: 8, maxLen: 80 },
      justificativa: { type: 'string', required: true, maxLen: 400 },
    },
    handler: async (args, ctx) => {
      const settings = (args.settings as Record<string, string>) ?? {}
      if (args.engine) settings.engine = String(args.engine)
      if (Object.keys(settings).length) ctx.scratch.lastSettings = { ...ctx.scratch.lastSettings, ...settings }
      const rec: ConfigRecommendation = {
        moduleId: args.module_id as string,
        moduleLabel: moduleLabel(args.module_id as string),
        engine: settings.engine ?? settings.model,
        settings,
        estimatedNodes: estimateCost(args.module_id as string, settings) ?? undefined,
        rationale: clampText(String(args.justificativa), 400),
      }
      return { output: { recomendacao_registrada: rec }, artifact: { recommendation: rec } }
    },
  },
  {
    name: 'criar_prompt',
    description: 'Registra um prompt/direção criativa pronto pro usuário usar (vira card com "copiar"/"usar"). Escreva o prompt no vocabulário do módulo alvo.',
    spec: {
      module_id: { type: 'string', required: false, enum: MODULE_IDS },
      prompt: { type: 'string', required: true, maxLen: 900 },
      justificativa: { type: 'string', required: true, maxLen: 300 },
    },
    handler: async (args, ctx) => {
      const suggestion: PromptSuggestion = {
        prompt: sanitizeUserText(String(args.prompt), 900),
        rationale: clampText(String(args.justificativa), 300),
        moduleId: args.module_id as string | undefined,
      }
      ctx.scratch.lastPrompt = suggestion.prompt
      return { output: { prompt_registrado: true }, artifact: { promptSuggestion: suggestion } }
    },
  },
  {
    name: 'montar_plano',
    description: 'Registra um plano de geração/apresentação em etapas ordenadas usando SÓ módulos reais (vira card). Consulte módulos/custos antes; inclua custo estimado quando souber.',
    spec: { objetivo: { type: 'string', required: true, maxLen: 300 } },
    schemaOverride: {
      type: 'object',
      properties: {
        objetivo: { type: 'string' },
        observacoes: { type: 'string' },
        etapas: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              module_id: { type: 'string', enum: [...MODULE_IDS] },
              meta: { type: 'string' },
              engine: { type: 'string' },
              settings: { type: 'object', additionalProperties: { type: 'string' } },
            },
            required: ['module_id', 'meta'],
          },
        },
      },
      required: ['objetivo', 'etapas'],
    },
    handler: async (args) => {
      const rawSteps = Array.isArray(args.etapas) ? args.etapas.slice(0, 7) : []
      const steps: PlanStep[] = []
      for (const [i, raw] of rawSteps.entries()) {
        const v = validateObject(raw, {
          module_id: { type: 'string', required: true, enum: MODULE_IDS },
          meta: { type: 'string', required: true, maxLen: 240 },
          engine: { type: 'string', required: false, maxLen: 80 },
          settings: { type: 'record', required: false, maxKeys: 6, maxLen: 80 },
        })
        if (!v.ok) continue
        const s = v.value as { module_id: string; meta: string; engine?: string; settings?: Record<string, string> }
        const settings = s.settings ?? {}
        if (s.engine) settings.engine = s.engine
        steps.push({
          order: i + 1,
          moduleId: s.module_id,
          moduleLabel: moduleLabel(s.module_id),
          goal: s.meta,
          engine: settings.engine ?? settings.model,
          settings: Object.keys(settings).length ? settings : undefined,
          estimatedNodes: estimateCost(s.module_id, settings) ?? undefined,
        })
      }
      if (!steps.length) return { output: { erro: 'nenhuma etapa válida — use module_id existente e meta curta' } }
      const total = steps.reduce((acc, s) => (s.estimatedNodes ? acc + s.estimatedNodes : acc), 0)
      const plan: GenerationPlan = {
        objective: clampText(String(args.objetivo), 300),
        steps,
        totalEstimatedNodes: total > 0 ? total : undefined,
        notes: typeof args.observacoes === 'string' ? clampText(args.observacoes, 300) : undefined,
      }
      return { output: { plano_registrado: { etapas: steps.length, total_nodes_estimado: plan.totalEstimatedNodes ?? 'parcial' } }, artifact: { plan } }
    },
  },
  {
    name: 'preparar_chamado',
    description: 'Monta o rascunho de chamado pro suporte (o usuário revisa e confirma no painel — nada é enviado por você).',
    spec: {
      categoria: { type: 'string', required: true, enum: CATEGORIES },
      titulo: { type: 'string', required: true, maxLen: 160 },
      descricao: { type: 'string', required: true, maxLen: 2000 },
      causa_provavel: { type: 'string', required: false, maxLen: 400 },
      generation_kind: { type: 'string', required: false, enum: ['render', 'edit', 'video', 'upscale', 'vista'] },
      generation_id: { ...ID_SPEC, required: false },
    },
    handler: async (args, ctx) => {
      const draft: TicketDraft = {
        title: sanitizeUserText(String(args.titulo), 160),
        description: sanitizeUserText(String(args.descricao), 2000),
        category: args.categoria as TicketCategory,
        priority: 'normal',
        probableCause: args.causa_provavel ? sanitizeUserText(String(args.causa_provavel), 400) : undefined,
        context: {
          route: ctx.request.nodi.route,
          module: ctx.request.nodi.moduleLabel ?? undefined,
          projectId: ctx.request.nodi.projectId ?? undefined,
          generationKind: args.generation_kind as TicketDraft['generationKind'],
          generationId: args.generation_id as string | undefined,
          planId: ctx.request.planId ?? undefined,
        },
      }
      return {
        output: { chamado_pronto: { categoria: TICKET_CATEGORY_LABEL[draft.category], titulo: draft.title } },
        artifact: { ticketDraft: draft },
      }
    },
  },
  {
    name: 'propor_acao',
    description: 'Propõe UMA ação na interface (o usuário confirma no painel): navigate (rota interna), fill_prompt (preencher direção criativa no módulo), apply_settings (engine/resolução etc.) ou start_generation (pré-voo com custo e saldo). No Renderizar, start_generation com origem (source_kind+source_id de uma geração do usuário, ou a imagem anexada) e projeto (interior|exterior) vira EXECUÇÃO DIRETA: após confirmar, a geração roda pelo chat.',
    spec: {
      tipo: { type: 'string', required: true, enum: ACTION_TYPES },
      rotulo: { type: 'string', required: true, maxLen: 80 },
      rota: { type: 'string', required: false, maxLen: 100 },
      module_id: { type: 'string', required: false, enum: MODULE_IDS },
      prompt: { type: 'string', required: false, maxLen: 900 },
      settings: { type: 'record', required: false, maxKeys: 8, maxLen: 80 },
      imagem_rotulo: { type: 'string', required: false, maxLen: 120 },
      source_kind: { type: 'string', required: false, enum: ['render', 'edit', 'video', 'upscale', 'vista'] },
      source_id: { ...ID_SPEC, required: false },
      projeto: { type: 'string', required: false, enum: ['interior', 'exterior'] },
    },
    handler: async (args, ctx) => {
      if (!ctx.capabilities.actions) return { output: { erro: 'ações supervisionadas desativadas neste ambiente' } }
      const tipo = args.tipo as SupervisedActionType
      const label = clampText(String(args.rotulo), 80)

      if (tipo === 'navigate') {
        const rota = String(args.rota ?? '')
        if (!allowedRoutes().has(rota)) return { output: { erro: `rota fora da lista permitida: ${rota}` } }
        const action: SupervisedAction = { id: actionId(), type: 'navigate', label, href: rota }
        return { output: { acao_proposta: tipo }, artifact: { proposals: [action] } }
      }

      const moduleId = args.module_id as string | undefined
      if (!moduleId) return { output: { erro: 'module_id é obrigatório para essa ação' } }
      // O modelo costuma mandar settings no apply_settings e propor a geração
      // em seguida sem repetir — herdamos do rascunho do request o que faltar
      // (achado do smoke real: pré-voo sem engine ficava sem custo).
      const settings = { ...ctx.scratch.lastSettings, ...((args.settings as Record<string, string>) ?? {}) }
      const prompt = args.prompt ? sanitizeUserText(String(args.prompt), 900) : ctx.scratch.lastPrompt
      if (Object.keys(settings).length) ctx.scratch.lastSettings = { ...settings }
      if (prompt) ctx.scratch.lastPrompt = prompt

      // validação dura das combinações que conhecemos
      if (settings.engine && (moduleId === 'renderizar' || moduleId === 'spaces')) {
        const engine = settings.engine as EngineId
        const resolution = (settings.resolution ?? '2k') as Resolution
        if (!ENGINE_ORDER.includes(engine) || !isValidCombination(engine, resolution)) {
          return { output: { erro: `combinação inválida: ${settings.engine} × ${settings.resolution ?? '2k'}` } }
        }
      }
      if (moduleId === 'animar' && settings.model && !listAvailableVideoModels().some(m => m.id === settings.model)) {
        return { output: { erro: 'modelo de vídeo indisponível' } }
      }

      if (tipo === 'start_generation') {
        const preflight = await buildPreflight(ctx, moduleId, settings, prompt, args.imagem_rotulo as string | undefined)
        const action: SupervisedAction = {
          id: actionId(), type: tipo, label,
          moduleId, prompt, settings, preflight,
        }

        // V3: origem resolvível + projeto + custo computável → intent assinada
        // (confirmar EXECUTA; sem isso, confirmar abre a ferramenta preenchida).
        if (ctx.capabilities.execute && moduleId === 'renderizar' && preflight.estimatedNodes !== null) {
          const srcKind = (args.source_kind as string) ?? ctx.request.attachment?.kind
          const srcId = (args.source_id as string) ?? ctx.request.attachment?.id
          const projeto = args.projeto as 'interior' | 'exterior' | undefined
          if (srcKind && srcId && projeto) {
            const imgs = await resolveGenerationImages(
              ctx.supabase, ctx.userId, srcKind as Parameters<typeof resolveGenerationImages>[2], srcId,
            )
            const inputUrl = imgs?.inputUrl ?? imgs?.outputUrl
            if (inputUrl) {
              action.executable = true
              action.intentToken = signIntent({
                userId: ctx.userId,
                action: 'render',
                cost: preflight.estimatedNodes,
                params: {
                  inputUrl,
                  anchorUrl: imgs?.outputUrl ?? undefined,
                  projectType: projeto,
                  engine: settings.engine ?? 'vega',
                  resolution: settings.resolution ?? '2k',
                  refinementText: prompt,
                },
              })
              preflight.imageLabel = preflight.imageLabel ?? `${imgs!.label} existente`
            }
          }
        }

        return {
          output: {
            acao_proposta: tipo,
            execucao_direta: action.executable === true,
            custo_estimado: preflight.estimatedNodes,
            saldo: preflight.balance,
            riscos: preflight.risks,
          },
          artifact: { proposals: [action] },
        }
      }

      const action: SupervisedAction = { id: actionId(), type: tipo, label, moduleId, prompt, settings }
      return { output: { acao_proposta: tipo }, artifact: { proposals: [action] } }
    },
  },
  {
    name: 'propor_memoria',
    description: 'Propõe salvar na memória do projeto uma decisão APROVADA pelo usuário (estilo, materiais, iluminação, imagem principal, elementos que não podem mudar). O usuário confirma no painel.',
    spec: {
      space_id: { ...ID_SPEC, required: false },
      motivo: { type: 'string', required: true, maxLen: 200 },
      estilo: { type: 'string', required: false, maxLen: 400 },
      materiais: { type: 'string', required: false, maxLen: 400 },
      iluminacao: { type: 'string', required: false, maxLen: 400 },
      imagem_principal: { type: 'string', required: false, maxLen: 200 },
      elementos_travados: { type: 'string', required: false, maxLen: 600 },
      decisoes: { type: 'string[]', required: false, maxItems: 5, maxLen: 200 },
    },
    handler: async (args, ctx) => {
      if (!ctx.capabilities.memory) return { output: { erro: 'memória de projeto desativada neste ambiente' } }
      const spaceId = (args.space_id as string) ?? ctx.request.nodi.projectId
      if (!spaceId) return { output: { erro: 'nenhum projeto aberto — memória é por projeto' } }
      const patch = sanitizeMemoryPatch({
        style: args.estilo, materials: args.materiais, lighting: args.iluminacao,
        mainImage: args.imagem_principal, lockedElements: args.elementos_travados,
        decisions: args.decisoes,
      })
      if (memoryPatchIsEmpty(patch)) return { output: { erro: 'nada para salvar — informe pelo menos um campo' } }
      return {
        output: { memoria_proposta: true },
        artifact: { memoryProposal: { spaceId, patch, reason: clampText(String(args.motivo), 200) } },
      }
    },
  },
]

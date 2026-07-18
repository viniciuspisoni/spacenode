// ── Tools de consulta (só leitura, dados do próprio usuário) ─────────────────

import { ENGINES, ENGINE_ORDER } from '@/lib/engines'
import { listAvailableVideoModels } from '@/lib/video/models'
import { getEnabledModules } from '@/lib/nav/modules-config'
import { getPayerBalance } from '@/lib/workspaces/balance'
import { matchKb, buildKbAnswer } from '../../knowledge'
import { matchKnownIssue, knownIssueIds } from '../../known-issues'
import { listRecentGenerations, diagnoseGeneration } from '../../diagnostics'
import { readProjectMemory } from '../memory'
import { ID_SPEC } from '../validate'
import type { GenerationKind } from '../../types'
import type { NodiTool } from './registry'

const KINDS = ['render', 'edit', 'video', 'upscale', 'vista'] as const

export const readTools: NodiTool[] = [
  {
    name: 'consultar_contexto',
    description: 'Onde o usuário está agora: rota, módulo, projeto/vista abertos, plano e saldo.',
    spec: {},
    handler: async (_args, ctx) => ({
      output: {
        rota: ctx.request.nodi.route,
        modulo: ctx.request.nodi.moduleLabel,
        projeto_aberto: ctx.request.nodi.projectId,
        vista_aberta: ctx.request.nodi.vistaId,
        plano: ctx.request.planName,
        saldo_nodes: ctx.request.balance,
        saldo_lumens: ctx.request.lumens,
        imagem_anexada: ctx.request.attachment,
      },
    }),
  },
  {
    name: 'consultar_projeto',
    description: 'Detalhes do projeto (Space): nome e vistas com status. Sem space_id usa o projeto aberto.',
    spec: { space_id: { ...ID_SPEC, required: false } },
    handler: async (args, ctx) => {
      const spaceId = (args.space_id as string) ?? ctx.request.nodi.projectId
      if (!spaceId) return { output: { erro: 'nenhum projeto aberto — peça o projeto ao usuário ou navegue até um' } }
      // selects resilientes: nomes de coluna podem variar entre ambientes
      let name: string | null = null
      for (const cols of ['id, name', 'id']) {
        const { data, error } = await ctx.supabase.from('spaces').select(cols).eq('id', spaceId).maybeSingle()
        if (!error && data) { name = (data as { name?: string }).name ?? null; break }
        if (error && error.code !== '42703') break
      }
      const { data: vistas } = await ctx.supabase
        .from('vistas')
        .select('id, status, created_at')
        .eq('space_id', spaceId)
        .eq('user_id', ctx.userId)
        .order('created_at', { ascending: false })
        .limit(12)
      return {
        output: {
          space_id: spaceId,
          nome: name,
          vistas: (vistas ?? []).map(v => ({ id: v.id, status: v.status, criada_em: v.created_at })),
        },
      }
    },
  },
  {
    name: 'consultar_geracao',
    description: 'Status, motor, nodes e problema conhecido de UMA geração do usuário.',
    spec: {
      kind: { type: 'string', required: true, enum: KINDS },
      id: ID_SPEC,
    },
    handler: async (args, ctx) => {
      const report = await diagnoseGeneration(ctx.supabase, ctx.userId, args.kind as GenerationKind, args.id as string)
      if (!report) return { output: { erro: 'geração não encontrada na conta do usuário' } }
      return {
        output: {
          geracao: report.generation,
          problema_conhecido: report.known
            ? { id: report.known.id, causa: report.known.cause, sugestao: report.known.suggestion }
            : null,
        },
      }
    },
  },
  {
    name: 'listar_historico',
    description: 'Últimas gerações do usuário (todas as ferramentas), mais recentes primeiro.',
    spec: { limit: { type: 'number', required: false, min: 1, max: 12 } },
    handler: async (args, ctx) => {
      const generations = await listRecentGenerations(ctx.supabase, ctx.userId, (args.limit as number) ?? 6)
      return { output: { geracoes: generations } }
    },
  },
  {
    name: 'consultar_engines',
    description: 'Motores de imagem (Vega/Pulsar/Quasar) e modelos de vídeo: propósito, resoluções/durações e custo em nodes.',
    spec: {},
    handler: async () => ({
      output: {
        imagem: ENGINE_ORDER.map(id => {
          const e = ENGINES[id]
          return { id, nome: e.name, perfil: e.tagline, descricao: e.description, custos: e.nodes }
        }),
        video: listAvailableVideoModels().map(m => ({
          id: m.id, nome: m.label, tag: m.tag, descricao: m.description,
          pontos_fortes: m.strengths, limitacoes: m.weaknesses,
          duracoes: m.supportedDurations, formatos: m.supportedAspectRatios, custos: m.costInNodes,
        })),
      },
    }),
  },
  {
    name: 'consultar_modulos',
    description: 'Ferramentas ativas da plataforma e para que serve cada uma.',
    spec: {},
    handler: async () => ({
      output: {
        modulos: [
          ...getEnabledModules().map(m => ({ id: m.id, nome: m.label, rota: m.href })),
          { id: 'historico', nome: 'Histórico', rota: '/app/history' },
        ],
        proposito: {
          renderizar: 'do print do modelo à imagem fotorrealista, preservando geometria/perspectiva',
          spaces: 'várias vistas do mesmo ambiente com um único DNA visual',
          editar: 'alteração localizada sem regenerar o resto',
          ampliar: 'aumentar resolução/nitidez da imagem aprovada',
          animar: 'vídeo a partir da imagem (apresentação/movimento)',
          finalizar: 'pós-produção não destrutiva e exportação',
          planta_humanizada: 'planta técnica vestida com materiais e mobiliário',
        },
      },
    }),
  },
  {
    name: 'consultar_saldo_custos',
    description: 'Saldo atual do pagador (plano + lumens) e custo de uma combinação, se informada.',
    spec: {
      engine: { type: 'string', required: false, enum: ENGINE_ORDER },
      resolution: { type: 'string', required: false, enum: ['hd', '2k', '4k'] },
    },
    handler: async (args, ctx) => {
      const payer = await getPayerBalance(ctx.admin, ctx.userId).catch(() => null)
      let custo: number | null = null
      if (args.engine && args.resolution) {
        const e = ENGINES[args.engine as keyof typeof ENGINES]
        custo = e?.nodes[args.resolution as 'hd' | '2k' | '4k'] ?? null
      }
      return {
        output: {
          saldo_plano: payer?.planBalance ?? null,
          saldo_lumens: payer?.lumenBalance ?? null,
          saldo_total: payer?.totalBalance ?? null,
          bolsa_compartilhada: payer?.pooled ?? false,
          custo_consultado: custo,
        },
      }
    },
  },
  {
    name: 'consultar_documentacao',
    description: 'Busca na base de conhecimento oficial (custos, planos, ferramentas, boas práticas). Use antes de afirmar qualquer fato da plataforma.',
    spec: { pergunta: { type: 'string', required: true, maxLen: 300 } },
    handler: async (args, ctx) => {
      const matches = matchKb(args.pergunta as string, ctx.request.nodi.moduleId, 3)
      return {
        output: {
          resultados: matches.map(m => {
            const a = buildKbAnswer(m.entry)
            return { id: a.id, titulo: a.title, conteudo: a.text }
          }),
        },
      }
    },
  },
  {
    name: 'consultar_erros_conhecidos',
    description: 'Mapeia uma mensagem/sintoma de erro para um problema conhecido (causa + o que tentar).',
    spec: { erro: { type: 'string', required: false, maxLen: 400 } },
    handler: async (args) => {
      if (args.erro) {
        const issue = matchKnownIssue(args.erro as string)
        return { output: issue ? { id: issue.id, causa: issue.cause, sugestao: issue.suggestion } : { resultado: 'não mapeado — considere preparar_chamado' } }
      }
      return { output: { problemas_conhecidos: knownIssueIds() } }
    },
  },
  {
    name: 'consultar_memoria_projeto',
    description: 'Memória aprovada do projeto (estilo, materiais, iluminação, elementos travados, decisões).',
    spec: { space_id: { ...ID_SPEC, required: false } },
    handler: async (args, ctx) => {
      if (!ctx.capabilities.memory) return { output: { erro: 'memória de projeto desativada neste ambiente' } }
      const spaceId = (args.space_id as string) ?? ctx.request.nodi.projectId
      if (!spaceId) return { output: { erro: 'nenhum projeto aberto' } }
      const memory = await readProjectMemory(ctx.supabase, ctx.userId, spaceId)
      return { output: { memoria: memory ?? 'vazia' } }
    },
  },
]

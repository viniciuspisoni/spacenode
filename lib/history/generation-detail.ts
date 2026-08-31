// ── Histórico como arquivo técnico ─────────────────────────────────────────────
//
// Normaliza uma geração (render / edit / vista) num modelo único que o painel
// "Detalhes da geração" consegue exibir sem conhecer o schema de cada tabela.
//
// Dois níveis de exposição (decisão de produto):
//   - usuário comum: labels de produto, legíveis ("Módulo: Melhorar",
//     "Escala: 4×"). Nada de JSON bruto, endpoint, request id de provider ou
//     prompt final proprietário — esses campos nem chegam ao cliente (a API
//     redige a linha no servidor; ver app/api/history/detail).
//   - admin/suporte (viewer.privileged): tudo acima + bloco "Diagnóstico
//     técnico" com o JSON completo.
//
// Todos os campos são opcionais por design: gerações antigas não têm metadados
// completos e a UI exibe fallbacks ("Não registrado") em vez de quebrar.

import { getVideoDisplayLabel } from '@/lib/renderLabels'
import { getCameraMotion } from '@/lib/video/cameraPresets'
import { getSceneType } from '@/lib/video/scenes'
import { getVideoTypePreset } from '@/lib/video/videoPresets'

export type GenerationKind = 'render' | 'edit' | 'vista'

// Sem uuid: a API não expõe o user_id do autor — só o que a UI exibe.
export interface GenerationAuthor {
  name:  string | null
  email: string | null
}

// Resposta de GET /api/history/detail (linha já redigida para usuário comum;
// objetos de contexto sem ids internos)
export interface DetailResponse {
  kind:      GenerationKind
  viewer:    { privileged: boolean }
  row:       Record<string, unknown>
  author:    GenerationAuthor | null
  workspace: { name: string; type: string } | null
  folder:    { name: string } | null
  space:     { name: string; hasDna: boolean } | null
}

export interface ConfigEntry {
  label:    string
  value:    string | null   // null → "Não registrado"
  advanced?: boolean        // fica atrás do "Mostrar avançado"
}

export interface GenerationDetail {
  kind:            GenerationKind
  id:              string
  shortId:         string          // id amigável curto (#8f3a21c7) p/ usuário comum
  privileged:      boolean
  title:           string
  moduleLabel:     string
  engineLabel:     string | null
  status:          string
  statusLabel:     string
  imageUrl:        string | null
  sourceImageUrl:  string | null
  isVideo:         boolean
  createdAt:       string
  completedAt:     string | null
  contextLabel:    string | null   // pasta (renders) ou Space (vistas)
  contextHref:     string | null
  nodesCost:       number | null
  durationMs:      number | null
  retryCount:      number | null
  userBriefing:    string | null   // texto escrito PELO usuário (nunca o prompt interno)
  finalPrompt:     string | null   // só chega preenchido para admin/suporte
  config:          ConfigEntry[]
  author:          GenerationAuthor | null
  workspaceName:   string | null
  editHref:        string | null   // "Enviar para edição"
  reuseHref:       string | null   // "Reutilizar configuração"
  variationHref:   string | null   // "Criar variação"
  technicalLog:    Record<string, unknown> | null  // null para usuário comum
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function str(v: unknown): string | null {
  if (typeof v === 'string' && v.trim() !== '') return v
  return null
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

// ── Provider real de uma geração (Diagnóstico técnico/admin) ───────────────────
//
// generation_log.provider é a fonte de verdade (gravado por lib/ai/image-provider
// desde 2026-07). Quando o log não existe — geração antiga OU janela em que uma
// migration pendente derrubou o insert estendido — o provider é INFERIDO pela
// evidência que sobra na row, nunca chutado: o default `?? 'fal'` fez todos os
// renders de 13→18/08 (gerados no GCP) aparecerem como "fal" no Diagnóstico e
// disparou um alarme falso de "caiu tudo no fallback".
//   · request id UUID           → FAL (formato dos request ids da fila da FAL)
//   · request id noutro formato → GCP (responseId do Vertex)
//   · URL de saída na CDN fal.media → FAL (o caminho GCP re-hospeda no Storage)
//   · sem evidência             → null (a UI trata como "Não registrado")
const FAL_REQUEST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function inferProvider(requestId: string | null, outputUrl?: string | null): 'fal' | 'gcp' | null {
  if (outputUrl && outputUrl.includes('fal.media')) return 'fal'
  if (requestId) return FAL_REQUEST_ID_RE.test(requestId) ? 'fal' : 'gcp'
  return null
}

export function engineDisplayLabel(raw: string | null | undefined): string | null {
  if (!raw) return null
  const v = raw.toLowerCase()
  if (v.includes('nano-banana-pro') || v.includes('vega'))   return 'Vega'
  if (v.includes('gpt-image')       || v.includes('quasar')) return 'Quasar'
  if (v.includes('nano-banana')     || v.includes('pulsar')) return 'Pulsar'
  // Editar V3 grava o modelo Google cru (gemini-*-image); mesmos motores das
  // labels acima: Flash = Pulsar, Pro = Vega.
  if (v.includes('gemini') && v.includes('pro'))             return 'Vega'
  if (v.includes('gemini'))                                  return 'Pulsar'
  if (v.includes('clarity'))                                 return 'Clarity'
  if (v.includes('flux'))                                    return 'Flux'
  // Valor desconhecido = provavelmente endpoint interno → não vira label de
  // produto. (Admin vê o valor cru no Diagnóstico técnico.)
  return null
}

// ── Editar V3 (edit_v3_jobs) no vocabulário do Histórico ───────────────────────
//
// O V3 persiste em tabela própria; o Histórico e o painel de detalhes falam o
// vocabulário de `edits`. Estes helpers são o único ponto de tradução.

/** Labels PT das ações do V3 — viram título quando não há instrução escrita. */
const EDIT_V3_ACTION_TITLES: Record<string, string> = {
  remove:         'Remover elemento',
  swap_material:  'Trocar material',
  insert_element: 'Inserir elemento',
  refine_area:    'Refinar área',
}

/** Título/instrução exibível de um job do V3 (nunca vazio — o card depende). */
export function editV3DisplayPrompt(j: { instruction?: unknown; prompt?: unknown; action_type?: unknown }): string {
  const text = [j.instruction, j.prompt]
    .find((v): v is string => typeof v === 'string' && v.trim() !== '')
  return text?.trim() ?? EDIT_V3_ACTION_TITLES[String(j.action_type)] ?? 'Edição'
}

/** quality exibível de um job do V3 (o card faz .toUpperCase() → "PADRÃO"/"ALTA"). */
export function editV3QualityLabel(qualityMode: unknown): string {
  return qualityMode === 'high' ? 'alta' : 'padrão'
}

export function resolutionDisplayLabel(raw: string | null | undefined, nodes?: number | null): string | null {
  const v = raw?.toLowerCase()
  if (v === 'hd') return 'HD'
  if (v === '2k') return '2K'
  if (v === '4k') return '4K'
  // Renders antigos não têm coluna resolution — infere pelo custo em nodes.
  if (nodes === 4)  return 'HD'
  if (nodes === 8)  return '2K'
  if (nodes === 20) return '4K'
  return null
}

export function statusDisplayLabel(status: string | null | undefined): string {
  switch (status) {
    case 'completed':  return 'Concluída'
    case 'processing': return 'Processando'
    case 'pending':    return 'Na fila'
    case 'failed':     return 'Falhou'
    case 'refunded':   return 'Reembolsada'
    default:           return status ? status : 'Não registrado'
  }
}

export function authorInitials(author: GenerationAuthor | null | undefined): string {
  const base = author?.name || author?.email || ''
  if (!base) return '?'
  const parts = base.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return base.slice(0, 2).toUpperCase()
}

export function formatDuration(ms: number | null | undefined): string | null {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return null
  if (ms < 1000) return `${ms} ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`
  const min = Math.floor(s / 60)
  const rest = Math.round(s % 60)
  return `${min}min ${rest}s`
}

// ── Tradução de parâmetros técnicos → labels de produto ────────────────────────
//
// Único ponto de verdade para transformar valores internos em texto amigável.
// Regra: se o valor não tem tradução conhecida, exibimos o valor cru apenas
// quando ele já é legível (ex.: "Entardecer"); identificadores internos
// retornam null e a UI mostra "Não registrado".

const FIDELITY_LABELS: Record<string, string> = {
  maximum:  'Máxima',
  high:     'Alta',
  balanced: 'Balanceada',
  creative: 'Criativa',
  strict:   'Estrita',
}

export function fidelityLabel(level?: string | null, mode?: string | null): string | null {
  const parts = [
    level ? (FIDELITY_LABELS[level] ?? level) : null,
    mode && mode !== level ? (FIDELITY_LABELS[mode] ?? mode) : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

// Ampliar/Melhorar: style = 'upscale:<provider>' (v2) ou id legado.
const UPSCALE_ENGINE_LABELS: Record<string, string> = {
  'topaz':             'Topaz',
  'clarity':           'Clarity',
  'nafnet-denoise':    'NAFNet',
  'nafnet-deblur':     'NAFNet',
  'photo-restoration': 'Restauração',
}

export function upscaleEngineLabel(style: string | null | undefined): string | null {
  if (!style) return null
  if (style.startsWith('upscale:')) {
    const provider = style.slice('upscale:'.length)
    return UPSCALE_ENGINE_LABELS[provider] ?? null
  }
  // Legado
  if (style.includes('clarity'))  return 'Clarity'
  if (style.includes('aura'))     return 'Aura'
  if (style.includes('supir'))    return 'SUPIR'
  if (style.includes('esrgan'))   return 'ESRGAN'
  if (style === 'magnific')       return 'Magnific'
  return null
}

const UPSCALE_MODE_LABELS: Record<string, string> = {
  fidelity: 'Alta fidelidade',
  recover:  'Recuperar imagem',
  denoise:  'Limpar ruído',
  deblur:   'Corrigir desfoque',
  restore:  'Restaurar imagem',
  smart:    'Melhoria inteligente',
}

export function upscaleModeLabel(modeId: string | null | undefined): string | null {
  if (!modeId) return null
  return UPSCALE_MODE_LABELS[modeId] ?? null
}

export function scaleDisplayLabel(scale: string | null | undefined): string | null {
  if (!scale) return null
  if (scale === 'none')  return 'Sem aumento'
  if (scale === 'ultra') return 'Ultra'
  return scale.replace('x', '×')
}

// ── Animar (config_snapshot module: 'animar') ──────────────────────────────────
// Ids de produto → labels PT. Ids desconhecidos retornam null ("Não registrado").

const VIDEO_INTENSITY_LABELS: Record<string, string> = {
  subtle:     'Sutil',
  normal:     'Moderado',
  cinematic:  'Cinematográfico',
  pronounced: 'Dinâmico',
}

const VIDEO_FIDELITY_LABELS: Record<string, string> = {
  max:      'Máxima fidelidade',
  balanced: 'Equilíbrio',
  creative: 'Mais liberdade',
}

export function videoTypeDisplayLabel(id: string | null): string | null {
  if (!id) return null
  return getVideoTypePreset(id)?.label ?? null
}

export function cameraMotionDisplayLabel(id: string | null): string | null {
  if (!id) return null
  return getCameraMotion(id)?.label ?? null
}

export function videoFormatDisplayLabel(aspectRatio: string | null): string | null {
  if (!aspectRatio) return null
  return aspectRatio === 'auto' ? 'Original' : aspectRatio
}

export function videoIntensityDisplayLabel(id: string | null): string | null {
  if (!id) return null
  return VIDEO_INTENSITY_LABELS[id] ?? null
}

export function videoSceneDisplayLabel(id: string | null): string | null {
  if (!id) return null
  return getSceneType(id)?.label ?? null
}

export function videoFidelityDisplayLabel(id: string | null): string | null {
  if (!id) return null
  return VIDEO_FIDELITY_LABELS[id] ?? null
}

const SPACES_MODE_LABELS: Record<string, string> = {
  luz:      'Luz',
  clima:    'Clima',
  material: 'Materialidade',
  detalhe:  'Detalhe',
  cena:     'Cena',
  camera:   'Câmera',
}

const PRESERVATION_LABELS: Record<string, string> = {
  STRICT_SOURCE_LOCK:     'Preservação máxima',
  ARCHITECTURAL_DNA_LOCK: 'DNA arquitetônico',
  CONTROLLED_EXPLORATION: 'Exploração controlada',
}

function projectTypeLabel(v: string | null): string | null {
  if (v === 'interior') return 'Interior'
  if (v === 'exterior') return 'Exterior'
  return v
}

const MODULE_LABEL: Record<GenerationKind, string> = {
  render: 'Renderizar',
  edit:   'Editar',
  vista:  'Spaces',
}

// ── Briefing copiável (nunca inclui o prompt interno proprietário) ─────────────

export function buildBriefingText(d: GenerationDetail): string {
  const lines: string[] = ['Briefing — SpaceNode']
  // Em edições o título É a instrução do usuário — sem a checagem o texto
  // sairia duplicado (Nome + Briefing do usuário).
  if (d.title !== d.userBriefing) lines.push(`Nome: ${d.title}`)
  lines.push(`Módulo: ${d.moduleLabel}`)
  if (d.engineLabel) lines.push(`Engine: ${d.engineLabel}`)
  for (const c of d.config.filter(c => !c.advanced && c.value)) {
    if (c.label === 'Módulo' || c.label === 'Engine') continue
    lines.push(`${c.label}: ${c.value}`)
  }
  if (d.nodesCost != null) lines.push(`Custo: ${d.nodesCost} node${d.nodesCost !== 1 ? 's' : ''}`)
  if (d.userBriefing) {
    lines.push('', 'Briefing do usuário:', `"${d.userBriefing}"`)
  }
  return lines.join('\n')
}

// ── Log técnico (somente admin/suporte) ────────────────────────────────────────

function buildTechnicalLog(
  kind: GenerationKind,
  row: Record<string, unknown>,
  extra: { provider: string | null; model: string | null; endpoint: string | null; finalPrompt: string | null; nodes: number | null; durationMs: number | null; params: Record<string, unknown> | null },
): Record<string, unknown> {
  return {
    generation_id:   row.id ?? null,
    user_id:         row.user_id ?? null,
    team_id:         row.workspace_id ?? null,
    project_id:      (row.space_id ?? row.folder_id) ?? null,
    source_image_id: (row.source_id ?? row.source_vista_id) ?? null,
    module:          kind,
    provider:        extra.provider,
    model:           extra.model,
    endpoint:        extra.endpoint,
    fal_request_id:  row.fal_request_id ?? null,
    parameters_json: extra.params,
    prompt_final:    extra.finalPrompt,
    cost_nodes:      extra.nodes,
    duration_ms:     extra.durationMs,
    status:          row.status ?? null,
    error_message:   row.error_message ?? null,
    created_at:      row.created_at ?? null,
    updated_at:      (row.updated_at ?? row.completed_at) ?? null,
    generation_log:  row.generation_log ?? null,
  }
}

// ── Normalizadores por tipo ─────────────────────────────────────────────────────

function baseDetail(res: DetailResponse): Pick<GenerationDetail, 'privileged' | 'author' | 'workspaceName' | 'shortId'> {
  const id = String(res.row.id ?? '')
  return {
    privileged:    res.viewer?.privileged ?? false,
    author:        res.author,
    workspaceName: res.workspace?.name ?? null,
    shortId:       `#${id.slice(0, 8)}`,
  }
}

function normalizeRender(res: DetailResponse): GenerationDetail {
  const r = res.row
  const ambient   = str(r.ambient)
  const isUpscale = ambient === 'upscale'
  const isVideo   = ambient === 'video'
  const cs        = (r.config_snapshot ?? null) as Record<string, unknown> | null
  const um        = (r.upscale_meta ?? null) as Record<string, unknown> | null
  const log       = (r.generation_log ?? null) as Record<string, unknown> | null

  const nodes    = num(r.nodes_charged) ?? num(r.cost_credits)
  const duration = num(r.duration_ms) ?? num(um?.total_duration_ms)

  const inputUrl  = str(r.input_url)
  const outputUrl = str(r.output_url)
  // Vídeo: output_url é o VÍDEO gerado e input_url a imagem base — o preview
  // precisa do output (um <video> apontando pra JPEG fica preto). Sem output
  // (falha), o preview fica vazio e a imagem base aparece na seção própria.
  const display   = isVideo ? outputUrl : (outputUrl ?? inputUrl)

  let moduleLabel: string
  let title: string
  let engine: string | null
  const config: ConfigEntry[] = []

  if (isUpscale) {
    // ── Melhorar (Upscale) — campos legados de render NÃO se aplicam:
    // style = 'upscale:<provider>', lighting = escala. Traduz tudo.
    moduleLabel = 'Melhorar'
    title       = 'Upscale'
    engine      = upscaleEngineLabel(str(r.style))

    const scale = str(um?.scale) ?? str(r.lighting)
    const dims  = (um?.input_dimensions ?? null) as { width?: number; height?: number } | null

    config.push(
      { label: 'Módulo',  value: 'Melhorar' },
      { label: 'Tipo',    value: scale === 'none' ? 'Aprimorar' : 'Upscale' },
      { label: 'Engine',  value: engine },
      { label: 'Preset',  value: upscaleModeLabel(str(um?.mode_id)) },
      { label: 'Escala',  value: scaleDisplayLabel(scale) },
    )
    if (dims?.width && dims?.height) {
      config.push({ label: 'Dimensões de origem', value: `${dims.width} × ${dims.height}px`, advanced: true })
    }
  } else if (isVideo) {
    // ── Animar — style = engine de vídeo, lighting = duração.
    // Gerações novas trazem config_snapshot (module: 'animar') com a
    // configuração de produto; antigas caem no par Configuração/Duração.
    moduleLabel = 'Animar'
    title       = 'Animação'
    engine      = null
    config.push(
      { label: 'Módulo',       value: 'Animar' },
      { label: 'Tipo',         value: 'Vídeo' },
      { label: 'Configuração', value: getVideoDisplayLabel(str(r.style) ?? '', str(r.lighting)) },
      { label: 'Duração',      value: str(r.lighting) },
    )
    if (cs?.module === 'animar') {
      config.push(
        { label: 'Tipo de vídeo', value: videoTypeDisplayLabel(str(cs.video_type)) },
        { label: 'Movimento',     value: cameraMotionDisplayLabel(str(cs.camera_motion)) },
        { label: 'Formato',       value: videoFormatDisplayLabel(str(cs.aspect_ratio)) },
        { label: 'Intensidade',   value: videoIntensityDisplayLabel(str(cs.intensity)) },
        { label: 'Cena',          value: videoSceneDisplayLabel(str(cs.scene_type)), advanced: true },
        { label: 'Fidelidade',    value: videoFidelityDisplayLabel(str(cs.fidelity)), advanced: true },
      )
      if (cs.avoid_people === true) {
        config.push({ label: 'Sem pessoas', value: 'Sim', advanced: true })
      }
    }
  } else {
    // ── Renderizar
    moduleLabel = 'Renderizar'
    title       = ambient || str(r.lighting) || 'Render'
    engine      = engineDisplayLabel(str(r.engine) ?? str(r.model))

    config.push(
      { label: 'Módulo',          value: 'Renderizar' },
      { label: 'Engine',          value: engine },
      { label: 'Resolução',       value: resolutionDisplayLabel(str(r.resolution), nodes) },
      { label: 'Tipo de projeto', value: projectTypeLabel(str(cs?.projectType) ?? str(r.style)) },
      { label: 'Iluminação',      value: str(cs?.lighting) ?? str(r.lighting) },
    )
    if (cs) {
      if (str(cs.segment))     config.push({ label: 'Segmento', value: str(cs.segment) })
      if (str(cs.environment)) config.push({ label: 'Ambiente', value: str(cs.environment) })
      // Clima / preset / lente: o Renderizar atual não captura — exibe quando
      // um snapshot futuro trouxer (chaves já previstas aqui).
      if (str(cs.weather) || str(cs.clima)) config.push({ label: 'Clima', value: str(cs.weather) ?? str(cs.clima) })
      if (str(cs.preset)) config.push({ label: 'Preset', value: str(cs.preset) })
      if (str(cs.lens) || str(cs.camera)) config.push({ label: 'Lente / câmera', value: str(cs.lens) ?? str(cs.camera) })
      config.push({ label: 'Fidelidade', value: fidelityLabel(str(cs.fidelityLevel), str(cs.fidelityMode)) })
      if (str(cs.background)) config.push({ label: 'Fundo', value: str(cs.background), advanced: true })
      const scene = Array.isArray(cs.sceneElements) ? (cs.sceneElements as string[]).filter(Boolean) : []
      if (scene.length) config.push({ label: 'Elementos de cena', value: scene.join(', '), advanced: true })
      if (num(cs.geometryLock) != null) config.push({ label: 'Trava de geometria', value: `${num(cs.geometryLock)}%`, advanced: true })
      if (cs.materials) config.push({ label: 'Materiais do projeto', value: 'Aplicados', advanced: true })
      if (cs.briefing)  config.push({ label: 'Briefing arquitetônico', value: 'Aplicado', advanced: true })
    } else {
      config.push({ label: 'Configuração completa', value: null })
    }
  }

  // "Reutilizar configuração": /app/generate já aceita ?source= (pré-carrega a
  // imagem base). O param extra ?reuse=<renderId> fica reservado para o
  // GenerateClient hidratar o restante da configuração a partir do
  // config_snapshot desta render.
  // TODO(reuse-config): consumir `reuse` em app/app/generate para preencher
  // engine, resolução, fidelidade, iluminação etc. a partir do config_snapshot.
  const reuseHref = !isUpscale && !isVideo && inputUrl
    ? `/app/generate?source=${encodeURIComponent(inputUrl)}&reuse=${r.id}`
    : isUpscale ? '/app/upscale' : isVideo ? '/app/video' : '/app/generate'

  // "Criar variação": mesma base + mesma configuração, nova geração.
  // TODO(variation): quando o GenerateClient consumir ?reuse=, o param
  // &variation=1 deve apenas pular direto para o passo de geração.
  const variationHref = !isUpscale && !isVideo && inputUrl
    ? `/app/generate?source=${encodeURIComponent(inputUrl)}&reuse=${r.id}&variation=1`
    : null

  const editHref = !isVideo && outputUrl
    ? `/app/editar?source=${encodeURIComponent(outputUrl)}&source_type=render&source_id=${r.id}`
    : null

  const privileged = res.viewer?.privileged ?? false

  return {
    ...baseDetail(res),
    kind: 'render',
    id: String(r.id),
    title,
    moduleLabel,
    engineLabel: engine,
    status: str(r.status) ?? 'completed',
    statusLabel: statusDisplayLabel(str(r.status)),
    imageUrl: display,
    sourceImageUrl: isVideo ? inputUrl : (outputUrl ? inputUrl : null),
    isVideo,
    createdAt: String(r.created_at),
    completedAt: str(r.completed_at),
    contextLabel: res.folder?.name ?? null,
    contextHref: null,
    nodesCost: nodes,
    durationMs: duration,
    retryCount: num(r.retry_count),
    userBriefing: str(r.user_prompt),
    finalPrompt: privileged ? str(r.prompt) : null,
    config,
    editHref,
    reuseHref,
    variationHref,
    technicalLog: privileged
      ? buildTechnicalLog('render', r, {
          provider: str(log?.provider) ?? inferProvider(str(r.fal_request_id), outputUrl),
          model: str(r.engine) ?? str(r.model),
          endpoint: str(log?.endpoint),
          finalPrompt: str(r.prompt),
          nodes,
          durationMs: duration,
          params: cs ?? um,
        })
      : null,
  }
}

function normalizeEdit(res: DetailResponse): GenerationDetail {
  const r = res.row
  const nodes = num(r.nodes_cost)
  // Para usuário comum a API já entrega engine como label de produto; para
  // admin chega o endpoint cru — engineDisplayLabel resolve os dois.
  const engine = engineDisplayLabel(str(r.engine))
  const sourceUrl = str(r.source_image_url)
  const resultUrl = str(r.result_image_url)

  const sourceTypeLabel: Record<string, string> = {
    upload: 'Upload', render: 'Render', vista: 'Vista', edit: 'Edição anterior',
  }

  const config: ConfigEntry[] = [
    { label: 'Módulo',           value: 'Editar' },
    { label: 'Engine',           value: engine },
    { label: 'Resolução',        value: resolutionDisplayLabel(str(r.quality)) },
    { label: 'Origem da imagem', value: sourceTypeLabel[str(r.source_type) ?? ''] ?? null },
  ]
  const coverage = num(r.mask_coverage)
  if (str(r.mask_url)) config.push({ label: 'Área selecionada', value: coverage != null ? `${(coverage * 100).toFixed(1)}% da imagem` : 'Aplicada', advanced: true })
  if (num(r.reference_count)) config.push({ label: 'Imagens de referência', value: String(num(r.reference_count)) })

  const privileged = res.viewer?.privileged ?? false

  return {
    ...baseDetail(res),
    kind: 'edit',
    id: String(r.id),
    title: str(r.prompt) ?? 'Edição',
    moduleLabel: 'Editar',
    engineLabel: engine,
    status: str(r.status) ?? 'completed',
    statusLabel: statusDisplayLabel(str(r.status) ?? 'completed'),
    imageUrl: resultUrl,
    sourceImageUrl: sourceUrl,
    isVideo: false,
    createdAt: String(r.created_at),
    completedAt: str(r.completed_at),
    contextLabel: null,
    contextHref: null,
    nodesCost: nodes,
    durationMs: num(r.duration_ms),
    retryCount: num(r.retry_count),
    // Em edições o prompt É a instrução escrita pelo usuário.
    userBriefing: str(r.prompt),
    finalPrompt: privileged ? str(r.prompt) : null,
    config,
    editHref: resultUrl
      ? `/app/editar?source=${encodeURIComponent(resultUrl)}&source_type=edit&source_id=${r.id}`
      : null,
    // Reutilizar uma edição = abrir o Editar com a MESMA imagem de origem.
    reuseHref: sourceUrl
      ? `/app/editar?source=${encodeURIComponent(sourceUrl)}&source_type=${str(r.source_type) ?? 'upload'}${str(r.source_id) ? `&source_id=${r.source_id}` : ''}`
      : null,
    variationHref: null,
    technicalLog: privileged
      ? buildTechnicalLog('edit', r, {
          // edits não têm coluna provider — o request id decide (o resultado é
          // re-hospedado no Storage, então a URL não carrega evidência aqui).
          provider: inferProvider(str(r.fal_request_id)),
          model: str(r.engine),
          endpoint: str(r.engine),
          finalPrompt: str(r.prompt),
          nodes,
          durationMs: num(r.duration_ms),
          params: {
            quality: r.quality ?? null,
            mask_url: r.mask_url ?? null,
            mask_coverage: r.mask_coverage ?? null,
            source_type: r.source_type ?? null,
          },
        })
      : null,
  }
}

function normalizeVista(res: DetailResponse): GenerationDetail {
  const r = res.row
  const nodes = num(r.nodes_cost)
  const engine = engineDisplayLabel(str(r.engine))
  const imageUrl = str(r.image_url)

  const config: ConfigEntry[] = [
    { label: 'Módulo',    value: 'Spaces' },
    { label: 'Engine',    value: engine },
    { label: 'Resolução', value: resolutionDisplayLabel(str(r.quality)) },
    { label: 'Variação',  value: str(r.axis_label) ?? str(r.axis_value) },
  ]
  if (str(r.spaces_mode)) config.push({ label: 'Modo', value: SPACES_MODE_LABELS[str(r.spaces_mode)!] ?? str(r.spaces_mode) })
  config.push({ label: 'DNA do projeto', value: res.space ? (res.space.hasDna ? 'Aplicado' : 'Não aplicado') : null })
  if (str(r.preservation_level)) {
    config.push({ label: 'Preservação', value: PRESERVATION_LABELS[str(r.preservation_level)!] ?? null, advanced: true })
  }
  if (str(r.aspect_ratio)) config.push({ label: 'Proporção', value: str(r.aspect_ratio), advanced: true })
  if (num(r.generated_width) && num(r.generated_height)) {
    config.push({ label: 'Dimensões geradas', value: `${num(r.generated_width)} × ${num(r.generated_height)}px`, advanced: true })
  }
  if (r.dna_verified != null) config.push({ label: 'DNA verificado', value: r.dna_verified ? 'Sim' : 'Não', advanced: true })

  const privileged = res.viewer?.privileged ?? false

  return {
    ...baseDetail(res),
    kind: 'vista',
    id: String(r.id),
    title: str(r.axis_label) ?? 'Vista',
    moduleLabel: 'Spaces',
    engineLabel: engine,
    status: str(r.status) ?? 'completed',
    statusLabel: statusDisplayLabel(str(r.status)),
    imageUrl,
    sourceImageUrl: str(r.source_image_url),
    isVideo: false,
    createdAt: String(r.created_at),
    completedAt: str(r.completed_at),
    contextLabel: res.space?.name ?? null,
    contextHref: res.space ? `/app/spaces/${r.space_id}/vistas/${r.id}` : null,
    nodesCost: nodes,
    durationMs: num(r.duration_ms),
    retryCount: num(r.retry_count),
    userBriefing: null,
    finalPrompt: privileged ? str(r.prompt) : null,
    config,
    editHref: imageUrl
      ? `/app/editar?source=${encodeURIComponent(imageUrl)}&source_type=vista&source_id=${r.id}`
      : null,
    // Reutilizar a configuração de uma vista = voltar ao Space de origem.
    // TODO(reuse-config): pré-selecionar modo/eixo/engine/qualidade no Space.
    reuseHref: r.space_id ? `/app/spaces/${r.space_id}` : null,
    variationHref: null,
    technicalLog: privileged
      ? buildTechnicalLog('vista', r, {
          provider: str(r.provider) ?? inferProvider(str(r.fal_request_id), imageUrl),
          model: str(r.model) ?? str(r.engine),
          endpoint: str(r.model),
          finalPrompt: str(r.prompt),
          nodes,
          durationMs: num(r.duration_ms),
          params: {
            engine: r.engine ?? null,
            quality: r.quality ?? null,
            axis: r.axis ?? null,
            axis_value: r.axis_value ?? null,
            spaces_mode: r.spaces_mode ?? null,
            preservation_level: r.preservation_level ?? null,
            preservation_check: r.preservation_check ?? null,
          },
        })
      : null,
  }
}

export function normalizeGeneration(res: DetailResponse): GenerationDetail {
  if (res.kind === 'edit')  return normalizeEdit(res)
  if (res.kind === 'vista') return normalizeVista(res)
  return normalizeRender(res)
}

export { MODULE_LABEL }

import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayerId } from '@/lib/workspaces/context'
import { refundNodes } from '@/lib/billing/refund-nodes'
import { APRESENTAR_TOOLS } from '@/lib/apresentar/config'
import { buildHumanizedPlanPrompt } from '@/lib/apresentar/prompts'
import { getFalEndpoint, getNodesCost, type EngineId, type Resolution } from '@/lib/engines'
import { generateImage } from '@/lib/ai/image-provider'
import type {
  HumanizedPlanProjectType,
  HumanizedPlanStyle,
  HumanizedPlanLevel,
  HumanizedPlanOptions,
} from '@/lib/apresentar/config'

export const maxDuration = 300

fal.config({ credentials: process.env.FAL_KEY })

const FAL_TIMEOUT_MS = 90_000

// ── Apresentar · Planta Humanizada ───────────────────────────────────────────
//
// Pipeline (espelha /api/generate):
//   1. Auth
//   2. Validar payload + ler engine/resolution do config da ferramenta
//   3. Debit atômico via `consume_nodes_v2`
//   4. Upload imagem para Fal.ai
//   5. Construir prompt fiel via buildHumanizedPlanPrompt
//   6. fal.subscribe(falEndpoint, ...) com timeout race
//   7. Insert em `renders` com config_snapshot { tool, ... }
//   8. Refund best-effort em falha pós-débito

const TOOL = APRESENTAR_TOOLS.humanized_plan

// Tipos válidos vindos do client (validação defensiva)
const VALID_PROJECT_TYPES: HumanizedPlanProjectType[] = ['apartamento','casa','comercial','corporativo','paisagismo']
const VALID_STYLES:        HumanizedPlanStyle[]       = ['clean_tecnico','imobiliario_premium','editorial_minimalista','aquarelado','contemporaneo']
const VALID_LEVELS:        HumanizedPlanLevel[]       = ['leve','equilibrado','completo']

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()

  let debited = false
  let nodesToCharge = 0
  let inputUrl: string | undefined
  let outputUrl: string | undefined

  try {
    const formData    = await req.formData()
    const imageFile   = formData.get('image')       as File   | null
    const projectType = formData.get('projectType') as string | null
    const style       = formData.get('style')       as string | null
    const level       = formData.get('level')       as string | null
    const optionsRaw  = formData.get('options')     as string | null
    const additionalInstructionsRaw = formData.get('additionalInstructions') as string | null
    const additionalInstructions    = additionalInstructionsRaw?.trim().slice(0, 400) || null

    // ── Validações ────────────────────────────────────────────────────────────
    if (!imageFile) {
      return NextResponse.json({ error: 'Imagem obrigatória' }, { status: 400 })
    }
    if (!VALID_PROJECT_TYPES.includes(projectType as HumanizedPlanProjectType)) {
      return NextResponse.json({ error: 'Tipo de projeto inválido' }, { status: 400 })
    }
    if (!VALID_STYLES.includes(style as HumanizedPlanStyle)) {
      return NextResponse.json({ error: 'Estilo inválido' }, { status: 400 })
    }
    if (!VALID_LEVELS.includes(level as HumanizedPlanLevel)) {
      return NextResponse.json({ error: 'Nível inválido' }, { status: 400 })
    }

    let options: HumanizedPlanOptions
    try {
      options = optionsRaw ? JSON.parse(optionsRaw) : {}
    } catch {
      return NextResponse.json({ error: 'Opções inválidas' }, { status: 400 })
    }

    if (!TOOL.engine || !TOOL.resolution) {
      return NextResponse.json({ error: 'Ferramenta não configurada' }, { status: 500 })
    }
    const engine     = TOOL.engine     as EngineId
    const resolution = TOOL.resolution as Resolution
    nodesToCharge    = getNodesCost(engine, resolution)
    const falEndpoint = getFalEndpoint(engine)

    // ── Débito atômico ────────────────────────────────────────────────────────
    const { error: debitError } = await admin.rpc('consume_workspace_nodes', {
      user_id_input: user.id,
      amount:        nodesToCharge,
    })
    if (debitError) {
      console.error('[apresentar/humanized-plan] consume_nodes_v2 error:', debitError)
      if (debitError.code === 'P0001') {
        return NextResponse.json(
          { error: `Nodes insuficientes. Necessários: ${nodesToCharge}.` },
          { status: 402 }
        )
      }
      return NextResponse.json({ error: 'Erro ao processar saldo.' }, { status: 500 })
    }
    debited = true

    // ── Geração ───────────────────────────────────────────────────────────────
    const prompt = buildHumanizedPlanPrompt({
      projectType: projectType as HumanizedPlanProjectType,
      style:       style       as HumanizedPlanStyle,
      level:       level       as HumanizedPlanLevel,
      options,
      additionalInstructions,
    })

    inputUrl = await fal.storage.upload(imageFile)

    console.log('[apresentar/humanized-plan] engine    :', engine, '→', falEndpoint)
    console.log('[apresentar/humanized-plan] resolution:', resolution, '→', nodesToCharge, 'nodes')
    console.log('[apresentar/humanized-plan] inputUrl  :', inputUrl)
    console.log('[apresentar/humanized-plan] prompt    :', prompt)

    // Vega (nano-banana-pro/edit): resolution param 1K/2K/4K
    const resolutionMap: Record<Resolution, string> = { hd: '1K', '2k': '2K', '4k': '4K' }
    const falInput = {
      prompt,
      image_urls:    [inputUrl],
      resolution:    resolutionMap[resolution],
      num_images:    1,
      output_format: 'jpeg',
    }

    // Camada única de provider (lib/ai/image-provider): GCP/Vertex primário
    // quando ligado por env, fallback FAL transparente.
    const gen = await generateImage({
      falEndpoint,
      falInput,
      timeoutMs: FAL_TIMEOUT_MS,
      context:   'apresentar/humanized-plan',
      deliver:   { kind: 'url', userId: user.id, area: 'apresentar' },
    })

    outputUrl = gen.images[0]?.url
    if (!outputUrl) throw new Error('Provider não retornou imagem')
    const falRequestId = gen.requestId
    console.log('[apresentar/humanized-plan] outputUrl :', outputUrl, '| provider:', gen.provider, '| req:', falRequestId)

    // ── Persistência ──────────────────────────────────────────────────────────
    const configSnapshot = {
      tool:        TOOL.id,
      module:      'apresentar',
      projectType,
      style,
      level,
      options,
      additionalInstructions,
      generation: {
        provider:       gen.provider,
        provider_model: gen.providerModel,
        fallback_used:  gen.fallbackUsed,
        provider_error: gen.errorMessage,
        latency_ms:     gen.latencyMs,
      },
    }

    const insertResult = await admin
      .from('renders')
      .insert({
        user_id:         user.id,
        input_url:       inputUrl,
        output_url:      outputUrl,
        prompt,
        ambient:         'planta humanizada',
        style:           style,
        lighting:        level,
        engine,
        resolution,
        nodes_charged:   nodesToCharge,
        fal_request_id:  falRequestId,
        status:          'completed',
        completed_at:    new Date().toISOString(),
        config_snapshot: configSnapshot,
      })
      .select('id')
      .single()

    if (insertResult.error) {
      console.error('[apresentar/humanized-plan] DB INSERT falhou (imagem gerada — investigar):', {
        error: insertResult.error, userId: user.id, outputUrl,
      })
    }

    // Saldo pós-débito da BOLSA (dono do workspace) — é dela que saiu.
    const payerId = (await getPayerId(admin, user.id)) ?? user.id
    const { data: balance } = await admin
      .from('user_node_balance')
      .select('plan_balance, lumen_balance, total_balance')
      .eq('user_id', payerId)
      .single()

    return NextResponse.json({
      url:              outputUrl,
      originalUrl:      inputUrl,
      renderId:         insertResult.data?.id ?? null,
      creditsRemaining: balance?.total_balance ?? 0,
      planBalance:      balance?.plan_balance  ?? 0,
      lumenBalance:     balance?.lumen_balance ?? 0,
      nodesCharged:     nodesToCharge,
      prompt,
    })

  } catch (err: unknown) {
    // ── Refund best-effort ────────────────────────────────────────────────────
    if (debited && nodesToCharge > 0) {
      await refundNodes(admin, user.id, nodesToCharge, { module: 'apresentar/humanized-plan' })
    }

    const e = err as { status?: number; body?: unknown; message?: string; isFalTimeout?: boolean }
    console.error('[apresentar/humanized-plan] ERROR status:', e?.status)
    console.error('[apresentar/humanized-plan] ERROR body  :', JSON.stringify(e?.body ?? e?.message ?? err))

    let userMessage = 'Erro ao gerar planta humanizada. Tente novamente.'
    if (e?.isFalTimeout)        userMessage = 'Tempo limite excedido. Tente novamente.'
    else if (e?.status === 422) userMessage = 'Imagem ou parâmetros não aceitos pelo modelo.'
    else if (e?.status === 429) userMessage = 'Limite de requisições atingido. Aguarde alguns segundos.'

    return NextResponse.json({ error: userMessage }, { status: 500 })
  }
}

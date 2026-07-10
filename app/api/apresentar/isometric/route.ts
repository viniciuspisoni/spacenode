import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayerId } from '@/lib/workspaces/context'
import { refundNodes } from '@/lib/billing/refund-nodes'
import { APRESENTAR_TOOLS } from '@/lib/apresentar/config'
import { buildIsometricPrompt } from '@/lib/apresentar/prompts'
import { getFalEndpoint, getNodesCost, type EngineId, type Resolution } from '@/lib/engines'
import { generateImage } from '@/lib/ai/image-provider'
import type {
  IsometricOrigin,
  IsometricType,
  IsometricStyle,
} from '@/lib/apresentar/config'

export const maxDuration = 300

fal.config({ credentials: process.env.FAL_KEY })

const FAL_TIMEOUT_MS = 90_000

// ── Apresentar · Isométricas ─────────────────────────────────────────────────
// Mesma estrutura de /api/apresentar/humanized-plan.

const TOOL = APRESENTAR_TOOLS.isometric

const VALID_ORIGINS: IsometricOrigin[] = ['sketchup','revit','planta','conceitual','outro']
const VALID_TYPES:   IsometricType[]   = ['maquete_branca','mobiliada','realista','corte','explodida','diagrama_volumetrico']
const VALID_STYLES:  IsometricStyle[]  = ['premium_clean','editorial','concurso','incorporadora','minimalista']

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
    const formData  = await req.formData()
    const imageFile = formData.get('image')  as File   | null
    const origin    = formData.get('origin') as string | null
    const type      = formData.get('type')   as string | null
    const style     = formData.get('style')  as string | null

    if (!imageFile) {
      return NextResponse.json({ error: 'Imagem obrigatória' }, { status: 400 })
    }
    if (!VALID_ORIGINS.includes(origin as IsometricOrigin)) {
      return NextResponse.json({ error: 'Origem inválida' }, { status: 400 })
    }
    if (!VALID_TYPES.includes(type as IsometricType)) {
      return NextResponse.json({ error: 'Tipo de isométrica inválido' }, { status: 400 })
    }
    if (!VALID_STYLES.includes(style as IsometricStyle)) {
      return NextResponse.json({ error: 'Estilo inválido' }, { status: 400 })
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
      console.error('[apresentar/isometric] consume_nodes_v2 error:', debitError)
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
    const prompt = buildIsometricPrompt({
      origin: origin as IsometricOrigin,
      type:   type   as IsometricType,
      style:  style  as IsometricStyle,
    })

    inputUrl = await fal.storage.upload(imageFile)

    console.log('[apresentar/isometric] engine    :', engine, '→', falEndpoint)
    console.log('[apresentar/isometric] resolution:', resolution, '→', nodesToCharge, 'nodes')
    console.log('[apresentar/isometric] inputUrl  :', inputUrl)
    console.log('[apresentar/isometric] prompt    :', prompt)

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
      context:   'apresentar/isometric',
      deliver:   { kind: 'url', userId: user.id, area: 'apresentar' },
    })

    outputUrl = gen.images[0]?.url
    if (!outputUrl) throw new Error('Provider não retornou imagem')
    const falRequestId = gen.requestId
    console.log('[apresentar/isometric] outputUrl :', outputUrl, '| provider:', gen.provider, '| req:', falRequestId)

    // ── Persistência ──────────────────────────────────────────────────────────
    const configSnapshot = {
      tool:   TOOL.id,
      module: 'apresentar',
      origin,
      type,
      style,
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
        ambient:         'isométrica',
        style:           style,
        lighting:        type,
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
      console.error('[apresentar/isometric] DB INSERT falhou (imagem gerada — investigar):', {
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
    if (debited && nodesToCharge > 0) {
      await refundNodes(admin, user.id, nodesToCharge, { module: 'apresentar/isometric' })
    }

    const e = err as { status?: number; body?: unknown; message?: string; isFalTimeout?: boolean }
    console.error('[apresentar/isometric] ERROR status:', e?.status)
    console.error('[apresentar/isometric] ERROR body  :', JSON.stringify(e?.body ?? e?.message ?? err))

    let userMessage = 'Erro ao gerar isométrica. Tente novamente.'
    if (e?.isFalTimeout)        userMessage = 'Tempo limite excedido. Tente novamente.'
    else if (e?.status === 422) userMessage = 'Imagem ou parâmetros não aceitos pelo modelo.'
    else if (e?.status === 429) userMessage = 'Limite de requisições atingido. Aguarde alguns segundos.'

    return NextResponse.json({ error: userMessage }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { refundNodes } from '@/lib/billing/refund-nodes'
import { APRESENTAR_TOOLS, CAROUSEL_STYLES, type CarouselStyle } from '@/lib/apresentar/config'
import { generateCarouselCopy, type SlideImageMeta } from '@/lib/apresentar/board'

export const maxDuration = 60

// ── Apresentar · Prancha IA · POST /api/apresentar/board ────────────────────
//
// Carrossel Instagram:
//   1. Auth
//   2. Validar payload (imagens, contexto, estilo)
//   3. consume_nodes_v2 (TOOL.nodes — 6 por carrossel)
//   4. generateCarouselCopy() via Claude/Fal — texto only, sem geração de imagem
//   5. INSERT renders { config_snapshot = { tool, module, format, slides, copy } }
//   6. refund_nodes em falha pós-débito
//
// Renderização dos slides é client-side (SVG → PNG) — server só devolve a copy
// + IDs e URLs das imagens já escolhidas pelo usuário.

const TOOL = APRESENTAR_TOOLS.presentation_board

const VALID_STYLES = CAROUSEL_STYLES.map(s => s.id)

const MIN_SLIDES = 3
const MAX_SLIDES = 8       // máx 8 imagens → 10 slides totais (cover + 8 + closing) = limite do Instagram

interface Payload {
  projectName?:  string
  projectType?:  string
  location?:     string
  style?:        string
  format?:       string
  slides?:       SlideImageMeta[]
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()

  let debited = false
  const nodesToCharge = TOOL.nodes ?? 0

  try {
    const body = (await req.json()) as Payload

    const projectName = body.projectName?.trim()
    const style       = body.style as CarouselStyle | undefined
    const slides      = Array.isArray(body.slides) ? body.slides : []
    const format      = body.format ?? 'instagram_carousel'

    // ── Validação ─────────────────────────────────────────────────────────────
    if (!projectName || projectName.length < 2) {
      return NextResponse.json({ error: 'Nome do projeto obrigatório.' }, { status: 400 })
    }
    if (!style || !VALID_STYLES.includes(style)) {
      return NextResponse.json({ error: 'Estilo inválido.' }, { status: 400 })
    }
    if (slides.length < MIN_SLIDES || slides.length > MAX_SLIDES) {
      return NextResponse.json(
        { error: `Selecione entre ${MIN_SLIDES} e ${MAX_SLIDES} imagens.` },
        { status: 400 }
      )
    }
    if (slides.some(s => typeof s.imageUrl !== 'string' || !s.imageUrl.startsWith('http'))) {
      return NextResponse.json({ error: 'URL de imagem inválida.' }, { status: 400 })
    }
    if (format !== 'instagram_carousel') {
      return NextResponse.json({ error: 'Formato ainda não disponível.' }, { status: 400 })
    }

    // ── Identidade do estúdio (opcional, pra alimentar a copy) ───────────────
    const { data: identity } = await admin
      .from('architect_identity')
      .select('name')
      .eq('user_id', user.id)
      .maybeSingle()
    const studioName = identity?.name?.trim() || undefined

    // ── Débito atômico ────────────────────────────────────────────────────────
    if (nodesToCharge > 0) {
      const { error: debitError } = await admin.rpc('consume_workspace_nodes', {
        user_id_input: user.id,
        amount:        nodesToCharge,
      })
      if (debitError) {
        console.error('[apresentar/board] consume_nodes_v2 error:', debitError)
        if (debitError.code === 'P0001') {
          return NextResponse.json(
            { error: `Nodes insuficientes. Necessários: ${nodesToCharge}.` },
            { status: 402 }
          )
        }
        return NextResponse.json({ error: 'Erro ao processar saldo.' }, { status: 500 })
      }
      debited = true
    }

    // ── Geração da copy ───────────────────────────────────────────────────────
    console.log('[apresentar/board] slides:', slides.length, 'style:', style)
    const copy = await generateCarouselCopy({
      projectName,
      projectType: body.projectType?.trim() || undefined,
      location:    body.location?.trim()    || undefined,
      style,
      studioName,
      slides,
    })
    console.log('[apresentar/board] copy gerada:', copy.coverTitle, '|', copy.captions.length, 'captions')

    // ── Persistência ──────────────────────────────────────────────────────────
    const configSnapshot = {
      tool:        TOOL.id,
      module:      'apresentar',
      format,
      projectName,
      projectType: body.projectType?.trim() || null,
      location:    body.location?.trim()    || null,
      style,
      slides,
      copy,
    }

    const insertResult = await admin
      .from('renders')
      .insert({
        user_id:         user.id,
        input_url:       slides[0]?.imageUrl ?? null,    // primeira imagem como thumbnail
        output_url:      slides[0]?.imageUrl ?? null,    // mesma (a renderização final é local)
        prompt:          `Carrossel: ${projectName}`,
        ambient:         'prancha · carrossel',
        style:           style,
        lighting:        format,
        nodes_charged:   nodesToCharge,
        status:          'completed',
        completed_at:    new Date().toISOString(),
        config_snapshot: configSnapshot,
      })
      .select('id')
      .single()

    if (insertResult.error) {
      console.error('[apresentar/board] DB INSERT falhou (copy gerada — investigar):', {
        error:  insertResult.error,
        userId: user.id,
      })
    }

    const { data: balance } = await admin
      .from('user_node_balance')
      .select('plan_balance, lumen_balance, total_balance')
      .eq('user_id', user.id)
      .single()

    return NextResponse.json({
      renderId:         insertResult.data?.id ?? null,
      format,
      style,
      copy,
      slides,                                              // ecoa para o client renderizar
      studioName:       studioName ?? null,
      creditsRemaining: balance?.total_balance ?? 0,
      planBalance:      balance?.plan_balance  ?? 0,
      lumenBalance:     balance?.lumen_balance ?? 0,
      nodesCharged:     nodesToCharge,
    })

  } catch (err: unknown) {
    if (debited && nodesToCharge > 0) {
      await refundNodes(admin, user.id, nodesToCharge, { module: 'apresentar/board' })
    }

    const e = err as { status?: number; body?: unknown; message?: string }
    console.error('[apresentar/board] ERROR:', e?.status, e?.message)

    return NextResponse.json(
      { error: 'Erro ao gerar carrossel. Tente novamente.' },
      { status: 500 }
    )
  }
}

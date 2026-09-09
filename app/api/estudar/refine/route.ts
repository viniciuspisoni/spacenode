// POST /api/estudar/refine — refinamento localizado de uma alternativa do
// estudo: o usuário seleciona uma região (máscara P&B, branco = alterar) e
// descreve a mudança; gera uma nova versão da alternativa (kind='refino').
//
// Contrato (JSON):
//   - estudoId:      uuid do estudo
//   - alternativaId: uuid da alternativa base (status completed)
//   - maskKey:       key do upload direto da máscara (área estudo-asset,
//                    kind=refine-mask, PNG) — obrigatória
//   - instruction:   texto da alteração desejada — obrigatório
//
// Custo: getEstudarConfig().refineNodes (env ESTUDAR_REFINE_NODES).
// Débito antes; refund integral em falha. A preservação fora da região é
// contrato de prompt (sem recompose server-side no MVP — limitação documentada).

import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { refundNodes } from '@/lib/billing/refund-nodes'
import { DIRECT_UPLOAD_AREAS, downloadDirectUpload } from '@/lib/storage/direct-upload'
import { rehostToStorage } from '@/lib/storage/rehost'
import { generateImage } from '@/lib/ai/image-provider'
import { nearestSupportedAspectRatio } from '@/lib/ai/aspect-ratio'
import { getPayerId } from '@/lib/workspaces/context'
import { getEstudarConfig } from '@/lib/estudar/config'
import { buildRefineImageLabels, buildRefinePrompt } from '@/lib/estudar/prompt'
import { isEstudoVariante } from '@/lib/estudar/types'

export const maxDuration = 300

const STORAGE_BUCKET = 'space-mestres'
const MASK_ASPECT_TOLERANCE = 0.03
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface AlternativaRow {
  id: string
  estudo_id: string
  user_id: string
  variante: string
  status: string
  image_url: string | null
  image_width: number | null
  image_height: number | null
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // ── Parse + validação ──────────────────────────────────────────────────────
  const body = await req.json().catch(() => null)
  const estudoId = typeof body?.estudoId === 'string' ? body.estudoId : ''
  const alternativaId = typeof body?.alternativaId === 'string' ? body.alternativaId : ''
  const maskKey = typeof body?.maskKey === 'string' ? body.maskKey : ''
  const instruction = typeof body?.instruction === 'string' ? body.instruction.trim().slice(0, 600) : ''

  if (!UUID_RE.test(estudoId) || !UUID_RE.test(alternativaId)) {
    return NextResponse.json({ error: 'Estudo ou alternativa inválidos' }, { status: 400 })
  }
  if (!maskKey) {
    return NextResponse.json({ error: 'Selecione a região a alterar' }, { status: 400 })
  }
  if (!instruction) {
    return NextResponse.json({ error: 'Descreva a alteração desejada' }, { status: 400 })
  }

  // ── Posse + estado da alternativa base ─────────────────────────────────────
  const admin = createAdminClient()
  const { data: alt } = await admin
    .from('estudo_alternativas')
    .select('id, estudo_id, user_id, variante, status, image_url, image_width, image_height')
    .eq('id', alternativaId)
    .eq('estudo_id', estudoId)
    .eq('user_id', user.id)
    .maybeSingle<AlternativaRow>()
  if (!alt || !isEstudoVariante(alt.variante)) {
    return NextResponse.json({ error: 'Alternativa não encontrada' }, { status: 404 })
  }
  if (alt.status !== 'completed' || !alt.image_url) {
    return NextResponse.json({ error: 'Esta alternativa não tem imagem pra refinar' }, { status: 409 })
  }

  // ── Máscara da região ──────────────────────────────────────────────────────
  const mask = await downloadDirectUpload(
    admin, DIRECT_UPLOAD_AREAS['estudo-asset'], user.id, { kind: 'refine-mask' }, maskKey,
  )
  if (!mask.ok) return NextResponse.json({ error: mask.message }, { status: mask.status })
  try {
    const meta = await sharp(mask.buffer).metadata()
    const mw = meta.width ?? 0
    const mh = meta.height ?? 0
    if (!mw || !mh) throw new Error('máscara sem dimensões')
    if (alt.image_width && alt.image_height) {
      const ratio = alt.image_width / alt.image_height
      const delta = Math.abs(mw / mh - ratio) / ratio
      if (delta > MASK_ASPECT_TOLERANCE) {
        return NextResponse.json(
          { error: 'A seleção não corresponde à imagem da alternativa — refaça a marcação.' },
          { status: 400 },
        )
      }
    }
  } catch {
    return NextResponse.json({ error: 'Máscara da região ilegível.' }, { status: 400 })
  }

  // ── Custo + débito ─────────────────────────────────────────────────────────
  const config = getEstudarConfig()
  const cost = config.refineNodes
  let debited = false

  try {
    const { error: debitErr } = await admin.rpc('consume_workspace_nodes', {
      user_id_input: user.id,
      amount: cost,
    })
    if (debitErr) {
      if (debitErr.code === 'P0001') {
        return NextResponse.json(
          { error: 'insufficient_balance', required: cost, message: 'Saldo insuficiente' },
          { status: 402 },
        )
      }
      console.error('[estudar/refine] consume_workspace_nodes RPC error:', debitErr)
      return NextResponse.json({ error: 'Erro ao processar saldo' }, { status: 500 })
    }
    debited = true

    // ── Geração ──────────────────────────────────────────────────────────────
    const prompt = buildRefinePrompt(instruction)
    const aspectRatio = nearestSupportedAspectRatio(alt.image_width, alt.image_height)
    const falInput: Record<string, unknown> = {
      prompt,
      image_urls: [alt.image_url, mask.url],
      num_images: 1,
      resolution: config.resolution,
      ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
      ...(config.imageEndpoint === 'fal-ai/nano-banana-2/edit' ? { thinking_level: 'high' } : {}),
    }
    const result = await generateImage({
      falEndpoint: config.imageEndpoint,
      falInput,
      timeoutMs: config.timeoutMs,
      context: 'estudar.refine',
      deliver: { kind: 'url', userId: user.id, area: 'estudar/result' },
      imageLabels: buildRefineImageLabels(),
    })
    const image = result.images[0]
    if (!image?.url) throw new Error('provider não devolveu imagem')
    const rehosted = await rehostToStorage(admin, image.url, {
      bucket: STORAGE_BUCKET,
      userId: user.id,
      kind: 'estudar/result',
    })
    const imageUrl = rehosted?.url ?? image.url

    // ── Persistência ─────────────────────────────────────────────────────────
    const { data: row, error: insErr } = await admin
      .from('estudo_alternativas')
      .insert({
        estudo_id: estudoId,
        user_id: user.id,
        variante: alt.variante,
        kind: 'refino',
        parent_id: alt.id,
        status: 'completed',
        prompt,
        refine_instruction: instruction,
        refine_mask_url: mask.url,
        image_url: imageUrl,
        image_width: image.width,
        image_height: image.height,
        provider: result.provider,
        model: result.providerModel,
        request_id: result.requestId,
        nodes_cost: cost,
      } as never)
      .select('id, created_at')
      .single<{ id: string; created_at: string }>()
    if (insErr || !row) {
      console.error('[estudar/refine] insert alternativa falhou:', insErr)
      throw new Error('persistência do refino indisponível')
    }

    const payerId = (await getPayerId(admin, user.id)) ?? user.id
    const { data: balance } = await admin
      .from('user_node_balance')
      .select('plan_balance, total_balance')
      .eq('user_id', payerId)
      .single<{ plan_balance: number | null; total_balance: number | null }>()

    return NextResponse.json({
      alternativa: {
        id: row.id,
        variante: alt.variante,
        kind: 'refino',
        parentId: alt.id,
        imageUrl,
        status: 'completed',
        errorMessage: null,
        createdAt: row.created_at,
      },
      nodesCharged: cost,
      credits: balance?.plan_balance ?? 0,
      totalBalance: balance?.total_balance ?? 0,
    })
  } catch (err: unknown) {
    console.error('[estudar/refine] ERROR:', (err as Error)?.message ?? err)
    if (debited) {
      await refundNodes(admin, user.id, cost, {
        module: 'estudar',
        jobTable: 'estudo_alternativas',
        jobId: alternativaId,
      })
    }
    return NextResponse.json(
      { error: 'Erro ao refinar. Nada foi cobrado — tente novamente.' },
      { status: 500 },
    )
  }
}

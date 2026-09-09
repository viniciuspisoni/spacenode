// POST /api/estudar — cria um estudo preliminar e gera as 3 alternativas
// (Essencial / Equilibrada / Completa) sobre a fotografia do ambiente.
//
// Contrato (JSON — a foto e a máscara sobem DIRETO pro Storage via uploadDirect,
// área estudo-asset; o binário não passa pela Vercel):
//   - sourceKey:  string (key do upload direto da foto, kind=source, obrigatório)
//   - maskKey?:   string (key da máscara de preservação, kind=mask, PNG, opcional)
//   - sourceType: 'PHOTO' (MVP; 'FLOOR_PLAN' já é recusado com mensagem própria)
//   - medida?:    { descricao: string, valor: number, unidade: 'cm'|'m' }
//   - briefing:   EstudoBriefing (lib/estudar/types) — ambienteTipo e estudoTipo
//                 obrigatórios, resto opcional
//
// Custo: getEstudarConfig().studyNodes (env ESTUDAR_STUDY_NODES) — único ponto
// de verdade, o mesmo que a page passa à UI.
// Débito: consume_workspace_nodes ANTES da geração; alternativa que falha
// devolve a fração proporcional via refund_workspace_nodes (falha total = tudo).
// Persistência: estudos + estudo_alternativas (migration 20260831220000 —
// OBRIGATÓRIA pra este módulo; sem ela a rota falha com refund).

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
import { buildEstudoPrompt, buildImageLabels } from '@/lib/estudar/prompt'
import {
  ESTUDO_VARIANTES,
  isEstudoTipo,
  type EstudoBriefing,
  type EstudoMedida,
  type EstudoVariante,
} from '@/lib/estudar/types'

export const maxDuration = 300

const STORAGE_BUCKET = 'space-mestres'
/** Tolerância de aspecto máscara×foto — mesma régua do Editar V3 (3%). */
const MASK_ASPECT_TOLERANCE = 0.03

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

function parseBriefing(raw: unknown): EstudoBriefing | null {
  const b = raw as Record<string, unknown> | null
  if (!b || typeof b !== 'object') return null
  if (!isEstudoTipo(b.estudoTipo)) return null
  const briefing: EstudoBriefing = {
    ambienteTipo: str(b.ambienteTipo, 120),
    ambienteUso: str(b.ambienteUso, 600),
    estudoTipo: b.estudoTipo,
    itensObrigatorios: str(b.itensObrigatorios, 600),
    estilo: str(b.estilo, 300),
    materiais: str(b.materiais, 300),
    necessidades: str(b.necessidades, 600),
    orcamento: str(b.orcamento, 120),
    mudancasEstruturais: str(b.mudancasEstruturais, 600),
    instrucoes: str(b.instrucoes, 800),
  }
  if (!briefing.ambienteTipo) return null
  return briefing
}

function parseMedida(raw: unknown): EstudoMedida | null {
  const m = raw as Record<string, unknown> | null
  if (!m || typeof m !== 'object') return null
  const descricao = str(m.descricao, 200)
  const valor = Number(m.valor)
  const unidade = m.unidade === 'm' ? 'm' : m.unidade === 'cm' ? 'cm' : null
  if (!descricao || !Number.isFinite(valor) || valor <= 0 || !unidade) return null
  return { descricao, valor, unidade }
}

function truncateErr(msg: string, max = 300): string {
  return msg.length > max ? msg.slice(0, max) + '…' : msg
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // ── Parse + validação (tudo ANTES de qualquer débito) ──────────────────────
  const body = await req.json().catch(() => null)
  const sourceKey = typeof body?.sourceKey === 'string' ? body.sourceKey : ''
  const maskKey = typeof body?.maskKey === 'string' && body.maskKey ? body.maskKey : null
  const sourceType = typeof body?.sourceType === 'string' ? body.sourceType : 'PHOTO'

  if (!sourceKey) {
    return NextResponse.json({ error: 'Fotografia do ambiente é obrigatória' }, { status: 400 })
  }
  if (sourceType === 'FLOOR_PLAN') {
    return NextResponse.json(
      { error: 'Estudo sobre planta baixa ainda não está disponível — envie uma fotografia do ambiente.' },
      { status: 400 },
    )
  }
  if (sourceType !== 'PHOTO') {
    return NextResponse.json({ error: 'sourceType inválido' }, { status: 400 })
  }
  const briefing = parseBriefing(body?.briefing)
  if (!briefing) {
    return NextResponse.json(
      { error: 'Briefing incompleto — informe pelo menos o tipo do ambiente e o tipo de estudo.' },
      { status: 400 },
    )
  }
  const medida = parseMedida(body?.medida)

  // ── Origem + máscara: baixa os uploads diretos (valida dono/área/limites) ──
  const admin = createAdminClient()
  const src = await downloadDirectUpload(
    admin, DIRECT_UPLOAD_AREAS['estudo-asset'], user.id, { kind: 'source' }, sourceKey,
  )
  if (!src.ok) return NextResponse.json({ error: src.message }, { status: src.status })

  let sourceWidth: number | null = null
  let sourceHeight: number | null = null
  try {
    const meta = await sharp(src.buffer).metadata()
    sourceWidth = meta.width ?? null
    sourceHeight = meta.height ?? null
  } catch {
    return NextResponse.json({ error: 'Não foi possível ler a imagem enviada.' }, { status: 400 })
  }

  let maskUrl: string | null = null
  if (maskKey) {
    const mask = await downloadDirectUpload(
      admin, DIRECT_UPLOAD_AREAS['estudo-asset'], user.id, { kind: 'mask' }, maskKey,
    )
    if (!mask.ok) return NextResponse.json({ error: mask.message }, { status: mask.status })
    try {
      const meta = await sharp(mask.buffer).metadata()
      const mw = meta.width ?? 0
      const mh = meta.height ?? 0
      if (!mw || !mh) throw new Error('máscara sem dimensões')
      if (sourceWidth && sourceHeight) {
        const delta = Math.abs(mw / mh - sourceWidth / sourceHeight) / (sourceWidth / sourceHeight)
        if (delta > MASK_ASPECT_TOLERANCE) {
          return NextResponse.json(
            { error: 'A marcação não corresponde à fotografia enviada — refaça a seleção.' },
            { status: 400 },
          )
        }
      }
    } catch {
      return NextResponse.json({ error: 'Máscara de preservação ilegível.' }, { status: 400 })
    }
    maskUrl = mask.url
  }

  // ── Custo + débito ─────────────────────────────────────────────────────────
  const config = getEstudarConfig()
  const cost = config.studyNodes
  let debited = false
  let estudoId: string | null = null

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
      console.error('[estudar] consume_workspace_nodes RPC error:', debitErr)
      return NextResponse.json({ error: 'Erro ao processar saldo' }, { status: 500 })
    }
    debited = true

    // ── Registro do estudo (obrigatório — sem a migration a rota não opera) ──
    const { data: estudoRow, error: insErr } = await admin
      .from('estudos')
      .insert({
        user_id: user.id,
        source_type: 'PHOTO',
        status: 'processing',
        source_image_url: src.url,
        source_width: sourceWidth,
        source_height: sourceHeight,
        preserve_mask_url: maskUrl,
        medida: medida ?? null,
        briefing,
        nodes_cost: cost,
        charged: true,
      } as never)
      .select('id')
      .single<{ id: string }>()
    if (insErr || !estudoRow) {
      console.error('[estudar] insert estudos falhou (migration aplicada?):', insErr)
      throw new Error('persistência do estudo indisponível')
    }
    estudoId = estudoRow.id

    // ── Geração das 3 alternativas em paralelo ───────────────────────────────
    const imageUrls = maskUrl ? [src.url, maskUrl] : [src.url]
    const imageLabels = buildImageLabels(!!maskUrl)
    const aspectRatio = nearestSupportedAspectRatio(sourceWidth, sourceHeight)

    const generateOne = async (variante: EstudoVariante) => {
      const prompt = buildEstudoPrompt({
        briefing,
        variante,
        hasPreserveMask: !!maskUrl,
        medida,
      })
      const falInput: Record<string, unknown> = {
        prompt,
        image_urls: imageUrls,
        num_images: 1,
        resolution: config.resolution,
        ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
        // Thinking alto: o NB2 planeja a cena antes de gerar e adere melhor a
        // contratos longos de preservação (só o NB2 expõe o knob no schema FAL).
        ...(config.imageEndpoint === 'fal-ai/nano-banana-2/edit' ? { thinking_level: 'high' } : {}),
      }
      const result = await generateImage({
        falEndpoint: config.imageEndpoint,
        falInput,
        timeoutMs: config.timeoutMs,
        context: `estudar.${variante}`,
        deliver: { kind: 'url', userId: user.id, area: 'estudar/result' },
        imageLabels,
      })
      const image = result.images[0]
      if (!image?.url) throw new Error('provider não devolveu imagem')
      // Saída do fallback FAL vive no CDN deles (sem SLA de retenção) —
      // re-hospeda no nosso Storage; GCP já sobe direto pro bucket.
      const rehosted = await rehostToStorage(admin, image.url, {
        bucket: STORAGE_BUCKET,
        userId: user.id,
        kind: 'estudar/result',
      })
      return {
        variante,
        prompt,
        imageUrl: rehosted?.url ?? image.url,
        width: image.width,
        height: image.height,
        provider: result.provider,
        model: result.providerModel,
        requestId: result.requestId,
      }
    }

    const settled = await Promise.allSettled(ESTUDO_VARIANTES.map(generateOne))

    // ── Persistência das alternativas + refund proporcional das falhas ───────
    type AltRow = {
      id: string
      variante: EstudoVariante
      imageUrl: string | null
      status: 'completed' | 'failed'
      errorMessage: string | null
    }
    const alternatives: AltRow[] = []
    let failedCount = 0

    for (let i = 0; i < settled.length; i++) {
      const variante = ESTUDO_VARIANTES[i]
      const outcome = settled[i]
      if (outcome.status === 'fulfilled') {
        const alt = outcome.value
        const { data: row, error } = await admin
          .from('estudo_alternativas')
          .insert({
            estudo_id: estudoId,
            user_id: user.id,
            variante,
            kind: 'inicial',
            status: 'completed',
            prompt: alt.prompt,
            image_url: alt.imageUrl,
            image_width: alt.width,
            image_height: alt.height,
            provider: alt.provider,
            model: alt.model,
            request_id: alt.requestId,
            nodes_cost: 0,
          } as never)
          .select('id')
          .single<{ id: string }>()
        if (error || !row) {
          console.error('[estudar] insert alternativa falhou:', error)
          failedCount++
          alternatives.push({ id: `${variante}-erro`, variante, imageUrl: null, status: 'failed', errorMessage: 'Falha ao salvar a alternativa.' })
          continue
        }
        alternatives.push({ id: row.id, variante, imageUrl: alt.imageUrl, status: 'completed', errorMessage: null })
      } else {
        failedCount++
        const msg = truncateErr((outcome.reason as Error)?.message ?? String(outcome.reason))
        console.error(`[estudar] alternativa ${variante} falhou:`, msg)
        const { data: row } = await admin
          .from('estudo_alternativas')
          .insert({
            estudo_id: estudoId,
            user_id: user.id,
            variante,
            kind: 'inicial',
            status: 'failed',
            error_message: msg,
            nodes_cost: 0,
          } as never)
          .select('id')
          .single<{ id: string }>()
        alternatives.push({
          id: row?.id ?? `${variante}-falha`,
          variante,
          imageUrl: null,
          status: 'failed',
          errorMessage: 'Não foi possível gerar esta alternativa.',
        })
      }
    }

    // Refund proporcional: cada alternativa vale 1/3 do estudo; falha total
    // devolve o valor cheio (sem sobra de arredondamento).
    let refunded = 0
    if (failedCount === ESTUDO_VARIANTES.length) refunded = cost
    else if (failedCount > 0) refunded = Math.floor(cost / ESTUDO_VARIANTES.length) * failedCount
    if (refunded > 0) {
      await refundNodes(admin, user.id, refunded, {
        module: 'estudar',
        jobTable: 'estudos',
        jobId: estudoId,
      })
    }

    const status =
      failedCount === ESTUDO_VARIANTES.length ? 'failed'
      : failedCount > 0 ? 'partial'
      : 'completed'
    await admin
      .from('estudos')
      .update({
        status,
        refunded_nodes: refunded,
        completed_at: new Date().toISOString(),
        ...(status === 'failed' ? { error_message: 'todas as alternativas falharam' } : {}),
      } as never)
      .eq('id', estudoId)

    if (status === 'failed') {
      return NextResponse.json(
        { error: 'Não foi possível gerar o estudo agora. Nada foi cobrado — tente novamente.' },
        { status: 502 },
      )
    }

    // ── Saldo pós-operação do PAGADOR (workspace) pra UI atualizar ───────────
    const payerId = (await getPayerId(admin, user.id)) ?? user.id
    const { data: balance } = await admin
      .from('user_node_balance')
      .select('plan_balance, total_balance')
      .eq('user_id', payerId)
      .single<{ plan_balance: number | null; total_balance: number | null }>()

    return NextResponse.json({
      estudoId,
      status,
      sourceUrl: src.url,
      sourceWidth,
      sourceHeight,
      alternatives,
      nodesCharged: cost - refunded,
      refundedNodes: refunded,
      credits: balance?.plan_balance ?? 0,
      totalBalance: balance?.total_balance ?? 0,
    })
  } catch (err: unknown) {
    console.error('[estudar] ERROR:', (err as Error)?.message ?? err)
    if (debited) {
      await refundNodes(admin, user.id, cost, {
        module: 'estudar',
        jobTable: 'estudos',
        jobId: estudoId,
      })
      if (estudoId) {
        await admin
          .from('estudos')
          .update({
            status: 'failed',
            refunded_nodes: cost,
            error_message: truncateErr((err as Error)?.message ?? 'erro desconhecido'),
            completed_at: new Date().toISOString(),
          } as never)
          .eq('id', estudoId)
      }
    }
    return NextResponse.json(
      { error: 'Erro ao gerar o estudo. Nada foi cobrado — tente novamente.' },
      { status: 500 },
    )
  }
}

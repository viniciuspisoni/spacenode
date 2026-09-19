// POST /api/upscale — módulo Ampliar v2 (abas Resolução e Aprimorar).
//
// Contrato (JSON — a imagem sobe DIRETO pro Storage via uploadDirect, área
// upscale-source; o binário não passa pela Vercel, teto de 4,5 MB não se aplica):
//   - sourceKey:    string (key do upload direto, obrigatório)
//   - tab:          'resolution' | 'enhance'
//   - modeId:       'fidelity' | 'recover' | 'denoise' | 'deblur' | 'restore' | 'smart'
//   - scale:        'none' | '2x' | '4x' | '8x' | 'ultra'
//   - objectiveId?: 'client' | 'portfolio' | 'print' | 'recover' | 'final'
//   - imageWidth?:  number  (origem; fallback se o decode server-side falhar)
//   - imageHeight?: number
//
// Custo: computeUpscaleCost — único ponto de verdade.
// Débito: consume_nodes_v2 com refund_nodes em falha pós-débito.
// Histórico: insere em `renders` com upscale_meta jsonb completo.

import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRequestUser } from '@/lib/auth/request-user'
import { refundNodes } from '@/lib/billing/refund-nodes'
import { DIRECT_UPLOAD_AREAS, downloadDirectUpload } from '@/lib/storage/direct-upload'
import { fetchStorageBuffer } from '@/lib/storage/fetch'
// Server-only (sharp) — importado direto, nunca via lib/upscale/index, que o
// componente cliente também importa.
import { normalizeSource, type NormalizeNote } from '@/lib/upscale/normalize-source'
import sharp from 'sharp'
import {
  MAX_OUTPUT_MP,
  computeUpscaleCost,
  effectiveFactor,
  finalProvider,
  isScaleClamped,
  megapixelsFromDimensions,
  runUpscalePipeline,
  type ModeId,
  type Scale,
  type UpscaleTab,
} from '@/lib/upscale'

export const maxDuration = 300

fal.config({ credentials: process.env.FAL_KEY })

const VALID_TABS:   UpscaleTab[] = ['resolution', 'enhance']
const VALID_MODES:  ModeId[]     = ['fidelity', 'recover', 'denoise', 'deblur', 'restore', 'smart']
const VALID_SCALES: Scale[]      = ['none', '2x', '4x', '8x', 'ultra']

// Teto do OUTPUT em MAX_OUTPUT_MP (lib/upscale): 256 MP ≈ 16K×16K — acima
// disso o provider falha depois de minutos (refund, tempo perdido) ou devolve
// resultado silenciosamente reduzido. Checado ANTES do custo/débito.

// Constraint: aba × modo precisam combinar para evitar requisições inválidas.
const ALLOWED_MODES_BY_TAB: Record<UpscaleTab, ModeId[]> = {
  resolution: ['fidelity', 'recover'],
  enhance:    ['denoise', 'deblur', 'restore', 'smart'],
}

export async function POST(req: NextRequest) {
  // Cookie (browser) ou Bearer (plugin SketchUp).
  const { user } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // ── Parse + validação ──────────────────────────────────────────────────────
  const body = await req.json().catch(() => null)
  const sourceKey   = typeof body?.sourceKey   === 'string' ? body.sourceKey   : ''
  const tab         = typeof body?.tab         === 'string' ? body.tab         : 'resolution'
  const modeId      = typeof body?.modeId      === 'string' ? body.modeId      : 'fidelity'
  const scale       = typeof body?.scale       === 'string' ? body.scale       : '4x'
  const objectiveId = typeof body?.objectiveId === 'string' ? body.objectiveId : null
  const widthRaw    = body?.imageWidth  != null ? String(body.imageWidth)  : null
  const heightRaw   = body?.imageHeight != null ? String(body.imageHeight) : null

  if (!sourceKey) {
    return NextResponse.json({ error: 'Imagem obrigatória' }, { status: 400 })
  }
  if (!VALID_TABS.includes(tab as UpscaleTab)) {
    return NextResponse.json({ error: 'tab inválido' }, { status: 400 })
  }
  if (!VALID_MODES.includes(modeId as ModeId)) {
    return NextResponse.json({ error: 'modeId inválido' }, { status: 400 })
  }
  if (!VALID_SCALES.includes(scale as Scale)) {
    return NextResponse.json({ error: 'scale inválido' }, { status: 400 })
  }
  if (!ALLOWED_MODES_BY_TAB[tab as UpscaleTab].includes(modeId as ModeId)) {
    return NextResponse.json({ error: 'combinação tab/modo inválida' }, { status: 400 })
  }

  const tabT    = tab    as UpscaleTab
  const modeT   = modeId as ModeId
  const scaleT  = scale  as Scale

  // ── Origem: baixa o upload direto do Storage (valida dono/área/limites) ────
  const admin = createAdminClient()
  const src = await downloadDirectUpload(
    admin, DIRECT_UPLOAD_AREAS['upscale-source'], user.id, {}, sourceKey,
  )
  if (!src.ok) return NextResponse.json({ error: src.message }, { status: src.status })

  // Dimensões REAIS medidas no servidor (AL-5): o custo do upscale é por
  // megapixel; confiar no imageWidth/imageHeight do cliente permitia
  // subdeclarar as dimensões pra pagar o piso enquanto envia uma imagem grande
  // (custo real alto). sharp mede a origem; o client só é fallback se o decode
  // falhar (caso raro — aí o provider provavelmente também falharia).
  //
  // Além de medir, NORMALIZA a orientação EXIF quando preciso (ver
  // normalizeSource): a saída é PNG, formato sem tag de orientação, então uma
  // foto deitada voltaria deitada e com a proporção trocada. Cor NÃO é tratada
  // aqui, de propósito — está medido que o provider preserva o perfil ICC
  // ponta a ponta (MEDICOES.md §7).
  let width:  number | null = null
  let height: number | null = null
  let sourceBuffer = src.buffer
  let sourceMime   = src.mime
  let normalized: NormalizeNote = null
  try {
    const norm = await normalizeSource(src.buffer, src.mime)
    width        = norm.width
    height       = norm.height
    sourceBuffer = norm.buffer
    sourceMime   = norm.mime
    normalized   = norm.note
  } catch {
    console.warn('[upscale] sharp metadata falhou — usando dims do cliente (fallback)')
    width  = widthRaw  ? Number(widthRaw)  : null
    height = heightRaw ? Number(heightRaw) : null
  }

  // ── Teto de resolução do output (antes de custo/débito) ────────────────────
  // Fator EFETIVO: é o que o motor entrega e, portanto, o que se cobra. Um
  // cliente antigo que ainda peça 8× roda e paga como 4× (MAX_UPSCALE_FACTOR).
  const scaleFactor = effectiveFactor(scaleT)
  if (width && height) {
    const outputMp = (width * height * scaleFactor * scaleFactor) / 1_000_000
    if (outputMp > MAX_OUTPUT_MP) {
      return NextResponse.json(
        {
          code:  'output_too_large',
          error:
            `Esta imagem em ${scaleFactor}× daria ~${Math.round(outputMp)} MP, acima do limite de ${MAX_OUTPUT_MP} MP. ` +
            'Escolha uma escala menor. Nenhum node foi cobrado.',
        },
        { status: 400 },
      )
    }
  }

  // ── Custo ──────────────────────────────────────────────────────────────────
  const cost = computeUpscaleCost({
    tab:        tabT,
    modeId:     modeT,
    scale:      scaleT,
    megapixels: megapixelsFromDimensions(width, height),
  }).total

  // ── Débito (com refund em falha) ───────────────────────────────────────────
  let debited = false
  let inputUrl:  string | undefined

  try {
    const { error: debitErr } = await admin.rpc('consume_workspace_nodes', {
      user_id_input: user.id,
      amount:        cost,
    })
    if (debitErr) {
      if (debitErr.code === 'P0001') {
        return NextResponse.json(
          { code: 'insufficient_balance', error: 'insufficient_balance', required: cost, message: 'Saldo insuficiente' },
          { status: 402 },
        )
      }
      console.error('[upscale] consume_nodes_v2 RPC error:', debitErr)
      return NextResponse.json({ code: 'balance_error', error: 'Erro ao processar saldo' }, { status: 500 })
    }
    debited = true

    // ── Upload da imagem para FAL (buffer normalizado, ver normalizeSource) ─
    const baseName = sourceKey.split('/').pop() ?? 'source.jpg'
    const fileName = sourceMime === 'image/png' ? baseName.replace(/\.[^.]+$/, '') + '.png' : baseName
    inputUrl = await fal.storage.upload(
      new File([new Uint8Array(sourceBuffer)], fileName, { type: sourceMime }),
    )

    console.log('[upscale] tab=%s mode=%s scale=%s mp=%s', tabT, modeT, scaleT, megapixelsFromDimensions(width, height))

    // ── Pipeline ────────────────────────────────────────────────────────────
    const result = await runUpscalePipeline({
      tab:             tabT,
      modeId:          modeT,
      scale:           scaleT,
      objectiveId:     objectiveId as never,
      imageUrl:        inputUrl,
      inputDimensions: width && height ? { width, height } : null,
    })

    const outputUrl   = result.outputUrl
    const usedProvider = finalProvider(result) ?? modeT
    // Fallback (ex.: Topaz → Clarity na Alta Fidelidade) deixa de ser
    // silencioso: a UI avisa que o resultado veio de um provider generativo,
    // não do preservador prometido pelo modo.
    const fallbackUsed = result.steps.some(s => s.status === 'completed' && s.fallbackOf !== null)

    // ── Verificação do output: dimensões REAIS + fator atingido ──────────────
    // (o provider pode clampar/reduzir sem avisar — ex.: Topaz vai só até 4×).
    // Best-effort: falha aqui nunca derruba a entrega.
    let outputWidth:  number | null = null
    let outputHeight: number | null = null
    let outputBytes:  number | null = null
    let outputFormat: string | null = null
    let achievedFactor: number | null = null
    try {
      const outBuf  = await fetchStorageBuffer(outputUrl)
      const outMeta = await sharp(outBuf).metadata()
      outputWidth  = outMeta.width  ?? null
      outputHeight = outMeta.height ?? null
      outputBytes  = outBuf.byteLength
      outputFormat = outMeta.format ?? null
      if (outputWidth && width) {
        achievedFactor = Math.round((outputWidth / width) * 100) / 100
        if (scaleFactor > 1 && achievedFactor < scaleFactor * 0.9) {
          console.warn('[upscale] fator atingido abaixo do pedido:', achievedFactor, 'vs', scaleFactor)
        }
      }
    } catch (verifyErr) {
      console.warn('[upscale] verificação do output falhou (segue sem):', (verifyErr as Error).message)
    }
    // Rastreabilidade: id do request fal do último step concluído (o que produziu
    // o output). O detalhe por step também vai em upscale_meta.steps[].requestId.
    const falRequestId = [...result.steps].reverse().find(s => s.status === 'completed')?.requestId ?? null

    // ── Histórico ───────────────────────────────────────────────────────────
    // Mantemos o padrão legado em ambient/style/lighting para compatibilidade
    // com a UI de histórico atual; o detalhe rico vai em upscale_meta.
    const styleKey = `upscale:${usedProvider}`
    const lighting = scaleT === 'none' ? 'none' : scaleT

    const upscaleMeta = {
      tab:              tabT,
      mode_id:          modeT,
      objective_id:     objectiveId,
      scale:            scaleT,
      steps:            result.steps,
      input_dimensions:  width && height ? { width, height } : null,
      output_dimensions: outputWidth && outputHeight ? { width: outputWidth, height: outputHeight } : null,
      achieved_factor:   achievedFactor,
      // Escala pedida × entregue: 'scale' guarda o rótulo do pedido, este
      // guarda o fator que o motor de fato aplicou e pelo qual se cobrou.
      effective_factor:  scaleFactor,
      output_format:     outputFormat,
      output_bytes:      outputBytes,
      source_normalized: normalized,
      fallback_used:     fallbackUsed,
      total_duration_ms: result.totalDurationMs,
    }

    // nodes_charged: o Histórico ("Detalhes da geração") lê daqui o custo real.
    // duration_ms: idem para tempo de geração (coluna da migration 20260701;
    // se ainda não aplicada, o insert cai no fallback sem ela).
    const upscaleRow = {
      user_id:      user.id,
      input_url:    inputUrl,
      output_url:   outputUrl,
      prompt:       `ampliar ${tabT}/${modeT} ${scaleT}`,
      ambient:      'upscale',
      style:        styleKey,
      lighting,
      nodes_charged: cost,
      fal_request_id: falRequestId,
      status:       'completed',
      completed_at: new Date().toISOString(),
      upscale_meta: upscaleMeta,
    }
    const ins = await admin.from('renders').insert({
      ...upscaleRow,
      duration_ms: result.totalDurationMs ?? null,
    } as never)
    if (ins.error && (ins.error.code === 'PGRST204' || ins.error.code === '42703')) {
      await admin.from('renders').insert(upscaleRow as never)
    }

    return NextResponse.json({
      url:          outputUrl,
      originalUrl:  inputUrl,
      provider:     usedProvider,
      fallbackUsed,
      outputWidth,
      outputHeight,
      outputBytes,
      outputFormat,
      achievedFactor,
      // A UI mostra a escala ENTREGUE, não a pedida — um cliente antigo que
      // peça 8× precisa ver 4× no rodapé do resultado.
      effectiveFactor: scaleFactor,
      scaleClamped:    isScaleClamped(scaleT),
      sourceNormalized: normalized,
      nodesCharged:    cost,
      durationMs:   result.totalDurationMs,
    })

  } catch (err: unknown) {
    const e = err as { status?: number; body?: unknown; message?: string }
    console.error('[upscale] ERROR status:', e?.status)
    console.error('[upscale] ERROR body  :', JSON.stringify(e?.body ?? e?.message ?? err))

    // O estorno acontece de todo jeito; o que muda é o usuário SABER disso.
    // "Erro ao processar imagem" para tudo deixava a pessoa sem saber se
    // perdeu node, se o problema é a imagem dela ou se adianta tentar de novo.
    let refunded = false
    if (debited) {
      await refundNodes(admin, user.id, cost, { module: 'upscale' })
      refunded = true
    }

    const raw      = `${e?.message ?? ''} ${JSON.stringify(e?.body ?? '')}`.toLowerCase()
    const isTimeout = raw.includes('timeout')
    const backNote  = refunded ? ` Seus ${cost} nodes foram devolvidos.` : ''

    const { code, message, status } = isTimeout
      ? {
          code: 'provider_timeout',
          status: 504,
          message:
            'O motor demorou demais para responder — normalmente é pico de uso.' +
            ` Tente de novo em alguns minutos.${backNote}`,
        }
      : {
          code: 'provider_failed',
          status: 502,
          message: `Não conseguimos processar esta imagem.${backNote} Se repetir, tente outra escala ou outro arquivo.`,
        }

    return NextResponse.json({ code, error: message, refunded }, { status })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayerId } from '@/lib/workspaces/context'
import { refundNodes } from '@/lib/billing/refund-nodes'
import {
  APRESENTAR_TOOLS,
  MOODBOARD_AMBIENTS,
  MOODBOARD_STYLES,
  MOODBOARD_PALETTES,
  MOODBOARD_LEVELS,
  MOODBOARD_FORMATS,
  type MoodboardAmbient,
  type MoodboardStyle,
  type MoodboardPalette,
  type MoodboardLevel,
  type MoodboardFormat,
} from '@/lib/apresentar/config'
import { generateMoodboardContent } from '@/lib/apresentar/moodboard'

export const maxDuration = 60

fal.config({ credentials: process.env.FAL_KEY })

// ── Apresentar · Moodboard · POST /api/apresentar/moodboard ──────────────────
//
// Pipeline:
//   1. Auth
//   2. Validar payload (formato, presets, imagem opcional)
//   3. consume_nodes_v2 (TOOL.nodes — 8 por moodboard)
//   4. Se imagem: fal.storage.upload → vira referenceUrl + coverUrl
//   5. generateMoodboardContent() via Claude Vision/Text
//   6. INSERT renders { config_snapshot = { tool, module, format, result } }
//   7. refund_nodes em falha pós-débito
//
// Renderização do moodboard é client-side (SVG → PNG).

const TOOL = APRESENTAR_TOOLS.moodboard

const VALID_AMBIENTS  = MOODBOARD_AMBIENTS.map(a => a.id)
const VALID_STYLES    = MOODBOARD_STYLES.map(s => s.id)
const VALID_PALETTES  = MOODBOARD_PALETTES.map(p => p.id)
const VALID_LEVELS    = MOODBOARD_LEVELS.map(l => l.id)
const VALID_FORMATS   = MOODBOARD_FORMATS.map(f => f.id)

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()

  let debited = false
  const nodesToCharge = TOOL.nodes ?? 0
  let referenceUrl: string | undefined

  try {
    const formData    = await req.formData()
    const imageFile   = formData.get('image')       as File   | null
    const projectName = (formData.get('projectName') as string | null)?.trim() || undefined
    const ambient     = formData.get('ambient')     as string | null
    const style       = formData.get('style')       as string | null
    const palette     = formData.get('palette')     as string | null
    const level       = formData.get('level')       as string | null
    const format      = formData.get('format')      as string | null

    // ── Validação ─────────────────────────────────────────────────────────────
    if (!VALID_AMBIENTS.includes(ambient as MoodboardAmbient)) {
      return NextResponse.json({ error: 'Ambiente inválido.' }, { status: 400 })
    }
    if (!VALID_STYLES.includes(style as MoodboardStyle)) {
      return NextResponse.json({ error: 'Estilo inválido.' }, { status: 400 })
    }
    if (!VALID_PALETTES.includes(palette as MoodboardPalette)) {
      return NextResponse.json({ error: 'Paleta inválida.' }, { status: 400 })
    }
    if (!VALID_LEVELS.includes(level as MoodboardLevel)) {
      return NextResponse.json({ error: 'Nível inválido.' }, { status: 400 })
    }
    if (!VALID_FORMATS.includes(format as MoodboardFormat)) {
      return NextResponse.json({ error: 'Formato inválido.' }, { status: 400 })
    }

    // ── Identidade do estúdio ─────────────────────────────────────────────────
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
        console.error('[apresentar/moodboard] consume_nodes_v2 error:', debitError)
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

    // ── Upload da referência (se houver) ──────────────────────────────────────
    if (imageFile && imageFile.size > 0) {
      if (!imageFile.type.startsWith('image/')) {
        throw new Error('Arquivo de referência precisa ser uma imagem.')
      }
      if (imageFile.size > 20 * 1024 * 1024) {
        throw new Error('Imagem muito grande (máx 20 MB).')
      }
      referenceUrl = await fal.storage.upload(imageFile)
      console.log('[apresentar/moodboard] referenceUrl:', referenceUrl)
    }

    // ── Geração do conteúdo ───────────────────────────────────────────────────
    const result = await generateMoodboardContent({
      referenceUrl,
      projectName,
      ambient:  ambient  as MoodboardAmbient,
      style:    style    as MoodboardStyle,
      palette:  palette  as MoodboardPalette,
      level:    level    as MoodboardLevel,
      studioName,
    })
    console.log('[apresentar/moodboard] gerado:', result.title, '·', result.palette.length, 'swatches ·', result.materials.length, 'materiais')

    // ── Persistência ──────────────────────────────────────────────────────────
    const configSnapshot = {
      tool:        TOOL.id,
      module:      'apresentar',
      format,
      projectName: projectName ?? null,
      ambient,
      style,
      palette,
      level,
      result,
    }

    const insertResult = await admin
      .from('renders')
      .insert({
        user_id:         user.id,
        input_url:       referenceUrl ?? null,
        output_url:      referenceUrl ?? null,    // o PNG final é gerado no cliente
        prompt:          `Moodboard: ${result.title}`,
        ambient:         `moodboard · ${ambient}`,
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
      console.error('[apresentar/moodboard] DB INSERT falhou (gerado — investigar):', {
        error: insertResult.error, userId: user.id,
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
      renderId:         insertResult.data?.id ?? null,
      format,
      ambient,
      style,
      palette,
      level,
      result,
      studioName:       studioName ?? null,
      creditsRemaining: balance?.total_balance ?? 0,
      planBalance:      balance?.plan_balance  ?? 0,
      extraBalance:     balance?.lumen_balance ?? 0,
      nodesCharged:     nodesToCharge,
    })

  } catch (err: unknown) {
    if (debited && nodesToCharge > 0) {
      await refundNodes(admin, user.id, nodesToCharge, { module: 'apresentar/moodboard' })
    }

    const e = err as { status?: number; body?: unknown; message?: string }
    console.error('[apresentar/moodboard] ERROR:', e?.status, e?.message)

    return NextResponse.json(
      { error: e?.message || 'Erro ao gerar moodboard. Tente novamente.' },
      { status: 500 }
    )
  }
}

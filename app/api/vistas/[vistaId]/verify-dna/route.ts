// POST /api/vistas/[vistaId]/verify-dna
//
// Re-analisa imagem da vista contra o DNA travado do Space e persiste o
// resultado. Disparado pelo cliente em fire-and-forget após cada geração
// (evita prolongar a latência da rota de generate).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'
import { verifyDna, getVisualDna } from '@/lib/spaces/dna'
import type { Vista } from '@/lib/spaces/types'

export async function POST(
  _req:    NextRequest,
  context: { params: Promise<{ vistaId: string }> },
) {
  const { vistaId } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // Rate limit (AL-2): Vision grátis, disparado fire-and-forget por geração.
  const rl = await rateLimit(createAdminClient(), `verify-dna:${user.id}`, 60, 60)
  if (!rl.allowed) return NextResponse.json({ error: 'Muitas requisições.' }, { status: 429 })

  // Carrega vista + DNA do Space
  const { data: vistaRow, error: vErr } = await supabase
    .from('vistas')
    .select('id, image_url, space_id, status, dna_verified, axis, is_edited, edit_mask_coverage, reference_vista_id')
    .eq('id', vistaId)
    .single()
  if (vErr || !vistaRow) {
    return NextResponse.json({ error: 'Vista não encontrada' }, { status: 404 })
  }
  const vista = vistaRow as Pick<Vista, 'id' | 'image_url' | 'space_id' | 'status' | 'dna_verified' | 'axis' | 'is_edited' | 'edit_mask_coverage' | 'reference_vista_id'>

  if (vista.status !== 'completed' || !vista.image_url) {
    return NextResponse.json({ error: 'Vista não está pronta' }, { status: 409 })
  }

  // Idempotência: se já verificada, retorna direto.
  if (vista.dna_verified !== null) {
    return NextResponse.json({ alreadyVerified: true })
  }

  // Multi-DNA: vista gerada a partir de uma referência é verificada contra o
  // DNA DELA (foi o que a geração usou), não o do Space. Fallback pro DNA do
  // Space se a referência sumiu (ON DELETE SET NULL) ou perdeu o dna.
  let referenceDna: unknown = null
  if (vista.reference_vista_id) {
    const { data: refRow } = await supabase
      .from('vistas')
      .select('dna')
      .eq('id', vista.reference_vista_id)
      .maybeSingle()
    referenceDna = refRow?.dna ?? null
  }

  const { data: spaceRow } = await supabase
    .from('spaces')
    .select('dna')
    .eq('id', vista.space_id)
    .single()
  const visualDna = getVisualDna(referenceDna) ?? getVisualDna(spaceRow?.dna)
  if (!visualDna) {
    return NextResponse.json({ error: 'Space sem DNA' }, { status: 409 })
  }

  try {
    // Modo de verificação:
    // - vistas editadas (Retocar) → edit_relaxed (só uma região mudou)
    // - eixo Ângulo → angulo_relaxed (nova vista: enquadramento muda por design)
    // - eixo Detalhe → detalhe_relaxed (recorte mostra só parte dos materiais/
    //   paleta; avaliar só o que está visível, senão dá falso "DNA divergente")
    // - padrão       → standard
    const mode = vista.is_edited
      ? 'edit_relaxed'
      : vista.axis === 'angulo'
        ? 'angulo_relaxed'
        : vista.axis === 'detalhe'
          ? 'detalhe_relaxed'
          : 'standard'
    const coverage = typeof vista.edit_mask_coverage === 'number' ? vista.edit_mask_coverage : 0
    const verification = await verifyDna(vista.image_url, visualDna, mode, coverage)

    await supabase
      .from('vistas')
      .update({
        dna_verified:             verification.passed,
        dna_verification_details: verification,
      })
      .eq('id', vistaId)

    return NextResponse.json({ verification })
  } catch (err) {
    console.error('[verify-dna] error:', (err as Error).message)
    return NextResponse.json({ error: 'Falha na verificação' }, { status: 500 })
  }
}

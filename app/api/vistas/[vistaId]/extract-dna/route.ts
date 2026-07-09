// POST /api/vistas/[vistaId]/extract-dna
//
// Extrai DNA próprio de uma vista gerada — ela vira "referência" selecionável
// nas próximas gerações do Space (multi-DNA). Espelha a extração do Space:
// validações de pré-débito → débito (8 nodes) → Vision API (análise COMPLETA
// da imagem da vista: visual + briefing, sem herdar do Space — um recorte ou
// outra luz divergem da Vista Mestre de propósito) → persistência → retorno.
// Refund best-effort em falha pós-débito.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { refundNodes } from '@/lib/billing/refund-nodes'
import { extractDnaPayload } from '@/lib/spaces/dna'
import { DNA_EXTRACTION_COST } from '@/lib/spaces/economy'
import { signStorageUrl } from '@/lib/storage/signed'

export async function POST(
  _req:    NextRequest,
  context: { params: Promise<{ vistaId: string }> },
) {
  const { vistaId } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()

  let debited = false

  try {
    // Carrega vista — RLS valida posse pelo user.
    const { data: vista, error: fetchErr } = await supabase
      .from('vistas')
      .select('id, space_id, status, image_url, dna')
      .eq('id', vistaId)
      .single()

    if (fetchErr || !vista) {
      return NextResponse.json({ error: 'Vista não encontrada' }, { status: 404 })
    }
    if (vista.status !== 'completed' || !vista.image_url) {
      return NextResponse.json({ error: 'Vista não está pronta' }, { status: 409 })
    }

    // Guard ATÔMICO contra double-submit (mesmo padrão AL-6 da extração do
    // Space): só a PRIMEIRA requisição consegue setar dna_extracting. Se 0
    // linhas, outra extração está em andamento — retorna 409 SEM debitar.
    const { data: claimed } = await supabase
      .from('vistas')
      .update({ dna_extracting: true })
      .eq('id', vistaId)
      .eq('dna_extracting', false)
      .select('id')
      .maybeSingle()
    if (!claimed) {
      return NextResponse.json({ error: 'Extração de DNA já em andamento.' }, { status: 409 })
    }

    // ── Débito atômico ──────────────────────────────────────────
    const { error: debitErr } = await admin.rpc('consume_workspace_nodes', {
      user_id_input: user.id,
      amount:        DNA_EXTRACTION_COST,
    })

    if (debitErr) {
      console.error('[vistas.extract-dna] consume RPC error:', debitErr)
      await supabase.from('vistas').update({ dna_extracting: false }).eq('id', vistaId)
      if (debitErr.code === 'P0001') {
        return NextResponse.json(
          {
            error:     'insufficient_balance',
            available: 0,
            required:  DNA_EXTRACTION_COST,
            message:   `Saldo insuficiente. Necessários: ${DNA_EXTRACTION_COST} nodes.`,
          },
          { status: 402 },
        )
      }
      return NextResponse.json({ error: 'Erro ao processar saldo' }, { status: 500 })
    }
    debited = true

    // ── Vision API: análise completa da imagem da vista ─────────
    // Assina a URL antes de mandar pra Vision (no-op enquanto os buckets forem
    // públicos / URL da FAL; pronto pro flip do B2).
    const imageUrl = (await signStorageUrl(admin, vista.image_url)) ?? vista.image_url
    const payload  = await extractDnaPayload(imageUrl)

    // ── Persistir ───────────────────────────────────────────────
    const { error: updErr } = await supabase
      .from('vistas')
      .update({
        dna:              payload,
        dna_extracted_at: new Date().toISOString(),
        dna_extracting:   false,
      })
      .eq('id', vistaId)

    if (updErr) {
      console.error('[vistas.extract-dna] update failed (DNA gerado mas não persistido):', updErr)
      // Não refunda: usuário recebeu o DNA. Loga pra reprocessar.
    }

    return NextResponse.json({ dna: payload.visual })

  } catch (err) {
    if (debited) {
      await refundNodes(admin, user.id, DNA_EXTRACTION_COST, { module: 'vistas/extract-dna', jobTable: 'vistas', jobId: vistaId })
    }
    await supabase.from('vistas').update({ dna_extracting: false }).eq('id', vistaId)

    console.error('[vistas.extract-dna] error:', (err as Error).message)
    return NextResponse.json(
      { error: 'Falha na análise da vista. Tente novamente.' },
      { status: 500 },
    )
  }
}

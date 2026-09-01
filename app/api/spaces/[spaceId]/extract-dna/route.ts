// POST /api/spaces/[spaceId]/extract-dna
//
// Validações de pré-débito  →  débito (8 nodes via consume_nodes_v2)  →
// chamada Vision API  →  persistência do DNA  →  retorno do DNA.
// Em caso de falha pós-débito, faz refund best-effort.

import { NextRequest, NextResponse } from 'next/server'
import { getRequestAuthContext } from '@/lib/auth/request-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { refundNodes } from '@/lib/billing/refund-nodes'
import { extractDnaPayload } from '@/lib/spaces/dna'
import { DNA_EXTRACTION_COST } from '@/lib/spaces/economy'

export async function POST(
  req:     NextRequest,
  context: { params: Promise<{ spaceId: string }> },
) {
  const { spaceId } = await context.params
  // Cookie (browser) ou Bearer (plugin SketchUp) — client RLS do usuário.
  const { user, supabase } = await getRequestAuthContext(req)
  if (!user || !supabase) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()

  let debited = false

  try {
    const { data: space, error: fetchErr } = await supabase
      .from('spaces')
      .select('id, status, vista_mestre_url, source_metadata')
      .eq('id', spaceId)
      .single()

    if (fetchErr || !space) {
      return NextResponse.json({ error: 'Space não encontrado' }, { status: 404 })
    }
    if (!space.vista_mestre_url) {
      return NextResponse.json({ error: 'Vista Mestre não enviada' }, { status: 409 })
    }
    if (space.status === 'locked' || space.status === 'archived') {
      return NextResponse.json({ error: 'Space não permite re-extração' }, { status: 409 })
    }

    // Guard ATÔMICO contra double-submit (AL-6): só a PRIMEIRA requisição
    // consegue transicionar pra 'dna_extracting'. Se 0 linhas (outra já está
    // extraindo), retorna 409 SEM debitar. Antes o UPDATE era INCONDICIONAL e
    // duas requisições concorrentes passavam pela leitura acima e debitavam
    // 8 nodes CADA.
    const { data: claimed } = await supabase
      .from('spaces')
      .update({ status: 'dna_extracting' })
      .eq('id', spaceId)
      .neq('status', 'dna_extracting')
      .select('id')
      .maybeSingle()
    if (!claimed) {
      return NextResponse.json({ error: 'Extração de DNA já em andamento.' }, { status: 409 })
    }

    // ── Débito atômico ──────────────────────────────────────────
    const { data: debitData, error: debitErr } = await admin.rpc('consume_workspace_nodes', {
      user_id_input: user.id,
      amount:        DNA_EXTRACTION_COST,
    })

    if (debitErr) {
      console.error('[extract-dna] consume_nodes_v2 RPC error:', debitErr)
      // Reverte estado pra draft pra usuário poder tentar novamente
      await supabase.from('spaces').update({ status: 'draft' }).eq('id', spaceId)
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
    void debitData

    // ── Vision API: DNA visual + briefing arquitetônico em paralelo ───
    // source_metadata vem populado quando o Space foi criado a partir de
    // uma render (fluxo /api/spaces/from-render). Quando presente:
    //   - DNA visual usa prompt enriquecido com ground truth de configs
    //   - briefing técnico é reusado se já estava em config_snapshot
    //     (economiza 1 call de Vision)
    const payload = await extractDnaPayload(
      space.vista_mestre_url,
      space.source_metadata as Parameters<typeof extractDnaPayload>[1] ?? null,
    )

    // ── Persistir ───────────────────────────────────────────────
    const { error: updErr } = await supabase
      .from('spaces')
      .update({
        dna:              payload,
        dna_extracted_at: new Date().toISOString(),
        status:           'dna_extracted',
      })
      .eq('id', spaceId)

    if (updErr) {
      console.error('[extract-dna] update failed (DNA gerado mas não persistido):', updErr)
      // Não refunda: usuário recebeu o DNA. Loga pra reprocessar.
    }

    // Resposta mantém shape compatível com NewSpaceFlow (que lê dna.estilo etc):
    // exposto só o `visual` na response — briefing é interno.
    return NextResponse.json({ dna: payload.visual })

  } catch (err) {
    if (debited) {
      await refundNodes(admin, user.id, DNA_EXTRACTION_COST, { module: 'extract-dna', jobTable: 'spaces', jobId: spaceId })
    }

    // Reverte status pra draft
    await supabase.from('spaces').update({ status: 'draft' }).eq('id', spaceId)

    console.error('[extract-dna] error:', (err as Error).message)
    return NextResponse.json(
      { error: 'Falha na análise da Vista Mestre. Tente novamente.' },
      { status: 500 },
    )
  }
}

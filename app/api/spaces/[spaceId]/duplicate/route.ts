// POST /api/spaces/[spaceId]/duplicate → duplica o Space (metadados + Vista
// Mestre + DNA). Vistas geradas NÃO são copiadas — são histórico de geração
// do projeto original, e a cópia nasce pronta pra gerar as próprias.
//
// Gratuito: nenhuma geração acontece aqui; o DNA copiado já foi pago na
// extração original.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  _req:    NextRequest,
  context: { params: Promise<{ spaceId: string }> },
) {
  const { spaceId } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: original, error: fetchError } = await supabase
    .from('spaces')
    .select('*')
    .eq('id', spaceId)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !original) {
    return NextResponse.json({ error: 'Space não encontrado' }, { status: 404 })
  }

  // Estágio da cópia derivado do que existe de fato (cópia de um arquivado
  // volta ativa; extração em andamento não é herdável).
  const status = original.locked_at && original.dna
    ? 'locked'
    : original.dna
      ? 'dna_extracted'
      : 'draft'

  const name = `${original.name} (cópia)`.slice(0, 80)

  const { data: copy, error: insertError } = await supabase
    .from('spaces')
    .insert({
      user_id:          user.id,
      name,
      category:         original.category,
      engine:           original.engine,
      status,
      vista_mestre_url: original.vista_mestre_url,
      dna:              original.dna,
      dna_extracted_at: original.dna_extracted_at,
      locked_at:        status === 'locked' ? original.locked_at : null,
      source_render_id: original.source_render_id,
      source_metadata:  original.source_metadata,
    })
    .select('id, name, status')
    .single()

  if (insertError || !copy) {
    console.error('[spaces.duplicate] insert failed:', insertError)
    return NextResponse.json({ error: 'Erro ao duplicar Space' }, { status: 500 })
  }

  return NextResponse.json({ space: copy })
}

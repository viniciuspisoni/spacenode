// lib/spaces/vista-mestre-upload.ts
//
// Constantes e validação compartilhadas do upload direto da Vista Mestre
// (rotas em app/api/spaces/[spaceId]/upload-vista-mestre/{sign,confirm}).
//
// Por que upload direto: Vercel Functions rejeitam corpo de request > 4,5 MB
// com 413 em texto puro ("Request Entity Too Large") — bem abaixo dos 15 MB
// prometidos na UI. O browser sobe o arquivo direto pro Storage via signed
// upload URL; o bucket impõe os mesmos limites (file_size_limit 15 MB +
// allowed_mime_types) no próprio PUT, então o teto continua valendo
// server-side mesmo sem o arquivo passar pela nossa API.

import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const VISTA_MESTRE_BUCKET = 'space-mestres'
export const VISTA_MESTRE_MAX_BYTES = 15 * 1024 * 1024
export const VISTA_MESTRE_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp']

/** Nome de arquivo emitido pela rota sign — confirm só aceita este formato,
 *  o que impede apontar a Vista Mestre pra outro objeto do bucket. */
export const VISTA_MESTRE_FILE_RE = /^mestre-\d+\.(jpg|png|webp)$/

/** Carrega o Space do caller (RLS restringe ao dono) e garante que a Vista
 *  Mestre ainda pode ser alterada. Em falha devolve a NextResponse pronta. */
export async function requireEditableSpace(
  supabase: SupabaseClient,
  spaceId: string,
): Promise<{ error: NextResponse } | { error?: undefined }> {
  const { data: space, error } = await supabase
    .from('spaces')
    .select('id, status')
    .eq('id', spaceId)
    .single()

  if (error || !space) {
    return { error: NextResponse.json({ error: 'Space não encontrado' }, { status: 404 }) }
  }
  if (space.status === 'locked' || space.status === 'archived') {
    return {
      error: NextResponse.json(
        { error: 'Space travado — Vista Mestre não pode ser substituída' },
        { status: 409 },
      ),
    }
  }
  return {}
}

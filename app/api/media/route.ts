// GET /api/media?bucket=<bucket>&key=<key>
//
// Proxy de mídia central (fundação do B2). Autentica, confere que a chave
// pertence ao usuário (prefixo `${user.id}/`) e redireciona pra uma signed URL
// de TTL curto do bucket privado. Controle de acesso num ponto só.
//
// INERTE por enquanto: nenhum write-site grava URL apontando pra cá ainda. Uma
// das abordagens de wiring do B2 é os uploads passarem a gravar
// `/api/media?bucket=…&key=…` no lugar de getPublicUrl — aí a leitura nos
// componentes não muda e o acesso é validado aqui. (A outra abordagem é assinar
// na emissão via lib/storage/signed.ts.)
//
// Acesso a pack compartilhado (anônimo em /p/[slug]) NÃO passa por aqui — será
// tratado por assinatura server-side na própria página do pack.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PRIVATE_BUCKETS } from '@/lib/storage/signed'

const SIGNED_TTL_SECONDS = 60 // curto: é um redirect por request

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const bucket = req.nextUrl.searchParams.get('bucket')
  const key = req.nextUrl.searchParams.get('key')

  if (!bucket || !key || !PRIVATE_BUCKETS.has(bucket)) {
    return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
  }

  // Ownership: a chave tem que estar no namespace do próprio usuário. Impede
  // ler arquivo de outro usuário via /api/media, mesmo com o bucket privado.
  if (!key.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(key, SIGNED_TTL_SECONDS)
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 })
  }

  const res = NextResponse.redirect(data.signedUrl)
  // Não cachear o redirect: a signed URL expira em SIGNED_TTL_SECONDS.
  res.headers.set('Cache-Control', 'private, no-store')
  return res
}

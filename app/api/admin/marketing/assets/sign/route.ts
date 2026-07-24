import { NextRequest, NextResponse } from 'next/server'
import { staffOr404, errorResponse } from '@/lib/marketing/api'
import { signMarketingUpload } from '@/lib/marketing/storage'

// Emite signed upload URL para asset de marca no bucket privado
// marketing-assets (browser faz o PUT direto — nada de binário pela Vercel;
// mesmo desenho do upload direto do produto). Valida kind/MIME/tamanho aqui e
// revalida contra a metadata real no confirm.

export async function POST(req: NextRequest) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const body = await req.json()
    const out = await signMarketingUpload(
      gate.ctx.admin,
      String(body.kind ?? ''),
      String(body.content_type ?? ''),
      Number(body.size_bytes ?? 0),
    )
    if (!out.ok) return NextResponse.json({ error: out.message }, { status: out.status })
    return NextResponse.json(out.result)
  } catch (err) {
    return errorResponse(err)
  }
}

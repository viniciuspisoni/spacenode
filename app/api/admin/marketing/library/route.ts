import { NextRequest, NextResponse } from 'next/server'
import { staffOr404, errorResponse } from '@/lib/marketing/api'
import { listProductLibrary } from '@/lib/marketing/service'

// Biblioteca de gerações reais do produto (renders/vistas) para vínculo em
// peças. Exposição mínima — id, imagem assinada, label, data; nenhum dado do
// usuário dono. O uso em conteúdo exige permissão registrada (content_projects).

export async function GET(req: NextRequest) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const kind = req.nextUrl.searchParams.get('kind') === 'vista' ? 'vista' : 'render'
    const items = await listProductLibrary(gate.ctx.admin, kind)
    return NextResponse.json({ items })
  } catch (err) {
    return errorResponse(err)
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { staffOr404, errorResponse } from '@/lib/marketing/api'
import { confirmMarketingUpload } from '@/lib/marketing/storage'
import { createUploadAsset } from '@/lib/marketing/service'

// Confirma o upload (metadata real do objeto: path emitido, tamanho, MIME) e
// registra o asset. Com brief_id vira asset da peça; sem, vai para a
// biblioteca de marca (logos, arquivos de marca, capas, referências).

export async function POST(req: NextRequest) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const body = await req.json()
    const kind = String(body.kind ?? '')
    const key = String(body.key ?? '')

    const verified = await confirmMarketingUpload(gate.ctx.admin, kind, key)
    if (!verified.ok) {
      return NextResponse.json({ error: verified.message }, { status: verified.status })
    }

    const asset = await createUploadAsset(gate.ctx.admin, {
      briefId: typeof body.brief_id === 'string' && body.brief_id ? body.brief_id : null,
      assetType: kind === 'video' ? 'video' : kind,
      storagePath: verified.result.key,
      originalFilename: typeof body.original_filename === 'string' ? body.original_filename : null,
      mimeType: verified.result.mime,
      sizeMeta: { size_bytes: verified.result.size },
    })
    return NextResponse.json({ asset }, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}

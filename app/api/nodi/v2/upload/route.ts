import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isNodiEnabled } from '@/lib/nodi/flags'
import { capabilitiesFor, isNodiV2EnabledFor } from '@/lib/nodi/v2/flags'
import { rateLimit } from '@/lib/rate-limit'
import { NODI_UPLOAD_BUCKET, NODI_UPLOAD_MAX_BYTES, NODI_UPLOAD_MIMES,
  newUploadKey, validUploadKey, validatePrint, sealUpload } from '@/lib/nodi/v2/uploads'

export const maxDuration = 30

export async function POST(req: Request) {
  if (!isNodiEnabled()) return NextResponse.json({ error: 'Não disponível' }, { status: 404 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const admin = createAdminClient()
  if (!await isNodiV2EnabledFor(admin, user) || !capabilitiesFor(true).multimodal) {
    return NextResponse.json({ error: 'Não disponível' }, { status: 404 })
  }
  const body = await req.json().catch(() => null)
  const storage = admin.storage.from(NODI_UPLOAD_BUCKET)

  if (body?.step === 'sign') {
    if (typeof body.mime !== 'string' || !NODI_UPLOAD_MIMES.includes(body.mime) ||
      !Number.isInteger(body.size) || body.size <= 0 || body.size > NODI_UPLOAD_MAX_BYTES) {
      return NextResponse.json({ error: 'Use JPG, PNG ou WebP de até 8 MB.' }, { status: 400 })
    }
    const limits = await Promise.all([
      rateLimit(admin, `nodi-upload-minute:${user.id}`, 6, 60),
      rateLimit(admin, `nodi-upload-day:${user.id}`, 30, 86400),
    ])
    if (limits.some(limit => !limit.allowed)) {
      return NextResponse.json({ error: 'Limite de envios atingido. Tente novamente mais tarde.' }, { status: 429 })
    }
    // Fail closed if an operator accidentally makes this bucket public.
    const { data: bucket, error: bucketError } = await admin.storage.getBucket(NODI_UPLOAD_BUCKET)
    if (bucketError || !bucket || bucket.public) {
      return NextResponse.json({ error: 'Envio de imagens indisponível agora.' }, { status: 503 })
    }
    const key = newUploadKey(user.id, body.mime)
    const { data, error } = await storage.createSignedUploadUrl(key)
    if (error || !data?.token) return NextResponse.json({ error: 'Não foi possível preparar o envio.' }, { status: 503 })
    return NextResponse.json({ bucket: NODI_UPLOAD_BUCKET, key, token: data.token }, { headers: { 'Cache-Control': 'no-store' } })
  }

  if (body?.step !== 'confirm' || typeof body.key !== 'string' || !validUploadKey(body.key, user.id)) {
    return NextResponse.json({ error: 'Anexo inválido.' }, { status: 400 })
  }
  const limit = await rateLimit(admin, `nodi-upload-confirm:${user.id}`, 12, 60)
  if (!limit.allowed) return NextResponse.json({ error: 'Aguarde alguns segundos antes de tentar novamente.' }, { status: 429 })
  // Inspect metadata before downloading, so forged oversized uploads aren't
  // buffered in a function. Only this user's exact object is ever inspected.
  const dir = body.key.slice(0, body.key.lastIndexOf('/'))
  const file = body.key.slice(body.key.lastIndexOf('/') + 1)
  const { data: objects, error: listError } = await storage.list(dir, { search: file, limit: 10 })
  const object = objects?.find(item => item.name === file)
  if (listError || !object) return NextResponse.json({ error: 'Arquivo não encontrado. Envie novamente.' }, { status: 400 })
  if (!object.metadata || !Number.isInteger(object.metadata.size) || object.metadata.size <= 0 ||
    object.metadata.size > NODI_UPLOAD_MAX_BYTES || !NODI_UPLOAD_MIMES.includes(object.metadata.mimetype)) {
    await storage.remove([body.key])
    return NextResponse.json({ error: 'Use JPG, PNG ou WebP de até 8 MB.' }, { status: 400 })
  }
  const { data, error } = await storage.download(body.key)
  if (error || !data) return NextResponse.json({ error: 'Não foi possível conferir o arquivo. Tente novamente.' }, { status: 503 })
  try {
    await validatePrint(Buffer.from(await data.arrayBuffer()), data.type)
  } catch {
    await storage.remove([body.key])
    return NextResponse.json({ error: 'Imagem inválida. Use uma imagem estática em JPG, PNG ou WebP de até 8 MB.' }, { status: 400 })
  }
  return NextResponse.json({ attachment: { kind: 'upload', id: sealUpload(user.id, body.key) } }, { headers: { 'Cache-Control': 'no-store' } })
}

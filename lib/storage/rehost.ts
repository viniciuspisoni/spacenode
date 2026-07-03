// lib/storage/rehost.ts
//
// Fundação do B3 (re-hospedagem das saídas da FAL). O CDN da FAL não tem SLA de
// retenção — renders/vistas/vídeo/upscale vivem só lá hoje e podem sumir. Este
// helper baixa o output do provider e re-hospeda no Storage do Supabase.
//
// INERTE por enquanto: nenhuma rota de geração chama isto ainda. Ao ligar (ex.:
// no /api/video), gravar a URL/key retornada em vez da URL crua da FAL.
//
// Segurança: só busca de hosts da FAL (allowlist) — o input é uma URL que NÓS
// acabamos de receber do fal.subscribe, mas mantemos o allowlist por defesa.

import type { SupabaseClient } from '@supabase/supabase-js'

const ALLOWED_SOURCE_HOSTS = ['fal.media', 'v2.fal.media', 'v3.fal.media', 'fal.run']

function isAllowedSource(url: string): boolean {
  try {
    const h = new URL(url).host.toLowerCase()
    return ALLOWED_SOURCE_HOSTS.some(a => h === a || h.endsWith(`.${a}`))
  } catch {
    return false
  }
}

/** Baixa `sourceUrl` (FAL) e re-hospeda no bucket dado, sob `${userId}/${kind}/`.
 *  Devolve { url, key } do arquivo re-hospedado, ou null em qualquer falha — o
 *  chamador mantém a URL original da FAL como fallback (nunca perde o output). */
export async function rehostToStorage(
  admin: SupabaseClient,
  sourceUrl: string,
  opts: { bucket: string; userId: string; kind: string },
): Promise<{ url: string; key: string } | null> {
  if (!isAllowedSource(sourceUrl)) {
    console.error('[storage-rehost] fonte não permitida:', (() => { try { return new URL(sourceUrl).host } catch { return '??' } })())
    return null
  }
  try {
    const res = await fetch(sourceUrl)
    if (!res.ok) {
      console.error('[storage-rehost] download falhou:', res.status)
      return null
    }
    const contentType = res.headers.get('content-type') ?? 'application/octet-stream'
    const buf = Buffer.from(await res.arrayBuffer())

    const ext = (contentType.split('/')[1] ?? 'bin').split(';')[0].replace('jpeg', 'jpg')
    const rand = Math.random().toString(36).slice(2, 8)
    const key = `${opts.userId}/${opts.kind}/${Date.now()}-${rand}.${ext}`

    const { error: upErr } = await admin.storage.from(opts.bucket).upload(key, buf, {
      contentType,
      upsert: false,
    })
    if (upErr) {
      console.error('[storage-rehost] upload falhou:', upErr.message)
      return null
    }

    // getPublicUrl devolve a URL no formato público (funciona enquanto o bucket
    // for público; após o flip, os read-sites assinam via signStorageUrl). A key
    // fica disponível pra quem preferir o proxy/assinar direto.
    const { data } = admin.storage.from(opts.bucket).getPublicUrl(key)
    return { url: data.publicUrl, key }
  } catch (e) {
    console.error('[storage-rehost] erro:', (e as Error).message)
    return null
  }
}

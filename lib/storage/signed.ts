// lib/storage/signed.ts
//
// Fundação do B2 (buckets privados) da auditoria 2026-07-03. Assina URLs do
// Storage do Supabase pra servir conteúdo privado por signed URL de TTL curto.
//
// INERTE por enquanto: nada chama isto até o wiring dos read-sites. E só tem
// efeito real DEPOIS que a migration de flip tornar os buckets privados — antes
// disso as URLs públicas continuam funcionando e assinar é apenas redundante.
//
// Como funciona: as colunas do DB guardam URLs no formato público
// (`…/storage/v1/object/public/<bucket>/<key>`) geradas por getPublicUrl. Este
// helper extrai a `key` dessa URL e devolve uma signed URL. Assim o flip pra
// privado NÃO exige migração de dados — só que os read-sites passem a assinar.

import type { SupabaseClient } from '@supabase/supabase-js'
import { parseSupabaseStoragePath } from './cleanup'

/** Buckets que passarão a ser privados (ver migration de flip). Só URLs destes
 *  são assinadas; FAL, externas e buckets públicos passam direto. */
export const PRIVATE_BUCKETS = new Set(['space-mestres', 'architect-identity', 'spacenode-media'])

const DEFAULT_TTL_SECONDS = 60 * 60 // 1h

/** Assina uma URL do Storage se ela apontar pra um bucket privado nosso; senão
 *  devolve a URL original (FAL/externas passam direto). Best-effort: em erro
 *  devolve a original pra não quebrar a UI. */
export async function signStorageUrl(
  admin: SupabaseClient,
  url: string | null | undefined,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<string | null> {
  if (!url) return url ?? null
  const parsed = parseSupabaseStoragePath(url)
  if (!parsed || !PRIVATE_BUCKETS.has(parsed.bucket)) return url
  const { data, error } = await admin.storage.from(parsed.bucket).createSignedUrl(parsed.key, ttlSeconds)
  if (error || !data?.signedUrl) {
    console.error('[storage-signed] createSignedUrl falhou:', error?.message)
    return url
  }
  return data.signedUrl
}

/** Assina várias URLs em paralelo, preservando a ordem (e os null). */
export async function signStorageUrls(
  admin: SupabaseClient,
  urls: Array<string | null | undefined>,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<Array<string | null>> {
  return Promise.all(urls.map(u => signStorageUrl(admin, u, ttlSeconds)))
}

/** Assina direto por bucket+key (quando você já tem a chave, não a URL). */
export async function signStorageKey(
  admin: SupabaseClient,
  bucket: string,
  key: string,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<string | null> {
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(key, ttlSeconds)
  if (error || !data?.signedUrl) {
    console.error('[storage-signed] createSignedUrl (key) falhou:', error?.message)
    return null
  }
  return data.signedUrl
}

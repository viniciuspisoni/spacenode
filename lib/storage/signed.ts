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

/** Flag de ativação do B2. Enquanto `STORAGE_PRIVATE !== '1'` a assinatura é um
 *  NO-OP TOTAL: todo o wiring de emissão devolve a URL pública original, sem
 *  tocar em nada — produção fica idêntica. No flip, aplica-se a migration de
 *  privatização E seta-se STORAGE_PRIVATE=1 (na Vercel) no MESMO passo. Assim o
 *  wiring pode ser mergeado/deployado ANTES do flip sem efeito algum, e sem o
 *  risco de persistir signed URLs (que expiram) em dados round-trip. */
function privateStorageActive(): boolean {
  return process.env.STORAGE_PRIVATE === '1'
}

/** Assina uma URL do Storage se ela apontar pra um bucket privado nosso; senão
 *  devolve a URL original (FAL/externas passam direto). Best-effort: em erro
 *  devolve a original pra não quebrar a UI. */
export async function signStorageUrl(
  admin: SupabaseClient,
  url: string | null | undefined,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<string | null> {
  if (!url) return url ?? null
  if (!privateStorageActive()) return url // inerte até o flip (STORAGE_PRIVATE=1)
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

/** Devolve uma cópia de `row` com os campos `fields` assinados (no-op nos campos
 *  que não são de bucket privado, ausentes ou não-string). Uso típico no ponto
 *  de emissão de uma rota/detalhe: `await signRow(admin, vista, ['image_url'])`. */
export async function signRow<T extends Record<string, unknown>>(
  admin: SupabaseClient,
  row: T,
  fields: ReadonlyArray<keyof T>,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<T> {
  const patch: Record<string, unknown> = {}
  await Promise.all(fields.map(async (f) => {
    const v = row[f]
    if (typeof v === 'string') patch[f as string] = await signStorageUrl(admin, v, ttlSeconds)
  }))
  return { ...row, ...patch }
}

/** signRow para uma lista (arrays de linhas). Preserva a ordem. */
export async function signRows<T extends Record<string, unknown>>(
  admin: SupabaseClient,
  rows: T[],
  fields: ReadonlyArray<keyof T>,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<T[]> {
  return Promise.all(rows.map(r => signRow(admin, r, fields, ttlSeconds)))
}

/** Deep-sign: percorre um valor jsonb e assina TODA string que for URL de bucket
 *  privado (no-op no resto — nomes de camada, números, etc.). Devolve uma cópia.
 *  Para o `document` do Finalizar (layers[].url / layers[].maskUrl aninhados),
 *  onde signRow (raso) não alcança. */
export async function signDeep(
  admin: SupabaseClient,
  value: unknown,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<unknown> {
  if (typeof value === 'string') return signStorageUrl(admin, value, ttlSeconds)
  if (Array.isArray(value)) return Promise.all(value.map(v => signDeep(admin, v, ttlSeconds)))
  if (value && typeof value === 'object') {
    const entries = await Promise.all(
      Object.entries(value).map(async ([k, v]) => [k, await signDeep(admin, v, ttlSeconds)] as const),
    )
    return Object.fromEntries(entries)
  }
  return value
}

/** Converte URL pública de bucket privado no proxy `/api/media` (STABLE +
 *  displayable). Pro caso ROUND-TRIP (uploads e o editor do Finalizar): gravar
 *  uma signed URL (que expira) quebraria no save-back; a URL do proxy é estável
 *  e re-resolve o acesso a cada request. Síncrono (só transforma string). Gated
 *  por STORAGE_PRIVATE → no-op enquanto off. */
export function mediaProxyUrl(url: string | null | undefined): string | null {
  if (!url) return url ?? null
  if (!privateStorageActive()) return url
  const parsed = parseSupabaseStoragePath(url)
  if (!parsed || !PRIVATE_BUCKETS.has(parsed.bucket)) return url
  return `/api/media?bucket=${encodeURIComponent(parsed.bucket)}&key=${encodeURIComponent(parsed.key)}`
}

/** mediaProxyUrl recursivo num valor jsonb (o `document` do Finalizar). Síncrono. */
export function mediaProxyDeep(value: unknown): unknown {
  if (typeof value === 'string') return mediaProxyUrl(value)
  if (Array.isArray(value)) return value.map(mediaProxyDeep)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mediaProxyDeep(v)]))
  }
  return value
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

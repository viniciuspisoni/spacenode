// Pareamento por código do plugin SketchUp — primitivas compartilhadas
// pelas rotas /api/sketchup/pair/*.
//
// O plugin guarda só { deviceId, deviceSecret }; o refresh token da sessão
// mintada fica em custódia no banco (sketchup_devices.refresh_token) e é
// rotacionado a cada renovação. Revogação server-side mata a renovação.

import { createHash, randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export const PAIR_CODE_TTL_SECONDS = 600
export const PAIR_POLL_INTERVAL_SECONDS = 3

// Alfabeto sem confundíveis (0/O, 1/I/L) — código lido/digitado por humanos.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function generatePairCode(): string {
  const bytes = randomBytes(8)
  let out = ''
  for (let i = 0; i < 8; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
    if (i === 3) out += '-'
  }
  return out
}

export function normalizePairCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^(.{4})(.{4})$/, '$1-$2')
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function generateDeviceSecret(): string {
  return `snd_${randomBytes(32).toString('base64url')}`
}

export interface MintedSession {
  accessToken: string
  refreshToken: string
  expiresAt: number
  email: string | null
}

// Minta uma sessão Supabase NOVA e independente pro dispositivo:
// generateLink(magiclink) NÃO envia e-mail — só gera o hashed_token —
// e verifyOtp num client anon descartável troca o token pela sessão
// completa (padrão canônico; supabase-js 2.103).
export async function mintDeviceSession(
  admin: SupabaseClient,
  anonDisposable: SupabaseClient,
  email: string,
): Promise<MintedSession | null> {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  const hashedToken = data?.properties?.hashed_token
  if (error || !hashedToken) {
    console.error('[sketchup/pair] generateLink falhou:', error?.message)
    return null
  }

  const { data: verified, error: verifyError } = await anonDisposable.auth.verifyOtp({
    token_hash: hashedToken,
    type: 'email',
  })
  const session = verified?.session
  if (verifyError || !session?.access_token || !session.refresh_token) {
    console.error('[sketchup/pair] verifyOtp falhou:', verifyError?.message)
    return null
  }

  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    email: verified.user?.email ?? null,
  }
}

export interface RefreshedTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

// Refresh grant direto no GoTrue (REST puro, server-side). Rotação sempre:
// o refresh_token devolvido substitui o guardado. Reuso fora da janela de
// 10s revoga a família inteira — por isso a custódia é exclusiva do servidor.
export async function refreshDeviceSession(refreshToken: string): Promise<RefreshedTokens | null> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, '')
  const res = await fetch(`${base}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: {
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
  if (!res.ok) return null

  const data = (await res.json()) as {
    access_token?: string
    refresh_token?: string
    expires_at?: number
    expires_in?: number
  }
  if (!data.access_token || !data.refresh_token) return null

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at ?? Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
  }
}

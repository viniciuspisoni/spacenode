import { createHmac, timingSafeEqual } from 'node:crypto'
import { FIRST_IMAGE_PILOT_VERSION, PILOT_UUID, PILOT_VARIANTS, type PilotVariant } from './contract'

export interface PilotReceipt {
  version: typeof FIRST_IMAGE_PILOT_VERSION
  userId: string; caseId: string; requestId: string; variant: PilotVariant
  issuedAt: number; expiresAt: number; qa: boolean
}
const SCOPE = 'nodi-first-image-pilot-v1:'
function secret() {
  const value = process.env.NODI_ACTION_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!value) throw new Error('Piloto indisponível')
  return value
}
export function sealPilotReceipt(input: Pick<PilotReceipt, 'userId' | 'caseId' | 'requestId' | 'variant' | 'qa'>, now = Date.now()): string {
  const payload: PilotReceipt = { ...input, version: FIRST_IMAGE_PILOT_VERSION, issuedAt: now, expiresAt: now + 60 * 60_000 }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', secret()).update(SCOPE + body).digest('base64url')
  return `${body}.${signature}`
}
export function openPilotReceipt(token: unknown, userId: string, now = Date.now()): PilotReceipt | null {
  if (typeof token !== 'string' || token.length > 1400 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null
  try {
    const [body, signature] = token.split('.')
    const expected = createHmac('sha256', secret()).update(SCOPE + body).digest()
    const provided = Buffer.from(signature, 'base64url')
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null
    const data = JSON.parse(Buffer.from(body, 'base64url').toString()) as PilotReceipt
    if (data.version !== FIRST_IMAGE_PILOT_VERSION || data.userId !== userId || !PILOT_UUID.test(data.caseId) || !PILOT_UUID.test(data.requestId) ||
      !PILOT_VARIANTS.includes(data.variant) || typeof data.qa !== 'boolean' || !Number.isFinite(data.issuedAt) || data.issuedAt > now + 1000 ||
      !Number.isFinite(data.expiresAt) || data.expiresAt <= now || data.expiresAt - data.issuedAt !== 60 * 60_000) return null
    return data
  } catch { return null }
}

// ── Intents de execução do Nodi V3 (server-only) ─────────────────────────────
//
// Quando o copiloto propõe uma execução direta (gerar de verdade, com débito),
// o SERVIDOR monta e ASSINA a intent completa (usuário, ação, payload, custo,
// validade). O painel só devolve o token opaco na confirmação — o client não
// escolhe payload nem custo, e token adulterado/vencido/de outro usuário é
// recusado. HMAC-SHA256; segredo próprio (NODI_ACTION_SECRET) com derivação
// do service key como fallback (zero fricção de env em dev).

import { createHmac, timingSafeEqual } from 'node:crypto'

export interface RenderIntentParams {
  inputUrl: string
  anchorUrl?: string
  projectType: 'interior' | 'exterior'
  engine: string
  resolution: string
  refinementText?: string
}

export interface ExecIntent {
  v: 1
  userId: string
  action: 'render'
  cost: number
  /** epoch ms de expiração (proposta velha não executa) */
  exp: number
  params: RenderIntentParams
}

const INTENT_TTL_MS = 10 * 60_000

function secret(): string {
  const own = process.env.NODI_ACTION_SECRET?.trim()
  if (own) return own
  const derived = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!derived) throw new Error('NODI_ACTION_SECRET/SUPABASE_SERVICE_ROLE_KEY ausentes')
  return `nodi-v3:${derived}`
}

const b64url = (buf: Buffer) => buf.toString('base64url')

function hmac(payload: string): string {
  return b64url(createHmac('sha256', secret()).update(payload).digest())
}

export function signIntent(intent: Omit<ExecIntent, 'v' | 'exp'>, now = Date.now()): string {
  const full: ExecIntent = { v: 1, exp: now + INTENT_TTL_MS, ...intent }
  const payload = b64url(Buffer.from(JSON.stringify(full), 'utf8'))
  return `${payload}.${hmac(payload)}`
}

/** Verifica assinatura, validade e dono. null = recusa (sem detalhes ao client). */
export function verifyIntent(token: string, userId: string, now = Date.now()): ExecIntent | null {
  const dot = token.lastIndexOf('.')
  if (dot <= 0 || token.length > 4096) return null
  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = hmac(payload)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const intent = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as ExecIntent
    if (intent.v !== 1 || intent.action !== 'render') return null
    if (intent.userId !== userId) return null
    if (typeof intent.exp !== 'number' || now > intent.exp) return null
    if (typeof intent.cost !== 'number' || !intent.params?.inputUrl) return null
    return intent
  } catch {
    return null
  }
}

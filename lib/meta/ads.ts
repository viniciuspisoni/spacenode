// Cliente da Meta Marketing API (Graph API) para automacao de campanhas de trafego.
//
// Env vars necessarias (.env.local + Vercel):
//   META_ACCESS_TOKEN   - token de System User (longa duracao) gerado no Business Manager
//   META_AD_ACCOUNT_ID  - id da conta de anuncios (com ou sem prefixo "act_")
//   META_PAGE_ID        - id da Pagina do Facebook vinculada ao Instagram
//   META_IG_ACCOUNT_ID  - id da conta profissional do Instagram (@spacenode)
//   META_APP_ID         - id do app na Meta (opcional, usado no debug de token)
//   META_APP_SECRET     - secret do app (opcional; se presente, envia appsecret_proof)

import { createHmac } from 'node:crypto'

export const META_GRAPH_VERSION = 'v25.0'
const GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`

export class MetaApiError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly subcode?: number,
    public readonly fbtraceId?: string,
  ) {
    super(message)
    this.name = 'MetaApiError'
  }
}

function token(): string {
  const t = process.env.META_ACCESS_TOKEN
  if (!t) throw new Error('META_ACCESS_TOKEN ausente no ambiente')
  return t
}

export function adAccountId(): string {
  const raw = process.env.META_AD_ACCOUNT_ID
  if (!raw) throw new Error('META_AD_ACCOUNT_ID ausente no ambiente')
  return raw.startsWith('act_') ? raw : `act_${raw}`
}

// HMAC exigido quando o app esta com "Require App Secret" ativo (recomendado pela Meta).
function appsecretProof(accessToken: string): string | null {
  const secret = process.env.META_APP_SECRET
  if (!secret) return null
  return createHmac('sha256', secret).update(accessToken).digest('hex')
}

export async function metaGraph<T = Record<string, unknown>>(
  path: string,
  params: Record<string, string> = {},
  init?: { method?: 'GET' | 'POST' | 'DELETE' },
): Promise<T> {
  const t = token()
  const url = new URL(`${GRAPH_BASE}/${path.replace(/^\//, '')}`)
  const method = init?.method ?? 'GET'

  const allParams: Record<string, string> = { ...params, access_token: t }
  const proof = appsecretProof(t)
  if (proof) allParams.appsecret_proof = proof

  let body: URLSearchParams | undefined
  if (method === 'GET' || method === 'DELETE') {
    for (const [k, v] of Object.entries(allParams)) url.searchParams.set(k, v)
  } else {
    body = new URLSearchParams(allParams)
  }

  const res = await fetch(url, { method, body })
  const json = (await res.json().catch(() => null)) as
    | (T & { error?: { message: string; code?: number; error_subcode?: number; fbtrace_id?: string } })
    | null

  if (!res.ok || json?.error) {
    const e = json?.error
    throw new MetaApiError(
      e?.message ?? `Meta API ${res.status} em ${path}`,
      e?.code,
      e?.error_subcode,
      e?.fbtrace_id,
    )
  }
  return json as T
}

// ---------- Diagnostico da conexao ----------

export type MetaTokenInfo = {
  appId?: string
  type?: string
  isValid: boolean
  expiresAt: number // epoch segundos; 0 = nao expira
  scopes: string[]
}

export async function debugToken(): Promise<MetaTokenInfo> {
  const data = await metaGraph<{
    data: { app_id?: string; type?: string; is_valid: boolean; expires_at: number; scopes?: string[] }
  }>('debug_token', { input_token: token() })
  const d = data.data
  return {
    appId: d.app_id,
    type: d.type,
    isValid: d.is_valid,
    expiresAt: d.expires_at,
    scopes: d.scopes ?? [],
  }
}

export type MetaAdAccount = {
  id: string
  name: string
  account_status: number // 1 = ativa
  currency: string
  timezone_name: string
  amount_spent: string
}

export async function getAdAccount(): Promise<MetaAdAccount> {
  return metaGraph<MetaAdAccount>(adAccountId(), {
    fields: 'id,name,account_status,currency,timezone_name,amount_spent',
  })
}

export type MetaIgAccount = {
  id: string
  username?: string
  name?: string
  followers_count?: number
}

export async function getInstagramAccount(): Promise<MetaIgAccount> {
  const igId = process.env.META_IG_ACCOUNT_ID
  if (!igId) throw new Error('META_IG_ACCOUNT_ID ausente no ambiente')
  return metaGraph<MetaIgAccount>(igId, { fields: 'id,username,name,followers_count' })
}

export type MetaCampaign = {
  id: string
  name: string
  objective: string
  status: string
  effective_status: string
  daily_budget?: string
  lifetime_budget?: string
}

export async function listCampaigns(limit = 25): Promise<MetaCampaign[]> {
  const data = await metaGraph<{ data: MetaCampaign[] }>(`${adAccountId()}/campaigns`, {
    fields: 'id,name,objective,status,effective_status,daily_budget,lifetime_budget',
    limit: String(limit),
  })
  return data.data
}

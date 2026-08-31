// lib/marketing/ads/channels.ts
//
// Camada de integração por canal de mídia paga. SERVER-ONLY: lê variáveis de
// ambiente e fala com APIs externas — nunca importar em client component
// (nenhum env chega ao browser).
//
// Princípio (docs/marketing/prohibited-content.md §7 + workflow.ts): adapter
// NUNCA ativa gasto. O máximo que uma implementação futura fará é publicar
// campanha PAUSADA, e somente executando uma ad_pending_action aprovada por
// humano. Hoje nenhuma credencial de escrita existe (aguardando token de
// System User da Meta) — os adapters servem para diagnóstico de conexão no
// painel e para fixar o contrato que a publicação usará.

import { debugToken, getAdAccount, MetaApiError } from '@/lib/meta/ads'

export interface ChannelDiagnostics {
  configured: boolean
  ok: boolean
  /** Mensagens PT-BR prontas para o painel (estado, próximos passos, erros). */
  details: string[]
}

export interface ChannelAdapter {
  slug: string
  name: string
  /** true quando as credenciais mínimas do canal existem no ambiente. */
  isConfigured(): boolean
  /** Testa a conexão real (token, escopos, conta) sem efeito colateral. */
  diagnose(): Promise<ChannelDiagnostics>
  /** Publicação SEMPRE pausada, somente com ad_pending_action aprovada — não
   *  implementada até haver token. */
  publishCampaignPaused?(campaignId: string): Promise<{ external_id: string }>
}

// ── Meta (Facebook/Instagram) ──────────────────────────────────────────────────
// Leitura/diagnóstico via lib/meta/ads.ts (Graph v25.0). Escrita aguarda token
// de System User — ver docs/marketing/ads-system.md, seção Integrações.

/** Escopos que permitem operar anúncios — basta um deles para leitura. */
const META_AD_SCOPES = ['ads_read', 'ads_management']

function metaErrorDetail(err: unknown, contexto: string): string {
  if (err instanceof MetaApiError) {
    // Códigos comuns: 190 = token inválido/expirado; 100 = id/permissão errada.
    if (err.code === 190) {
      return 'Token inválido ou expirado — gere um novo token de System User no Business Manager.'
    }
    return `Meta API (${contexto}): ${err.message}`
  }
  if (err instanceof Error && err.message.includes('ausente no ambiente')) {
    return `Configuração incompleta: ${err.message}.`
  }
  return `Falha ao consultar a Meta API (${contexto}) — verifique token e conectividade.`
}

const metaAdapter: ChannelAdapter = {
  slug: 'meta',
  name: 'Meta Ads (Facebook/Instagram)',

  isConfigured(): boolean {
    return Boolean(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID)
  },

  async diagnose(): Promise<ChannelDiagnostics> {
    if (!this.isConfigured()) {
      return {
        configured: false,
        ok: false,
        details: [
          'META_ACCESS_TOKEN e/ou META_AD_ACCOUNT_ID ausentes no ambiente.',
          'Gere um token de System User no Business Manager e cadastre os envs META_* (passo a passo em docs/marketing/ads-system.md).',
        ],
      }
    }

    const details: string[] = []
    let ok = true

    // 1. Token: validade + escopos de anúncio.
    try {
      const info = await debugToken()
      if (!info.isValid) {
        ok = false
        details.push('Token inválido ou expirado — gere um novo token de System User no Business Manager.')
      } else {
        details.push(
          `Token válido (${info.type ?? 'tipo desconhecido'}${info.expiresAt === 0 ? ', sem expiração' : ''}).`,
        )
        const hasAdScope = META_AD_SCOPES.some(s => info.scopes.includes(s))
        if (!hasAdScope) {
          ok = false
          details.push(
            `Token sem escopo de anúncios — conceda ${META_AD_SCOPES.join(' ou ')} ao System User no Business Manager.`,
          )
        }
      }
    } catch (err) {
      ok = false
      details.push(metaErrorDetail(err, 'debug_token'))
    }

    // 2. Conta de anúncios: existe e está ativa (account_status 1 = ativa).
    try {
      const account = await getAdAccount()
      if (account.account_status === 1) {
        details.push(`Conta de anúncios "${account.name}" ativa (${account.currency}).`)
      } else {
        ok = false
        details.push(
          `Conta de anúncios com status ${account.account_status} — verifique bloqueio/pagamento no Gerenciador de Anúncios.`,
        )
      }
    } catch (err) {
      ok = false
      details.push(metaErrorDetail(err, 'conta de anúncios'))
    }

    return { configured: true, ok, details }
  },

  async publishCampaignPaused(): Promise<{ external_id: string }> {
    // Escrita deliberadamente não implementada: sem token de System User não há
    // como publicar — e quando houver, a implementação continuará exigindo
    // ad_pending_action aprovada e status PAUSED na criação.
    throw new Error(
      'Publicação via API aguarda token de System User — publique manualmente no Gerenciador (campanha pausada)',
    )
  },
}

// ── Google Ads (busca/YouTube) ─────────────────────────────────────────────────
// Canal planejado (integration-roadmap.md item 7) — nenhuma credencial existe.

const googleAdsAdapter: ChannelAdapter = {
  slug: 'google_ads',
  name: 'Google Ads (Busca/YouTube)',

  isConfigured(): boolean {
    return false
  },

  async diagnose(): Promise<ChannelDiagnostics> {
    return {
      configured: false,
      ok: false,
      details: [
        'Integração Google Ads ainda não configurada (canal planejado).',
        '1. Solicitar um developer token na conta de administrador do Google Ads.',
        '2. Criar credenciais OAuth no Google Cloud e gerar o refresh token da conta gestora.',
        '3. Registrar o customer id da conta de anúncios nos envs do servidor.',
        'Mesma regra do Meta: campanha sobe pausada e a ativação exige ação aprovada.',
      ],
    }
  },
}

// ── Registro ───────────────────────────────────────────────────────────────────
// Canais sem adapter (instagram/linkedin_ads/tiktok_ads) são operados 100%
// manualmente por enquanto — o painel mostra "sem integração" para eles.

const ADAPTERS: readonly ChannelAdapter[] = [metaAdapter, googleAdsAdapter]

/** Adapter do canal, ou null quando o canal ainda não tem integração. */
export function getChannelAdapter(slug: string): ChannelAdapter | null {
  return ADAPTERS.find(a => a.slug === slug) ?? null
}

export function listChannelAdapters(): readonly ChannelAdapter[] {
  return ADAPTERS
}

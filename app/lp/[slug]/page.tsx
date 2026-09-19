// /lp/[slug] — landing page pública de campanha (tráfego pago).
//
// Server Component; conteúdo vem de marketing.landing_pages via service-role
// (mesmo desenho de /p/[slug]: página pública dinâmica, só status=published é
// servida). Sempre dark, seguindo a convenção visual da landing: hairline
// 0.5px, eyebrow uppercase com tracking largo, h2 minúsculo com ponto final,
// CTA primário claro sobre escuro. Sem styled-jsx (server component) — Tailwind
// + style inline com tokens var(--color-*).
//
// Rastreamento 100% first-party e server-side (a política de privacidade
// promete "sem rastreadores de terceiros"): nenhum pixel, nenhum script
// externo; o registro de visita é anônimo e o IP só entra na CHAVE do rate
// limit — nunca é persistido no evento.

import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { cache } from 'react'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import ForceDarkScope from '@/lib/theme/ForceDarkScope'
import LpCtaLink from '@/components/marketing/LpCtaLink'
import LpViewPing from '@/components/marketing/LpViewPing'
import LpStickyCta from '@/components/marketing/LpStickyCta'
import { BeforeAfter } from '@/components/landing/BeforeAfter'
import { Logo } from '@/components/brand'
import type { PlanIntent } from '@/lib/analytics/attribution'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLandingPageBySlug, recordAcquisitionEvent } from '@/lib/marketing/ads/service'
import { isBotUserAgent, isInternalHost, isNonProductionRuntime } from '@/lib/analytics/internal'
import { getEnabledModules } from '@/lib/nav/modules-config'
import { SELLABLE_PLANS } from '@/lib/plans'
import { rateLimit } from '@/lib/rate-limit'
import type { LandingPage, LandingSection } from '@/lib/marketing/ads/types'

export const dynamic = 'force-dynamic'

const SLUG_RE = /^[a-z0-9-]{1,80}$/
const HAIRLINE = '0.5px solid var(--color-border)'

// Descrições curtas dos módulos citáveis (fatos do produto — nada além do que
// os módulos realmente fazem; léxico proibido em docs/marketing).
const MODULE_DESCRIPTIONS: Record<string, string> = {
  renderizar:        'Imagens fotorrealistas a partir de modelos, prints e referências — preservando geometria, proporções e perspectiva.',
  spaces:            'Variações do mesmo projeto com identidade consistente: iluminação, ângulos e detalhes.',
  editar:            'Ajustes pontuais na imagem, sem refazer o render.',
  ampliar:           'Mais resolução para a imagem final do projeto.',
  animar:            'Vídeos curtos a partir das imagens do projeto.',
  finalizar:         'Pós-produção no navegador: ajustes, máscaras e exportação.',
  planta_humanizada: 'A planta técnica apresentada como planta humanizada.',
}

const CTA_CLASSES =
  'inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-inverse px-7 ' +
  'text-sm font-medium text-inverse-foreground no-underline transition-colors hover:bg-inverse-hover'

// Dedupe da leitura entre generateMetadata e a página (mesma request).
// Página PÚBLICA nunca responde 500 por infra de marketing (schema não
// aplicado/exposto): qualquer erro de leitura degrada para null → 404.
const loadPage = cache(async (slug: string): Promise<LandingPage | null> => {
  try {
    const admin = createAdminClient()
    return await getLandingPageBySlug(admin, slug, { publishedOnly: true })
  } catch (err) {
    console.warn('[lp] leitura falhou (degrada p/ 404):', err instanceof Error ? err.message : err)
    return null
  }
})

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  if (!SLUG_RE.test(slug)) return {}
  const page = await loadPage(slug)
  if (!page) return {}
  return {
    title: page.meta_title ?? `${page.name} · SpaceNode`,
    description: page.meta_description ?? page.subheadline ?? undefined,
    robots: { index: !page.noindex, follow: true },
  }
}

export default async function LandingCampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { slug } = await params
  if (!SLUG_RE.test(slug)) notFound()

  const page = await loadPage(slug)
  if (!page) notFound()

  // Só os parâmetros de campanha da URL de chegada (utm_*/gclid/fbclid) —
  // nada além disso entra no evento nem no CTA.
  const sp = await searchParams
  const utm: Record<string, string> = {}
  for (const [key, value] of Object.entries(sp)) {
    const v = Array.isArray(value) ? value[0] : value
    if (!v) continue
    if (key.startsWith('utm_') || key === 'gclid' || key === 'fbclid') {
      utm[key] = v.slice(0, 300)
    }
  }

  // CTA → /login?mode=signup preservando a atribuição (o cookie sn_attribution
  // é o mecanismo principal; a query é redundância para navegação sem JS).
  const qs = new URLSearchParams({ mode: 'signup' })
  for (const [k, v] of Object.entries(utm)) qs.set(k, v)
  const ctaHref = `/login?${qs.toString()}`
  const ctaLabel = page.cta_label?.trim() || 'Começar agora'

  // Um CTA por plano, cada um com a própria intenção (decisão do dono,
  // 18/09/26: a landing não empurra o Essence — leva o visitante a ESCOLHER
  // um plano). O CTA leva `plan=` na query além do cookie de intenção que o
  // clique grava: com os dois, a página de login manda o cadastro terminar
  // no checkout do plano escolhido (lib/analytics/attribution.ts →
  // intentResumePath) mesmo sem JS no clique. O plano mais barato é o
  // "comece por aqui" da seção de planos e a âncora de preço do hero.
  const planLinks: PlanLinks = Object.fromEntries(
    SELLABLE_PLANS.map((p) => {
      const planQs = new URLSearchParams(qs)
      planQs.set('plan', p.id)
      const intent: PlanIntent = { plan: p.id, billing: 'monthly' }
      return [p.id, { href: `/login?${planQs.toString()}`, intent }]
    }),
  )
  const entryPlan = SELLABLE_PLANS.reduce((a, b) => (b.monthlyPrice < a.monthlyPrice ? b : a))
  const cheapestPlanPrice = entryPlan.monthlyPrice

  const sections: LandingSection[] = Array.isArray(page.sections) ? page.sections : []

  // MOBILE (2026-09-18): a prova visual sobe para o primeiro viewport. O
  // primeiro par do `before_after` vira um comparador logo abaixo do título
  // — no celular, o visitante que veio de um Reel abria a página e via só
  // texto (o antes/depois começava em 712px de um viewport de 812). A seção
  // de resultados mostra os pares restantes. No desktop nada muda: o hero
  // segue sem imagem e a seção mostra todos os pares.
  const heroPair = sections.flatMap((s) => (s.kind === 'before_after' && Array.isArray(s.pairs) ? s.pairs : []))[0] ?? null

  // Registro de visita — best-effort no fim do render: rate limit por IP
  // (o IP fica só na chave da janela, o evento é anônimo) e jamais quebra a
  // página por falha de rastreamento.
  try {
    const hdrs = await headers()
    const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const rl = await rateLimit(createAdminClient(), `lp-view:${ip}`, 30, 60)
    if (rl.allowed) {
      // Três coisas que não são visita de mercado, todas GRAVADAS e marcadas
      // (nunca descartadas): dev server local apontando para o banco de
      // produção, preview da Vercel, e rastreador de link — o do próprio Meta
      // responde pela maior parte das "visitas" desta página (ver
      // docs/VALIDACAO-FUNIL-2026-09-16.md).
      const bot = isBotUserAgent(hdrs.get('user-agent'))
      const ambiente = isInternalHost(hdrs.get('x-forwarded-host') ?? hdrs.get('host'))
        || isNonProductionRuntime()
      await recordAcquisitionEvent(createAdminClient(), {
        event_type: 'lp_view',
        landing_page_id: page.id,
        utm,
        referrer: hdrs.get('referer')?.slice(0, 300) ?? null,
        is_internal: bot || ambiente,
        metadata: bot ? { nao_mercado: 'bot' } : ambiente ? { nao_mercado: 'ambiente' } : {},
      })
    }
  } catch (err) {
    console.warn('[lp] registro de visita falhou (best-effort):', err)
  }

  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <ForceDarkScope />
      <LpViewPing slug={slug} />

      {/* Header mínimo — o logo oficial (símbolo + wordmark, components/brand)
          de volta pra home. Antes era um wordmark solto em caixa-baixa
          espaçada, fora da identidade. */}
      <header className="mx-auto flex max-w-5xl items-center px-5 py-3 sm:px-10 sm:py-5">
        <Link href="/" className="inline-flex text-text-primary no-underline" aria-label="SpaceNode — início">
          <Logo symbolSize={30} />
        </Link>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-3xl px-5 pb-8 pt-4 text-center sm:px-10 sm:pb-14 sm:pt-24">
          {/* Eyebrow só no desktop: no celular é uma linha a mais entre a
              pessoa e a imagem. */}
          <span
            className="hidden text-[10px] font-medium uppercase text-text-tertiary sm:inline-block"
            style={{ letterSpacing: '0.28em' }}
          >
            Visualização arquitetônica
          </span>
          <h1
            className="mx-auto max-w-2xl text-[29px] font-light leading-[1.08] text-text-primary sm:mt-6 sm:text-[clamp(32px,6vw,52px)]"
            style={{ letterSpacing: '-0.045em' }}
          >
            {page.headline ?? page.name}
          </h1>

          {/* Prova visual no primeiro viewport — só mobile (ver heroPair). O
              comparador é o mesmo da home (arraste), em 16:9 para caber
              inteiro entre o título e o CTA. */}
          {heroPair && (
            <figure className="mx-auto mt-4 max-w-xl sm:hidden" style={{ margin: '16px auto 0' }}>
              <div className="overflow-hidden rounded-2xl" style={{ border: HAIRLINE }}>
                <BeforeAfter
                  base={heroPair.before}
                  render={heroPair.after}
                  aspect="16 / 9"
                  caption={heroPair.label}
                  sizes="100vw"
                />
              </div>
              <figcaption
                className="mt-2 text-[10px] uppercase text-text-tertiary"
                style={{ letterSpacing: '0.12em' }}
              >
                arraste para comparar
                {heroPair.credit && (
                  <span className="normal-case" style={{ letterSpacing: '0' }}> · projeto de {heroPair.credit}</span>
                )}
              </figcaption>
            </figure>
          )}

          {page.subheadline && (
            <p
              className="mx-auto mt-4 max-w-xl text-[14px] leading-relaxed text-text-secondary sm:mt-5 sm:text-[17px]"
              style={{ letterSpacing: '-0.01em' }}
            >
              {page.subheadline}
            </p>
          )}
          <div className="mt-5 sm:mt-9">
            <LpCtaLink href={ctaHref} slug={slug} position="hero" className={CTA_CLASSES}>
              {ctaLabel}
              <CtaArrow />
            </LpCtaLink>
          </div>
          {/* Âncora de preço no mobile: quem entra sabe desde o primeiro
              viewport que a ferramenta é paga — a métrica desta página é
              assinatura, não volume de cadastro. Desktop segue como estava. */}
          <p className="mt-4 text-[11px] text-text-tertiary sm:mt-5" style={{ letterSpacing: '0.02em' }}>
            <span className="sm:hidden">
              80 nodes grátis, sem cartão · planos a partir de R$ {cheapestPlanPrice}/mês
            </span>
            <span className="hidden sm:inline">80 nodes grátis · sem cartão</span>
          </p>
        </section>

        {/* Seções configuradas no painel, na ordem do array */}
        {sections.map((section, index) => renderSection(section, index, page, planLinks))}

        {/* CTA final */}
        <section className="mx-auto max-w-3xl px-5 py-12 text-center sm:px-10 sm:py-16" style={{ borderTop: HAIRLINE }}>
          <h2 className="text-[26px] font-light text-text-primary" style={{ letterSpacing: '-0.03em' }}>
            comece com 80 nodes grátis.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-text-secondary">
            {/* Preço lido da tabela, não escrito à mão: este texto já ficou
                desatualizado uma vez quando o Starter saiu da vitrine. */}
            Sem cartão para começar. Planos a partir de R$ {cheapestPlanPrice}/mês.
          </p>
          <div className="mt-7">
            <LpCtaLink href={ctaHref} slug={slug} position="final" className={CTA_CLASSES}>
              {ctaLabel}
              <CtaArrow />
            </LpCtaLink>
          </div>
        </section>
      </main>

      {/* Barra fixa (só mobile): genérica, leva à seção de planos — lá cada
          plano tem o próprio CTA. Some enquanto a seção está na tela e sobe
          quando o banner de consentimento está aberto. */}
      <LpStickyCta
        slug={slug}
        href="#planos"
        label="Escolher meu plano"
        note={`planos a partir de R$ ${cheapestPlanPrice}/mês · cancele quando quiser`}
        hideWhenVisibleId="planos"
      />

      {/* Footer mínimo */}
      <footer
        className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-8 sm:px-10"
        style={{ borderTop: HAIRLINE }}
      >
        <span className="text-[11px] text-text-tertiary">© SPACENODE TECNOLOGIA LTDA</span>
        <nav className="flex gap-4 text-[11px]" aria-label="Jurídico">
          <a href="/termos" className="text-text-tertiary no-underline hover:text-text-secondary">
            Termos de uso
          </a>
          <a href="/privacidade" className="text-text-tertiary no-underline hover:text-text-secondary">
            Privacidade
          </a>
        </nav>
      </footer>
    </div>
  )
}

// ── Seções ─────────────────────────────────────────────────────────────────────

/** Por plano vendável: destino de cadastro com `plan=` e a intenção que o
 *  clique grava. Cada CTA de plano preserva o SEU plano até o checkout. */
type PlanLinks = Record<string, { href: string; intent: PlanIntent }>

const CTA_GHOST_CLASSES =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-bg-elevated px-5 ' +
  'text-[13px] font-medium text-text-primary no-underline transition-colors hover:bg-bg-elevated-hover'
const CTA_GHOST_STYLE = { border: '0.5px solid var(--color-border-strong)' } as const

function renderSection(
  section: LandingSection,
  index: number,
  page: LandingPage,
  planLinks: PlanLinks,
): ReactNode {
  switch (section.kind) {
    case 'value_props':
      return <ValuePropsSection key={index} items={section.items} />
    case 'before_after':
      return <BeforeAfterSection key={index} pairs={section.pairs} pageName={page.name} />
    case 'modules':
      return <ModulesSection key={index} moduleIds={section.module_ids} />
    case 'how_it_works':
      return <HowItWorksSection key={index} steps={section.steps} />
    case 'faq':
      return <FaqSection key={index} items={section.items} />
    case 'quote':
      return <QuoteSection key={index} text={section.text} attribution={section.attribution} />
    case 'pricing':
      return (
        <PricingSection
          key={index}
          planIds={section.plan_ids}
          featuredPlanId={section.featured_plan_id}
          note={section.note}
          slug={page.slug}
          planLinks={planLinks}
        />
      )
    default:
      // Seção desconhecida (dado mais novo que o código) — ignorada em silêncio.
      return null
  }
}

/** Cabeçalho padrão de seção: eyebrow uppercase + h2 minúsculo com ponto. */
function SectionShell({
  id,
  eyebrow,
  title,
  children,
}: {
  id?: string
  eyebrow: string
  title: string
  children: ReactNode
}) {
  // Mobile mais denso (py-8, mb-5); desktop mantém py-12 / mb-8.
  return (
    <section id={id} className="mx-auto max-w-4xl px-5 py-8 sm:px-10 sm:py-12" style={id ? { scrollMarginTop: 12 } : undefined}>
      <span
        className="block text-[10px] font-medium uppercase text-text-tertiary"
        style={{ letterSpacing: '0.28em' }}
      >
        {eyebrow}
      </span>
      <h2
        className="mb-5 mt-2 text-[24px] font-light text-text-primary sm:mb-8 sm:mt-3 sm:text-[26px]"
        style={{ letterSpacing: '-0.03em' }}
      >
        {title}
      </h2>
      {children}
    </section>
  )
}

/** Colunas responsivas conforme a quantidade de itens (evita célula fantasma). */
function gridColsFor(count: number): string {
  if (count >= 4) return 'sm:grid-cols-2 lg:grid-cols-4'
  if (count === 3) return 'sm:grid-cols-3'
  if (count === 2) return 'sm:grid-cols-2'
  return ''
}

function ValuePropsSection({ items }: { items: Array<{ title: string; body: string }> }) {
  if (!Array.isArray(items) || items.length === 0) return null
  return (
    <section className="mx-auto max-w-4xl px-5 py-6 sm:px-10 sm:py-10">
      {/* Mobile: lista com hairline, sem cartão — os três argumentos cabem
          em meia tela. Desktop: os cartões de sempre. */}
      <ul className="m-0 list-none p-0 sm:hidden" style={{ borderTop: HAIRLINE }}>
        {items.map((item, i) => (
          <li key={i} className="py-3" style={{ borderBottom: HAIRLINE }}>
            <span className="text-[13px] font-medium text-text-primary" style={{ letterSpacing: '-0.01em' }}>
              {item.title}
            </span>
            <span className="text-xs text-text-tertiary"> — {item.body}</span>
          </li>
        ))}
      </ul>
      <div className={`hidden grid-cols-1 gap-2 sm:grid ${gridColsFor(items.length)}`}>
        {items.map((item, i) => (
          <div key={i} className="rounded-xl bg-bg-elevated p-5" style={{ border: HAIRLINE }}>
            <div className="text-[13px] font-medium text-text-primary" style={{ letterSpacing: '-0.01em' }}>
              {item.title}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-text-tertiary">{item.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function BeforeAfterSection({
  pairs,
  pageName,
}: {
  pairs: Array<{ before: string; after: string; label?: string; credit?: string }>
  pageName: string
}) {
  if (!Array.isArray(pairs) || pairs.length === 0) return null
  // Mobile: o primeiro par já está no hero (heroPair); aqui entram os
  // restantes como comparadores 16:9 — um par por ~230px em vez de ~600px
  // (duas imagens 4:3 empilhadas). Sem par restante, a seção some no mobile.
  const mobilePairs = pairs.slice(1)
  return (
    <SectionShell eyebrow="Resultados" title="antes e depois.">
      <div className={`grid gap-5 ${mobilePairs.length === 0 ? 'hidden' : ''} sm:hidden`}>
        {mobilePairs.map((pair, i) => (
          <figure key={i} className="m-0">
            <div className="overflow-hidden rounded-2xl" style={{ border: HAIRLINE }}>
              <BeforeAfter
                base={pair.before}
                render={pair.after}
                aspect="16 / 9"
                caption={pair.label}
                sizes="100vw"
              />
            </div>
            {pair.credit && (
              <figcaption className="mt-1.5 text-[11px] text-text-tertiary" style={{ letterSpacing: '0.01em' }}>
                {pair.credit}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
      <div className="hidden gap-8 sm:grid">
        {pairs.map((pair, i) => (
          <figure key={i} className="m-0">
            {/* Divisor hairline: gap de 1px sobre fundo na cor da borda */}
            <div
              className="grid grid-cols-1 overflow-hidden rounded-2xl sm:grid-cols-2"
              style={{ border: HAIRLINE, background: 'var(--color-border)', gap: 1 }}
            >
              <div className="bg-bg-elevated">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pair.before}
                  alt={`${pair.label ?? pageName} — antes`}
                  loading="lazy"
                  className="block h-full w-full object-cover"
                  style={{ aspectRatio: '4 / 3', maxWidth: '100%' }}
                />
              </div>
              <div className="bg-bg-elevated">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pair.after}
                  alt={`${pair.label ?? pageName} — depois`}
                  loading="lazy"
                  className="block h-full w-full object-cover"
                  style={{ aspectRatio: '4 / 3', maxWidth: '100%' }}
                />
              </div>
            </div>
            <figcaption
              className="mt-2 flex items-center justify-between text-[11px] uppercase text-text-tertiary"
              style={{ letterSpacing: '0.12em' }}
            >
              <span>Antes</span>
              {pair.label && (
                <span className="normal-case text-text-secondary" style={{ letterSpacing: '-0.005em' }}>
                  {pair.label}
                  {/* O crédito vai colado no par, não numa lista no rodapé: é
                      assim que a pessoa que projetou consegue se achar. A grafia
                      vem exatamente como ela assina (ver AUTORIZACOES.md —
                      "muda arquitetura" é minúsculo de propósito). */}
                  {pair.credit && (
                    <span className="text-text-tertiary"> · {pair.credit}</span>
                  )}
                </span>
              )}
              <span>Depois</span>
            </figcaption>
          </figure>
        ))}
      </div>
      {pairs.some((p) => p.credit) && (
        <p className="mt-4 text-xs leading-relaxed text-text-tertiary sm:mt-6">
          Projetos de escritórios que usam a plataforma. Publicado com autorização
          de quem projetou.
        </p>
      )}
    </SectionShell>
  )
}

function ModulesSection({ moduleIds }: { moduleIds: string[] }) {
  // Só módulos habilitados na navegação (lib/nav/modules-config) — módulo
  // desligado (Isométricas/Prancha IA/Moodboard) nunca aparece em campanha.
  const ids = Array.isArray(moduleIds) ? moduleIds : []
  const modules = getEnabledModules().filter((m) => ids.includes(m.id))
  if (modules.length === 0) return null
  return (
    <SectionShell eyebrow="Plataforma" title="módulos da plataforma.">
      <div className="grid gap-2 sm:grid-cols-2">
        {modules.map((m) => (
          <div key={m.id} className="rounded-xl bg-bg-elevated p-5" style={{ border: HAIRLINE }}>
            <div className="text-[13px] font-medium text-text-primary" style={{ letterSpacing: '-0.01em' }}>
              {m.label}
            </div>
            {MODULE_DESCRIPTIONS[m.id] && (
              <p className="mt-1.5 text-xs leading-relaxed text-text-tertiary">
                {MODULE_DESCRIPTIONS[m.id]}
              </p>
            )}
          </div>
        ))}
      </div>
    </SectionShell>
  )
}

function HowItWorksSection({ steps }: { steps: Array<{ title: string; body: string }> }) {
  if (!Array.isArray(steps) || steps.length === 0) return null
  return (
    <SectionShell eyebrow="Processo" title="como funciona.">
      {/* Mobile: lista numerada em linha, sem cartão. Desktop: cartões. */}
      <ol className="m-0 list-none p-0 sm:hidden" style={{ borderTop: HAIRLINE }}>
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3 py-3" style={{ borderBottom: HAIRLINE }}>
            <span
              aria-hidden
              className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full text-[10px] text-text-secondary"
              style={{ border: '0.5px solid var(--color-border-strong)' }}
            >
              {i + 1}
            </span>
            <div>
              <span className="text-[13px] font-medium text-text-primary" style={{ letterSpacing: '-0.01em' }}>
                {step.title}
              </span>
              <p className="mt-0.5 text-xs leading-relaxed text-text-tertiary">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <ol className={`m-0 hidden list-none gap-2 p-0 sm:grid ${gridColsFor(steps.length)}`}>
        {steps.map((step, i) => (
          <li key={i} className="rounded-xl bg-bg-elevated p-5" style={{ border: HAIRLINE }}>
            <span
              aria-hidden
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-xs text-text-secondary"
              style={{ border: '0.5px solid var(--color-border-strong)' }}
            >
              {i + 1}
            </span>
            <div className="mt-3 text-[13px] font-medium text-text-primary" style={{ letterSpacing: '-0.01em' }}>
              {step.title}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-text-tertiary">{step.body}</p>
          </li>
        ))}
      </ol>
    </SectionShell>
  )
}

function FaqSection({ items }: { items: Array<{ q: string; a: string }> }) {
  if (!Array.isArray(items) || items.length === 0) return null
  return (
    <SectionShell eyebrow="Dúvidas" title="perguntas frequentes.">
      <div className="overflow-hidden rounded-2xl" style={{ border: HAIRLINE }}>
        {items.map((item, i) => (
          <details
            key={i}
            className="group bg-bg-elevated"
            style={i > 0 ? { borderTop: HAIRLINE } : undefined}
          >
            <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-4 px-5 py-4 text-sm font-medium text-text-primary [&::-webkit-details-marker]:hidden">
              {item.q}
              <span aria-hidden className="text-text-tertiary transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="px-5 pb-5 text-[13px] leading-relaxed text-text-secondary">{item.a}</p>
          </details>
        ))}
      </div>
    </SectionShell>
  )
}

function QuoteSection({ text, attribution }: { text: string; attribution?: string }) {
  // NUNCA renderizar depoimento vazio — e nunca inventar um (o texto vem do
  // painel, com revisão humana e brand-check).
  if (typeof text !== 'string' || !text.trim()) return null
  return (
    <section className="mx-auto max-w-3xl px-5 py-12 sm:px-10">
      <blockquote className="m-0 pl-5" style={{ borderLeft: '2px solid var(--color-border-strong)' }}>
        <p className="text-lg font-light leading-relaxed text-text-secondary" style={{ letterSpacing: '-0.01em' }}>
          “{text.trim()}”
        </p>
        {attribution && <footer className="mt-3 text-xs text-text-tertiary">— {attribution}</footer>}
      </blockquote>
    </section>
  )
}

/**
 * Preço na LP de campanha.
 *
 * Por que existe: até 2026-09-16 nenhuma LP paga mostrava preço. Quem clicava
 * no anúncio só via "80 nodes grátis, sem cartão" e se cadastrava sabendo que
 * era de graça — o Google mandou 62 cadastros e 0 assinaturas. Preço na página
 * filtra antes do clique: quem chega no cadastro já sabe que a ferramenta é
 * paga. Menos cadastro, cadastro mais qualificado — a métrica desta seção é
 * assinatura, nunca volume de cadastro.
 *
 * Os valores vêm de SELLABLE_PLANS, nunca do dado da LP: preço editado à mão
 * no painel vira preço errado no dia em que a tabela muda.
 */
function PricingSection({
  planIds,
  featuredPlanId,
  note,
  slug,
  planLinks,
}: {
  planIds?: string[]
  featuredPlanId?: string
  note?: string
  slug: string
  planLinks: PlanLinks
}) {
  const ids = Array.isArray(planIds) ? planIds : []
  const plans = ids.length > 0 ? SELLABLE_PLANS.filter((p) => ids.includes(p.id)) : SELLABLE_PLANS
  if (plans.length === 0) return null

  // Cada plano tem o PRÓPRIO CTA, com a própria intenção (decisão do dono,
  // 18/09/26): a página leva o visitante a escolher um plano, não a um plano
  // em particular. O destaque "comece por aqui" é só hierarquia visual — no
  // mobile o mais barato vira cartão e os outros linhas, cada linha com o
  // seu botão. `featured_plan_id` no dado troca o destaque.
  const cheapest = plans.reduce((a, b) => (b.monthlyPrice < a.monthlyPrice ? b : a))
  const featured = plans.find((p) => p.id === featuredPlanId) ?? cheapest
  const secondary = plans.filter((p) => p.id !== featured.id)
  const noteText =
    note ??
    'Nodes são os créditos de geração e acumulam enquanto a assinatura estiver ativa. Começa grátis com 80 nodes, sem cartão — a assinatura entra quando o volume pedir.'
  const linkFor = (id: string) => planLinks[id]

  return (
    <SectionShell id="planos" eyebrow="Planos" title="quanto custa.">
      {/* ── Mobile ─────────────────────────────────────────────────── */}
      <div className="sm:hidden">
        <div
          className="relative flex flex-col rounded-xl bg-bg-elevated p-5"
          style={{ border: '0.5px solid var(--color-border-strong)' }}
        >
          <span
            className="absolute right-4 top-4 rounded-full bg-inverse px-2 py-0.5 text-[9px] font-medium uppercase text-inverse-foreground"
            style={{ letterSpacing: '0.14em' }}
          >
            comece por aqui
          </span>
          <div
            className="text-[10px] font-medium uppercase text-text-tertiary"
            style={{ letterSpacing: '0.28em' }}
          >
            {featured.name}
          </div>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="text-xs text-text-tertiary">R$</span>
            <span
              className="text-[34px] font-light leading-none text-text-primary"
              style={{ letterSpacing: '-0.03em' }}
            >
              {featured.monthlyPrice}
            </span>
            <span className="text-xs text-text-tertiary">/mês</span>
          </div>
          <div className="mt-2 text-[13px] text-text-secondary" style={{ letterSpacing: '-0.01em' }}>
            {featured.nodes.toLocaleString('pt-BR')} nodes / mês · cancele quando quiser
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-text-tertiary">{featured.description}</p>
          {linkFor(featured.id) && (
            <div className="mt-5">
              <LpCtaLink
                href={linkFor(featured.id).href}
                slug={slug}
                position="pricing"
                intent={linkFor(featured.id).intent}
                className={`${CTA_CLASSES} w-full`}
              >
                Começar com {featured.name}
                <CtaArrow />
              </LpCtaLink>
            </div>
          )}
        </div>

        {secondary.length > 0 && (
          <ul className="m-0 mt-3 list-none p-0" style={{ borderTop: HAIRLINE }}>
            {secondary.map((plan) => (
              <li
                key={plan.id}
                className="flex items-center justify-between gap-3 py-3"
                style={{ borderBottom: HAIRLINE }}
              >
                <div className="min-w-0">
                  <span className="text-[13px] font-medium text-text-primary" style={{ letterSpacing: '-0.01em' }}>
                    {plan.name}
                    <span className="font-normal text-text-secondary"> · R$ {plan.monthlyPrice}/mês</span>
                  </span>
                  <span className="block text-[11px] text-text-tertiary">
                    {plan.nodes.toLocaleString('pt-BR')} nodes / mês · {plan.description}
                  </span>
                </div>
                {linkFor(plan.id) && (
                  <LpCtaLink
                    href={linkFor(plan.id).href}
                    slug={slug}
                    position="pricing"
                    intent={linkFor(plan.id).intent}
                    className={`${CTA_GHOST_CLASSES} flex-none min-h-[40px] px-4 text-[12px]`}
                    style={CTA_GHOST_STYLE}
                  >
                    Escolher
                  </LpCtaLink>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs leading-relaxed text-text-tertiary">{noteText}</p>
      </div>

      {/* ── Desktop: os mesmos cartões, agora cada um com o próprio CTA ── */}
      <div className="hidden sm:block">
      <div className={`grid grid-cols-1 gap-2 ${gridColsFor(plans.length)}`}>
        {plans.map((plan) => (
          <div
            key={plan.id}
            className="flex flex-col rounded-xl bg-bg-elevated p-5"
            style={{
              border: plan.recommended ? '0.5px solid var(--color-border-strong)' : HAIRLINE,
            }}
          >
            <div
              className="text-[10px] font-medium uppercase text-text-tertiary"
              style={{ letterSpacing: '0.28em' }}
            >
              {plan.name}
            </div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-xs text-text-tertiary">R$</span>
              <span
                className="text-[30px] font-light leading-none text-text-primary"
                style={{ letterSpacing: '-0.03em' }}
              >
                {plan.monthlyPrice}
              </span>
              <span className="text-xs text-text-tertiary">/mês</span>
            </div>
            <div className="mt-2 text-[13px] text-text-secondary" style={{ letterSpacing: '-0.01em' }}>
              {plan.nodes.toLocaleString('pt-BR')} nodes / mês
            </div>
            <p className="mt-1.5 flex-1 text-xs leading-relaxed text-text-tertiary">{plan.description}</p>
            {/* O CTA de cada cartão grava a intenção DESTE plano: o cadastro
                termina no checkout dele. O destaque leva o botão cheio. */}
            {linkFor(plan.id) && (
              <div className="mt-5">
                <LpCtaLink
                  href={linkFor(plan.id).href}
                  slug={slug}
                  position="pricing"
                  intent={linkFor(plan.id).intent}
                  className={plan.id === featured.id ? `${CTA_CLASSES} w-full` : `${CTA_GHOST_CLASSES} w-full`}
                  style={plan.id === featured.id ? undefined : CTA_GHOST_STYLE}
                >
                  Começar com {plan.name}
                  <CtaArrow />
                </LpCtaLink>
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-6 text-xs leading-relaxed text-text-tertiary">{noteText}</p>
      </div>
    </SectionShell>
  )
}

function CtaArrow() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M2 6h8M6.5 2.5L10 6l-3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

# Analytics do funil de conversão

Camada first-party de eventos + atribuição do SPACENODE. Fonte única:
`lib/analytics/` (catálogo tipado, client, server, adapters) gravando em
`marketing.acquisition_events` (Supabase, RLS deny-all, service_role).

**Princípios**

- **Server é a verdade.** Dinheiro e assinatura só via webhook do Stripe;
  geração/cadastro nas rotas onde o fato acontece. O browser só emite eventos
  de UI (allowlist anti-spoof no coletor).
- **Sem PII.** Nenhum evento carrega e-mail, telefone, prompt, imagem ou IP.
  Identidade = `user_id` interno + id anônimo first-party (`sn_aid`).
- **Best-effort.** Rastreamento nunca lança, nunca bloqueia produto, nunca
  taxa latência de rota quente (usa `after()` do Next).
- **Sem terceiros por padrão.** GA4/Meta são adapters opcionais por env var,
  atrás de `lib/analytics/consent.ts` — e exigem atualização da cláusula 7 da
  política de privacidade ANTES de ligar (hoje ela promete "sem rastreadores
  de terceiros"; o gtag do Google Ads já está em produção com essa pendência).

## Identidade e atribuição

| Cookie | O quê | Duração | Quem escreve |
|---|---|---|---|
| `sn_aid` | id anônimo (uuid) | 400 dias | `UtmCapture` (layout raiz), sempre |
| `sn_attribution` | first touch + last touch: utm_source/medium/campaign/content/term, gclid, fbclid, referrer, landing_path, timestamp | 90 dias | `UtmCapture`, só quando a URL traz parâmetro de campanha |
| `sn_intent` | plano/ciclo/oferta escolhidos no CTA | 24 h (uso único) | CTA de plano e `/login?plan=…`; limpo pelos handlers de auth |

- **Anônimo → usuário:** o evento `signup` (storage) grava `user_id` +
  `anonymous_id` + snapshot de atribuição — imutável (índice único por
  usuário). Toda a jornada anônima junta via `anonymous_id`; a jornada logada
  via `user_id`. Nada é duplicado: os eventos antigos não são reescritos, o
  join acontece na leitura.
- **Fluxo de plano:** CTA "Começar com <plano>" grava `sn_intent` e navega a
  `/login?mode=signup&plan=…`. Depois da auth (qualquer caminho: GIS, OAuth,
  e-mail), o handler lê o cookie e retoma em
  `/app/billing?plan=…&billing=…&resume=1`, onde o checkout abre sozinho uma
  única vez. `next` explícito tem precedência; conta nova ganha `signup=1`
  (ping de conversão do Google Ads — agora também no caminho GIS).
- **Stripe:** o checkout grava `anonymous_id` + last-touch (utm/gclid/fbclid)
  + `offer` no `metadata` da session; o webhook devolve isso nos eventos de
  dinheiro — atribuição de receita não depende de cookie no webhook.

## Catálogo de eventos

Nomes públicos (o que `track()`/`trackServerEvent()` aceitam). `→` indica o
event_type persistido quando difere (aliases legados do painel de ads).

| Evento | Origem | Disparo | Propriedades principais |
|---|---|---|---|
| `landing_view` | client | mount da landing `/` (LPs de campanha têm `lp_view` server-side) | page, referrer |
| `cta_clicked` | client | qualquer CTA da landing | cta (hero, navbar, final, pricing_card, …), plan?, offer?, billing? |
| `plans_viewed` | client | seção `#planos` visível (IntersectionObserver) e `/app/billing` | source: landing\|billing |
| `signup_started` | client | `/login` em modo cadastro (1× por pageload) | plan?, offer? |
| `signup_completed` → `signup` | server (bind) | 1º acesso autenticado; imutável por usuário | organic, plan_intent?, account_created_at, anonymous_id |
| `onboarding_completed` | client | conclusão do tour de boas-vindas | — |
| `project_created` | server | `POST /api/spaces` 201 | feature: spaces, category, engine |
| `image_uploaded` | client | `uploadDirect()` concluído | area (render-source, editar, …) |
| `generation_started` | server | rotas de geração, após débito | feature, engine?, resolution?, nodes |
| `generation_completed` | server | geração persistida | feature, engine?, resolution?, nodes, duration_ms, id |
| `generation_failed` | server | catch das rotas (refund) | feature, reason |
| `result_approved` | client | 1ª ação positiva sobre um resultado (baixar, ampliar, continuar editando) — 1× por resultado | feature, action |
| `result_rejected` | client/server | "Corrigir drift" (user) ou edição descartada pelo gate de fidelidade (system) | feature, by: user\|system, reason |
| `result_downloaded` | server (`/api/download`) e client (só Editar V3, download via blob) | download efetivo | feature?, filename slug |
| `checkout_started` | server | `POST /api/stripe/checkout` (plano e Lumen) | plan/pack, billing_cycle, launch_offer, offer |
| `checkout_completed` | webhook | session paga (`checkout.session.completed`/`async_payment_succeeded` com `payment_status=paid`) | product_type, plan/pack, value_cents; dedupe `checkout:{session_id}` |
| `subscription_started` | webhook | ativação do plano (card ou Pix via `invoice.paid`) | plan, billing_cycle, value_cents, launch_offer, activated_via; dedupe por assinatura |
| `subscription_cancelled` → `subscription_canceled` | webhook | `customer.subscription.deleted` | plan; dedupe `sub_canceled:{subscription_id}` |
| `first_generation` (interno) | server | junto do 1º `generation_completed` do usuário (índice único) | feature |

Eventos legados que continuam como estão: `lp_view`, `lp_cta_click` (LPs de
campanha `/lp/{slug}`), `subscription_renewed` (webhook, receita de renovação).

## Dedupe (regra por evento)

- **Webhook:** chave `dedupe_key` + índice único parcial — retry do Stripe não
  duplica (`checkout:{session_id}`, `sub_started:{subscription_id}`,
  `sub_canceled:{subscription_id}`).
- **Signup/first_generation:** índice único por usuário (legado).
- **Client × server:** o coletor público recusa eventos server-only; o client
  não emite os que o servidor grava. `result_downloaded` não colide: Editar V3
  baixa via blob (client), todo o resto via `/api/download` (server).
- **Pixel × CAPI (quando ligados):** `event_id` determinístico compartilhado.

## Variáveis de ambiente

| Var | Lado | Efeito |
|---|---|---|
| `NEXT_PUBLIC_GADS_SIGNUP_LABEL` | client | (existente) label da conversão de cadastro do Google Ads — pendente na conta |
| `NEXT_PUBLIC_GA4_ID` | client | liga GA4 (config no gtag.js já carregado + eventos client) |
| `GA4_API_SECRET` | server | com `NEXT_PUBLIC_GA4_ID`, liga GA4 Measurement Protocol (eventos de dinheiro via webhook) |
| `NEXT_PUBLIC_META_PIXEL_ID` | client | liga Meta Pixel (snippet + eventos client) |
| `META_CAPI_ACCESS_TOKEN` | server | com o pixel id, liga Meta Conversions API (dinheiro via webhook) |

Sem nenhuma delas, tudo continua funcionando 100% first-party. **Antes de
definir qualquer uma em produção:** atualizar a cláusula 7 da
`/privacidade` (e, se exigido, implementar consentimento explícito) — trocar
a implementação de `lib/analytics/consent.ts` quando houver banner/CMP.

## Funil por canal (SQL de referência)

Canal = `utm->last->>'source'` (ou `utm->first->>'source'` para first-touch).

```sql
-- Visita → cadastro (por canal, últimos 30 dias)
with signups as (
  select id, user_id, anonymous_id,
         coalesce(utm->'last'->>'source', 'organico') as canal
  from marketing.acquisition_events
  where event_type = 'signup' and created_at > now() - interval '30 days'
),
visitas as (
  select anonymous_id,
         coalesce(utm->'last'->>'source', 'organico') as canal
  from marketing.acquisition_events
  where event_type in ('landing_view', 'lp_view')
    and created_at > now() - interval '30 days'
)
select v.canal,
       count(distinct v.anonymous_id)                 as visitantes,
       count(distinct s.user_id)                      as cadastros,
       round(100.0 * count(distinct s.user_id)
             / nullif(count(distinct v.anonymous_id), 0), 1) as conv_pct
from visitas v
left join signups s using (anonymous_id, canal)
group by 1 order by 2 desc;

-- Cadastro → ativação (1º resultado aprovado/baixado ou 1ª geração)
select count(*) filter (where a.user_id is not null) as ativados,
       count(*)                                      as cadastros
from (select user_id from marketing.acquisition_events where event_type = 'signup') s
left join lateral (
  select user_id from marketing.acquisition_events e
  where e.user_id = s.user_id
    and e.event_type in ('result_approved', 'result_downloaded', 'first_generation')
  limit 1
) a on true;

-- Ativação → assinatura
select count(distinct user_id)
from marketing.acquisition_events
where event_type = 'subscription_started';
```

O painel `/admin/marketing/ads` continua funcionando sem mudança (consome os
nomes legados).

## Validação

**Local** (`npm run dev` + Stripe test):

1. Abrir `http://localhost:3000/?utm_source=teste&utm_medium=cpc&utm_campaign=val&gclid=g123`
   → DevTools: cookies `sn_aid` e `sn_attribution` presentes; POST
   `/api/analytics/track` com `landing_view`.
2. Rolar até os planos (`plans_viewed`), clicar "Começar com Starter"
   (`cta_clicked` + cookie `sn_intent`) → `/login?mode=signup&plan=starter`
   (`signup_started`).
3. Criar conta (Google ou e-mail) → volta em
   `/app/billing?plan=starter&resume=1` com o checkout abrindo sozinho;
   `checkout_started` no banco com `anonymous_id` e utm.
4. Pagar com `4242 4242 4242 4242` → webhook grava `checkout_completed` +
   `subscription_started` (conferir `stripe listen --forward-to
   localhost:3000/api/stripe/webhook`). Reentregar o evento no dashboard do
   Stripe → nenhuma linha nova (dedupe).
5. Gerar uma imagem no Renderizar → `generation_started/completed` +
   `first_generation`; baixar → `result_downloaded`.
6. Conferir tudo:
   `select event_type, user_id is not null as logado, anonymous_id, plan_id,
    offer_id, created_at from marketing.acquisition_events order by created_at desc limit 30;`

**Produção:** repetir 1–3 com `?utm_source=validacao` (sem pagar, parar no
Stripe) e conferir as linhas + atribuição no SQL editor do Supabase; a
consulta de funil acima responde visita→cadastro por canal. `subscription_*`
valida na próxima compra real (ou com uma compra de R$ 44,50 cancelada em
seguida, como na validação da oferta de lançamento).

## Pendências externas

- `NEXT_PUBLIC_GADS_SIGNUP_LABEL` — criar a conversão na conta Google Ads.
- GA4 / Meta Pixel / CAPI — criar propriedades/pixel e definir envs QUANDO a
  cláusula 7 for atualizada (decisão jurídica pendente; mesma trava da
  campanha de Search).
- Migration `20260818000000_analytics_funnel.sql` precisa estar aplicada no
  Supabase antes do deploy (sem ela os eventos novos caem no CHECK e são
  descartados com warn — produto não quebra).

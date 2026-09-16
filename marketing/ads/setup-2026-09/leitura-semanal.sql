-- Leitura semanal do tráfego pago (Supabase de PRODUÇÃO, SQL Editor). Rodar toda segunda 9h.
-- Fonte da verdade = funil first-party (marketing.acquisition_events) + Stripe. Contas internas excluídas.
-- Troque as datas de :inicio quando abrir uma nova rodada.

-- 0) Contas internas (nunca contam)
create temp table if not exists _staff as
select id from public.profiles where email in (
  'viniciuspisonivargas@gmail.com','spacenodetestes@gmail.com','spacenodeads@gmail.com',
  'mudecomamuda@gmail.com','equipedamuda@gmail.com','equipedamuda01@gmail.com');

-- 1) Cadastros por célula (campanha + conjunto/grupo) desde o início da rodada, com ativação 7d
with c as (
  select a.user_id, a.campaign_identifier as campanha,
         split_part(a.ad_identifier, '_', 5) as celula,      -- RENDER / PLUGIN (Meta) · FIDELIDADE / PLUGIN / APRESENTACAO (Google)
         a.ad_identifier as anuncio, a.created_at as signup_at,
         (a.utm->'last'->>'gclid') is not null as google, (a.utm->'last'->>'fbclid') is not null as meta
  from marketing.acquisition_events a
  where a.event_type = 'signup' and a.created_at >= '2026-09-14'
    and a.user_id not in (select id from _staff)
),
gen as (
  select user_id, created_at from public.renders where status = 'completed'
  union all select user_id, created_at from public.vistas where status = 'completed'
  union all select user_id, created_at from public.edits
  union all select user_id, created_at from public.edit_v3_jobs
),
g as (
  select c.user_id, count(r.*) as gens_7d, min(r.created_at) as primeira
  from c left join gen r on r.user_id = c.user_id and r.created_at between c.signup_at and c.signup_at + interval '7 days'
  group by c.user_id
),
chk as (select user_id, min(created_at) at from marketing.acquisition_events where event_type = 'checkout_started' group by user_id),
sub as (select user_id, min(created_at) at, min(value_cents) valor from marketing.acquisition_events where event_type = 'subscription_started' group by user_id)
select coalesce(c.campanha, case when c.google then 'google (sem utm)' when c.meta then 'meta (sem utm)' else 'organico' end) as campanha,
       c.celula,
       count(*) as cadastros,
       count(*) filter (where g.gens_7d >= 1) as ativados,
       round(100.0 * count(*) filter (where g.gens_7d >= 1) / nullif(count(*),0)) as ativacao_pct,
       count(*) filter (where g.gens_7d >= 5) as cinco_mais,
       count(*) filter (where g.gens_7d >= 10) as dez_mais,
       count(*) filter (where chk.at is not null) as iniciaram_checkout,
       count(*) filter (where sub.at is not null) as assinaram,
       sum(sub.valor) / 100.0 as receita_1a_fatura_brl
from c left join g using (user_id) left join chk using (user_id) left join sub using (user_id)
group by 1, 2 order by 1, 2;

-- 2) Cadastros de julho/agosto que assinaram DEPOIS (assinatura demora; reler toda semana)
select p.email, p.created_at::date cadastro, s.created_at::date assinou, s.value_cents/100.0 valor,
       e.campaign_identifier, e.ad_identifier
from marketing.acquisition_events s
join public.profiles p on p.id = s.user_id
left join marketing.acquisition_events e on e.user_id = s.user_id and e.event_type = 'signup'
where s.event_type = 'subscription_started' and s.user_id not in (select id from _staff)
order by s.created_at desc;

-- 3) CAC da rodada (colar o gasto do CSV do painel; 1 linha por célula)
--    CAC = gasto ÷ assinaturas atribuídas; CPL = gasto ÷ cadastros; custo por ativado = gasto ÷ ativados.
--    Amostra < 20 cadastros por célula = inconclusivo (regra do painel).

-- 4) Pool de reengajamento (free "na parede": saldo ≤ 15 e já gerou)
select p.email, p.created_at::date, p.credits + coalesce((select sum(nodes_remaining) from public.lumen_packs l where l.user_id = p.id and l.status = 'active'),0) as saldo,
       (select count(*) from public.renders r where r.user_id = p.id and r.status = 'completed') as renders
from public.profiles p
where p.plan = 'free' and p.id not in (select id from _staff)
  and p.credits <= 15
  and exists (select 1 from public.renders r where r.user_id = p.id and r.status = 'completed')
order by renders desc;

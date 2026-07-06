-- 20260703150000_node_ledger_ai_cost_log.sql
--
-- Fase C.2 / AL-3 da auditoria 2026-07-03: livro-razão de nodes + log de custo.
--
-- node_ledger  → uma linha por MOVIMENTO de nodes (débito/refund/grant/expiry),
--                pra auditoria e reconciliação. O UNIQUE(kind, job_table, job_id)
--                previne registro DUPLICADO do mesmo movimento (ex.: refund duplo
--                do mesmo job).
-- ai_cost_log  → custo estimado/real por job (margem por módulo/modelo).
--
-- Ambas: RLS ON, SEM policies de client = deny-all; escrita/leitura só via
-- service_role (mesmo padrão das tabelas de auditoria). Aditivo e seguro de
-- aplicar. O helper lib/billing/refund-nodes.ts já grava a linha de refund
-- best-effort (inerte enquanto a tabela não existir).
--
-- FOLLOW-UP (não incluído aqui): gravar a linha de DÉBITO dentro de
-- consume_nodes_v2 (mesma transação, com balance_after) + popular ai_cost_log
-- nas rotas — passo separado que altera as RPCs SECURITY DEFINER com cuidado.

create table if not exists public.node_ledger (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  payer_id        uuid references public.profiles(id) on delete set null,
  workspace_id    uuid,
  delta           integer not null,   -- negativo = débito; positivo = crédito/refund
  kind            text not null check (kind in
                    ('debit','refund','grant_signup','grant_plan','grant_renewal',
                     'grant_lumen','expiry','adjustment')),
  source          text,               -- módulo de origem (ex.: 'generate','video')
  job_table       text,
  job_id          text,
  stripe_event_id text,
  balance_after   integer,
  created_at      timestamptz not null default now()
);

-- Previne DUPLICATA do mesmo movimento (refund/débito repetido do mesmo job).
create unique index if not exists uq_node_ledger_kind_job
  on public.node_ledger (kind, job_table, job_id)
  where job_table is not null and job_id is not null;

create index if not exists idx_node_ledger_user_created
  on public.node_ledger (user_id, created_at desc);

alter table public.node_ledger enable row level security;
revoke all on public.node_ledger from anon, authenticated;
grant  all on public.node_ledger to service_role;

create table if not exists public.ai_cost_log (
  id              uuid primary key default gen_random_uuid(),
  job_table       text,
  job_id          text,
  user_id         uuid,
  module          text,
  provider        text,
  endpoint        text,
  cost_usd_est    numeric,
  cost_usd_real   numeric,
  fal_request_id  text,
  duration_ms     integer,
  created_at      timestamptz not null default now()
);

create index if not exists idx_ai_cost_log_created on public.ai_cost_log (created_at desc);

alter table public.ai_cost_log enable row level security;
revoke all on public.ai_cost_log from anon, authenticated;
grant  all on public.ai_cost_log to service_role;

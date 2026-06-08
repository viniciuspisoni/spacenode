-- Workspaces/Equipes — Fase 2 (uso por membro + status de revisão).
--
-- 1. review_status (gerada/aprovada/descartada) nas imagens — atende o requisito
--    "quais foram aprovadas". 'favorita' já existe (vistas.is_favorited).
-- 2. workspace_member_usage — view que agrega, por (workspace_id, user_id):
--    imagens geradas, nodes consumidos, favoritas, aprovadas, descartadas e
--    última atividade. Junta vistas + renders + edits. (shots/vídeo entram quando
--    houver uso — hoje a tabela está vazia.)
--
-- A view é lida SÓ pelo service-role: a tela Equipe roteia por código de servidor
-- que primeiro checa se quem pede é owner/admin do workspace. NÃO mexe no RLS dos
-- projetos (eles continuam privados). Aditivo e reversível. Idempotente.

-- ── review_status nas imagens ──────────────────────────────────────────────────────
alter table public.vistas  add column if not exists review_status text not null default 'generated'
  check (review_status in ('generated','approved','discarded'));
alter table public.renders add column if not exists review_status text not null default 'generated'
  check (review_status in ('generated','approved','discarded'));
alter table public.edits   add column if not exists review_status text not null default 'generated'
  check (review_status in ('generated','approved','discarded'));

-- ── view de uso por membro ─────────────────────────────────────────────────────────
create or replace view public.workspace_member_usage
with (security_invoker = on) as
with gen as (
  select workspace_id, user_id, nodes_cost     as nodes, is_favorited as fav, review_status as review, created_at
  from public.vistas  where workspace_id is not null
  union all
  select workspace_id, user_id, nodes_charged, false,        review_status, created_at
  from public.renders where workspace_id is not null
  union all
  select workspace_id, user_id, nodes_cost,    false,        review_status, created_at
  from public.edits   where workspace_id is not null
)
select
  workspace_id,
  user_id,
  count(*)                                     as images,
  coalesce(sum(nodes), 0)                      as nodes,
  count(*) filter (where fav)                  as favoritas,
  count(*) filter (where review = 'approved')  as aprovadas,
  count(*) filter (where review = 'discarded') as descartadas,
  max(created_at)                              as last_activity
from gen
group by workspace_id, user_id;

-- Só o service-role lê (a rota da tela Equipe checa owner/admin antes).
revoke all    on public.workspace_member_usage from anon, authenticated;
grant  select on public.workspace_member_usage to service_role;

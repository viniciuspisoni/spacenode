-- Workspaces/Equipes — Fase 3c (histórico por membro).
--
-- workspace_generations — view "linha a linha" (1 linha por geração) das imagens
-- de cada workspace, pro dono/admin abrir o histórico de um membro e filtrar por
-- projeto (Space). Junta vistas + renders + edits. project_id só existe pra
-- vistas (= space_id); renders/edits ficam fora do filtro por projeto.
--
-- Lida só pelo service-role (a página do membro checa owner/admin antes).
-- Idempotente.

create or replace view public.workspace_generations
with (security_invoker = on) as
  select v.workspace_id, v.user_id, v.id as generation_id, 'vista'::text as kind,
         v.space_id as project_id, v.image_url as url, v.engine as tool,
         v.nodes_cost as nodes, v.is_favorited, v.review_status, v.created_at
  from public.vistas v where v.workspace_id is not null
  union all
  select r.workspace_id, r.user_id, r.id, 'render'::text, null::uuid, r.output_url, r.engine,
         r.nodes_charged, false, r.review_status, r.created_at
  from public.renders r where r.workspace_id is not null
  union all
  select e.workspace_id, e.user_id, e.id, 'edit'::text, null::uuid, e.result_image_url, e.engine,
         e.nodes_cost, false, e.review_status, e.created_at
  from public.edits e where e.workspace_id is not null;

revoke all    on public.workspace_generations from anon, authenticated;
grant  select on public.workspace_generations to service_role;

-- Histórico do escritório — carimbo de workspace no Editar V3.
--
-- `edit_v3_jobs` nasceu DEPOIS de 20260608000001 (que pôs workspace_id em
-- vistas/renders/edits/image_edit_attempts/shots) e ficou sem o carimbo. Como o
-- V3 é o editor padrão em produção desde 2026-06-25, é dele que vem quase toda
-- a aba Edições — sem workspace_id, o Histórico do escritório enxergaria apenas
-- as edições do editor v1, ou seja, praticamente nada.
--
-- Mesmo desenho da migration original, de propósito: coluna ANULÁVEL, ON DELETE
-- SET NULL, preenchimento por TRIGGER (reusa set_generation_workspace_id(), que
-- só olha new.user_id e portanto serve a qualquer tabela com essa coluna),
-- backfill do histórico e índice (workspace_id, created_at desc) pra listagem.
--
-- Também destrava a autorização de /api/history/detail para jobs do V3: a rota
-- já aceita "dono OU colega de workspace", mas caía sempre no dono porque a
-- linha não tinha workspace_id.
--
-- Aditiva, reversível, idempotente — segura pra reaplicar.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_edit_v3_jobs_workspace_id ON public.edit_v3_jobs;
--   DROP INDEX   IF EXISTS public.idx_edit_v3_jobs_workspace;
--   ALTER TABLE  public.edit_v3_jobs DROP COLUMN IF EXISTS workspace_id;

alter table public.edit_v3_jobs
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;

drop trigger if exists trg_edit_v3_jobs_workspace_id on public.edit_v3_jobs;
create trigger trg_edit_v3_jobs_workspace_id before insert on public.edit_v3_jobs
  for each row execute function public.set_generation_workspace_id();

-- Backfill: aponta cada job já existente pro workspace ativo do dono.
update public.edit_v3_jobs j set workspace_id = m.workspace_id
from public.workspace_members m
where j.workspace_id is null and m.user_id = j.user_id and m.status = 'active';

create index if not exists idx_edit_v3_jobs_workspace
  on public.edit_v3_jobs(workspace_id, created_at desc);

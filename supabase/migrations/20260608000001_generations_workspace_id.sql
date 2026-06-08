-- Workspaces/Equipes — Fase 1 (carimbo de workspace_id nas gerações).
--
-- Adiciona workspace_id às 5 superfícies de geração e o preenche por TRIGGER no
-- banco — assim NENHUMA rota de geração precisa mudar agora, e toda geração
-- futura (mesmo de caminhos não mapeados) recebe o workspace_id automaticamente.
--
-- workspace_id é ANULÁVEL e ON DELETE SET NULL de propósito:
--   - se algum insert não resolver o workspace, a geração NÃO quebra;
--   - apagar um workspace não bloqueia nem apaga gerações (só zera o vínculo).
--
-- Aditivo e reversível. Idempotente: seguro reaplicar.

-- ── coluna workspace_id ───────────────────────────────────────────────────────────
alter table public.vistas              add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;
alter table public.renders             add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;
alter table public.edits               add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;
alter table public.image_edit_attempts add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;
-- shots não tem user_id próprio; o dono vem de walkthroughs.user_id.
alter table public.shots               add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;

-- ── trigger de carimbo (tabelas COM user_id) ──────────────────────────────────────
-- BEFORE INSERT: se workspace_id veio nulo, resolve pelo workspace ativo do dono
-- da linha. SECURITY DEFINER pra ler workspace_members independente do RLS.
create or replace function public.set_generation_workspace_id()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.workspace_id is null then
    select m.workspace_id into new.workspace_id
    from public.workspace_members m
    where m.user_id = new.user_id and m.status = 'active'
    limit 1;
  end if;
  return new;
end;
$$;

revoke execute on function public.set_generation_workspace_id() from public;
revoke execute on function public.set_generation_workspace_id() from anon;

-- ── trigger de carimbo (shots → via walkthroughs.user_id) ──────────────────────────
create or replace function public.set_shot_workspace_id()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.workspace_id is null then
    select m.workspace_id into new.workspace_id
    from public.walkthroughs w
    join public.workspace_members m on m.user_id = w.user_id and m.status = 'active'
    where w.id = new.walkthrough_id
    limit 1;
  end if;
  return new;
end;
$$;

revoke execute on function public.set_shot_workspace_id() from public;
revoke execute on function public.set_shot_workspace_id() from anon;

-- ── liga os triggers ───────────────────────────────────────────────────────────────
drop trigger if exists trg_vistas_workspace_id on public.vistas;
create trigger trg_vistas_workspace_id before insert on public.vistas
  for each row execute function public.set_generation_workspace_id();

drop trigger if exists trg_renders_workspace_id on public.renders;
create trigger trg_renders_workspace_id before insert on public.renders
  for each row execute function public.set_generation_workspace_id();

drop trigger if exists trg_edits_workspace_id on public.edits;
create trigger trg_edits_workspace_id before insert on public.edits
  for each row execute function public.set_generation_workspace_id();

drop trigger if exists trg_iea_workspace_id on public.image_edit_attempts;
create trigger trg_iea_workspace_id before insert on public.image_edit_attempts
  for each row execute function public.set_generation_workspace_id();

drop trigger if exists trg_shots_workspace_id on public.shots;
create trigger trg_shots_workspace_id before insert on public.shots
  for each row execute function public.set_shot_workspace_id();

-- ── backfill do histórico ──────────────────────────────────────────────────────────
-- Aponta cada geração já existente pro workspace pessoal do dono.
update public.vistas v set workspace_id = m.workspace_id
from public.workspace_members m
where v.workspace_id is null and m.user_id = v.user_id and m.status = 'active';

update public.renders r set workspace_id = m.workspace_id
from public.workspace_members m
where r.workspace_id is null and m.user_id = r.user_id and m.status = 'active';

update public.edits e set workspace_id = m.workspace_id
from public.workspace_members m
where e.workspace_id is null and m.user_id = e.user_id and m.status = 'active';

update public.image_edit_attempts a set workspace_id = m.workspace_id
from public.workspace_members m
where a.workspace_id is null and m.user_id = a.user_id and m.status = 'active';

update public.shots s set workspace_id = m.workspace_id
from public.walkthroughs w
join public.workspace_members m on m.user_id = w.user_id and m.status = 'active'
where s.walkthrough_id = w.id and s.workspace_id is null;

-- ── índices pro painel da Equipe (Fase 2) ──────────────────────────────────────────
create index if not exists idx_vistas_workspace  on public.vistas(workspace_id, created_at desc);
create index if not exists idx_renders_workspace on public.renders(workspace_id, created_at desc);
create index if not exists idx_edits_workspace   on public.edits(workspace_id, created_at desc);
create index if not exists idx_iea_workspace     on public.image_edit_attempts(workspace_id, created_at desc);
create index if not exists idx_shots_workspace   on public.shots(workspace_id, created_at desc);

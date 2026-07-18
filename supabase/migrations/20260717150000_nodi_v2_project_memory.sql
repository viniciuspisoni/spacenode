-- 20260717150000_nodi_v2_project_memory.sql
--
-- Nodi V2 — memória estruturada POR PROJETO (flag NODI_PROJECT_MEMORY_ENABLED).
-- Nunca conversa completa: só campos aprovados explicitamente pelo usuário no
-- painel (estilo, materiais, iluminação, imagem principal, elementos travados,
-- decisões). O Nodi PROPÕE (tool) e o usuário CONFIRMA — a escrita acontece
-- via client do próprio usuário, então RLS fecha o isolamento no banco.
--
-- NÃO aplicada no deploy desta entrega (pendência registrada em docs/NODI.md);
-- rotas e tools toleram a ausência (42P01 → memória indisponível, sem erro).

create table if not exists public.nodi_project_memory (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users (id) on delete cascade,
  -- id do Space; sem FK dura por resiliência de ambiente (o app valida posse
  -- do projeto via RLS de vistas/spaces antes de propor).
  space_id        uuid        not null,
  style           text        check (char_length(style) <= 400),
  materials       text        check (char_length(materials) <= 400),
  lighting        text        check (char_length(lighting) <= 400),
  main_image      text        check (char_length(main_image) <= 200),
  locked_elements text        check (char_length(locked_elements) <= 600),
  -- decisões aprovadas (lista de frases curtas, append pelo app com dedupe)
  decisions       jsonb       not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, space_id)
);

comment on table public.nodi_project_memory is
  'Memória do Nodi por projeto (V2). Só campos estruturados aprovados pelo usuário — nunca transcrição de conversa.';

alter table public.nodi_project_memory enable row level security;

revoke all on public.nodi_project_memory from anon, authenticated;
grant select, insert, update on public.nodi_project_memory to authenticated;

drop policy if exists "nodi_project_memory_select_own" on public.nodi_project_memory;
create policy "nodi_project_memory_select_own"
  on public.nodi_project_memory for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "nodi_project_memory_insert_own" on public.nodi_project_memory;
create policy "nodi_project_memory_insert_own"
  on public.nodi_project_memory for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "nodi_project_memory_update_own" on public.nodi_project_memory;
create policy "nodi_project_memory_update_own"
  on public.nodi_project_memory for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Referências visuais da edição (texturas, objetos, imagens do projeto).
-- storage_path é NULLABLE (divergência da spec): referências de PROJETO não criam
-- storage novo — reusam a URL pública da imagem existente; só uploads têm path.

create table if not exists public.edit_reference_assets (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  project_id      uuid,
  edit_attempt_id uuid,
  source_image_id uuid,
  role            text        not null
                    check (role in ('material_texture','object_reference','person_reference',
                                    'style_reference','lighting_reference','landscape_reference',
                                    'original_image','project_render','consistency_reference',
                                    'restore_reference','custom')),
  source          text        not null check (source in ('upload','project','original')),
  storage_path    text,
  public_url      text,
  note            text,
  width           integer,
  height          integer,
  file_size_bytes integer,
  mime_type       text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_era_user    on public.edit_reference_assets(user_id, created_at desc);
create index if not exists idx_era_attempt on public.edit_reference_assets(edit_attempt_id);

alter table public.edit_reference_assets enable row level security;

drop policy if exists era_select_own on public.edit_reference_assets;
create policy era_select_own on public.edit_reference_assets
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists era_insert_own on public.edit_reference_assets;
create policy era_insert_own on public.edit_reference_assets
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists era_update_own on public.edit_reference_assets;
create policy era_update_own on public.edit_reference_assets
  for update to authenticated using (auth.uid() = user_id);
drop policy if exists era_delete_own on public.edit_reference_assets;
create policy era_delete_own on public.edit_reference_assets
  for delete to authenticated using (auth.uid() = user_id);

-- Resumo das referências por tentativa.
alter table public.image_edit_attempts
  add column if not exists reference_count integer  not null default 0 check (reference_count >= 0),
  add column if not exists reference_roles text[]   not null default '{}';

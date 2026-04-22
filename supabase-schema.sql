-- =============================================================
-- SPACENODE — Schema MVP
-- Execute no Supabase Dashboard > SQL Editor
-- =============================================================

-- -------------------------------------------------------------
-- 1. TABELA: profiles
-- Estende auth.users com dados do usuário e controle de créditos
-- -------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid        primary key references auth.users (id) on delete cascade,
  email       text        not null,
  full_name   text,
  credits     integer     not null default 3,
  plan        text        not null default 'free'
                          check (plan in ('free', 'starter', 'pro')),
  created_at  timestamptz not null default now()
);

-- -------------------------------------------------------------
-- 2. TABELA: renders
-- Histórico de renders gerados pelo usuário
-- -------------------------------------------------------------
create table if not exists public.renders (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references public.profiles (id) on delete cascade,
  input_url       text        not null,
  output_url      text,
  prompt          text        not null,
  ambient         text        not null,
  style           text        not null,
  lighting        text        not null,
  status          text        not null default 'pending'
                              check (status in ('pending', 'processing', 'completed', 'failed')),
  error_message   text,
  cost_credits    integer     not null default 1,
  fal_request_id  text,
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create index if not exists renders_user_id_idx
  on public.renders (user_id);

create index if not exists renders_created_at_idx
  on public.renders (created_at desc);

-- -------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
-- -------------------------------------------------------------

-- profiles
alter table public.profiles enable row level security;

create policy "users_read_own_profile"
  on public.profiles
  for select
  using (auth.uid() = id);

create policy "users_update_own_profile"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- renders
alter table public.renders enable row level security;

create policy "users_read_own_renders"
  on public.renders
  for select
  using (auth.uid() = user_id);

create policy "users_insert_own_renders"
  on public.renders
  for insert
  with check (auth.uid() = user_id);

-- Service role bypasses RLS automaticamente (sem policy necessária).
-- Para confirmar, o cliente admin em lib/supabase/admin.ts usa
-- SUPABASE_SERVICE_ROLE_KEY, que ignora RLS por design.

-- -------------------------------------------------------------
-- 4. TRIGGER: handle_new_user
-- Cria automaticamente um profile quando um usuário se cadastra
-- -------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- -------------------------------------------------------------
-- 5. FUNÇÃO: consume_credit
-- Decrementa 1 crédito do usuário de forma atômica.
-- Retorna true se havia crédito, false se estava zerado.
-- -------------------------------------------------------------
create or replace function public.consume_credit(user_id_input uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_credits integer;
begin
  -- Lock a linha para evitar race condition em gerações simultâneas
  select credits
    into current_credits
    from public.profiles
   where id = user_id_input
     for update;

  if current_credits is null then
    return false;
  end if;

  if current_credits > 0 then
    update public.profiles
       set credits = credits - 1
     where id = user_id_input;
    return true;
  end if;

  return false;
end;
$$;

-- -------------------------------------------------------------
-- TABELA: waitlist
-- Captura emails de leads da landing page
-- -------------------------------------------------------------
create table if not exists public.waitlist (
  id         uuid        default gen_random_uuid() primary key,
  email      text        not null unique,
  created_at timestamptz default now()
);

alter table public.waitlist enable row level security;

-- Apenas inserção pública — leitura só pelo service role
create policy "Allow public insert" on public.waitlist
  for insert with check (true);

-- ════════════════════════════════════════════════════════════════════════════
-- Confiabilidade do funil de aquisição — três correções na event store
-- (marketing.acquisition_events), sem apagar NENHUMA linha histórica.
--
-- 1. occurred_at ≠ created_at
--    `created_at` é quando a LINHA foi gravada; o evento de signup nasce no
--    primeiro acesso ao /app, que pode ser dias depois do cadastro (medido em
--    16/09/26: conta de 10/09 com evento gravado em 16/09). Datar cadastro por
--    `created_at` desloca o funil inteiro. `occurred_at` passa a ser QUANDO O
--    FATO ACONTECEU — para signup, `auth.users.created_at`, sempre.
--
-- 2. origin ∈ (paid | organic | unknown)
--    O código antigo gravava `metadata.organic = !snapshot`: ausência de
--    cookie de campanha virava "orgânico". Ausência de informação não é
--    origem — vira `unknown`. `organic` só com evidência positiva (jornada
--    anônima observada, sem marcador pago). O metadata legado é preservado.
--
-- 3. is_internal + marketing.internal_actors
--    Tráfego de desenvolvimento/teste (dev server local contra o banco de
--    PRODUÇÃO, previews da Vercel, conta do time) contamina o relatório. Em
--    vez de apagar, MARCA: o app grava `is_internal` a partir do host da
--    requisição e um trigger marca tudo que vem de um ator interno cadastrado
--    em `internal_actors`. Os relatórios filtram `is_internal = false`.
--
-- Fecha também o buraco de cobertura: 70 contas anteriores ao deploy da PR
-- #211 nunca geraram evento de signup (o gate antigo exigia cookie de
-- campanha). O backfill no fim cria o evento que falta para TODA conta sem
-- ele, datado pelo auth.users.created_at e com origin = 'unknown'.
--
-- MODELO DE ACESSO: inalterado — RLS ligada sem policies (deny-all para
-- anon/authenticated); escrita/leitura via service_role. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. occurred_at ───────────────────────────────────────────────────────────

alter table marketing.acquisition_events
  add column if not exists occurred_at timestamptz;

-- Histórico: o melhor relógio disponível por linha, nesta ordem.
--   • signup com account_created_at no metadata (gravado desde a PR #211) →
--     a data REAL do cadastro;
--   • qualquer outra linha → created_at (o fato e o registro coincidem).
update marketing.acquisition_events e
   set occurred_at = coalesce(
         case
           when e.event_type = 'signup'
            and (e.metadata ->> 'account_created_at') is not null
           then (e.metadata ->> 'account_created_at')::timestamptz
         end,
         e.created_at)
 where e.occurred_at is null;

-- Signup antigo sem account_created_at no metadata: a verdade está em
-- auth.users. Corrige as linhas que o passo acima datou pelo created_at.
update marketing.acquisition_events e
   set occurred_at = u.created_at
  from auth.users u
 where e.event_type = 'signup'
   and e.user_id = u.id
   and (e.metadata ->> 'account_created_at') is null
   and e.occurred_at is distinct from u.created_at;

alter table marketing.acquisition_events
  alter column occurred_at set default now();
alter table marketing.acquisition_events
  alter column occurred_at set not null;

comment on column marketing.acquisition_events.occurred_at is
  'Quando o FATO aconteceu (para signup: auth.users.created_at). created_at continua sendo '
  'quando a linha foi gravada — o bind do signup roda no 1o acesso ao /app, que pode ser dias '
  'depois. Todo relatório de funil recorta por occurred_at; created_at é auditoria.';

create index if not exists idx_mkt_acq_events_occurred
  on marketing.acquisition_events(event_type, occurred_at desc);

-- ── 2. origin ────────────────────────────────────────────────────────────────

alter table marketing.acquisition_events
  add column if not exists origin text;

alter table marketing.acquisition_events
  drop constraint if exists acquisition_events_origin_check;
alter table marketing.acquisition_events
  add constraint acquisition_events_origin_check
  check (origin is null or origin in ('paid', 'organic', 'unknown'));

-- Backfill conservador. `paid` exige marcador de campanha; TUDO que antes
-- caía em `organic` por ausência de cookie vira `unknown` — menos alcance,
-- zero invenção. A jornada anônima (anonymous_id) é a única evidência que
-- promove uma linha a `organic`, e ela só existe depois da PR #211.
update marketing.acquisition_events e
   set origin = case
         when e.campaign_identifier is not null or e.ad_identifier is not null then 'paid'
         when coalesce(e.utm, '{}'::jsonb) <> '{}'::jsonb then 'paid'
         when e.event_type = 'signup'
          and e.anonymous_id is not null
          and exists (
                select 1 from marketing.acquisition_events j
                 where j.anonymous_id = e.anonymous_id
                   and j.id <> e.id
                   and (j.campaign_identifier is not null or j.ad_identifier is not null))
           then 'paid'
         when e.event_type = 'signup' and e.anonymous_id is not null then 'organic'
         else 'unknown'
       end
 where e.origin is null;

comment on column marketing.acquisition_events.origin is
  'Origem CLASSIFICADA: paid (marcador de campanha), organic (jornada anônima observada sem '
  'marcador pago) ou unknown (sem informação). Nunca inferir organic a partir de ausência de '
  'dado — era o bug do metadata.organic, preservado nas linhas antigas só como histórico.';

-- ── 3. Tráfego interno ───────────────────────────────────────────────────────

alter table marketing.acquisition_events
  add column if not exists is_internal boolean not null default false;

comment on column marketing.acquisition_events.is_internal is
  'Evento de desenvolvimento/teste (dev server local apontando para o banco de produção, '
  'preview da Vercel, conta do time). Nunca apagado — apenas excluído dos relatórios.';

create index if not exists idx_mkt_acq_events_real
  on marketing.acquisition_events(event_type, occurred_at desc)
  where is_internal = false;

-- Atores internos: contas cujo tráfego nunca é de mercado. Sem e-mail no
-- repositório — quem cadastra é o operador, via marketing.mark_internal_actor().
create table if not exists marketing.internal_actors (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);

alter table marketing.internal_actors enable row level security;

comment on table marketing.internal_actors is
  'Contas internas (dono, time, testes). Um trigger marca is_internal em todo evento delas, '
  'inclusive quando o evento vem do host de produção — é o caso que o host sozinho não pega.';

-- Histórico óbvio: qualquer evento cujo referrer aponta para dev/preview.
update marketing.acquisition_events
   set is_internal = true
 where is_internal = false
   and (referrer ilike 'http://localhost%'
     or referrer ilike 'https://localhost%'
     or referrer ilike 'http://127.0.0.1%'
     or referrer ilike '%.vercel.app%');

-- Quem já produziu evento de dev é ator interno daqui pra frente (um usuário
-- real jamais navega com referrer localhost).
insert into marketing.internal_actors (user_id, note)
select distinct e.user_id, 'detectado pelo referrer de dev/preview'
  from marketing.acquisition_events e
 where e.is_internal = true and e.user_id is not null
on conflict (user_id) do nothing;

create or replace function marketing.tag_internal_actor_event()
returns trigger
language plpgsql
security definer
set search_path = marketing, public, pg_temp
as $$
begin
  if new.is_internal is not true and new.user_id is not null then
    if exists (select 1 from marketing.internal_actors a where a.user_id = new.user_id) then
      new.is_internal := true;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mkt_acq_tag_internal on marketing.acquisition_events;
create trigger trg_mkt_acq_tag_internal
  before insert on marketing.acquisition_events
  for each row execute function marketing.tag_internal_actor_event();

-- Cadastra um ator interno pelo e-mail E remarca o histórico dele.
-- Uso (SQL editor, uma vez por conta interna):
--   select marketing.mark_internal_actor('dono@exemplo.com', 'conta do dono');
create or replace function marketing.mark_internal_actor(p_email text, p_note text default null)
returns integer
language plpgsql
security definer
set search_path = marketing, public, pg_temp
as $$
declare
  v_user_id uuid;
  v_rows    integer;
begin
  select id into v_user_id from auth.users where lower(email) = lower(p_email);
  if v_user_id is null then
    raise exception 'conta nao encontrada para o e-mail informado';
  end if;

  insert into marketing.internal_actors (user_id, note)
  values (v_user_id, coalesce(p_note, 'marcado manualmente'))
  on conflict (user_id) do update set note = excluded.note;

  update marketing.acquisition_events
     set is_internal = true
   where user_id = v_user_id and is_internal = false;
  get diagnostics v_rows = row_count;

  return v_rows;
end;
$$;

revoke all on function marketing.mark_internal_actor(text, text) from public, anon, authenticated;

-- ── 4. Backfill dos cadastros sem evento ─────────────────────────────────────
--
-- Antes do deploy da PR #211 o evento de signup só era gravado quando existia
-- cookie de campanha — 70 das 144 contas ficaram fora do funil. O evento que
-- falta é criado aqui com a data REAL do cadastro e origem `unknown` (não há
-- como reconstruir a origem a posteriori; inventá-la é o bug que esta
-- migration corrige). O índice parcial uq_mkt_acq_signup_per_user garante a
-- unicidade — rodar de novo não duplica.

insert into marketing.acquisition_events
  (user_id, event_type, utm, metadata, occurred_at, origin, is_internal)
select
  u.id,
  'signup',
  '{}'::jsonb,
  jsonb_build_object(
    'account_created_at', to_char(u.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'backfilled', true,
    'backfill_source', 'auth.users',
    'backfill_migration', '20260916173000_funil_confiabilidade'),
  u.created_at,
  'unknown',
  exists (select 1 from marketing.internal_actors a where a.user_id = u.id)
from auth.users u
where not exists (
  select 1 from marketing.acquisition_events e
   where e.user_id = u.id and e.event_type = 'signup')
on conflict do nothing;

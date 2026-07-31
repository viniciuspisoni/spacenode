-- ════════════════════════════════════════════════════════════════════════════
-- Programa de Indicações — fundação de dados.
--
-- Regras de produto (fonte única da janela e dos percentuais: lib/referral/config.ts):
--   • Indicado  → 10% na PRIMEIRA mensalidade (aplicado no checkout).
--   • Indicador → 20% na PRÓXIMA mensalidade por indicado que concluir a
--     primeira assinatura paga. Acumula até 100% por mensalidade (5 indicações
--     = uma mensalidade grátis); o excedente fica disponível para as seguintes.
--   • A recompensa só fica DISPONÍVEL depois do pagamento confirmado do
--     indicado E do fim da janela de reembolso (referral_rewards.available_at).
--   • Nada acumula com a promoção de lançamento — a decisão é do checkout
--     (lib/referral/config.ts: resolveCheckoutDiscount), não do banco.
--
-- MODELO DE ACESSO (deny-by-default, padrão de workspace_invites):
--   RLS ligada em todas as tabelas e NENHUMA policy. Todo acesso passa por
--   rota/página de servidor com service_role (createAdminClient), que já
--   autenticou o usuário. As funções abaixo são security definer e só o
--   service_role recebe EXECUTE.
--
-- IDEMPOTÊNCIA: todas as transições são funções atômicas que podem ser
-- chamadas N vezes pelo mesmo webhook sem duplicar recompensa — o Stripe
-- reentrega eventos e a entrega fora de ordem é normal.
--
-- Aditivo e reversível: não altera profiles, assinaturas, cupons nem qualquer
-- tabela existente. Convenções espelhadas das migrations anteriores (uuid PK,
-- timestamptz default now(), IF NOT EXISTS / OR REPLACE). NÃO é aplicado por
-- db push.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Helpers puros ───────────────────────────────────────────────────────────

-- Normaliza email para detectar "mesma pessoa com endereço alternativo".
-- Remove o sufixo +tag sempre; pontos só nos provedores que os ignoram.
create or replace function public.normalize_email(p_email text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v        text;
  v_local  text;
  v_domain text;
begin
  if p_email is null then return null; end if;
  v := lower(btrim(p_email));
  if position('@' in v) = 0 then return v; end if;

  v_local  := split_part(v, '@', 1);
  v_domain := split_part(v, '@', 2);
  v_local  := regexp_replace(v_local, '\+.*$', '');

  if v_domain in ('gmail.com', 'googlemail.com') then
    v_local  := replace(v_local, '.', '');
    v_domain := 'gmail.com';
  end if;

  return v_local || '@' || v_domain;
end;
$$;

-- Código de 8 caracteres em alfabeto sem ambiguidade visual (sem 0/O/1/I),
-- para o usuário conseguir ditar o código por telefone sem erro.
create or replace function public.generate_referral_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_code   text := '';
  i        int;
begin
  for i in 1..8 loop
    v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return v_code;
end;
$$;

-- ── referral_codes — um código por conta ────────────────────────────────────
create table if not exists public.referral_codes (
  user_id    uuid        primary key references public.profiles(id) on delete cascade,
  code       text        not null unique,
  disabled   boolean     not null default false,
  created_at timestamptz not null default now()
);

comment on table public.referral_codes is
  'Código individual de indicação. Criado sob demanda (ensure_referral_code) na '
  'primeira visita à área de indicações — nenhuma trigger de cadastro é tocada.';

-- ── referral_invites — convites enviados (compartilhamentos) ────────────────
create table if not exists public.referral_invites (
  id               uuid        primary key default gen_random_uuid(),
  referrer_user_id uuid        not null references public.profiles(id) on delete cascade,
  channel          text        not null default 'other'
                               check (channel in ('copy_link','copy_code','share','whatsapp','email','other')),
  created_at       timestamptz not null default now()
);

create index if not exists idx_referral_invites_user
  on public.referral_invites(referrer_user_id, created_at desc);

comment on table public.referral_invites is
  'Cada compartilhamento do link/código. Alimenta o contador "convites enviados" '
  'do painel — não é entrega de email, é intenção registrada pelo próprio usuário.';

-- ── referrals — o vínculo indicador → indicado ──────────────────────────────
create table if not exists public.referrals (
  id                         uuid        primary key default gen_random_uuid(),
  code                       text        not null,
  referrer_user_id           uuid        not null references public.profiles(id) on delete cascade,
  -- Uma conta só pode usar UMA indicação: a unicidade é da coluna, não do código.
  referred_user_id           uuid        not null unique references public.profiles(id) on delete cascade,
  status                     text        not null default 'signed_up'
                                         check (status in ('signed_up','confirmed','revoked','rejected')),
  signed_up_at               timestamptz not null default now(),
  confirmed_at               timestamptz,
  /** Fim da janela de reembolso — antes disso a recompensa não fica disponível. */
  hold_until                 timestamptz,
  revoked_at                 timestamptz,
  revoke_reason              text,
  /** Fatura do indicado que qualificou a indicação (primeira mensalidade paga). */
  qualifying_invoice_id      text,
  qualifying_payment_intent  text,
  /** Percentual efetivamente concedido ao indicado no checkout (auditoria). */
  referred_percent_off       integer,
  referred_session_id        text,
  fraud_flags                jsonb       not null default '[]'::jsonb,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint referrals_no_self_referral check (referrer_user_id <> referred_user_id)
);

create index if not exists idx_referrals_referrer
  on public.referrals(referrer_user_id, status);
create unique index if not exists uq_referrals_qualifying_invoice
  on public.referrals(qualifying_invoice_id) where qualifying_invoice_id is not null;
create index if not exists idx_referrals_payment_intent
  on public.referrals(qualifying_payment_intent) where qualifying_payment_intent is not null;

comment on table public.referrals is
  'Vínculo indicador → indicado. signed_up (link usado) → confirmed (primeira '
  'mensalidade do indicado paga) → revoked (reembolso/contestação/falha). '
  'rejected = bloqueado por antiabuso, nunca gera recompensa.';

-- ── referral_rewards — 20% por indicação confirmada ─────────────────────────
create table if not exists public.referral_rewards (
  id               uuid        primary key default gen_random_uuid(),
  referral_id      uuid        not null unique references public.referrals(id) on delete cascade,
  referrer_user_id uuid        not null references public.profiles(id) on delete cascade,
  percent_off      integer     not null check (percent_off > 0 and percent_off <= 100),
  status           text        not null default 'pending'
                               check (status in ('pending','available','applied','consumed','revoked')),
  /** Quando a recompensa sai de 'pending' (fim da janela de reembolso). */
  available_at     timestamptz not null,
  applied_invoice_id text,
  applied_at       timestamptz,
  consumed_at      timestamptz,
  revoked_at       timestamptz,
  revoke_reason    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_referral_rewards_user
  on public.referral_rewards(referrer_user_id, status, available_at);
create index if not exists idx_referral_rewards_invoice
  on public.referral_rewards(applied_invoice_id) where applied_invoice_id is not null;

comment on table public.referral_rewards is
  'Uma recompensa por indicação confirmada. pending (em janela de reembolso) → '
  'available → applied (numa fatura em rascunho) → consumed (fatura paga). '
  'released volta para available: benefício excedente segue para a mensalidade seguinte.';

-- ── referral_reward_applications — uma aplicação por fatura ─────────────────
create table if not exists public.referral_reward_applications (
  id               uuid        primary key default gen_random_uuid(),
  /** Chave de idempotência: o Stripe reentrega invoice.created. */
  invoice_id       text        not null unique,
  referrer_user_id uuid        not null references public.profiles(id) on delete cascade,
  percent_off      integer     not null check (percent_off > 0 and percent_off <= 100),
  stripe_coupon_id text,
  status           text        not null default 'applied'
                               check (status in ('applied','consumed','released')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_referral_apps_user
  on public.referral_reward_applications(referrer_user_id, created_at desc);

-- ── referral_events — log auditável append-only ─────────────────────────────
create table if not exists public.referral_events (
  id               bigint      generated always as identity primary key,
  referral_id      uuid        references public.referrals(id) on delete set null,
  reward_id        uuid        references public.referral_rewards(id) on delete set null,
  user_id          uuid        references public.profiles(id) on delete set null,
  type             text        not null,
  stripe_object_id text,
  detail           jsonb       not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists idx_referral_events_referral
  on public.referral_events(referral_id, created_at desc);
create index if not exists idx_referral_events_user
  on public.referral_events(user_id, created_at desc);

comment on table public.referral_events is
  'Trilha de auditoria de cada indicação e recompensa. Append-only: nenhuma '
  'função abaixo faz update ou delete aqui.';

-- ── referral_payment_fingerprints — antiabuso por meio de pagamento ─────────
create table if not exists public.referral_payment_fingerprints (
  fingerprint   text        primary key,
  user_id       uuid        not null references public.profiles(id) on delete cascade,
  first_seen_at timestamptz not null default now()
);

comment on table public.referral_payment_fingerprints is
  'Fingerprint do meio de pagamento (Stripe) → primeira conta que o usou. '
  'Mesmo cartão em duas contas não gera recompensa de indicação.';

-- ── stripe_webhook_events — idempotência de entrega ─────────────────────────
create table if not exists public.stripe_webhook_events (
  id          text        primary key,
  type        text        not null,
  received_at timestamptz not null default now()
);

comment on table public.stripe_webhook_events is
  'Ids de evento do Stripe já processados pelos efeitos colaterais de indicação. '
  'A ativação de plano continua idempotente por valores absolutos, sem depender daqui.';

-- ── RLS: ligada, sem policies (só service_role entra) ───────────────────────
alter table public.referral_codes                 enable row level security;
alter table public.referral_invites               enable row level security;
alter table public.referrals                      enable row level security;
alter table public.referral_rewards               enable row level security;
alter table public.referral_reward_applications   enable row level security;
alter table public.referral_events                enable row level security;
alter table public.referral_payment_fingerprints  enable row level security;
alter table public.stripe_webhook_events          enable row level security;

-- ════════════════════════════════════════════════════════════════════════════
-- Funções de transição
-- ════════════════════════════════════════════════════════════════════════════

-- ── ensure_referral_code ────────────────────────────────────────────────────
create or replace function public.ensure_referral_code(p_user uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_try  int := 0;
begin
  select code into v_code from public.referral_codes where user_id = p_user;
  if v_code is not null then return v_code; end if;

  loop
    v_try  := v_try + 1;
    v_code := public.generate_referral_code();
    begin
      insert into public.referral_codes (user_id, code) values (p_user, v_code);
      return v_code;
    exception when unique_violation then
      -- Corrida na mesma conta → o código do vencedor serve. Colisão de código
      -- (32^8 combinações) → sorteia outro.
      select code into v_code from public.referral_codes where user_id = p_user;
      if v_code is not null then return v_code; end if;
      if v_try >= 10 then raise; end if;
    end;
  end loop;
end;
$$;

-- ── bind_referral — vincula o código a uma conta nova ───────────────────────
-- Retorna {ok, reason?, referral_id?, referrer_user_id?}. Nunca lança por
-- entrada inválida: o chamador é uma rota best-effort, não uma transação de
-- cobrança.
create or replace function public.bind_referral(
  p_code    text,
  p_user    uuid,
  p_max_age interval default interval '30 days'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code      text := upper(btrim(coalesce(p_code, '')));
  v_owner     uuid;
  v_referral  public.referrals;
  v_profile   public.profiles;
  v_owner_norm text;
begin
  if v_code = '' then
    return jsonb_build_object('ok', false, 'reason', 'code_missing');
  end if;

  select rc.user_id into v_owner
    from public.referral_codes rc
   where rc.code = v_code and rc.disabled = false;
  if v_owner is null then
    return jsonb_build_object('ok', false, 'reason', 'code_not_found');
  end if;

  -- Autoindicação: nem registra — não é fraude, é engano comum.
  if v_owner = p_user then
    return jsonb_build_object('ok', false, 'reason', 'self_referral');
  end if;

  select * into v_referral from public.referrals where referred_user_id = p_user;
  if v_referral.id is not null then
    return jsonb_build_object(
      'ok', false, 'reason', 'already_referred', 'referral_id', v_referral.id
    );
  end if;

  select * into v_profile from public.profiles where id = p_user;
  if v_profile.id is null then
    return jsonb_build_object('ok', false, 'reason', 'profile_not_found');
  end if;

  -- "Cada nova conta pode utilizar apenas uma indicação" — nova de verdade:
  -- conta antiga ou que já foi cliente não entra pelo programa.
  if v_profile.created_at < now() - p_max_age then
    return jsonb_build_object('ok', false, 'reason', 'account_too_old');
  end if;
  if v_profile.stripe_customer_id is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_customer');
  end if;

  -- Conta duplicada do próprio indicador (ponto/+tag no mesmo endereço).
  select public.normalize_email(p.email) into v_owner_norm
    from public.profiles p where p.id = v_owner;
  if v_owner_norm is not null
     and v_owner_norm = public.normalize_email(v_profile.email) then
    insert into public.referrals (
      code, referrer_user_id, referred_user_id, status,
      revoked_at, revoke_reason, fraud_flags
    ) values (
      v_code, v_owner, p_user, 'rejected',
      now(), 'duplicate_identity', '["same_normalized_email"]'::jsonb
    ) returning * into v_referral;

    insert into public.referral_events (referral_id, user_id, type, detail)
    values (v_referral.id, p_user, 'referral_rejected',
            jsonb_build_object('reason', 'duplicate_identity'));

    return jsonb_build_object('ok', false, 'reason', 'duplicate_identity');
  end if;

  insert into public.referrals (code, referrer_user_id, referred_user_id)
  values (v_code, v_owner, p_user)
  returning * into v_referral;

  insert into public.referral_events (referral_id, user_id, type, detail)
  values (v_referral.id, p_user, 'referral_signed_up',
          jsonb_build_object('code', v_code, 'referrer_user_id', v_owner));

  return jsonb_build_object(
    'ok', true, 'referral_id', v_referral.id, 'referrer_user_id', v_owner
  );
end;
$$;

-- ── mark_referred_discount — auditoria do 10% concedido no checkout ─────────
create or replace function public.mark_referred_discount(
  p_user    uuid,
  p_percent integer,
  p_session text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_referral public.referrals;
begin
  select * into v_referral
    from public.referrals
   where referred_user_id = p_user and status = 'signed_up'
     for update;
  if v_referral.id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_referral');
  end if;

  update public.referrals
     set referred_percent_off = p_percent,
         referred_session_id  = p_session,
         updated_at           = now()
   where id = v_referral.id;

  insert into public.referral_events (referral_id, user_id, type, stripe_object_id, detail)
  values (v_referral.id, p_user, 'referred_discount_applied', p_session,
          jsonb_build_object('percent_off', p_percent));

  return jsonb_build_object('ok', true, 'referral_id', v_referral.id);
end;
$$;

-- ── claim_payment_fingerprint — um meio de pagamento, uma conta ─────────────
create or replace function public.claim_payment_fingerprint(
  p_fingerprint text,
  p_user        uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if p_fingerprint is null or btrim(p_fingerprint) = '' then
    return jsonb_build_object('ok', true, 'owner', 'unknown');
  end if;

  insert into public.referral_payment_fingerprints (fingerprint, user_id)
  values (p_fingerprint, p_user)
  on conflict (fingerprint) do nothing;

  select user_id into v_owner
    from public.referral_payment_fingerprints
   where fingerprint = p_fingerprint;

  if v_owner = p_user then
    return jsonb_build_object('ok', true, 'owner', 'self');
  end if;
  return jsonb_build_object('ok', false, 'owner', 'other', 'owner_user_id', v_owner);
end;
$$;

-- ── reject_referral — antiabuso detectado na confirmação ────────────────────
create or replace function public.reject_referral(
  p_user   uuid,
  p_reason text,
  p_flag   text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_referral public.referrals;
begin
  select * into v_referral
    from public.referrals where referred_user_id = p_user for update;
  if v_referral.id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_referral');
  end if;

  update public.referrals
     set status        = 'rejected',
         revoked_at    = now(),
         revoke_reason = p_reason,
         fraud_flags   = fraud_flags || to_jsonb(array[p_flag]),
         updated_at    = now()
   where id = v_referral.id;

  update public.referral_rewards
     set status        = 'revoked',
         revoked_at    = now(),
         revoke_reason = p_reason,
         updated_at    = now()
   where referral_id = v_referral.id and status in ('pending', 'available');

  insert into public.referral_events (referral_id, user_id, type, detail)
  values (v_referral.id, p_user, 'referral_rejected',
          jsonb_build_object('reason', p_reason, 'flag', p_flag));

  return jsonb_build_object('ok', true, 'referral_id', v_referral.id);
end;
$$;

-- ── confirm_referral — primeira mensalidade do indicado foi paga ────────────
-- Idempotente: rechamada devolve a mesma recompensa em vez de criar outra.
create or replace function public.confirm_referral(
  p_user           uuid,
  p_invoice        text,
  p_payment_intent text,
  p_percent        integer,
  p_hold           interval
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_referral public.referrals;
  v_reward   public.referral_rewards;
begin
  select * into v_referral
    from public.referrals where referred_user_id = p_user for update;
  if v_referral.id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_referral');
  end if;

  if v_referral.status = 'confirmed' then
    select * into v_reward from public.referral_rewards where referral_id = v_referral.id;
    return jsonb_build_object(
      'ok', true, 'already', true,
      'referral_id', v_referral.id,
      'reward_id', v_reward.id,
      'referrer_user_id', v_referral.referrer_user_id,
      'available_at', v_reward.available_at
    );
  end if;

  if v_referral.status <> 'signed_up' then
    return jsonb_build_object('ok', false, 'reason', v_referral.status);
  end if;

  update public.referrals
     set status                    = 'confirmed',
         confirmed_at              = now(),
         hold_until                = now() + p_hold,
         qualifying_invoice_id     = p_invoice,
         qualifying_payment_intent = p_payment_intent,
         updated_at                = now()
   where id = v_referral.id;

  insert into public.referral_rewards (
    referral_id, referrer_user_id, percent_off, status, available_at
  ) values (
    v_referral.id, v_referral.referrer_user_id, p_percent, 'pending', now() + p_hold
  )
  on conflict (referral_id) do nothing
  returning * into v_reward;

  if v_reward.id is null then
    select * into v_reward from public.referral_rewards where referral_id = v_referral.id;
  end if;

  insert into public.referral_events (referral_id, reward_id, user_id, type, stripe_object_id, detail)
  values (v_referral.id, v_reward.id, v_referral.referrer_user_id,
          'referral_confirmed', p_invoice,
          jsonb_build_object('percent_off', p_percent, 'available_at', v_reward.available_at));

  return jsonb_build_object(
    'ok', true, 'already', false,
    'referral_id', v_referral.id,
    'reward_id', v_reward.id,
    'referrer_user_id', v_referral.referrer_user_id,
    'available_at', v_reward.available_at
  );
end;
$$;

-- ── revoke_referral_reward — reembolso, contestação, falha, cancelamento ────
-- Localiza a indicação por fatura, payment intent OU conta do indicado.
create or replace function public.revoke_referral_reward(
  p_reason         text,
  p_invoice        text default null,
  p_payment_intent text default null,
  p_referred_user  uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_referral public.referrals;
  v_reward   public.referral_rewards;
  v_note     text := null;
begin
  select * into v_referral
    from public.referrals
   where (p_invoice        is not null and qualifying_invoice_id     = p_invoice)
      or (p_payment_intent is not null and qualifying_payment_intent = p_payment_intent)
      or (p_referred_user  is not null and referred_user_id          = p_referred_user)
   order by confirmed_at desc nulls last
   limit 1
     for update;

  if v_referral.id is null then
    return jsonb_build_object('ok', true, 'found', false);
  end if;
  if v_referral.status in ('revoked', 'rejected') then
    return jsonb_build_object('ok', true, 'found', true, 'already', true);
  end if;

  update public.referrals
     set status        = 'revoked',
         revoked_at    = now(),
         revoke_reason = p_reason,
         updated_at    = now()
   where id = v_referral.id;

  select * into v_reward from public.referral_rewards where referral_id = v_referral.id;

  if v_reward.id is not null then
    if v_reward.status in ('pending', 'available') then
      update public.referral_rewards
         set status        = 'revoked',
             revoked_at    = now(),
             revoke_reason = p_reason,
             updated_at    = now()
       where id = v_reward.id;
    else
      -- Já entrou (ou está entrando) numa fatura do indicador. A janela de
      -- reembolso existe justamente para isso quase nunca acontecer; quando
      -- acontece (contestação tardia), fica registrado para tratativa manual.
      v_note := 'reward_' || v_reward.status;
    end if;
  end if;

  insert into public.referral_events (referral_id, reward_id, user_id, type, stripe_object_id, detail)
  values (v_referral.id, v_reward.id, v_referral.referrer_user_id,
          'referral_revoked', coalesce(p_invoice, p_payment_intent),
          jsonb_build_object('reason', p_reason, 'note', v_note));

  return jsonb_build_object('ok', true, 'found', true, 'note', v_note);
end;
$$;

-- ── mature_referral_rewards — pending → available (fim da janela) ───────────
create or replace function public.mature_referral_rewards(p_user uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  with matured as (
    update public.referral_rewards rw
       set status = 'available', updated_at = now()
     where rw.status = 'pending'
       and rw.available_at <= now()
       and (p_user is null or rw.referrer_user_id = p_user)
       and exists (
         select 1 from public.referrals r
          where r.id = rw.referral_id and r.status = 'confirmed'
       )
    returning rw.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from matured;

  insert into public.referral_events (referral_id, reward_id, user_id, type, detail)
  select rw.referral_id, rw.id, rw.referrer_user_id, 'reward_available',
         jsonb_build_object('percent_off', rw.percent_off)
    from public.referral_rewards rw
   where rw.id = any(v_ids);

  return coalesce(array_length(v_ids, 1), 0);
end;
$$;

-- ── claim_referral_rewards — reserva recompensas para uma fatura ────────────
-- Escolhe recompensas disponíveis até o teto de percentual (100 por
-- mensalidade). O que sobra continua disponível para as mensalidades seguintes.
create or replace function public.claim_referral_rewards(
  p_user        uuid,
  p_invoice     text,
  p_max_percent integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app     public.referral_reward_applications;
  v_total   integer := 0;
  v_ids     uuid[]  := '{}';
  v_reward  record;
begin
  select * into v_app
    from public.referral_reward_applications
   where invoice_id = p_invoice
     for update;

  -- Já reservado para esta fatura: devolve o mesmo resultado (o Stripe
  -- reentrega invoice.created e a aplicação no Stripe é reexecutável).
  if v_app.id is not null and v_app.status <> 'released' then
    select coalesce(array_agg(id), '{}') into v_ids
      from public.referral_rewards where applied_invoice_id = p_invoice;
    return jsonb_build_object(
      'ok', true, 'already', true,
      'percent_off', v_app.percent_off,
      'reward_ids', to_jsonb(v_ids),
      'stripe_coupon_id', v_app.stripe_coupon_id
    );
  end if;

  -- Amadurece antes de escolher: o cron é rede de segurança, não dependência.
  perform public.mature_referral_rewards(p_user);

  for v_reward in
    select * from public.referral_rewards
     where referrer_user_id = p_user and status = 'available'
     order by available_at asc, created_at asc
       for update
  loop
    exit when v_total + v_reward.percent_off > p_max_percent;
    v_total := v_total + v_reward.percent_off;
    v_ids   := v_ids || v_reward.id;
  end loop;

  if v_total = 0 then
    return jsonb_build_object('ok', true, 'already', false, 'percent_off', 0,
                              'reward_ids', to_jsonb('{}'::uuid[]));
  end if;

  if v_app.id is null then
    insert into public.referral_reward_applications (invoice_id, referrer_user_id, percent_off)
    values (p_invoice, p_user, v_total)
    returning * into v_app;
  else
    update public.referral_reward_applications
       set status = 'applied', percent_off = v_total, stripe_coupon_id = null, updated_at = now()
     where id = v_app.id
    returning * into v_app;
  end if;

  update public.referral_rewards
     set status             = 'applied',
         applied_invoice_id = p_invoice,
         applied_at         = now(),
         updated_at         = now()
   where id = any(v_ids);

  insert into public.referral_events (referral_id, reward_id, user_id, type, stripe_object_id, detail)
  select rw.referral_id, rw.id, rw.referrer_user_id, 'reward_applied', p_invoice,
         jsonb_build_object('percent_off', rw.percent_off, 'invoice_total_percent', v_total)
    from public.referral_rewards rw
   where rw.id = any(v_ids);

  return jsonb_build_object(
    'ok', true, 'already', false,
    'percent_off', v_total,
    'reward_ids', to_jsonb(v_ids)
  );
end;
$$;

-- ── set_application_coupon — registra o cupom usado no Stripe ───────────────
create or replace function public.set_application_coupon(
  p_invoice text,
  p_coupon  text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.referral_reward_applications
     set stripe_coupon_id = p_coupon, updated_at = now()
   where invoice_id = p_invoice;
end;
$$;

-- ── settle_reward_application — fatura paga (consumed) ou não (released) ────
create or replace function public.settle_reward_application(
  p_invoice text,
  p_outcome text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.referral_reward_applications;
  v_ids uuid[];
begin
  if p_outcome not in ('consumed', 'released') then
    raise exception 'invalid_outcome' using errcode = 'P0001';
  end if;

  select * into v_app
    from public.referral_reward_applications where invoice_id = p_invoice for update;
  if v_app.id is null then
    return jsonb_build_object('ok', true, 'found', false);
  end if;
  if v_app.status = p_outcome then
    return jsonb_build_object('ok', true, 'found', true, 'already', true);
  end if;
  -- Consumida é estado final: uma fatura paga não volta a liberar recompensa.
  if v_app.status = 'consumed' then
    return jsonb_build_object('ok', true, 'found', true, 'already', true);
  end if;

  select coalesce(array_agg(id), '{}') into v_ids
    from public.referral_rewards where applied_invoice_id = p_invoice;

  if p_outcome = 'consumed' then
    update public.referral_rewards
       set status = 'consumed', consumed_at = now(), updated_at = now()
     where id = any(v_ids) and status = 'applied';
  else
    -- Fatura não paga: o benefício NÃO se perde — volta para a fila e entra na
    -- próxima mensalidade.
    update public.referral_rewards
       set status             = 'available',
           applied_invoice_id = null,
           applied_at         = null,
           updated_at         = now()
     where id = any(v_ids) and status = 'applied';
  end if;

  update public.referral_reward_applications
     set status = p_outcome, updated_at = now()
   where id = v_app.id;

  insert into public.referral_events (referral_id, reward_id, user_id, type, stripe_object_id, detail)
  select rw.referral_id, rw.id, rw.referrer_user_id,
         case when p_outcome = 'consumed' then 'reward_consumed' else 'reward_released' end,
         p_invoice, jsonb_build_object('percent_off', rw.percent_off)
    from public.referral_rewards rw
   where rw.id = any(v_ids);

  return jsonb_build_object('ok', true, 'found', true, 'already', false);
end;
$$;

-- ── Privilégios: só o service_role executa ──────────────────────────────────
do $$
declare
  v_sig text;
begin
  foreach v_sig in array array[
    'public.normalize_email(text)',
    'public.generate_referral_code()',
    'public.ensure_referral_code(uuid)',
    'public.bind_referral(text, uuid, interval)',
    'public.mark_referred_discount(uuid, integer, text)',
    'public.claim_payment_fingerprint(text, uuid)',
    'public.reject_referral(uuid, text, text)',
    'public.confirm_referral(uuid, text, text, integer, interval)',
    'public.revoke_referral_reward(text, text, text, uuid)',
    'public.mature_referral_rewards(uuid)',
    'public.claim_referral_rewards(uuid, text, integer)',
    'public.set_application_coupon(text, text)',
    'public.settle_reward_application(text, text)'
  ]
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', v_sig);
    execute format('grant  execute on function %s to service_role', v_sig);
  end loop;
end;
$$;

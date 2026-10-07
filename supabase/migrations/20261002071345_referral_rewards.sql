-- Indicações pertencem à conta que trouxe o novo usuário. O vínculo é fixado
-- no cadastro; pagamentos do indicado geram Nodes extras para quem indicou.
create table if not exists public.referrals (
  referred_user_id uuid primary key references public.profiles(id) on delete cascade,
  referrer_user_id uuid not null references public.profiles(id) on delete cascade,
  code text not null,
  created_at timestamptz not null default now(),
  constraint referrals_no_self_reference check (referred_user_id <> referrer_user_id)
);

create index if not exists referrals_referrer_created_idx
  on public.referrals (referrer_user_id, created_at desc);

alter table public.referrals enable row level security;
revoke all on public.referrals from anon, authenticated;
grant select on public.referrals to authenticated;
grant all on public.referrals to service_role;

create policy referrals_read_own on public.referrals
  for select to authenticated
  using ((select auth.uid()) = referrer_user_id);

-- O signup por e-mail pode ser confirmado em outro navegador. O metadata é
-- lido SOMENTE neste trigger de criação; mudanças posteriores não reatribuem.
create function public.capture_signup_referral()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  candidate text;
  referrer uuid;
begin
  select raw_user_meta_data ->> 'spn_referrer_id' into candidate
    from auth.users where id = new.id;
  if candidate is null or candidate !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return new;
  end if;
  referrer := candidate::uuid;
  if referrer <> new.id then
    insert into public.referrals (referred_user_id, referrer_user_id, code)
    select new.id, referrer, referrer::text
      where exists (select 1 from public.profiles where id = referrer)
    on conflict (referred_user_id) do nothing;
  end if;
  return new;
end;
$$;

revoke execute on function public.capture_signup_referral() from public, anon, authenticated;
create trigger capture_signup_referral_after_profile
  after insert on public.profiles
  for each row execute function public.capture_signup_referral();

-- Reutiliza o saldo avulso já consumido pelas ferramentas. A origem separa
-- prêmios de compras, sem chamar o RPC de compra com um pacote fictício.
alter table public.lumen_packs
  drop constraint if exists lumen_packs_pack_size_check;
alter table public.lumen_packs
  add constraint lumen_packs_pack_size_check
  check (pack_size in (200, 400, 500, 800, 1500, 4000));
alter table public.lumen_packs
  add column source_type text not null default 'purchase'
    check (source_type in ('purchase', 'referral')),
  add column source_invoice_id text,
  add column referred_user_id uuid references public.profiles(id) on delete set null;

create unique index lumen_referral_invoice_once_idx
  on public.lumen_packs (source_invoice_id)
  where source_type = 'referral';

create function public.grant_referral_nodes(
  referred_user_id_input uuid,
  invoice_id_input text,
  plan_input text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  referrer uuid;
  reward integer;
  inserted_id uuid;
begin
  if invoice_id_input is null or invoice_id_input = '' then
    raise exception 'Invoice ID required' using errcode = '22023';
  end if;
  reward := case plan_input
    when 'essence' then 200
    when 'pro' then 400
    when 'studio' then 800
    else 0
  end;
  if reward = 0 then
    return jsonb_build_object('applied', false, 'reason', 'ineligible_plan');
  end if;

  select referrer_user_id into referrer
    from public.referrals where referred_user_id = referred_user_id_input;
  if referrer is null then
    return jsonb_build_object('applied', false, 'reason', 'no_referral');
  end if;

  insert into public.lumen_packs (
    user_id, pack_size, nodes_initial, nodes_remaining, status,
    expires_at, source_type, source_invoice_id, referred_user_id
  ) values (
    referrer, reward, reward, reward, 'active',
    'infinity'::timestamptz, 'referral', invoice_id_input, referred_user_id_input
  ) on conflict do nothing returning id into inserted_id;

  return jsonb_build_object('applied', inserted_id is not null, 'reward',
    case when inserted_id is not null then reward else 0 end);
end;
$$;

revoke execute on function public.grant_referral_nodes(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.grant_referral_nodes(uuid, text, text)
  to service_role;

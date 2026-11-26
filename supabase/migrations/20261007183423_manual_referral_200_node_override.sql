-- Uma indicação feita antes do link pode ter um prêmio definido por acordo.
-- O vínculo continua sendo único por indicado; cada fatura paga é única no saldo.
alter table public.referrals
  add column if not exists reward_override_nodes integer
    check (reward_override_nodes = 200);

create or replace function public.grant_referral_nodes(
  referred_user_id_input uuid,
  invoice_id_input text,
  plan_input text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  referrer uuid;
  override_nodes integer;
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
  select r.referrer_user_id, r.reward_override_nodes
    into referrer, override_nodes
    from public.referrals as r
    where r.referred_user_id = referred_user_id_input;
  if override_nodes = 200
    and plan_input in ('starter', 'essence', 'pro', 'studio', 'office') then
    reward := 200;
  end if;
  if reward = 0 then
    return jsonb_build_object('applied', false, 'reason', 'ineligible_plan');
  end if;
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

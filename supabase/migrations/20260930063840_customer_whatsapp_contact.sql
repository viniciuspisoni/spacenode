-- Local implementation. Apply before enabling WHATSAPP_SIGNUP_ENABLED.
-- Existing accounts are exempt; new accounts complete the contact step in /app.
begin;

create schema if not exists spacenode_contacts;
revoke all on schema spacenode_contacts from public, anon, authenticated;
grant usage on schema spacenode_contacts to service_role;

create table public.customer_contacts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  whatsapp_e164 text,
  whatsapp_verified_at timestamptz,
  support_opt_in boolean not null default false,
  marketing_opt_in boolean not null default false,
  signup_exempt boolean not null default false,
  notice_version text,
  source text not null default 'account_form' check (source in ('account_form', 'legacy_migration')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contact_phone_format check (whatsapp_e164 is null or whatsapp_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  constraint contact_phone_required check (signup_exempt or whatsapp_e164 is not null),
  constraint contact_consent_requires_phone check (whatsapp_e164 is not null or (not support_opt_in and not marketing_opt_in)),
  constraint contact_notice_required check (signup_exempt or notice_version is not null)
);
alter table public.customer_contacts enable row level security;
revoke all on public.customer_contacts from public, anon, authenticated;
grant select on public.customer_contacts to authenticated;
grant select, insert, update, delete on public.customer_contacts to service_role;
create policy own_contact_read on public.customer_contacts for select to authenticated
  using ((select auth.uid()) = user_id);

create table public.customer_contact_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  phone_changed boolean not null,
  support_opt_in boolean not null,
  marketing_opt_in boolean not null,
  notice_version text not null,
  source text not null,
  occurred_at timestamptz not null default now()
);
create index customer_contact_events_user_time on public.customer_contact_events(user_id, occurred_at);
alter table public.customer_contact_events enable row level security;
revoke all on public.customer_contact_events from public, anon, authenticated;
grant select on public.customer_contact_events to authenticated;
grant select, insert, delete on public.customer_contact_events to service_role;
grant usage, select on sequence public.customer_contact_events_id_seq to service_role;
create policy own_contact_events_read on public.customer_contact_events for select to authenticated
  using ((select auth.uid()) = user_id);

-- No phone or consent is inferred for pre-existing accounts.
insert into public.customer_contacts (user_id, signup_exempt, source)
select id, true, 'legacy_migration' from auth.users;

create function spacenode_contacts.stamp_contact() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.whatsapp_verified_at := null;
  elsif new.whatsapp_e164 is distinct from old.whatsapp_e164 then
    new.whatsapp_verified_at := null;
  end if;
  return new;
end;
$$;
create function spacenode_contacts.audit_contact() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare changed boolean;
begin
  if tg_op = 'INSERT' then
    changed := true;
  else
    changed := new.whatsapp_e164 is distinct from old.whatsapp_e164;
    if not changed
      and new.support_opt_in = old.support_opt_in
      and new.marketing_opt_in = old.marketing_opt_in
      and new.notice_version is not distinct from old.notice_version then
      return new;
    end if;
  end if;
  insert into public.customer_contact_events
    (user_id, phone_changed, support_opt_in, marketing_opt_in, notice_version, source)
  values (new.user_id, changed, new.support_opt_in, new.marketing_opt_in, new.notice_version, new.source);
  return new;
end;
$$;
revoke all on function spacenode_contacts.stamp_contact() from public, anon, authenticated;
revoke all on function spacenode_contacts.audit_contact() from public, anon, authenticated;
grant execute on function spacenode_contacts.stamp_contact() to service_role;
grant execute on function spacenode_contacts.audit_contact() to service_role;
create trigger stamp_customer_contact before insert or update on public.customer_contacts
for each row execute function spacenode_contacts.stamp_contact();
create trigger audit_customer_contact after insert or update on public.customer_contacts
for each row execute function spacenode_contacts.audit_contact();

comment on column public.customer_contacts.whatsapp_verified_at is
  'Null until provider ownership verification succeeds. Saving a number does not verify it.';
comment on table public.customer_contact_events is
  'Atomic history of contact preferences. Notice text version maps to lib/customer-contact/validation.ts.';

commit;

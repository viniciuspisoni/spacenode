-- Additive bootstrap; server access only. No prompts, image URLs or keys.
create table if not exists public.api_cost_events (
  id uuid primary key,
  created_at timestamptz not null default now(),
  module text not null, provider text not null, endpoint text not null,
  request_id text,
  status text not null check (status in ('completed','failed')),
  estimated_usd numeric check (estimated_usd >= 0),
  real_usd numeric check (real_usd >= 0),
  duration_ms integer check (duration_ms >= 0)
);
create index if not exists api_cost_events_created_idx on public.api_cost_events(created_at,id);
create index if not exists api_cost_events_request_idx on public.api_cost_events(request_id) where request_id is not null;
alter table public.api_cost_events enable row level security;
revoke all on public.api_cost_events from public, anon, authenticated;
grant select, insert on public.api_cost_events to service_role;

create table if not exists public.api_cost_invoices (
  provider text not null,
  month date not null check (extract(day from month)=1),
  currency text not null check (currency in ('USD','BRL')),
  amount numeric not null check (amount >= 0),
  note text not null default '' check (length(note)<=500),
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  primary key(provider,month)
);
alter table public.api_cost_invoices enable row level security;
revoke all on public.api_cost_invoices from public, anon, authenticated;
grant select, insert, update on public.api_cost_invoices to service_role;

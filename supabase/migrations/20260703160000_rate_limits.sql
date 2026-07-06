-- 20260703160000_rate_limits.sql
--
-- AL-2 da auditoria 2026-07-03: rate limit por janela fixa, via Postgres (sem
-- dependência nova). Protege os endpoints GRÁTIS de custo por request (analyze,
-- video/analyze, edits/segment SAM2, edits/preview, verify-dna) e o waitlist
-- público — que antes eram ilimitados (vetor de abuso de custo Gemini/SAM2).
--
-- RLS deny-all; a função é SECURITY DEFINER e só executável por service_role
-- (as rotas chamam via admin client). Aditivo e seguro de aplicar. O helper
-- lib/rate-limit.ts é FAIL-OPEN: enquanto esta migration não for aplicada, a
-- RPC não existe e o helper PERMITE tudo (inerte, não quebra nada).

create table if not exists public.rate_limits (
  bucket_key   text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (bucket_key, window_start)
);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;
grant  all on public.rate_limits to service_role;

-- Incremento ATÔMICO do contador da janela atual; devolve o total pós-incremento.
-- window_start = início da janela (piso do epoch pela largura da janela).
create or replace function public.bump_rate_limit(
  key_input      text,
  window_seconds integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  w_start timestamptz;
  total   integer;
begin
  w_start := to_timestamp(floor(extract(epoch from now()) / window_seconds) * window_seconds);
  insert into public.rate_limits (bucket_key, window_start, hits)
    values (key_input, w_start, 1)
  on conflict (bucket_key, window_start)
    do update set hits = public.rate_limits.hits + 1
  returning hits into total;
  return total;
end;
$$;

revoke all     on function public.bump_rate_limit(text, integer) from public, anon, authenticated;
grant  execute on function public.bump_rate_limit(text, integer) to service_role;

-- Limpeza opcional (janelas antigas): rodar por cron se a tabela crescer.
--   delete from public.rate_limits where window_start < now() - interval '2 days';

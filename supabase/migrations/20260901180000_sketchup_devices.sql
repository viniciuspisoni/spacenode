-- Dispositivos pareados do plugin SketchUp (device-code flow).
--
-- Desenho de segurança (plano mestre 2026-09-01, decisão 04):
--   * O plugin guarda APENAS device_id + device_secret (opaco). O refresh
--     token da sessão Supabase mintada pro dispositivo NUNCA sai do servidor:
--     fica aqui, rotacionado a cada renovação (custódia server-side).
--   * Revogar = revoked_at preenchido -> renovação negada -> o access token
--     em campo morre sozinho em <=1h.
--   * code_hash/secret_hash são sha256 hex — os valores crus nunca persistem.
--
-- Acesso: SOMENTE service_role (as rotas usam o admin client). RLS ligada
-- sem policy nenhuma = negado para anon/authenticated por padrão.

create table if not exists public.sketchup_devices (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users (id) on delete cascade,
  device_name  text not null default 'SketchUp',
  status       text not null default 'pending'
               check (status in ('pending', 'approved', 'active', 'revoked')),
  code_hash    text,                    -- sha256 do código XXXX-XXXX (limpo no claim)
  secret_hash  text not null,           -- sha256 do device_secret
  refresh_token text,                   -- custódia server-side; rotacionado
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,    -- validade do pareamento pendente
  approved_at  timestamptz,
  last_seen_at timestamptz,
  revoked_at   timestamptz
);

create index if not exists sketchup_devices_code_hash_idx
  on public.sketchup_devices (code_hash) where code_hash is not null;
create index if not exists sketchup_devices_user_idx
  on public.sketchup_devices (user_id) where user_id is not null;

alter table public.sketchup_devices enable row level security;

revoke all on public.sketchup_devices from anon, authenticated;

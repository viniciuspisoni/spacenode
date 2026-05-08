-- ─────────────────────────────────────────────────────────────
-- Harden SECURITY DEFINER functions
--
-- Auditoria via pg_proc revelou que vários grants/garantias do
-- migration de 20260503 foram revertidos em produção (provavelmente
-- por edição via dashboard, que faz CREATE OR REPLACE FUNCTION sem
-- preservar REVOKE/GRANT). Migration consolidada que:
--
-- 1. DROP consume_credit(uuid) — legacy, não chamada por código
--    de app (só por scripts .sh obsoletos no repo).
--
-- 2. consume_credits(uuid, integer) — reaplica a versão GUARDADA
--    da 20260503000001. A função em produção perdeu o auth.uid()
--    check, permitindo que qualquer authenticated user drene saldo
--    de outro user (basta passar user_id_input alheio no payload).
--    Esta é a vulnerabilidade mais grave do conjunto.
--
-- 3. consume_nodes / refund_nodes — REVOKE de anon e authenticated.
--    A migration de Pricing v2 só revogou PUBLIC; Supabase auto-
--    grants pra anon/authenticated em CREATE FUNCTION.
--
-- 4. add_credits (ambos overloads) — REVOKE de PUBLIC, anon,
--    authenticated; GRANT só pra service_role. Crédito é concedido
--    server-side (Stripe webhook usa admin.rpc → bypassa GRANT).
--    Adiciona search_path no overload 2-arg que estava sem.
--
-- 5. handle_new_user() — REVOKE de PUBLIC, anon, authenticated.
--    É função de trigger (ON INSERT em auth.users), nunca chamada
--    como RPC.
--
-- 6. update_spaces_updated_at() — adiciona search_path. Trigger,
--    não é SECURITY DEFINER, mas o linter pede pra todas funções.
-- ─────────────────────────────────────────────────────────────

-- ── 1. Drop legacy ────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.consume_credit(uuid);

-- ── 2. consume_credits — re-deploy com auth.uid() guard ──────
CREATE OR REPLACE FUNCTION public.consume_credits(
  user_id_input uuid,
  amount        integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  caller_id       uuid;
  current_credits integer;
begin
  -- Guard: amount inválido
  if amount is null or amount <= 0 then
    return false;
  end if;

  -- Guard: caller identity. auth.uid() lê o sub do JWT da sessão.
  -- NULL = chamada sem JWT de user (anon, ou service_role sem
  -- contexto). Bloqueia incondicionalmente.
  caller_id := auth.uid();
  if caller_id is null then
    return false;
  end if;

  -- Guard: caller só pode debitar próprio saldo
  if caller_id <> user_id_input then
    return false;
  end if;

  -- Débito atômico (FOR UPDATE evita race em chamadas concorrentes)
  select credits
    into current_credits
    from public.profiles
   where id = user_id_input
     for update;

  if current_credits is null then
    return false;
  end if;

  if current_credits >= amount then
    update public.profiles
       set credits = credits - amount
     where id = user_id_input;
    return true;
  end if;

  return false;
end;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_credits(uuid, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.consume_credits(uuid, integer) TO authenticated;

-- ── 3. consume_nodes / refund_nodes — admin-only ─────────────
REVOKE EXECUTE ON FUNCTION public.consume_nodes(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_nodes(uuid, integer)  FROM PUBLIC, anon, authenticated;
-- service_role grant já existe (Pricing v2 migration); manter

-- ── 4. add_credits — admin-only ──────────────────────────────
REVOKE EXECUTE ON FUNCTION public.add_credits(uuid, integer)              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_credits(uuid, integer, text)        FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.add_credits(uuid, integer)              TO service_role;
GRANT  EXECUTE ON FUNCTION public.add_credits(uuid, integer, text)        TO service_role;
ALTER  FUNCTION         public.add_credits(uuid, integer)                 SET search_path = public;

-- ── 5. handle_new_user — trigger only ────────────────────────
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- ── 6. update_spaces_updated_at — search_path lock ───────────
ALTER FUNCTION public.update_spaces_updated_at() SET search_path = public;

-- ── consume_credits RPC ───────────────────────────────────────────────────────
-- Atomically deducts `amount` credits from the caller's profile.
--
-- Security model
-- ──────────────
-- The function is SECURITY DEFINER so it can update profiles without granting
-- direct UPDATE rights to callers. Two layers protect it:
--
--   1. GRANT/REVOKE: only the `authenticated` role may execute it at the
--      SQL level. `anon` (unauthenticated) clients are blocked outright.
--      PostgreSQL superuser / service_role bypasses GRANT checks by design,
--      but the auth.uid() guard below closes that path too — server code
--      MUST call this function with a real user JWT (use supabase.rpc, not
--      admin.rpc) so auth.uid() resolves to the caller's UUID.
--
--   2. auth.uid() guard: rejects requests where the JWT sub is absent or
--      does not match user_id_input, preventing one user from draining
--      another user's balance even if they somehow invoke the function.
--
-- Amount guard
-- ────────────
-- amount must be a positive integer. NULL, 0, and negative values are
-- rejected immediately (return false) without touching profiles.
--
-- Return value
-- ────────────
-- TRUE  — credits were successfully deducted.
-- FALSE — any of: invalid amount, auth.uid() mismatch, user not found,
--         or insufficient balance. Caller maps FALSE to HTTP 402.
--
-- Idempotency
-- ───────────
-- CREATE OR REPLACE is safe to re-apply; the subsequent REVOKE/GRANT
-- statements are also idempotent.

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

  -- ── P0-1: Guard — reject invalid amount ────────────────────────────────────
  if amount is null or amount <= 0 then
    return false;
  end if;

  -- ── P0-2: Guard — caller identity via JWT ──────────────────────────────────
  -- auth.uid() reads the `sub` claim from the session JWT.
  -- Null means no authenticated JWT is present (e.g. unauthenticated request
  -- or service_role without a user JWT in context). Reject unconditionally.
  caller_id := auth.uid();

  if caller_id is null then
    return false;
  end if;

  if caller_id <> user_id_input then
    return false;
  end if;

  -- ── Atomic debit with row-level lock ───────────────────────────────────────
  -- FOR UPDATE prevents concurrent calls from over-spending the same balance.
  select credits
    into current_credits
    from public.profiles
   where id = user_id_input
     for update;

  -- User row not found (profile deleted between auth check and here)
  if current_credits is null then
    return false;
  end if;

  -- Sufficient balance — deduct and confirm
  if current_credits >= amount then
    update public.profiles
       set credits = credits - amount
     where id = user_id_input;
    return true;
  end if;

  -- Insufficient balance
  return false;

end;
$$;

-- ── Permission hardening ──────────────────────────────────────────────────────
-- Strip the default PUBLIC execute grant, then re-grant only to authenticated.
-- Calling these twice is safe (idempotent REVOKE/GRANT).
REVOKE EXECUTE ON FUNCTION public.consume_credits(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.consume_credits(uuid, integer) FROM anon;
GRANT  EXECUTE ON FUNCTION public.consume_credits(uuid, integer) TO authenticated;

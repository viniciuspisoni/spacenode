-- ── consume_credits RPC ───────────────────────────────────────────────────────
-- Atomically deducts `amount` credits from the user's profile.
-- Returns TRUE on success, FALSE when the balance is insufficient or the user
-- record doesn't exist. Uses FOR UPDATE to prevent double-spend under
-- concurrent requests. SECURITY DEFINER so it can be called from the API
-- (admin client) without needing direct UPDATE rights on profiles.

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
  current_credits integer;
begin
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

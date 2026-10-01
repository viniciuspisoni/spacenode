-- One explicit answer per completed render. No image, prompt or free text.
begin;

create table public.render_feedback (
  render_id uuid primary key references public.renders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  useful boolean not null,
  reason text check (reason in ('geometry', 'materials', 'lighting', 'other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint positive_feedback_has_no_reason check (not useful or reason is null)
);

create index render_feedback_user_id_idx on public.render_feedback(user_id);
create index render_feedback_updated_at_idx on public.render_feedback(updated_at);

-- Browser writes use the authenticated app route, which checks ownership.
-- Signed-in users can read only their own answers and cannot write directly.
alter table public.render_feedback enable row level security;
revoke all on public.render_feedback from public, anon, authenticated;
grant select on public.render_feedback to authenticated;
grant select, insert, update, delete on public.render_feedback to service_role;
create policy render_feedback_owner_read on public.render_feedback for select to authenticated
  using ((select auth.uid()) = user_id);

comment on table public.render_feedback is
  'Opt-in, one-tap feedback about whether a render was useful. No image, prompt or free text. The app route verifies render ownership and completion.';

commit;

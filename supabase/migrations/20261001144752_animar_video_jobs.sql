-- Animar: fila durável. As três RPCs são chamadas somente com service_role.
-- Débito/claim, estorno e conclusão+render são transações atômicas separadas.
-- ROLLBACK: DROP FUNCTION public.complete_video_job; DROP FUNCTION public.fail_video_job;
-- DROP FUNCTION public.reserve_video_job; DROP TABLE public.video_jobs;
-- ALTER TABLE public.renders DROP COLUMN video_job_id;

create table if not exists public.video_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  client_request_id uuid not null,
  status text not null default 'submitting'
    check (status in ('submitting', 'processing', 'completed', 'failed')),
  model_id text not null,
  provider_endpoint text not null,
  provider_request_id text,
  duration text not null,
  aspect_ratio text not null,
  motion_id text not null,
  video_type text not null,
  input_url text not null,
  prompt text not null,
  negative_prompt text,
  user_prompt text,
  nodes_cost integer not null check (nodes_cost > 0),
  charged boolean not null default false,
  refunded boolean not null default false,
  output_url text,
  provider_output_url text,
  storage_key text,
  delivery_status text,
  output_bytes integer,
  render_id uuid,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, client_request_id)
);

create index if not exists video_jobs_user_created_idx
  on public.video_jobs (user_id, created_at desc);
create index if not exists video_jobs_pending_idx
  on public.video_jobs (created_at)
  where status in ('submitting', 'processing');

alter table public.video_jobs enable row level security;
create policy video_jobs_select_own on public.video_jobs
  for select to authenticated using ((select auth.uid()) = user_id);

alter table public.renders add column if not exists video_job_id uuid;
create unique index if not exists renders_video_job_unique_idx
  on public.renders (video_job_id) where video_job_id is not null;

create or replace function public.reserve_video_job(
  p_user_id uuid, p_request_id uuid, p_model_id text, p_endpoint text,
  p_duration text, p_aspect_ratio text, p_motion_id text, p_video_type text,
  p_input_url text, p_prompt text, p_negative_prompt text, p_user_prompt text,
  p_nodes_cost integer
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_job public.video_jobs%rowtype;
begin
  insert into public.video_jobs (
    user_id, client_request_id, model_id, provider_endpoint, duration,
    aspect_ratio, motion_id, video_type, input_url, prompt, negative_prompt,
    user_prompt, nodes_cost
  ) values (
    p_user_id, p_request_id, p_model_id, p_endpoint, p_duration,
    p_aspect_ratio, p_motion_id, p_video_type, p_input_url, p_prompt,
    p_negative_prompt, p_user_prompt, p_nodes_cost
  ) on conflict (user_id, client_request_id) do nothing
  returning * into v_job;

  if v_job.id is null then
    select * into strict v_job from public.video_jobs
     where user_id = p_user_id and client_request_id = p_request_id;
    return jsonb_build_object('job_id', v_job.id, 'created', false);
  end if;

  -- Falha do débito aborta também o INSERT. Duas requisições com a mesma chave
  -- aguardam o UNIQUE e a segunda nunca debita novamente.
  perform public.consume_workspace_nodes(p_user_id, p_nodes_cost);
  update public.video_jobs set charged = true where id = v_job.id;
  return jsonb_build_object('job_id', v_job.id, 'created', true);
end;
$$;

create or replace function public.fail_video_job(p_job_id uuid, p_message text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_job public.video_jobs%rowtype;
begin
  select * into v_job from public.video_jobs where id = p_job_id for update;
  if v_job.id is null or v_job.status not in ('submitting','processing') then
    return false;
  end if;
  if v_job.charged and not v_job.refunded then
    -- Falha da RPC aborta o status também, deixando o job recuperável.
    perform public.refund_workspace_nodes(v_job.user_id, v_job.nodes_cost);
  end if;
  update public.video_jobs set status = 'failed', refunded = v_job.charged,
    error_message = left(p_message, 500), completed_at = now()
    where id = p_job_id;
  return true;
end;
$$;

create or replace function public.complete_video_job(
  p_job_id uuid, p_output_url text, p_provider_url text,
  p_storage_key text, p_delivery_status text, p_output_bytes integer
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_job public.video_jobs%rowtype;
declare v_render_id uuid;
begin
  select * into v_job from public.video_jobs where id = p_job_id for update;
  if v_job.id is null then raise exception 'video job not found'; end if;
  if v_job.status = 'completed' then return v_job.render_id; end if;
  if v_job.status <> 'processing' then raise exception 'video job not processing'; end if;

  insert into public.renders (
    user_id, input_url, output_url, prompt, ambient, style, lighting,
    nodes_charged, cost_credits, fal_request_id, status, completed_at,
    config_snapshot, user_prompt, generation_log, video_job_id
  ) values (
    v_job.user_id, v_job.input_url, p_output_url, v_job.prompt, 'video',
    v_job.model_id, v_job.duration || 's', v_job.nodes_cost, v_job.nodes_cost,
    v_job.provider_request_id, 'completed', now(),
    jsonb_build_object('module','animar','video_type',v_job.video_type,
      'camera_motion',v_job.motion_id,'aspect_ratio',v_job.aspect_ratio,
      'duration',v_job.duration,'engine',v_job.model_id,'fidelity','max'),
    v_job.user_prompt,
    jsonb_build_object('provider','fal','endpoint',v_job.provider_endpoint,
      'request_id',v_job.provider_request_id,'nodes_charged',v_job.nodes_cost,
      'delivery',jsonb_build_object('status',p_delivery_status,
        'bytes',p_output_bytes,'storage_key',p_storage_key,
        'provider_url',p_provider_url)),
    v_job.id
  ) returning id into v_render_id;

  update public.video_jobs set status = 'completed', render_id = v_render_id,
    output_url = p_output_url, provider_output_url = p_provider_url,
    storage_key = p_storage_key, delivery_status = p_delivery_status,
    output_bytes = p_output_bytes, completed_at = now()
    where id = p_job_id;
  return v_render_id;
end;
$$;

revoke all on function public.reserve_video_job(uuid,uuid,text,text,text,text,text,text,text,text,text,text,integer) from public, anon, authenticated;
revoke all on function public.fail_video_job(uuid,text) from public, anon, authenticated;
revoke all on function public.complete_video_job(uuid,text,text,text,text,integer) from public, anon, authenticated;
grant execute on function public.reserve_video_job(uuid,uuid,text,text,text,text,text,text,text,text,text,text,integer) to service_role;
grant execute on function public.fail_video_job(uuid,text) to service_role;
grant execute on function public.complete_video_job(uuid,text,text,text,text,integer) to service_role;

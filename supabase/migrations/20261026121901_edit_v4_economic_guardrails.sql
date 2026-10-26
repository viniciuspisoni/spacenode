-- Offline-reviewed preparation only. Do not apply automatically to a remote database.
-- Existing history and workspace wallet remain authoritative. Service-role only.
create table if not exists public.edit_v4_economic_requests (
  job_id uuid primary key references public.edit_v3_jobs(id),
  user_id uuid not null,
  client_request_id uuid not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'processing' check (status in ('processing','completed','rejected','failed')),
  ledger jsonb not null default '[]'::jsonb check (jsonb_typeof(ledger) = 'array'),
  proof jsonb,
  created_at timestamptz not null default now(),
  unique(user_id,client_request_id)
);
alter table public.edit_v4_economic_requests enable row level security;
revoke all on public.edit_v4_economic_requests from public, anon, authenticated;
grant select,insert,update on public.edit_v4_economic_requests to service_role;

create or replace function public.begin_edit_v4_economic(
  user_id_input uuid, client_request_id_input uuid, request_hash_input text, request_input jsonb
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v public.edit_v4_economic_requests%rowtype; j public.edit_v3_jobs%rowtype; new_id uuid;
begin
  if user_id_input is null or client_request_id_input is null or request_hash_input !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid edit identity' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(user_id_input::text || ':' || client_request_id_input::text,0));
  select * into v from public.edit_v4_economic_requests
    where user_id=user_id_input and client_request_id=client_request_id_input;
  if found then
    if v.request_hash <> request_hash_input then raise exception 'edit request changed' using errcode='22023'; end if;
    select * into strict j from public.edit_v3_jobs where id=v.job_id and user_id=user_id_input;
    return jsonb_build_object('state',v.status,'job_id',j.id,'result_url',case when v.status='completed' then j.result_image_url else null end,'nodes_cost',j.nodes_cost,'charged',j.charged);
  end if;
  if exists(select 1 from public.edit_v3_jobs where user_id=user_id_input and client_request_id=client_request_id_input::text) then
    raise exception 'request id already used' using errcode='22023';
  end if;
  new_id:=gen_random_uuid();
  insert into public.edit_v3_jobs(id,user_id,client_request_id,action_type,status,source_image_url,mask_url,prompt,instruction,nodes_cost,charged,quality_mode,preservation_mode,intensity_mode,reference_count)
  values(new_id,user_id_input,client_request_id_input::text,request_input->>'action','processing',request_input->>'sourceImageUrl',request_input->>'maskUrl',request_input->>'instruction',request_input->>'instruction',10,false,'standard','maximum','standard',coalesce(jsonb_array_length(request_input->'references'),0));
  insert into public.edit_v4_economic_requests(job_id,user_id,client_request_id,request_hash)
  values(new_id,user_id_input,client_request_id_input,request_hash_input);
  return jsonb_build_object('state','claimed','job_id',new_id,'nodes_cost',10,'charged',false);
end $$;

create or replace function public.finish_edit_v4_economic(
  user_id_input uuid, job_id_input uuid, status_input text, result_url_input text,
  ledger_input jsonb, proof_input jsonb, model_input text, charge_input boolean
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v public.edit_v4_economic_requests%rowtype; j public.edit_v3_jobs%rowtype; total_usd numeric; charge_now boolean:=false;
begin
  select * into strict v from public.edit_v4_economic_requests where job_id=job_id_input and user_id=user_id_input for update;
  select * into strict j from public.edit_v3_jobs where id=job_id_input and user_id=user_id_input for update;
  if v.status='completed' then return jsonb_build_object('state','completed','job_id',j.id,'result_url',j.result_image_url,'nodes_cost',j.nodes_cost,'charged',false,'replayed',true); end if;
  if v.status <> 'processing' then raise exception 'terminal edit cannot restart' using errcode='22023'; end if;
  if status_input not in ('completed','rejected','failed') or jsonb_typeof(ledger_input) is distinct from 'array' then raise exception 'invalid edit completion' using errcode='22023'; end if;
  if status_input='completed' then
    if proof_input->>'approved' is distinct from 'true' or nullif(result_url_input,'') is null
      or coalesce(proof_input->>'sourceHash','') !~ '^[a-f0-9]{64}$'
      or coalesce(proof_input->>'maskHash','') !~ '^[a-f0-9]{64}$'
      or coalesce(proof_input->>'candidateHash','') !~ '^[a-f0-9]{64}$' then
      raise exception 'explicit image approval required' using errcode='22023';
    end if;
    if jsonb_array_length(ledger_input) not in (2,3) or exists(
      select 1 from jsonb_array_elements(ledger_input) x where (x->>'status') is distinct from 'completed'
       or x->>'knownUsd' is null or (x->>'knownUsd')::numeric < 0
    ) then raise exception 'unconfirmed edit cost' using errcode='22023'; end if;
    if (select count(*) from jsonb_array_elements(ledger_input) x where x->>'stage'='reader')<>1
       or (select count(*) from jsonb_array_elements(ledger_input) x where x->>'stage'='judge')<>1 then
      raise exception 'reader and judge required' using errcode='22023';
    end if;
    if (model_input='local-linear-paint-v1' and jsonb_array_length(ledger_input)<>2)
       or (model_input='dola-seedream-5-0-flash-260915' and (select count(*) from jsonb_array_elements(ledger_input) x where x->>'stage'='editor')<>1)
       or model_input not in ('local-linear-paint-v1','dola-seedream-5-0-flash-260915') or model_input is null
       or exists(select 1 from jsonb_array_elements(ledger_input) x where x->>'stage' not in ('reader','editor','judge')
          or (x->>'stage' in ('reader','judge') and (x->>'knownUsd')::numeric>0.004)
          or (x->>'stage'='editor' and (x->>'knownUsd')::numeric>0.018)) then
      raise exception 'invalid edit route cost' using errcode='22023';
    end if;
    if proof_input#>>'{verdict,requestApplied}' is distinct from 'true'
      or proof_input#>>'{verdict,correctTarget}' is distinct from 'true'
      or proof_input#>>'{verdict,geometryPreserved}' is distinct from 'true'
      or proof_input#>>'{verdict,protectedPreserved}' is distinct from 'true'
      or proof_input#>>'{verdict,artifactFree}' is distinct from 'true'
      or proof_input#>>'{verdict,uncertain}' is distinct from 'false'
      or (j.reference_count>0 and proof_input#>>'{verdict,referenceFollowed}' is distinct from 'true') then
      raise exception 'visual approval incomplete' using errcode='22023';
    end if;
    select sum((x->>'knownUsd')::numeric)+0.0013333333333333333+0.003459577777777778 into total_usd from jsonb_array_elements(ledger_input) x;
    if total_usd > 0.03223580000000002 then raise exception 'edit cost limit exceeded' using errcode='22023'; end if;
    if charge_input is true then
      -- Debit and durable completion commit together. Any error rolls both back.
      perform public.consume_workspace_nodes(user_id_input,10);
      perform public.bump_monthly_usage(user_id_input=>user_id_input,edits_delta=>1,free_fixes_delta=>0,nodes_delta=>10);
      charge_now:=true;
    end if;
  end if;
  update public.edit_v3_jobs set status=status_input,charged=charge_now,completed_at=now(),
    model=model_input,provider=case when model_input='dola-seedream-5-0-flash-260915' then 'ark' else null end,
    result_image_url=case when status_input='completed' then result_url_input else null end,
    error_message=case when status_input='completed' then null else coalesce(proof_input->>'reason','economic_review_incomplete') end
    where id=job_id_input;
  update public.edit_v4_economic_requests set status=status_input,ledger=ledger_input,proof=proof_input where job_id=job_id_input;
  return jsonb_build_object('state',status_input,'job_id',job_id_input,'result_url',case when status_input='completed' then result_url_input else null end,'nodes_cost',10,'charged',charge_now,'replayed',false);
end $$;
revoke execute on function public.begin_edit_v4_economic(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.begin_edit_v4_economic(uuid,uuid,text,jsonb) to service_role;
revoke execute on function public.finish_edit_v4_economic(uuid,uuid,text,text,jsonb,jsonb,text,boolean) from public,anon,authenticated;
grant execute on function public.finish_edit_v4_economic(uuid,uuid,text,text,jsonb,jsonb,text,boolean) to service_role;

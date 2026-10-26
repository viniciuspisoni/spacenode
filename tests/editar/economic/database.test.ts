import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll,beforeEach,afterAll,describe,it,expect } from 'vitest'
const owner='00000000-0000-0000-0000-000000000001',requestId='00000000-0000-0000-0000-000000000002',hash='a'.repeat(64)
const request={action:'swap_material',sourceImageUrl:'https://storage/owner/source.png',maskUrl:'https://storage/owner/mask.png',instruction:'paint navy',references:[]}
const ledger=[{stage:'reader',status:'completed',knownUsd:.002},{stage:'judge',status:'completed',knownUsd:.001}]
const proof={approved:true,sourceHash:hash,maskHash:hash,candidateHash:hash,verdict:{requestApplied:true,correctTarget:true,geometryPreserved:true,protectedPreserved:true,artifactFree:true,uncertain:false,referenceFollowed:null}}
describe('economic claim, history and atomic wallet completion (real SQL, local Postgres)',()=>{
 let db:PGlite
 beforeAll(async()=>{
  db=new PGlite()
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create function auth.uid() returns uuid language sql as $$select null::uuid$$;
    create table wallet(id uuid primary key,balance integer not null);create table usage_count(edits integer not null);
    insert into wallet values('${owner}',100);insert into usage_count values(0);
    create function public.consume_workspace_nodes(user_id_input uuid,amount integer) returns json language plpgsql as $$ begin
      update wallet set balance=balance-amount where id=user_id_input and balance>=amount;
      if not found then raise exception 'insufficient' using errcode='P0001';end if;return '{}'::json;
    end $$;
    create function public.bump_monthly_usage(user_id_input uuid,edits_delta integer,free_fixes_delta integer,nodes_delta integer) returns void language sql as $$update usage_count set edits=edits+edits_delta$$;`)
  for(const file of ['20260623000000_edit_v3_jobs.sql','20260910040000_edit_jobs_widen_checks.sql','20260917120000_edit_v3_jobs_client_request_id.sql'])await db.exec(readFileSync('supabase/migrations/'+file,'utf8'))
  const sql=readFileSync('supabase/migrations/20261026121901_edit_v4_economic_guardrails.sql','utf8');await db.exec(sql);await db.exec(sql)
 },20000)
 beforeEach(async()=>{await db.exec('truncate public.edit_v4_economic_requests,public.edit_v3_jobs;update wallet set balance=100;update usage_count set edits=0;')})
 afterAll(async()=>{await db.close()})
 async function begin(h=hash){return (await db.query<{v:{job_id:string;state:string;result_url?:string}}>('select public.begin_edit_v4_economic($1,$2,$3,$4::jsonb) v',[owner,requestId,h,JSON.stringify(request)])).rows[0].v}
 async function finish(id:string,status='completed',costs:unknown=ledger,approval:unknown=proof,charge=true){return (await db.query<{v:{state:string;charged:boolean;result_url:string|null}}>('select public.finish_edit_v4_economic($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8) v',[owner,id,status,'https://storage/result.png',JSON.stringify(costs),JSON.stringify(approval),'local-linear-paint-v1',charge])).rows[0].v}
 async function balance(){return (await db.query<{balance:number}>('select balance from wallet')).rows[0].balance}
 it('claims once and returns processing on a repeat',async()=>{
  const first=await begin(),second=await begin();expect(first.state).toBe('claimed');expect(second.state).toBe('processing');expect(first.job_id).toBe(second.job_id)
  expect((await db.query('select * from edit_v3_jobs')).rows).toHaveLength(1)
  await expect(begin('b'.repeat(64))).rejects.toThrow('edit request changed')
 })
 it('debits exactly 10 and completes history in one transaction; retry does not debit',async()=>{
  const {job_id}=await begin();expect((await finish(job_id)).charged).toBe(true);expect(await balance()).toBe(90)
  expect((await finish(job_id)).charged).toBe(false);expect(await balance()).toBe(90)
  expect((await begin()).state).toBe('completed');expect((await db.query<{edits:number}>('select edits from usage_count')).rows[0].edits).toBe(1)
 })
 it('rejection never debits or exposes the discarded image; terminal cannot restart',async()=>{
  const {job_id}=await begin();const result=await finish(job_id,'rejected',[],{approved:false},true)
  expect(result.charged).toBe(false);expect(result.result_url).toBe(null);expect(await balance()).toBe(100)
  expect((await begin()).state).toBe('rejected');await expect(finish(job_id)).rejects.toThrow('terminal edit cannot restart')
 })
 it('retains unknown failure reserves without charging',async()=>{
  const {job_id}=await begin();const costs=[{stage:'reader',status:'failed',knownUsd:null,reserveUsd:.004}]
  await finish(job_id,'failed',costs,{approved:false},false)
  expect((await db.query<{ledger:unknown}>('select ledger from edit_v4_economic_requests')).rows[0].ledger).toEqual(costs)
  expect(await balance()).toBe(100)
 })
 it.each([{}, {...proof,verdict:{...proof.verdict,geometryPreserved:false}}, {...proof,approved:false}])('rejects incomplete visual proof before debit',async approval=>{
  const {job_id}=await begin();await expect(finish(job_id,'completed',ledger,approval)).rejects.toThrow();expect(await balance()).toBe(100)
 })
 it.each([{costs:[{stage:'reader',status:'completed',knownUsd:.1},ledger[1]]},{costs:[{stage:'reader',status:'completed',knownUsd:null},ledger[1]]},{costs:[ledger[0]]}])('rejects over-cap, unknown or missing stage costs',async ({costs})=>{
  const {job_id}=await begin();await expect(finish(job_id,'completed',costs)).rejects.toThrow();expect(await balance()).toBe(100)
 })
 it('insufficient pooled balance leaves both completion and debit uncommitted',async()=>{
  const {job_id}=await begin();await db.exec('update wallet set balance=5;')
  await expect(finish(job_id)).rejects.toThrow('insufficient');expect(await balance()).toBe(5);expect((await begin()).state).toBe('processing')
 })
 it('rolls debit and usage back if the durable history update fails',async()=>{
  const {job_id}=await begin()
  await db.exec(`create function fail_economic_history() returns trigger language plpgsql as $$begin raise exception 'history failed';end$$;
    create trigger fail_economic_history before update on edit_v3_jobs for each row execute function fail_economic_history();`)
  try{await expect(finish(job_id)).rejects.toThrow('history failed');expect(await balance()).toBe(100);expect((await begin()).state).toBe('processing')}
  finally{await db.exec('drop trigger fail_economic_history on edit_v3_jobs;drop function fail_economic_history();')}
 })
 it('has RLS and no customer-role financial/table access',async()=>{
  const rows=await db.query<{rls:boolean;read:boolean;invoke:boolean}>(`select relrowsecurity rls,has_table_privilege('authenticated',oid,'select') as read,has_function_privilege('authenticated','public.finish_edit_v4_economic(uuid,uuid,text,text,jsonb,jsonb,text,boolean)','execute') as invoke from pg_class where relname='edit_v4_economic_requests'`)
  expect(rows.rows[0]).toEqual({rls:true,read:false,invoke:false})
 })
})

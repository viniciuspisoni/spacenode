import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { handleEconomicEdit,type EconomicDependencies } from '@/lib/edit-v4/economic/handler'
import { EconomicEditError } from '@/lib/edit-v4/economic/contracts'
const owner='00000000-0000-0000-0000-000000000001'
const asset=(name:string)=>`https://project.supabase.co/storage/v1/object/public/space-mestres/${owner}/${name}.png`
const input={userId:owner,clientRequestId:'00000000-0000-0000-0000-000000000002',selectionConfirmed:true,charge:true,
 request:{action:'swap_material' as const,sourceImageUrl:asset('source'),maskUrl:asset('mask'),instruction:'Paint panel navy',preservation:'maximum' as const,intensity:'standard' as const,edgeSoftness:'hard' as const,references:[]}}
const binding={sourceHash:'a'.repeat(64),maskHash:'b'.repeat(64),requestHash:'c'.repeat(64)}
const result:Awaited<ReturnType<EconomicDependencies['run']>>={buffer:Buffer.from('image'),binding,candidateHash:'d'.repeat(64),engine:'local_color',model:'local-linear-paint-v1',
 ledger:[{stage:'reader',provider:'openai',model:'gpt-6-luna',status:'completed',knownUsd:.001,reserveUsd:.004,requestId:'reader',durationMs:1},
 {stage:'judge',provider:'openai',model:'gpt-6-luna',status:'completed',knownUsd:.001,reserveUsd:.004,requestId:'judge',durationMs:1}],
 accountedUsd:.01,output:{width:100,height:100},verdict:{...binding,candidateHash:'d'.repeat(64),requestApplied:true,correctTarget:true,geometryPreserved:true,protectedPreserved:true,artifactFree:true,referenceFollowed:null,uncertain:false,evidence:{requestApplied:'panel blue',correctTarget:'same panel',geometryPreserved:'edges aligned',protectedPreserved:'handles preserved',artifactFree:'clean'}},metrics:{maskCoverage:.2,outsideChangedPixels:0}}

function dependencies(){
 const rpc=vi.fn().mockResolvedValueOnce({data:{state:'claimed',job_id:'job1'},error:null}).mockResolvedValue({data:{state:'completed',result_url:asset('result'),charged:true},error:null})
 const admin=vi.fn(()=>({rpc}) as unknown as SupabaseClient)
 const run=vi.fn<EconomicDependencies['run']>().mockResolvedValue(result)
 const upload=vi.fn().mockResolvedValue(asset('result'))
 return {admin,run,upload,rpc}
}
beforeEach(()=>{vi.stubEnv('EDIT_V4_ECONOMIC_PAID_CALLS','1');vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://project.supabase.co');vi.stubGlobal('fetch',vi.fn(()=>{throw Error('NO NETWORK')}))})
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()})
describe('economic delivery boundary with simulated database/provider dependencies',()=>{
 it('paid switch off means no database, provider, storage or billing',async()=>{
  vi.stubEnv('EDIT_V4_ECONOMIC_PAID_CALLS','0');const deps=dependencies(),r=await handleEconomicEdit(input,deps)
  expect(r.status).toBe(503);expect(deps.admin).not.toHaveBeenCalled();expect(deps.run).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled()
 })
 it('requires a confirmed selection, request id and owner-bound asset URLs',async()=>{
  for(const change of [{selectionConfirmed:false},{clientRequestId:null},{request:{...input.request,maskUrl:null}},{request:{...input.request,sourceImageUrl:asset('source').replace(owner,'another-owner')}}]){
   const deps=dependencies();expect((await handleEconomicEdit({...input,...change},deps)).status).toBe(400);expect(deps.admin).not.toHaveBeenCalled()
  }
 })
 it('an unavailable durable claim blocks the whole run',async()=>{
  const deps=dependencies();deps.rpc.mockReset().mockResolvedValue({data:null,error:{code:'PGRST202'}})
  expect((await handleEconomicEdit(input,deps)).status).toBe(503);expect(deps.run).not.toHaveBeenCalled();expect(deps.upload).not.toHaveBeenCalled()
 })
 it('replays completed jobs without generation, upload or debit',async()=>{
  const deps=dependencies();deps.rpc.mockReset().mockResolvedValue({data:{state:'completed',job_id:'job1',result_url:asset('result'),nodes_cost:10},error:null})
  const response=await handleEconomicEdit(input,deps),body=await response.json()
  expect(body).toMatchObject({replayed:true,nodes_cost:10,charge:{debited:false}});expect(deps.run).not.toHaveBeenCalled();expect(deps.rpc).toHaveBeenCalledTimes(1)
 })
 it('returns processing without an automatic retry, including an old unresolved job',async()=>{
  const deps=dependencies();deps.rpc.mockReset().mockResolvedValue({data:{state:'processing',job_id:'old-job'},error:null})
  const r=await handleEconomicEdit(input,deps);expect(r.status).toBe(409);expect((await r.json()).in_progress).toBe(true);expect(deps.run).not.toHaveBeenCalled()
 })
 it('publishes and completes atomically only after the final run approves',async()=>{
  const deps=dependencies(),response=await handleEconomicEdit(input,deps),body=await response.json()
  expect(body).toMatchObject({rejected:false,nodes_cost:10,charge:{debited:true}})
  expect(deps.rpc.mock.calls[1][0]).toBe('finish_edit_v4_economic');expect(deps.rpc.mock.calls[1][1]).toMatchObject({status_input:'completed',charge_input:true,proof_input:{approved:true}})
  expect(deps.run).toHaveBeenCalledTimes(1);expect(deps.upload).toHaveBeenCalledTimes(1)
 })
 it('does not charge, publish or return a rejected candidate',async()=>{
  const deps=dependencies();deps.run.mockRejectedValue(new EconomicEditError('visual_rejected','Review failed'))
  const response=await handleEconomicEdit(input,deps),body=await response.json()
  expect(response.status).toBe(422);expect(body.charge.debited).toBe(false);expect(body.result_url).toBeUndefined();expect(deps.upload).not.toHaveBeenCalled()
  expect(deps.rpc.mock.calls[1][1]).toMatchObject({status_input:'rejected',charge_input:false,result_url_input:null})
 })
 it('closes a confirmed insufficient-balance rollback without another debit attempt',async()=>{
  const deps=dependencies();deps.rpc.mockReset().mockResolvedValueOnce({data:{state:'claimed',job_id:'job1'},error:null}).mockResolvedValueOnce({data:null,error:{code:'P0001'}}).mockResolvedValueOnce({data:{state:'failed'},error:null})
  const response=await handleEconomicEdit(input,deps),body=await response.json()
  expect(response.status).toBe(402);expect(body.terminal).toBe(true);expect(body.result_url).toBeUndefined()
  expect(deps.rpc.mock.calls[2][1]).toMatchObject({status_input:'failed',charge_input:false,result_url_input:null})
  expect(deps.run).toHaveBeenCalledTimes(1)
 })
 it('keeps a lost completion response pending instead of running or billing twice',async()=>{
  const deps=dependencies();deps.rpc.mockReset().mockResolvedValueOnce({data:{state:'claimed',job_id:'job1'},error:null}).mockResolvedValueOnce({data:null,error:{code:'network'}})
  const response=await handleEconomicEdit(input,deps),body=await response.json()
  expect(response.status).toBe(503);expect(body.completion_pending).toBe(true);expect(body.result_url).toBeUndefined()
  expect(deps.rpc).toHaveBeenCalledTimes(2);expect(deps.run).toHaveBeenCalledTimes(1)
 })
 it('keeps an exception after submitting completion pending with the same request identity',async()=>{
  const deps=dependencies();deps.rpc.mockReset().mockResolvedValueOnce({data:{state:'claimed',job_id:'job1'},error:null}).mockRejectedValueOnce(new Error('Response lost after commit'))
  const response=await handleEconomicEdit(input,deps),body=await response.json()
  expect(response.status).toBe(503);expect(body.completion_pending).toBe(true);expect(body.terminal).not.toBe(true)
  expect(body.result_url).toBeUndefined();expect(deps.rpc).toHaveBeenCalledTimes(2);expect(deps.run).toHaveBeenCalledTimes(1)
 })
})

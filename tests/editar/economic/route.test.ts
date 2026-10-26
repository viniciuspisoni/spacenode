import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest'
import { NextRequest } from 'next/server'
const mocks=vi.hoisted(()=>({user:vi.fn(),handle:vi.fn(),admin:vi.fn()}))
vi.mock('@/lib/auth/request-user',()=>({getRequestUser:mocks.user}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:mocks.admin}))
vi.mock('@/lib/edit-v4/economic/handler',()=>({handleEconomicEdit:mocks.handle}))
import { POST } from '@/app/api/edit-v4/route'
import { ENGINES } from '@/lib/engines'
const owner='00000000-0000-0000-0000-000000000001'
const req=(body:unknown)=>new NextRequest('http://localhost/api/edit-v4',{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'}})
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('EDIT_V4_ENABLED','1');vi.stubEnv('EDIT_V4_ECONOMIC','1');vi.stubEnv('EDIT_V4_ECONOMIC_USERS',owner);vi.stubEnv('EDIT_V4_ECONOMIC_PAID_CALLS','0')
 vi.stubGlobal('fetch',vi.fn(()=>{throw Error('NO NETWORK')}));mocks.user.mockResolvedValue({user:{id:owner}})
 mocks.handle.mockResolvedValue(new Response(JSON.stringify({prepared:true})))
})
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()})
describe('actual /api/edit-v4 entry point (offline mocks)',()=>{
 it('quotes 10 Nodes for an allowlisted authenticated user without running anything',async()=>{
  const response=await POST(req({action:'swap_material',dry_run:true})),body=await response.json()
  expect(body).toMatchObject({valid:true,nodes_cost:10,execution_available:false,charge:{debited:false}})
  expect(mocks.admin).not.toHaveBeenCalled();expect(mocks.handle).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled()
 })
 it('refuses availability if a generation repricing makes ten Nodes exceed half',async()=>{
  const old=ENGINES.quasar.nodes['2k'];ENGINES.quasar.nodes['2k']=18
  try{
   const body=await (await POST(req({action:'remove',dry_run:true}))).json()
   expect(body.valid).toBe(false);expect(body.execution_available).toBe(false);expect(mocks.handle).not.toHaveBeenCalled()
  }finally{ENGINES.quasar.nodes['2k']=old}
 })
 it('keeps the feature isolated from users outside the internal cohort',async()=>{
  mocks.user.mockResolvedValue({user:{id:'another-user'}})
  const body=await (await POST(req({action:'remove',dry_run:true}))).json()
  expect(body.nodes_cost).toBe(18);expect(mocks.handle).not.toHaveBeenCalled()
 })
 it('rejects unauthenticated and disabled endpoint requests',async()=>{
  mocks.user.mockResolvedValue({user:null});expect((await POST(req({action:'remove',dry_run:true}))).status).toBe(401)
  vi.stubEnv('EDIT_V4_ENABLED','0');expect((await POST(req({action:'remove',dry_run:true}))).status).toBe(404)
  expect(mocks.handle).not.toHaveBeenCalled()
 })
 it('forwards exact source, selection, request id and verbatim prompt to the guarded economic handler',async()=>{
  await POST(req({action:'remove',source_image_url:'https://storage/source',mask_url:'https://storage/mask',instruction:'Retire só a bolsa e as alças.',selection_confirmed:true,client_request_id:owner,edge_softness:'soft'}))
  expect(mocks.handle).toHaveBeenCalledTimes(1);expect(mocks.handle.mock.calls[0][0]).toMatchObject({userId:owner,selectionConfirmed:true,clientRequestId:owner,request:{instruction:'Retire só a bolsa e as alças.',maskUrl:'https://storage/mask',preservation:'maximum',edgeSoftness:'hard'}})
  expect(mocks.admin).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled()
 })
 it('cannot silently switch the economic user to the Pro motor',async()=>{
  const response=await POST(req({action:'remove',source_image_url:'https://storage/source',instruction:'Remove bag',motor:'advanced'}))
  expect(response.status).toBe(400);expect(mocks.handle).not.toHaveBeenCalled()
 })
})

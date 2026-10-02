import {beforeEach,describe,expect,it,vi} from 'vitest'
import {createWhatsAppLink} from '../lib/customer-contact/whatsapp-link'
const mocks=vi.hoisted(()=>({contact:{whatsapp_e164:'+15550000002',support_opt_in:true},read:vi.fn(),admin:vi.fn()}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:mocks.admin}))
import {POST} from '../app/api/internal/whatsapp/link/route'
const secret='s'.repeat(64),key='k'.repeat(64),uid='11111111-1111-4111-8111-111111111111'
const request=(body:unknown,auth='Bearer '+key)=>new Request('https://spacenode.app/api/internal/whatsapp/link',{method:'POST',headers:{authorization:auth,'content-type':'application/json'},body:JSON.stringify(body)})
describe('Private WhatsApp linkage',()=>{
  beforeEach(()=>{
    vi.stubEnv('COMMERCIAL_PILOT_ENABLED','true');vi.stubEnv('COMMERCIAL_SOURCE_TOKEN',key);vi.stubEnv('COMMERCIAL_REF_SECRET',secret)
    mocks.contact={whatsapp_e164:'+15550000002',support_opt_in:true}
    mocks.read.mockReset().mockImplementation(async()=>({data:mocks.contact,error:null}))
    mocks.admin.mockReset().mockReturnValue({from:()=>({select:()=>({eq:()=>({maybeSingle:mocks.read})})})})
  })
  it('rejects unauthenticated requests before any database access',async()=>{
    expect((await POST(request({},'Bearer wrong'))).status).toBe(401)
    expect(mocks.admin).not.toHaveBeenCalled()
  })
  it('returns only the opaque reference after a valid confirmation',async()=>{
    const token=createWhatsAppLink(secret,uid,'+15550000002')
    const response=await POST(request({token,phone:'+15550000002'}))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({account_ref:expect.stringMatching(/^[a-f0-9]{64}$/),support_opt_in:true})
  })
  it('rejects a changed phone or revoked help preference',async()=>{
    const token=createWhatsAppLink(secret,uid,'+15550000002')
    mocks.contact.whatsapp_e164='+15550000003'
    expect((await POST(request({token,phone:'+15550000002'}))).status).toBe(403)
    mocks.contact.whatsapp_e164='+15550000002';mocks.contact.support_opt_in=false
    expect((await POST(request({token,phone:'+15550000002'}))).status).toBe(403)
  })
  it('fails closed on database errors and expired confirmations',async()=>{
    const token=createWhatsAppLink(secret,uid,'+15550000002')
    mocks.read.mockResolvedValue({data:null,error:{message:'private'}})
    expect((await POST(request({token,phone:'+15550000002'}))).status).toBe(503)
    const old=createWhatsAppLink(secret,uid,'+15550000002',Date.now()-600001)
    expect((await POST(request({token:old,phone:'+15550000002'}))).status).toBe(400)
  })
})

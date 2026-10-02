import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest'
import {createWhatsAppProgress} from '../lib/customer-contact/whatsapp-link'
const m=vi.hoisted(()=>({contact:{whatsapp_e164:'+15550000002',support_opt_in:true},profile:{stripe_customer_id:'cus_fixture',stripe_subscription_id:'sub_fixture'},invoice:{status:'paid',amount_paid:100,livemode:true,status_transitions:{paid_at:1790900000}},stripe:vi.fn(),admin:vi.fn(),broken:false}))
vi.mock('stripe',()=>({default:class {subscriptions={retrieve:m.stripe}}}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:m.admin}))
import {POST} from '../app/api/internal/whatsapp/progress/route'
const uid='11111111-1111-4111-8111-111111111111',secret='s'.repeat(64),key='k'.repeat(64)
const req=(handles:unknown,auth='Bearer '+key)=>new Request('https://spacenode.app/api/internal/whatsapp/progress',{method:'POST',headers:{authorization:auth,'content-type':'application/json'},body:JSON.stringify({handles})})
describe('Read-only WhatsApp progress',()=>{
  beforeEach(()=>{
    vi.stubEnv('COMMERCIAL_PILOT_ENABLED','true');vi.stubEnv('COMMERCIAL_SOURCE_TOKEN',key);vi.stubEnv('COMMERCIAL_REF_SECRET',secret)
    m.contact={whatsapp_e164:'+15550000002',support_opt_in:true};m.broken=false
    m.invoice={status:'paid',amount_paid:100,livemode:true,status_transitions:{paid_at:1790900000}}
    m.stripe.mockReset().mockImplementation(async()=>({customer:'cus_fixture',livemode:true,latest_invoice:m.invoice}))
    m.admin.mockReset().mockImplementation(()=>{
      const from=(name:string)=>{const chain:Record<string,unknown>={}
        for(const method of ['select','eq','in','or','order']) chain[method]=()=>chain
        chain.maybeSingle=async()=>({data:name==='customer_contacts'?m.contact:m.profile,error:m.broken?{}:null})
        chain.limit=async()=>({data:[{created_at:'2026-10-02T00:00:00Z'}],error:m.broken?{}:null})
        return chain
      };return {from,schema:()=>({from})}
    })
  })
  afterEach(()=>vi.unstubAllEnvs())
  const handle=()=>createWhatsAppProgress(secret,uid,'+15550000002')
  it('requires server authentication before data access',async()=>{expect((await POST(req([],''))).status).toBe(401);expect(m.admin).not.toHaveBeenCalled()})
  it('returns milestones without identity or billing identifiers',async()=>{
    const result=await (await POST(req([handle()]))).json();const item=result.results[0]
    expect(item.payment_state).toBe('paid_invoice');expect(item.first_render_at).toBeTruthy()
    for(const value of [uid,'15550000002','cus_fixture','sub_fixture']) expect(JSON.stringify(result)).not.toContain(value)
  })
  it('checks revoked or changed contact before product and billing reads',async()=>{
    m.contact.support_opt_in=false
    expect((await (await POST(req([handle()]))).json()).results[0].state).toBe('revoked');expect(m.stripe).not.toHaveBeenCalled()
    m.contact.support_opt_in=true;m.contact.whatsapp_e164='+15550000003'
    expect((await (await POST(req([handle()]))).json()).results[0].state).toBe('revoked')
  })
  it('does not count a zero-value invoice or a test subscription as payment',async()=>{
    m.invoice.amount_paid=0
    expect((await (await POST(req([handle()]))).json()).results[0].latest_paid_invoice_at).toBeNull()
    m.stripe.mockResolvedValue({customer:'cus_fixture',livemode:false,latest_invoice:m.invoice})
    expect((await (await POST(req([handle()]))).json()).results[0].payment_state).toBe('unavailable')
  })
  it('keeps unavailable Stripe readings distinct from unpaid',async()=>{
    m.stripe.mockRejectedValue(new Error('private provider body'))
    const item=(await (await POST(req([handle()]))).json()).results[0]
    expect(item.payment_state).toBe('unavailable');expect(item.latest_paid_invoice_at).toBeNull()
  })
  it('bounds requests and fails closed on storage errors',async()=>{
    expect((await POST(req(Array(11).fill(handle())))).status).toBe(400)
    m.broken=true;expect((await POST(req([handle()]))).status).toBe(503)
  })
})

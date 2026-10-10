import {describe,it,expect,vi,beforeEach} from 'vitest'
const m=vi.hoisted(()=>({staff:false,listError:false}))
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'internal-synthetic'}}})}})}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({})}))
vi.mock('@/lib/auth/privileged',()=>({isInternalStaff:async()=>m.staff}))
vi.mock('@/lib/nodi/flags',()=>({isNodiEnabled:()=>true}))
vi.mock('@/lib/nodi/tickets',()=>({listMyTickets:async()=>{if(m.listError)throw new Error('database timeout');return []},createTicket:vi.fn(),ticketPlainSummary:vi.fn()}))
vi.mock('@/lib/nodi/telemetry',()=>({logNodiEvent:vi.fn()}))
vi.mock('@/lib/rate-limit',()=>({rateLimit:vi.fn()}))
import {GET} from '@/app/api/nodi/tickets/route'
describe('handoff sintético sem banco real',()=>{
 beforeEach(()=>{m.staff=false;m.listError=false})
 it('staff gate bloqueia consulta alheia',async()=>{const r=await GET(new Request('https://synthetic.invalid/api/nodi/tickets?all=1'));expect(r.status).toBe(403)})
 it('lista vazia confirmada devolve vazio',async()=>{const r=await GET(new Request('https://synthetic.invalid/api/nodi/tickets'));expect(r.status).toBe(200);expect(await r.json()).toEqual({tickets:[]})})
 it('erro de banco devolve indisponibilidade sem lista falsa ou detalhes internos',async()=>{m.listError=true;const r=await GET(new Request('https://synthetic.invalid/api/nodi/tickets'));expect(r.status).toBe(503);const body=await r.json();expect(body.error).toContain('consultar');expect(body).not.toHaveProperty('tickets');expect(JSON.stringify(body)).not.toContain('database timeout')})
})

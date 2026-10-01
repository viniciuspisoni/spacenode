import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({admin:vi.fn()}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:mocks.admin}))
import { GET } from '@/app/api/internal/commercial/snapshot/route'
beforeEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks()})
describe('commercial snapshot authorization',()=>{
 it('stays disabled without explicit configuration',async()=>{
  expect((await GET(new Request('https://spacenode.app/api/internal/commercial/snapshot'))).status).toBe(503)
  expect(mocks.admin).not.toHaveBeenCalled()
 })
 it('rejects missing and invalid keys before any customer read',async()=>{
  vi.stubEnv('COMMERCIAL_PILOT_ENABLED','true');vi.stubEnv('COMMERCIAL_SOURCE_TOKEN','a'.repeat(64));vi.stubEnv('COMMERCIAL_REF_SECRET','b'.repeat(64))
  for (const authorization of ['', 'Bearer wrong','Bearer '+'é'.repeat(64)]) {
   expect((await GET(new Request('https://spacenode.app/api/internal/commercial/snapshot',{headers:{authorization}}))).status).toBe(401)
  }
  expect(mocks.admin).not.toHaveBeenCalled()
 })
 it('returns sanitized failure instead of database details',async()=>{
  vi.stubEnv('COMMERCIAL_PILOT_ENABLED','true');vi.stubEnv('COMMERCIAL_SOURCE_TOKEN','a'.repeat(64));vi.stubEnv('COMMERCIAL_REF_SECRET','b'.repeat(64))
  mocks.admin.mockImplementation(()=>{throw new Error('private customer email and secret')})
  const response=await GET(new Request('https://spacenode.app/api/internal/commercial/snapshot',{headers:{authorization:'Bearer '+'a'.repeat(64)}}))
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({error:'Snapshot unavailable; retry before review'})
  expect(response.headers.get('cache-control')).toBe('no-store')
 })
})

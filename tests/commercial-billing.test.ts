import { describe, expect, it } from 'vitest'
import { checkoutBilling } from '@/lib/commercial/billing'
const now=new Date('2026-10-01T12:00:00Z'), observed='2026-10-01T10:00:00Z'
const session={metadata:{user_id:'test-user'},mode:'subscription' as const,livemode:true,payment_status:'unpaid' as const,status:'open' as const}
describe('Stripe checkout reconciliation',()=>{
 it('accepts only a live subscription checkout owned by the same user',()=>{
  expect(checkoutBilling(session,'test-user',observed,now)).toEqual({paid:false,pending:true})
  for(const changed of [{...session,livemode:false},{...session,metadata:{user_id:'other'}}]){
   expect(()=>checkoutBilling(changed,'test-user',observed,now)).toThrow('Checkout mismatch')
  }
 })
 it('stops recovery when paid or no payment is required',()=>{
  for(const status of ['paid','no_payment_required'] as const){
   expect(checkoutBilling({...session,payment_status:status},'test-user',observed,now)).toEqual({paid:true,pending:false})
  }
 })
 it('does not recover expired, completed-unpaid, recent or stale sessions',()=>{
  for(const status of ['expired','complete'] as const){
   expect(checkoutBilling({...session,status},'test-user',observed,now).pending).toBe(false)
  }
  for(const at of ['2026-10-01T11:59:00Z','2026-09-29T10:00:00Z','invalid']){
   expect(checkoutBilling(session,'test-user',at,now).pending).toBe(false)
  }
 })
})

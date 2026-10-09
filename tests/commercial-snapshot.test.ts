import { describe, it, expect } from 'vitest'
import { buildSnapshot, type Evidence } from '@/lib/commercial/snapshot'
const now=new Date('2026-10-01T12:00:00Z'), key='a'.repeat(64)
function source():Evidence { return {profiles:[{id:'user-private',created_at:'2026-09-29T12:00:00Z',plan:'free',stripe_subscription_id:null}],
  contacts:[{user_id:'user-private',support_opt_in:true,marketing_opt_in:true}],events:[],completedUsers:new Set(),
  openTicketUsers:new Set(),stripeGrantUsers:new Set(),billing:new Map()} }
describe('commercial normalized snapshot',()=>{
 it('exports only opaque references and blocks proactive contact without history',()=>{
  const snapshot=buildSnapshot(source(),key,now)
  expect(JSON.stringify(snapshot)).not.toContain('user-private')
  expect(snapshot.accounts[0].ref).toMatch(/^[a-f0-9]{64}$/)
  expect(snapshot.accounts[0].do_not_contact).toBe(true)
  expect(snapshot.events[0].kind).toBe('signup_without_value')
  expect(buildSnapshot(source(),key,now)).toEqual(snapshot)
 })
 it('never infers consent from legacy profile or completed generation',()=>{
  const data=source();data.contacts=[];data.completedUsers.add('user-private')
  const snapshot=buildSnapshot(data,key,now)
  expect(snapshot.accounts[0]).toMatchObject({support_opt_in:false,marketing_opt_in:false,first_value:false,activation_eligible:false})
  expect(snapshot.events).toEqual([])
 })
 it('does not infer useful value from approval while checkout remains reconciled',()=>{
  const data=source();data.events=[{id:'approval',user_id:'user-private',event_type:'result_approved',occurred_at:now.toISOString(),created_at:now.toISOString(),dedupe_key:null},
   {id:'checkout',user_id:'user-private',event_type:'checkout_started',occurred_at:now.toISOString(),created_at:now.toISOString(),dedupe_key:'checkout:cs_test'}]
  data.billing.set('user-private',{paid:true,pending:false})
  const snapshot=buildSnapshot(data,key,now)
  expect(snapshot.accounts[0]).toMatchObject({state:'paid',first_value:false,activation_eligible:true})
  expect(snapshot.events.map(e=>e.kind)).toEqual(['signup_without_value'])
 })
 it('requires explicit usefulness and confirmed output for first value',()=>{
  const data=source();data.usefulUsers=new Set(['user-private'])
  expect(buildSnapshot(data,key,now).accounts[0].first_value).toBe(false)
  data.completedUsers.add('user-private')
  expect(buildSnapshot(data,key,now).accounts[0]).toMatchObject({first_value:true,activation_eligible:false})
  expect(buildSnapshot(data,key,now).events).toEqual([])
 })
 it('holds an orphan first_generation without claiming useful value',()=>{
  const data=source();data.unknownActivationUsers=new Set(['user-private'])
  const snapshot=buildSnapshot(data,key,now)
  expect(snapshot.accounts[0]).toMatchObject({first_value:false,activation_eligible:false})
  expect(snapshot.events).toEqual([])
 })
 it('omits internal actors from accounts and proposed events',()=>{
  const data=source();data.internalUsers=new Set(['user-private'])
  expect(buildSnapshot(data,key,now)).toMatchObject({accounts:[],events:[]})
 })
 it('requires reconciled pending checkout instead of a tracking event alone',()=>{
  const data=source();data.contacts[0].support_opt_in=false
  data.events=[{id:'checkout',user_id:'user-private',event_type:'checkout_started',occurred_at:now.toISOString(),created_at:now.toISOString(),dedupe_key:'checkout:cs_test'}]
  expect(buildSnapshot(data,key,now).events).toEqual([])
  data.billing.set('user-private',{paid:false,pending:true})
  expect(buildSnapshot(data,key,now).events[0].kind).toBe('checkout_pending')
 })
 it('holds recovery after a local Stripe grant even if the session is unpaid',()=>{
  const data=source();data.stripeGrantUsers.add('user-private')
  expect(buildSnapshot(data,key,now).accounts[0].state).toBe('paid')
 })
})


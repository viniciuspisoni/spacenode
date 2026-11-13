import { describe,it,expect,vi } from 'vitest'
import { EditLedger } from '@/lib/edit-v4/economic/ledger'
import { EXTRA_VARIABLE_RESERVE_USD,INFRA_RESERVE_USD,MAX_USEFUL_PROCESSING_USD,economicMargin,ECONOMIC_TARGET_MARGIN } from '@/lib/edit-v4/economic/policy'
describe('cost of complete attempts including failures',()=>{
 it('durably reserves before a paid call and keeps all stages plus infrastructure',async()=>{
  const order:string[]=[];const ledger=new EditLedger(async entries=>{order.push(entries.at(-1)!.status)})
  await ledger.run('reader','openai','luna',async()=>{order.push('paid');return {value:1,usd:.002,requestId:'r'}})
  expect(order).toEqual(['started','paid','completed'])
  expect(ledger.accountedUsd).toBeCloseTo(.002+INFRA_RESERVE_USD+EXTRA_VARIABLE_RESERVE_USD,12)
  expect(economicMargin(MAX_USEFUL_PROCESSING_USD)).toBeCloseTo(ECONOMIC_TARGET_MARGIN,12)
 })
 it('never executes when the reservation cannot persist',async()=>{
  const paid=vi.fn();const ledger=new EditLedger(async()=>{throw Error('database down')})
  await expect(ledger.run('reader','openai','luna',paid)).rejects.toThrow();expect(paid).not.toHaveBeenCalled()
 })
 it('retains nonzero cost for unknown provider failures',async()=>{
  const ledger=new EditLedger(async()=>{})
  await expect(ledger.run('editor','ark','flash',async()=>{throw Error('timeout')})).rejects.toThrow()
  expect(ledger.entries[0]).toMatchObject({status:'failed',knownUsd:null,reserveUsd:.018})
  expect(ledger.accountedUsd).toBeGreaterThan(.018)
  await expect(ledger.run('editor','ark','flash',async()=>({value:1,usd:.018,requestId:null}))).rejects.toThrow()
 })
 it.each([null,NaN,-1,Infinity,.5])('blocks incomplete or over-cap cost %s without a next paid step',async usd=>{
  const ledger=new EditLedger(async()=>{})
  await expect(ledger.run('reader','openai','luna',async()=>({value:1,usd,requestId:null}))).rejects.toThrow()
  expect(ledger.entries).toHaveLength(1)
 })
})

import { describe,it,expect } from 'vitest'
import { localColorEligible,parsePlan,parseVerdict,requireApproved } from '@/lib/edit-v4/economic/contracts'
import { prepareEditAttempt,retainEditAttempt } from '@/lib/edit-v4/client-request'
import { parseStrictSemantics } from '@/lib/edit-v4/semantic-gate'
const binding={sourceHash:'source',maskHash:'mask',requestHash:'request'}
const plan={...binding,action:'swap_material',target:'three drawer fronts',instructionEn:'paint navy',preserve:['handles'],ambiguous:false,selectionCoversTarget:true,protectedExcluded:true,operation:'recolor_existing',sameMaterial:true,finishCompatible:true,palette:'navy',evidence:'Three fronts left of dishwasher; handles excluded.'}
const evidence=Object.fromEntries(['requestApplied','correctTarget','geometryPreserved','protectedPreserved','artifactFree'].map(x=>[x,'Localized evidence']))
const verdict={...binding,candidateHash:'candidate',requestApplied:true,correctTarget:true,geometryPreserved:true,protectedPreserved:true,artifactFree:true,referenceFollowed:null,uncertain:false,evidence}
describe('bound source-only color and strict visual review',()=>{
 it('accepts complete bound recoloring only for existing material',()=>{
  const p=parsePlan(plan,binding,'swap_material');expect(localColorEligible(p,0)).toBe(true)
  for(const other of [{sameMaterial:false},{finishCompatible:false},{operation:'edit' as const},{action:'remove' as const}])expect(localColorEligible({...p,...other},0)).toBe(false)
  expect(localColorEligible(p,1)).toBe(false)
 })
 it.each(['sourceHash','maskHash','requestHash'])('rejects stale %s before editing',key=>expect(()=>parsePlan({...plan,[key]:'old'},binding,'swap_material')).toThrow())
 it.each([{},null,{...plan,selectionCoversTarget:false},{...plan,protectedExcluded:false},{...plan,ambiguous:true},{...plan,palette:'black'},{...plan,preserve:[]}])('rejects incomplete/ambiguous/ineligible plan',p=>expect(()=>parsePlan(p,binding,'swap_material')).toThrow())
 it('does not accept generic success, a stale candidate, uncertainty or wrong geometry',()=>{
  const bound={...binding,candidateHash:'candidate'}
  expect(()=>requireApproved(parseVerdict(verdict,bound,false),false)).not.toThrow()
  for(const v of [{},{...verdict,candidateHash:'old'},{...verdict,evidence:{}},{...verdict,referenceFollowed:undefined}])expect(()=>parseVerdict(v,bound,false)).toThrow()
  for(const v of [{...verdict,geometryPreserved:false},{...verdict,uncertain:true},{...verdict,correctTarget:false}])expect(()=>requireApproved(parseVerdict(v,bound,false),false)).toThrow()
  expect(()=>parseVerdict(verdict,bound,true)).toThrow()
 })
 it('legacy V4 cannot pass empty, partial or missing-reference JSON',()=>{
  expect(parseStrictSemantics({},false).pass).toBe(false)
  expect(parseStrictSemantics({change_applied:true},false).pass).toBe(false)
  const v={change_applied:true,geometry_preserved:true,unrequested_changes:false,artifacts:false,reference_followed:null}
  expect(parseStrictSemantics(v,false).pass).toBe(true)
  expect(parseStrictSemantics(v,true).pass).toBe(false)
  expect(parseStrictSemantics({...v,geometry_preserved:false},false).pass).toBe(false)
 })
 it('retains exact uploaded URLs and id after a lost response; changed edit gets a new id',()=>{
  const first=prepareEditAttempt(null,'intent1',{mask_url:'mask1'},()=> 'uuid1')
  expect(prepareEditAttempt(first,'intent1',{mask_url:'mask2'},()=> 'uuid2')).toBe(first)
  expect(prepareEditAttempt(first,'intent2',{mask_url:'mask2'},()=> 'uuid2').body.client_request_id).toBe('uuid2')
  expect(retainEditAttempt(503,null)).toBe(true);expect(retainEditAttempt(409,{terminal:true})).toBe(false)
  expect(retainEditAttempt(200,null)).toBe(false)
 })
})

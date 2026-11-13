import { afterEach,beforeEach,describe,it,expect,vi } from 'vitest'
import sharp from 'sharp'
import type { EditV4Request } from '@/lib/edit-v4/types'
import { runEconomicEdit,type EconomicAdapters } from '@/lib/edit-v4/economic/runner'
import { assertOutsideUnchanged,decodeRgb,maskPng } from '@/lib/edit-v4/economic/pixels'
const request:EditV4Request={action:'swap_material',sourceImageUrl:'data:image/png;base64,source',maskUrl:'data:image/png;base64,mask',instruction:'Pinte só o painel de azul-marinho e preserve os puxadores.',preservation:'maximum',intensity:'standard',edgeSoftness:'hard',references:[]}
const dims={width:96,height:80};const mask=Uint8Array.from({length:96*80},(_,i)=>i%96>=28&&i%96<68&&Math.floor(i/96)>=20&&Math.floor(i/96)<60?1:0)
async function fixture({local=true,reject=false,ambiguous=false,unknownCost=false}:{local?:boolean;reject?:boolean;ambiguous?:boolean;unknownCost?:boolean}={}){
 const source=await sharp({create:{...dims,channels:3,background:'#ae9983'}}).png().toBuffer(),selection=await maskPng(mask,dims.width,dims.height)
 const vision=vi.fn<EconomicAdapters['vision']>().mockImplementation(async input=>{
  const b=input.payload
  if(input.name==='spacenode_edit_plan')return {value:{...b,target:'panel',instructionEn:'Paint only the panel navy.',preserve:['handles','adjacent wall'],ambiguous,selectionCoversTarget:true,protectedExcluded:true,operation:local?'recolor_existing':'edit',sameMaterial:true,finishCompatible:true,palette:local?'navy':null,evidence:'Panel selection excludes adjacent wall.'},usd:unknownCost?null:.001,requestId:'reader'}
  return {value:{...b,requestApplied:!reject,correctTarget:true,geometryPreserved:true,protectedPreserved:true,artifactFree:true,referenceFollowed:null,uncertain:false,evidence:{requestApplied:'Panel navy; handles unchanged',correctTarget:'Same panel',geometryPreserved:'All edges align',protectedPreserved:'Wall and handles unchanged',artifactFree:'No seams'}},usd:.001,requestId:'judge'}
 })
 const flash=vi.fn<EconomicAdapters['flash']>().mockImplementation(async ({image})=>{
  const meta=await sharp(image).metadata();return {value:await sharp({create:{width:meta.width!,height:meta.height!,channels:3,background:'#223366'}}).png().toBuffer(),usd:.018,requestId:'flash'}
 })
 const fetchImage=vi.fn<EconomicAdapters['fetchImage']>().mockImplementation(async url=>url===request.sourceImageUrl?source:selection)
 return {source,vision,flash,fetchImage}
}
beforeEach(()=>vi.stubGlobal('fetch',vi.fn(()=>{throw Error('NO NETWORK IN OFFLINE TESTS')})))
afterEach(()=>vi.unstubAllGlobals())
describe('full economic edit runner with real pixels and simulated providers',()=>{
 it('uses source-only color, runs independent final review and skips the editor',async()=>{
  const a=await fixture(),checkpoints:unknown[]=[]
  const result=await runEconomicEdit({request,checkpoint:async e=>{checkpoints.push(structuredClone(e))}},a)
  expect(result.engine).toBe('local_color');expect(a.flash).not.toHaveBeenCalled();expect(a.vision).toHaveBeenCalledTimes(2)
  expect(result.ledger.map(e=>e.stage)).toEqual(['reader','judge']);expect(checkpoints).toHaveLength(4)
  assertOutsideUnchanged(await decodeRgb(a.source),await decodeRgb(result.buffer),mask)
  const judge=a.vision.mock.calls[1][0];expect(judge.images[1]).toEqual(result.buffer);expect(judge.payload.requestVerbatim).toBe(request.instruction)
  expect(fetch).not.toHaveBeenCalled()
 })
 it('calls Flash exactly once for a nonlocal edit and preserves every outside pixel',async()=>{
  const a=await fixture({local:false});const result=await runEconomicEdit({request,checkpoint:async()=>{}},a)
  expect(result.engine).toBe('flash');expect(a.flash).toHaveBeenCalledTimes(1);expect(result.ledger).toHaveLength(3)
  expect(a.flash.mock.calls[0][0].prompt).toContain(request.instruction)
  assertOutsideUnchanged(await decodeRgb(a.source),await decodeRgb(result.buffer),mask)
 })
 it('rejects a bad local result without a paid fallback',async()=>{
  const a=await fixture({reject:true})
  await expect(runEconomicEdit({request,checkpoint:async()=>{}},a)).rejects.toMatchObject({code:'visual_rejected'})
  expect(a.flash).not.toHaveBeenCalled();expect(a.vision).toHaveBeenCalledTimes(2)
 })
 it('rejects wrong mask interpretation and unknown reader cost before editing',async()=>{
  for(const f of [{ambiguous:true},{local:false,unknownCost:true}]){
   const a=await fixture(f);await expect(runEconomicEdit({request,checkpoint:async()=>{}},a)).rejects.toThrow()
   expect(a.flash).not.toHaveBeenCalled();expect(a.vision).toHaveBeenCalledTimes(1)
  }
 })
 it('cannot deliver when the judge is unavailable; records its nonzero reservation',async()=>{
  const a=await fixture({local:false}),snapshots:unknown[][]=[]
  a.vision.mockImplementationOnce(async input=>({value:{...input.payload,target:'panel',instructionEn:'Paint navy.',preserve:['wall'],ambiguous:false,selectionCoversTarget:true,protectedExcluded:true,operation:'edit',sameMaterial:false,finishCompatible:false,palette:null,evidence:'Panel'},usd:.001,requestId:'reader'})).mockRejectedValueOnce(Error('judge unavailable'))
  await expect(runEconomicEdit({request,checkpoint:async e=>{snapshots.push(structuredClone(e))}},a)).rejects.toThrow('judge unavailable')
  expect(snapshots.at(-1)!.at(-1)).toMatchObject({stage:'judge',status:'failed',knownUsd:null,reserveUsd:.004})
  expect(a.flash).toHaveBeenCalledTimes(1)
 })
})

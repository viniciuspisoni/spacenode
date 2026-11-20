import sharp from 'sharp'
import { observeCall, type CostObserver } from '@/lib/costs/instrument'
import type { EditV4Request } from '../types'
import { normalizeSourceImage } from '@/lib/storage/normalize-image'
import { assertSafeImageUrl } from '@/lib/edit-v3/ssrf'
import { fetchStorageBuffer } from '@/lib/storage/fetch'
import { digest, EconomicEditError, localColorEligible, parsePlan, parseVerdict, requireApproved } from './contracts'
import { EditLedger, type CostEntry } from './ledger'
import { assertOutsideUnchanged, compose, contextRect, decodeMask, decodeRgb, encode, maskBounds, maskPng, recolor } from './pixels'
import { callFlash, callVision, editorPrompt, FLASH_MODEL, JUDGE_SYSTEM, PLAN_SCHEMA, READER_MODEL, READER_SYSTEM, VERDICT_SCHEMA } from './providers'
export interface EconomicAdapters {
  fetchImage: typeof fetchStorageBuffer; vision: typeof callVision; flash: typeof callFlash
}
const live: EconomicAdapters={fetchImage:fetchStorageBuffer,vision:callVision,flash:callFlash}
export async function runEconomicEdit(input:{request:EditV4Request;checkpoint:(entries:CostEntry[])=>Promise<void>;observe?:CostObserver},adapters:EconomicAdapters=live){
  const r=input.request
  if(!r.maskUrl||!r.instruction.trim())throw new EconomicEditError('selection_required','Marque a área e descreva a alteração para usar este motor.')
  for(const url of [r.sourceImageUrl,r.maskUrl,...r.references.map(x=>x.url)])assertSafeImageUrl(url)
  const normalized=await normalizeSourceImage(await adapters.fetchImage(r.sourceImageUrl),{maxLongSide:null,maxBytes:Number.MAX_SAFE_INTEGER})
  const source=await decodeRgb(normalized.buffer);const sourcePng=await encode(source)
  const mask=await decodeMask(await adapters.fetchImage(r.maskUrl),source.width,source.height)
  const box=maskBounds(mask,source.width,source.height),region=contextRect(box,source.width,source.height)
  const selection=await maskPng(mask,source.width,source.height)
  const detail=await sharp(sourcePng).extract(region).png().toBuffer()
  const refs=await Promise.all(r.references.map(async ref=>{
    const img=await normalizeSourceImage(await adapters.fetchImage(ref.url),{maxLongSide:2048,maxBytes:8*1024*1024})
    return sharp(img.buffer).png().toBuffer()
  }))
  const binding={sourceHash:digest(Buffer.from(source.rgb)),maskHash:digest(Buffer.from(mask)),
    requestHash:digest(JSON.stringify({action:r.action,instruction:r.instruction,references:refs.map(digest)}))}
  const ledger=new EditLedger(input.checkpoint)
  const rawPlan=await ledger.run('reader','openai',READER_MODEL,()=>observeCall(input.observe,{provider:'openai',endpoint:READER_MODEL+'-reader',context:'edit-v4-economic'},()=>adapters.vision({system:READER_SYSTEM,
    payload:{...binding,action:r.action,requestVerbatim:r.instruction,maskBounds:box,sourceDimensions:{width:source.width,height:source.height}},
    images:[sourcePng,selection,detail,...refs],schema:PLAN_SCHEMA,name:'spacenode_edit_plan'}),out=>({usd:out.usd,requestId:out.requestId})))
  const plan=parsePlan(rawPlan,binding,r.action)
  let candidate;let engine:'local_color'|'flash'='flash'
  // No fallback after local rejection: a second paid edit would require a new request and budget.
  if(localColorEligible(plan,refs.length)){
    candidate=recolor(source,mask,plan.palette!);engine='local_color'
  }else{
    // Coordinates describe the exact mask bounds inside this clean context crop; no painted marker.
    const coords={left:box.left-region.left,top:box.top-region.top,width:box.width,height:box.height}
    const generated=await ledger.run('editor','ark',FLASH_MODEL,()=>observeCall(input.observe,{provider:'ark',endpoint:FLASH_MODEL,context:'edit-v4-economic'},()=>adapters.flash({image:detail,references:refs,
      prompt:editorPrompt(binding,r.instruction,plan,coords)}),out=>({usd:out.usd,requestId:out.requestId})))
    candidate=await compose(source,mask,generated,region,r.action==='remove'||r.action==='refine_area')
  }
  assertOutsideUnchanged(source,candidate,mask)
  let changed=0,total=0
  for(let i=0;i<mask.length;i++)if(mask[i]){total++;if([0,1,2].some(c=>Math.abs(source.rgb[i*3+c]-candidate.rgb[i*3+c])>3))changed++}
  if(changed/total<.005)throw new EconomicEditError('no_change','A alteração solicitada não ficou visível. Nenhum node foi consumido.')
  const result=await encode(candidate),candidateHash=digest(result)
  // Check the final saved PNG, not a pre-composition provider output.
  assertOutsideUnchanged(source,await decodeRgb(result),mask)
  const finalDetail=await sharp(result).extract(region).png().toBuffer()
  const rawVerdict=await ledger.run('judge','openai',READER_MODEL,()=>observeCall(input.observe,{provider:'openai',endpoint:READER_MODEL+'-judge',context:'edit-v4-economic'},()=>adapters.vision({system:JUDGE_SYSTEM,
    payload:{...binding,candidateHash,requestVerbatim:r.instruction,action:r.action,target:plan.target,preserve:plan.preserve,hasReference:refs.length>0},
    images:[sourcePng,result,selection,detail,finalDetail,...refs],schema:VERDICT_SCHEMA,name:'spacenode_edit_verdict'}),out=>({usd:out.usd,requestId:out.requestId})))
  const verdict=parseVerdict(rawVerdict,{...binding,candidateHash},refs.length>0);requireApproved(verdict,refs.length>0)
  return {buffer:result,binding,candidateHash,engine,model:engine==='flash'?FLASH_MODEL:'local-linear-paint-v1',
    ledger:ledger.entries,accountedUsd:ledger.accountedUsd,output:{width:source.width,height:source.height},verdict,
    metrics:{maskCoverage:mask.reduce((a,b)=>a+b,0)/mask.length,outsideChangedPixels:0}}
}

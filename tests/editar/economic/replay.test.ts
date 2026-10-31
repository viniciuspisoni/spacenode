import { readFileSync,writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe,it,expect } from 'vitest'
import { decodeMask,decodeRgb,recolor,assertOutsideUnchanged } from '@/lib/edit-v4/economic/pixels'
import { PALETTES,type Palette } from '@/lib/edit-v4/economic/policy'
const root=process.env.EDIT_OFFLINE_REPLAY_ROOT
/** Optional regression against the already-paid immutable local benchmark; no network or credentials. */
describe.skipIf(!root)('port regression against frozen source-only color images',()=>{
 it('matches all eight selected saved outputs within one sRGB quantization level and exact outside pixels',async()=>{
  const base=path.join(root!,'output/editar-flash-v4-2026-10-23')
  const rows=JSON.parse(readFileSync(path.join(base,'REPLAY.json'),'utf8')).records.filter((r:{route:string})=>r.route==='local_color')
  const metrics=[]
  for(const r of rows){
   const source=await decodeRgb(readFileSync(path.join(root!,r.sourcePath)))
   const mask=await decodeMask(readFileSync(path.join(root!,r.maskPath)),source.width,source.height)
   const fixed=Object.entries(PALETTES).find(([,rgb])=>JSON.stringify(rgb)===JSON.stringify(r.palette.rgb))![0] as Palette
   const candidate=recolor(source,mask,fixed),saved=await decodeRgb(readFileSync(path.join(root!,r.candidatePath)))
   assertOutsideUnchanged(source,candidate,mask)
   let max=0,changed=0,total=0
   for(let i=0;i<candidate.rgb.length;i++){const d=Math.abs(candidate.rgb[i]-saved.rgb[i]);max=Math.max(max,d);if(d>0)changed++;total++}
   expect(max).toBeLessThanOrEqual(1)
   metrics.push({id:r.id,maximumChannelDifference:max,differentChannels:changed,totalChannels:total,outsideChangedPixels:0,paidCalls:0})
  }
  expect(rows).toHaveLength(8)
  if(process.env.EDIT_OFFLINE_REPLAY_REPORT)writeFileSync(process.env.EDIT_OFFLINE_REPLAY_REPORT,JSON.stringify({date:'2026-10-26',kind:'pixel_port_regression_not_new_semantic_evaluation',distinctTasks:4,outputs:8,newPaidCalls:0,metrics},null,2)+'\n')
 },30000)
})

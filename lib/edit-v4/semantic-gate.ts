/** Strict V4 verifier. V2's legacy best-effort behavior is deliberately not reused. */
import { geminiMultiVisionJson } from '@/lib/gemini'
import type { EditIntentV2 } from '@/lib/edit-v2/types'
export function parseStrictSemantics(raw:unknown,hasReference:boolean):{pass:boolean;reasons:string[]}{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return {pass:false,reasons:['incomplete_review']}
  const p=raw as Record<string,unknown>
  const keys=['change_applied','geometry_preserved','unrequested_changes','artifacts']
  if(keys.some(k=>typeof p[k]!=='boolean')||(hasReference?typeof p.reference_followed!=='boolean':p.reference_followed!==null))return {pass:false,reasons:['incomplete_review']}
  const reasons=[]
  if(!p.change_applied)reasons.push('change_not_applied')
  if(!p.geometry_preserved)reasons.push('geometry_altered')
  if(p.unrequested_changes)reasons.push('unrequested_changes')
  if(p.artifacts)reasons.push('artifacts')
  if(hasReference&&!p.reference_followed)reasons.push('reference_not_followed')
  return {pass:reasons.length===0,reasons}
}
export async function evaluateEditSemantics(opts:{originalUrl:string;editedUrl:string;referenceUrl?:string|null;instructionEn:string;intent:EditIntentV2;enabled:boolean;timeoutMs?:number}){
  if(!opts.enabled)return {pass:false,reasons:['review_disabled'],skipped:true}
  try{
    const raw=await geminiMultiVisionJson({
      system:'Strict architectural edit inspector. Compare original and edited image against the original request. Preserve geometry, target and all unrequested details. Return all requested JSON fields explicitly; never assume missing information means success.',
      user:JSON.stringify({instruction:opts.instructionEn,action:opts.intent,hasReference:!!opts.referenceUrl,
        expected_json:{change_applied:'boolean',geometry_preserved:'boolean',unrequested_changes:'boolean',artifacts:'boolean',reference_followed:opts.referenceUrl?'boolean':'null'}}),
      imageUrls:[opts.originalUrl,opts.editedUrl,...(opts.referenceUrl?[opts.referenceUrl]:[])],temperature:.1,maxTokens:500,timeoutMs:opts.timeoutMs??20_000,
    })
    return {...parseStrictSemantics(JSON.parse(raw),!!opts.referenceUrl),skipped:false}
  }catch{return {pass:false,reasons:['review_unavailable'],skipped:true}}
}

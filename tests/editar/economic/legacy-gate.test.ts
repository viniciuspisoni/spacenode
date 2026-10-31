import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest'
import sharp from 'sharp'
const mocks=vi.hoisted(()=>({engine:vi.fn(),gate:vi.fn()}))
vi.mock('@/lib/edit-v4/engine',async original=>({...await original<typeof import('@/lib/edit-v4/engine')>(),runSeedreamEdit:mocks.engine}))
vi.mock('@/lib/edit-v4/semantic-gate',()=>({evaluateEditSemantics:mocks.gate}))
import { runEditV4 } from '@/lib/edit-v4/pipeline'
beforeEach(()=>{
 vi.clearAllMocks();const native=globalThis.fetch
 vi.stubGlobal('fetch',((input:RequestInfo|URL,init?:RequestInit)=>{
  if(String(input).startsWith('data:image/'))return native(input,init)
  throw Error('NO EXTERNAL NETWORK IN TEST')
 }) as typeof fetch)
})
afterEach(()=>vi.unstubAllGlobals())
describe('legacy V4 semantic failure blocks delivery even with a selection',()=>{
 it.each([{pass:false,reasons:['geometry_altered'],skipped:false},{pass:false,reasons:['review_unavailable'],skipped:true},{pass:true,reasons:[],skipped:true}])('never returns an unverified selected result',async verdict=>{
  const source=await sharp({create:{width:96,height:80,channels:3,background:'#aaaaaa'}}).png().toBuffer()
  const edited=await sharp({create:{width:96,height:80,channels:3,background:'#2244aa'}}).png().toBuffer()
  const rawMask=new Uint8Array(96*80);for(let y=25;y<55;y++)for(let x=30;x<65;x++)rawMask[y*96+x]=255
  const mask=await sharp(Buffer.from(rawMask),{raw:{width:96,height:80,channels:1}}).png().toBuffer()
  const data=(b:Buffer)=>'data:image/png;base64,'+b.toString('base64')
  mocks.engine.mockResolvedValue({imageRef:data(edited),provider:'ark',model:'seedream-5-pro-edit',requestId:'mock',durationMs:1,outputWidth:96,outputHeight:80,costUsd:.045,usedFallback:false})
  mocks.gate.mockResolvedValue(verdict)
  const r=await runEditV4({request:{action:'swap_material',sourceImageUrl:data(source),maskUrl:data(mask),instruction:'Paint panel blue',preservation:'maximum',intensity:'standard',edgeSoftness:'hard',references:[]},instructionEn:'Paint panel blue',primaryRoute:'ark',drawOutline:false,semanticGate:true,uploadAsset:async b=>data(b)})
  expect(r.rejected).toBe(true);expect(r.resultUrl).toBe(null);expect(r.rejectReasons.some(x=>x.startsWith('semantic_'))).toBe(true)
  expect(mocks.engine).toHaveBeenCalledTimes(1)
 })
})

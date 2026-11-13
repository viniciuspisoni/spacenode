import { describe,it,expect } from 'vitest'
import sharp from 'sharp'
import { assertOutsideUnchanged,compose,decodeMask,decodeRgb,encode,maskPng,recolor,poisson,type Pixels } from '@/lib/edit-v4/economic/pixels'
const source=():Pixels=>({width:80,height:70,rgb:Uint8Array.from({length:80*70*3},(_,i)=>80+(i*17%100))})
const mask=()=>Uint8Array.from({length:80*70},(_,i)=>i%80>=20&&i%80<60&&Math.floor(i/80)>=15&&Math.floor(i/80)<55?1:0)
describe('lossless source-space composition',()=>{
 it('recolors from source only, preserving all outside pixels and texture variation',async()=>{
  const a=source(),m=mask(),b=recolor(a,m,'navy');assertOutsideUnchanged(a,b,m)
  expect(b.rgb).not.toEqual(a.rgb);expect(b.rgb[0]).toBe(a.rgb[0])
  const saved=await encode(b),roundtrip=await decodeRgb(saved);expect(roundtrip.rgb).toEqual(b.rgb)
  expect(await decodeMask(await maskPng(m,80,70),80,70)).toEqual(m)
 })
 it('uses mask alpha and rejects mismatched dimensions or too little color signal',async()=>{
  const transparent=await sharp({create:{width:80,height:70,channels:4,background:{r:255,g:255,b:255,alpha:0}}}).png().toBuffer()
  expect((await decodeMask(transparent,80,70)).reduce((a,b)=>a+b,0)).toBe(0)
  await expect(decodeMask(transparent,81,70)).rejects.toThrow()
  expect(()=>recolor(source(),new Uint8Array(80*70),'sage')).toThrow()
 })
 it('rejects a transparent source before claiming preservation of its pixels',async()=>{
  const transparent=await sharp({create:{width:80,height:70,channels:4,background:{r:255,g:255,b:255,alpha:0}}}).png().toBuffer()
  await expect(decodeRgb(transparent)).rejects.toMatchObject({code:'transparent_source_unsupported'})
 })
 it('does not paste the full context outside the exact target',async()=>{
  const a=source(),m=mask();const generated=await sharp({create:{width:80,height:70,channels:3,background:'#dd2244'}}).png().toBuffer()
  const b=await compose(a,m,generated,{left:0,top:0,width:80,height:70},false)
  assertOutsideUnchanged(a,b,m);expect(b.rgb[(20*80+30)*3]).toBe(221)
 })
 it('Poisson preserves boundary/source and converges constant offsets without introducing a seam',()=>{
  const a=source(),m=mask(),generated=Uint8Array.from(a.rgb,v=>v+20)
  const b=poisson(a,generated,m,500);assertOutsideUnchanged(a,b,m)
  expect(Math.max(...Array.from(b.rgb,(v,i)=>Math.abs(v-a.rgb[i])))).toBeLessThanOrEqual(1)
 })
})

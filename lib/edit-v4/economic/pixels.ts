import sharp from 'sharp'
import { EconomicEditError } from './contracts'
import type { Palette } from './policy'
import { PALETTES } from './policy'
export interface Pixels { rgb: Uint8Array; width: number; height: number }
export interface Rect { left: number; top: number; width: number; height: number }
const MAX_PIXELS=20_000_000
export async function decodeRgb(buffer: Buffer): Promise<Pixels> {
  const meta=await sharp(buffer,{limitInputPixels:MAX_PIXELS}).metadata()
  if(meta.hasAlpha){
    const stats=await sharp(buffer).stats()
    if(stats.channels.at(-1)!.min<255)throw new EconomicEditError('transparent_source_unsupported','Use uma imagem de cena sem transparência para este teste.')
  }
  const {data,info}=await sharp(buffer,{limitInputPixels:MAX_PIXELS}).removeAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject:true})
  if(info.channels!==3)throw new EconomicEditError('invalid_image','Formato de imagem não suportado.')
  return {rgb:new Uint8Array(data),width:info.width,height:info.height}
}
export async function decodeMask(buffer: Buffer, width: number, height: number): Promise<Uint8Array> {
  const meta=await sharp(buffer,{limitInputPixels:MAX_PIXELS}).metadata()
  if(meta.width!==width||meta.height!==height)throw new EconomicEditError('mask_mismatch','A seleção não corresponde à imagem atual.')
  const {data}=await sharp(buffer).flatten({background:'#000000'}).greyscale().raw().toBuffer({resolveWithObject:true})
  return Uint8Array.from(data,v=>v>127?1:0)
}
export function maskBounds(mask: Uint8Array,width: number,height: number): Rect {
  let minX=width,minY=height,maxX=-1,maxY=-1,count=0
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(mask[y*width+x]){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);count++}
  if(count===0||count>=width*height*.985)throw new EconomicEditError('invalid_mask','Marque apenas a área que deseja alterar.')
  return {left:minX,top:minY,width:maxX-minX+1,height:maxY-minY+1}
}
export function contextRect(box: Rect,width: number,height: number): Rect {
  const pad=Math.max(32,Math.ceil(Math.max(box.width,box.height)*.25))
  const left=Math.max(0,box.left-pad),top=Math.max(0,box.top-pad)
  return {left,top,width:Math.min(width,box.left+box.width+pad)-left,height:Math.min(height,box.top+box.height+pad)-top}
}
export async function encode(p: Pixels): Promise<Buffer> {
  const out=await sharp(Buffer.from(p.rgb),{raw:{width:p.width,height:p.height,channels:3}}).png().toBuffer()
  if(out.length>14*1024*1024)throw new EconomicEditError('lossless_too_large','A edição ficou grande demais para ser salva sem perda. Nenhum node foi consumido.')
  return out
}
export async function maskPng(mask: Uint8Array,width: number,height: number): Promise<Buffer> {
  return sharp(Buffer.from(Uint8Array.from(mask,v=>v?255:0)),{raw:{width,height,channels:1}}).png().toBuffer()
}
const median=(values:number[])=>{values.sort((a,b)=>a-b);const n=values.length;return n%2?values[(n-1)/2]:(values[n/2-1]+values[n/2])/2}
const linear=(v:number)=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4
const srgb=(v:number)=>v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055
/** Source, reviewed mask and fixed palette only. No Flash image or palette accepted. */
export function recolor(source: Pixels,mask: Uint8Array,palette: Palette): Pixels {
  const {width,height,rgb}=source;const core:number[][]=[[],[],[]]
  for(let y=4;y<height-4;y++)for(let x=4;x<width-4;x++){
    if(!mask[y*width+x])continue
    let inside=true
    for(let dy=-4;dy<=4&&inside;dy++)for(let dx=-4;dx<=4;dx++)if(!mask[(y+dy)*width+x+dx]){inside=false;break}
    if(inside)for(let c=0;c<3;c++)core[c].push(linear(rgb[(y*width+x)*3+c]/255))
  }
  if(core[0].length<200)throw new EconomicEditError('local_signal_insufficient','A seleção não tem área suficiente para esta aplicação de cor.')
  const ref=core.map(median);if(ref.some(x=>x<1e-5))throw new EconomicEditError('local_signal_insufficient','Não foi possível preservar o material com esta cor.')
  const target=PALETTES[palette].map(v=>linear(v/255));const out=new Uint8Array(rgb)
  for(let i=0;i<mask.length;i++)if(mask[i])for(let c=0;c<3;c++){
    const v=Math.max(0,Math.min(1,target[c]*linear(rgb[i*3+c]/255)/ref[c]));out[i*3+c]=Math.max(0,Math.min(255,Math.round(srgb(v)*255)))
  }
  return {...source,rgb:out}
}
/** Raw pixels may enter ONLY within the exact source-space mask. No feather outside. */
export async function compose(source: Pixels,mask: Uint8Array,generated: Buffer,region: Rect,repair: boolean): Promise<Pixels> {
  const patch=await sharp(generated).resize(region.width,region.height,{fit:'fill'}).removeAlpha().toColourspace('srgb').raw().toBuffer()
  const full=new Uint8Array(source.rgb)
  for(let y=0;y<region.height;y++)for(let x=0;x<region.width;x++){
    const dst=((region.top+y)*source.width+region.left+x)*3,src=(y*region.width+x)*3
    for(let c=0;c<3;c++)full[dst+c]=patch[src+c]
  }
  if(repair)return poisson(source,full,mask)
  const out=new Uint8Array(source.rgb)
  for(let i=0;i<mask.length;i++)if(mask[i])for(let c=0;c<3;c++)out[i*3+c]=full[i*3+c]
  return {...source,rgb:out}
}
/** Active-cell red/black SOR, float32. One solve, no paid regeneration or automatic retry. */
export function poisson(source: Pixels,generated: Uint8Array,mask: Uint8Array,iterations=800): Pixels {
  const {width:w,height:h,rgb}=source;const box=maskBounds(mask,w,h)
  const left=Math.max(0,box.left-1),top=Math.max(0,box.top-1)
  const right=Math.min(w,box.left+box.width+1),bottom=Math.min(h,box.top+box.height+1)
  const stride=right-left,rows=bottom-top,delta=new Float32Array(stride*rows*3)
  const red:number[]=[],black:number[]=[],ring:number[][]=[[],[],[]]
  for(let y=0;y<rows;y++)for(let x=0;x<stride;x++){
    const global=(y+top)*w+x+left,idx=y*stride+x
    for(let c=0;c<3;c++)delta[idx*3+c]=rgb[global*3+c]-generated[global*3+c]
    const inside=mask[global]&&x>0&&x<stride-1&&y>0&&y<rows-1
    if(inside){((x+y)%2?black:red).push(idx);continue}
    if(mask[global])continue
    let boundary=false
    for(let dy=-1;dy<=1&&!boundary;dy++)for(let dx=-1;dx<=1;dx++){
      const nx=x+dx,ny=y+dy;if(nx>=0&&nx<stride&&ny>=0&&ny<rows&&mask[(ny+top)*w+nx+left]){boundary=true;break}
    }
    if(boundary)for(let c=0;c<3;c++)ring[c].push(delta[idx*3+c])
  }
  if(ring[0].length===0)throw new EconomicEditError('invalid_repair_boundary','Refaça a seleção com uma margem de contexto.')
  const med=ring.map(median);for(const idx of [...red,...black])for(let c=0;c<3;c++)delta[idx*3+c]=med[c]
  const f=Math.fround,omega=f(1.85)
  for(let it=0;it<iterations;it++)for(const indices of [red,black])for(const idx of indices)for(let c=0;c<3;c++){
    const k=idx*3+c,avg=f(f(f(f(delta[k-stride*3]+delta[k+stride*3])+delta[k-3])+delta[k+3])*.25)
    delta[k]=f(delta[k]+f(omega*f(avg-delta[k])))
  }
  const out=new Uint8Array(rgb)
  for(const idx of [...red,...black]){const y=Math.floor(idx/stride),x=idx%stride,global=(y+top)*w+x+left
    for(let c=0;c<3;c++)out[global*3+c]=Math.max(0,Math.min(255,Math.round(generated[global*3+c]+delta[idx*3+c])))
  }
  return {...source,rgb:out}
}
export function assertOutsideUnchanged(a: Pixels,b: Pixels,mask: Uint8Array): void {
  if(a.width!==b.width||a.height!==b.height)throw new EconomicEditError('dimensions_changed','O resultado alterou as dimensões da imagem.')
  for(let i=0;i<mask.length;i++)if(!mask[i])for(let c=0;c<3;c++)if(a.rgb[i*3+c]!==b.rgb[i*3+c])throw new EconomicEditError('outside_changed','O resultado alterou áreas fora da seleção.')
}

import {timingSafeEqual} from 'node:crypto'
export function whatsappAuthorized(request:Request) {
  const key=process.env.COMMERCIAL_SOURCE_TOKEN ?? ''
  if(process.env.COMMERCIAL_PILOT_ENABLED!=='true' || key.length<48) return false
  const got=request.headers.get('authorization') ?? '', want='Bearer '+key
  return Buffer.byteLength(got)===Buffer.byteLength(want) && timingSafeEqual(Buffer.from(got),Buffer.from(want))
}
export const privateReply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}})

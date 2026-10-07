import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canonicalMobile, readWhatsAppLink, whatsappAccountRef, createWhatsAppProgress } from '@/lib/customer-contact/whatsapp-link'

export const dynamic='force-dynamic'
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}})

export async function POST(request:Request) {
  const key=process.env.COMMERCIAL_SOURCE_TOKEN ?? '', secret=process.env.COMMERCIAL_REF_SECRET ?? ''
  if(process.env.COMMERCIAL_PILOT_ENABLED!=='true' || key.length<48 || secret.length<48) return reply({error:'Unavailable'},503)
  const supplied=request.headers.get('authorization') ?? '', expected='Bearer '+key
  if(Buffer.byteLength(supplied)!==Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied),Buffer.from(expected))) return reply({error:'Unauthorized'},401)
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json') return reply({error:'Invalid request'},400)
  try {
    const raw=await request.text()
    if(raw.length>1024) return reply({error:'Invalid request'},400)
    const {token,phone}=JSON.parse(raw)
    if(typeof token!=='string' || typeof phone!=='string') return reply({error:'Invalid request'},400)
    const userId=readWhatsAppLink(secret,token,phone)
    const {data,error}=await createAdminClient().from('customer_contacts').select('whatsapp_e164,support_opt_in').eq('user_id',userId).maybeSingle()
    if(error) return reply({error:'Unavailable'},503)
    if(!data?.support_opt_in || !data.whatsapp_e164 || canonicalMobile(data.whatsapp_e164)!==canonicalMobile(phone)) return reply({error:'Link unavailable'},403)
    // Never return a phone, user ID, email or marketing permission. The private
    // pilot needs only the same opaque reference used by commercial snapshots.
    return reply({account_ref:whatsappAccountRef(secret,userId),support_opt_in:true,progress_handle:createWhatsAppProgress(secret,userId,phone)})
  } catch { return reply({error:'Invalid or expired link'},400) }
}

import Stripe from 'stripe'
import {createAdminClient} from '@/lib/supabase/admin'
import {readWhatsAppProgress,progressPhoneMatches,whatsappAccountRef} from '@/lib/customer-contact/whatsapp-link'
import {whatsappAuthorized,privateReply} from '@/lib/whatsapp/private'
export const dynamic='force-dynamic'
export const maxDuration=60
export async function POST(request:Request) {
  if(!whatsappAuthorized(request)) return privateReply({error:'Unauthorized'},401)
  try {
    const secret=process.env.COMMERCIAL_REF_SECRET ?? ''
    if(request.headers.get('content-type')?.split(';')[0]!=='application/json') return privateReply({error:'Invalid'},400)
    const raw=await request.text()
    if(raw.length>7000) return privateReply({error:'Invalid'},400)
    const {handles}=JSON.parse(raw)
    if(!Array.isArray(handles) || handles.length>10 || handles.some(h=>typeof h!=='string' || h.length>605)) return privateReply({error:'Invalid'},400)
    const admin=createAdminClient(), results=[]
    const stripe=new Stripe(process.env.STRIPE_SECRET_KEY!,{timeout:4000,maxNetworkRetries:0})
    for(const handle of [...new Set(handles)]) {
      let identity
      try {identity=readWhatsAppProgress(secret,handle)} catch {results.push({handle,state:'expired'});continue}
      const contact=await admin.from('customer_contacts').select('whatsapp_e164,support_opt_in').eq('user_id',identity.uid).maybeSingle()
      if(contact.error) throw new Error('Unavailable')
      if(!contact.data?.support_opt_in || !contact.data.whatsapp_e164 || !progressPhoneMatches(secret,identity.proof,contact.data.whatsapp_e164)) {
        results.push({handle,state:'revoked'});continue
      }
      const [render,value,profile]=await Promise.all([
        admin.from('renders').select('created_at').eq('user_id',identity.uid).eq('status','completed')
          .or('is_internal_test.is.null,is_internal_test.eq.false').order('created_at',{ascending:true}).limit(1),
        admin.schema('marketing').from('acquisition_events').select('created_at').eq('user_id',identity.uid)
          .in('event_type',['result_approved','result_downloaded']).eq('is_internal',false).order('created_at',{ascending:true}).limit(1),
        admin.from('profiles').select('stripe_customer_id,stripe_subscription_id').eq('id',identity.uid).maybeSingle(),
      ])
      if(render.error || value.error || profile.error) throw new Error('Unavailable')
      let paidAt:number|null=null, paymentState='no_subscription'
      if(profile.data?.stripe_subscription_id) {
        try {
          const subscription=await stripe.subscriptions.retrieve(profile.data.stripe_subscription_id,{expand:['latest_invoice']})
          const invoice=subscription.latest_invoice
          const customer=typeof subscription.customer==='string'?subscription.customer:subscription.customer.id
          if(customer!==profile.data.stripe_customer_id || !subscription.livemode) throw new Error('Unavailable')
          if(invoice && typeof invoice!=='string' && invoice.status==='paid' && invoice.amount_paid>0 && invoice.livemode) {
            paidAt=invoice.status_transitions.paid_at;paymentState='paid_invoice'
          } else paymentState='no_paid_invoice'
        } catch {paymentState='unavailable'}
      }
      results.push({handle,state:'ok',account_ref:whatsappAccountRef(secret,identity.uid),
        first_render_at:render.data?.[0]?.created_at ?? null, first_value_at:value.data?.[0]?.created_at ?? null,
        latest_paid_invoice_at:paidAt, payment_state:paymentState})
    }
    return privateReply({as_of:new Date().toISOString(),results})
  } catch {return privateReply({error:'Unavailable'},503)}
}

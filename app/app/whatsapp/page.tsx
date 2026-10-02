import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { readOwnContact } from '@/lib/customer-contact/server'
import { createWhatsAppLink } from '@/lib/customer-contact/whatsapp-link'
import { supportWhatsAppUrl } from '@/lib/support'

export const dynamic='force-dynamic'

export default async function WhatsAppPage() {
  const supabase=await createClient(), {data:{user}}=await supabase.auth.getUser()
  if(!user) redirect('/login?next=%2Fapp%2Fwhatsapp')
  const {contact,unavailable}=await readOwnContact(supabase,user.id)
  const enabled=process.env.COMMERCIAL_PILOT_ENABLED==='true' && (process.env.COMMERCIAL_REF_SECRET?.length ?? 0)>=48
  const ready=enabled && !unavailable && !!contact?.whatsapp_e164 && !!contact.support_opt_in
  const url=ready ? supportWhatsAppUrl(createWhatsAppLink(process.env.COMMERCIAL_REF_SECRET!,user.id,contact!.whatsapp_e164!)) : null
  return <main className="mx-auto max-w-xl px-6 py-12 space-y-6">
    <h1 className="text-2xl font-semibold">Conectar meu WhatsApp</h1>
    <p>Confirme que este WhatsApp pertence à sua conta para receber ajuda com seu primeiro projeto.</p>
    {url ? <>
      <p>Abra o WhatsApp e envie a mensagem de confirmação que já estará preenchida. Ela vale por 10 minutos.</p>
      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex rounded-xl bg-emerald-600 px-5 py-3 font-medium text-white">Confirmar conexão no WhatsApp</a>
      <p className="text-sm opacity-70">O atendimento está na fase inicial de lançamento. A confirmação liga esta conversa à sua conta; você pode pedir atendimento humano pelo WhatsApp.</p>
    </> : <p>{unavailable ? 'Não foi possível verificar seu cadastro agora. Tente novamente em alguns instantes.' : 'Salve seu WhatsApp e permita receber ajuda na página da sua conta para continuar.'}</p>}
    <div><Link href="/app/conta" className="underline">Ir para minha conta</Link></div>
  </main>
}

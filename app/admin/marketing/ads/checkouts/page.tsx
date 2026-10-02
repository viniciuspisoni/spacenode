import Stripe from 'stripe'
import { getMarketingStaffContext } from '@/lib/marketing/auth'
import { getCheckoutAudit } from '@/lib/marketing/checkout-audit'

export const dynamic = 'force-dynamic'

const message = 'Oi! Sou da SpaceNode. Posso ajudar a escolher um plano ou tirar alguma dúvida sobre a assinatura? Se preferir, não envio mais mensagens.'

function date(seconds: number | null) {
  return seconds ? new Date(seconds * 1000).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'
}

export default async function CheckoutsPage() {
  const ctx = await getMarketingStaffContext()
  if (!ctx) return null

  let audit
  try {
    audit = await getCheckoutAudit(ctx.admin, new Stripe(process.env.STRIPE_SECRET_KEY!))
  } catch (error) {
    console.error('[checkout-audit] falha:', error)
    return <p role="alert" className="rounded-xl border border-border bg-bg-elevated p-4 text-sm">Não foi possível consultar os checkouts agora. Tente novamente mais tarde.</p>
  }

  const stats = [
    ['Sessões criadas', audit.counts.created],
    ['Pagas', audit.counts.paid],
    ['Pagamento pendente', audit.counts.awaitingPayment],
    ['Abertas', audit.counts.open],
    ['Expiradas', audit.counts.expired],
  ] as const

  return <div className="space-y-8">
    <header>
      <h1 className="text-xl font-semibold">Checkouts de assinatura</h1>
      <p className="mt-2 text-sm text-text-secondary">Sessões criadas na Stripe desde {date(audit.since)}. Criar uma sessão não confirma que a pessoa abriu ou preencheu a página de pagamento.</p>
    </header>

    {audit.truncated && <p role="alert" className="rounded-xl border border-border bg-bg-elevated p-4 text-sm">Há mais de 1.000 sessões no período. Os totais e a lista abaixo estão incompletos.</p>}
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {stats.map(([label, value]) => <div key={label} className="rounded-xl border border-border bg-bg-elevated p-4">
        <div className="text-2xl font-semibold">{value}</div><div className="mt-1 text-xs text-text-secondary">{label}</div>
      </div>)}
    </div>

    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Abordagem manual</h2>
      <p className="text-sm text-text-secondary">Sessões expiradas nos últimos 7 dias, sem assinatura identificada e com autorização atual para marketing no WhatsApp. Confira cada caso antes de enviar. O número foi informado pela pessoa, mas ainda não foi verificado.</p>
      <p className="text-sm text-text-secondary">{audit.candidates.length} contato(s) elegível(is). {audit.noConsent} checkout(s) expirado(s) sem autorização ou WhatsApp para contato comercial.</p>
      {audit.candidates.length === 0 ? <p className="rounded-xl border border-border bg-bg-elevated p-4 text-sm">Nenhum contato elegível agora.</p> :
        <div className="overflow-x-auto rounded-xl border border-border bg-bg-elevated">
          <table className="w-full text-left text-sm"><thead><tr className="border-b border-border text-xs text-text-secondary">
            <th className="p-3">Sessão</th><th className="p-3">Plano</th><th className="p-3">Criado em</th><th className="p-3">Expirou em</th><th className="p-3">Ação</th>
          </tr></thead><tbody className="divide-y divide-border">{audit.candidates.map(item => <tr key={item.sessionId}>
            <td className="p-3 font-mono text-xs">{item.sessionId}</td><td className="p-3">{item.planId ?? '—'} · {item.billingCycle ?? '—'}</td>
            <td className="p-3">{date(item.createdAt)}</td><td className="p-3">{date(item.expiredAt)}</td>
            <td className="p-3"><a href={`https://wa.me/${item.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer" className="underline">Abrir WhatsApp</a></td>
          </tr>)}</tbody></table>
        </div>}
    </section>
    <p className="text-xs text-text-tertiary">Sessões sem identificação de usuário: {audit.counts.unknownOwner}. Pagamento pendente, inclusive Pix, não entra na lista de abordagem.</p>
  </div>
}

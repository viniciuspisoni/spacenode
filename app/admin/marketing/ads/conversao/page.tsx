import { notFound } from 'next/navigation'
import { getMarketingStaffContext } from '@/lib/marketing/auth'
import { getConversionData } from '@/lib/marketing/ads/conversion-service'

export const dynamic = 'force-dynamic'

export default async function ConversionPage({ searchParams }: { searchParams: Promise<{ campaign?: string }> }) {
  const ctx = await getMarketingStaffContext()
  if (!ctx) notFound()
  const sp = await searchParams
  const campaign = typeof sp.campaign === 'string' && /^[\w-]{1,100}$/.test(sp.campaign) ? sp.campaign : 'reels_assinantes_202610'
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const since = `${today.slice(0, 7)}-01T03:00:00.000Z`
  let data: Awaited<ReturnType<typeof getConversionData>>
  try { data = await getConversionData(ctx.admin, campaign, since) }
  catch { return <p role="alert">O registro próprio está indisponível. Não há uma leitura confiável do funil neste momento.</p> }
  const f = data.funnel
  const stages = [
    ['Navegadores identificados na LP', f.visitors], ['Cadastros atribuídos', f.signups],
    ['Contas com geração concluída', f.activated], ['Contas que viram planos', f.offers],
    ['Contas com checkout iniciado', f.checkouts], ['Contas com evento de assinatura paga', f.paidEvents],
    ['Contas com pagamento conferido no Stripe', data.stripeCheck?.paidUsers ?? 'Não conferido'],
  ]
  return <div className="space-y-6">
    <div><h1 className="text-xl font-semibold">Conversão para assinantes pagos</h1><p className="mt-2 text-sm text-text-secondary">Campanha {campaign}. Desde o dia 1º deste mês, no horário de Brasília.</p></div>
    <form className="flex flex-wrap gap-2"><label className="text-sm">UTM da campanha <input name="campaign" defaultValue={campaign} maxLength={100} className="ml-2 rounded border border-border p-2" /></label><button className="rounded border border-border px-3 py-2" type="submit">Consultar</button></form>
    {(data.eventsTruncated || data.stripeCheck?.truncated) && <p role="alert">Leitura parcial: o limite de paginação foi atingido. Estes números são mínimos, não totais definitivos.</p>}
    {data.stripeError && <p role="alert">{data.stripeError}</p>}
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{stages.map(([label, value]) => <div key={label} className="rounded-xl border border-border p-4"><dt className="text-sm text-text-secondary">{label}</dt><dd className="mt-2 text-2xl font-semibold">{value}</dd></div>)}</dl>
    <p className="text-sm text-text-secondary">Depois do cadastro, acompanhamos as mesmas contas, mesmo se a atribuição mudar. Uma conta pode entrar no checkout antes de gerar uma imagem. Não somamos etapas nem tratamos identificadores de navegador como pessoas únicas.</p>
    <p className="text-sm text-text-secondary">Stripe: somente checkout de assinatura em modo real, pago, com valor positivo e vinculado a essas contas; exclui teste grátis e renovação. Janela pela criação do checkout. Compras atribuídas pela Meta devem ser comparadas separadamente, considerando consentimento e atraso de atribuição.</p>
    {data.stripeCheck && <p className="text-sm">Valor dos checkouts pagos conferidos em BRL: {(data.stripeCheck.revenueCentsBRL / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.</p>}
    <p className="text-xs text-text-tertiary">Leitura: {new Date(data.until).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Pagamentos por outros fluxos ou anteriores à janela não estão nesta conferência.</p>
  </div>
}

'use client'

import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react'
import Link from 'next/link'
import { invoiceBrl, seedreamScenario } from '@/lib/costs/aggregate'
import type { CostGroup, CostsDashboard } from '@/lib/costs/types'

const money = (value: number, currency = 'BRL') => new Intl.NumberFormat('pt-BR', { style: 'currency', currency, maximumFractionDigits: currency === 'USD' ? 4 : 2 }).format(value)
const num = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
const pct = (n: number, d: number) => d ? `${num(n / d * 100)}%` : '—'
const input = 'rounded-lg border border-border-strong bg-bg-elevated px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-text-secondary'
const button = 'rounded-lg border border-border-strong px-4 py-2 text-sm hover:bg-surface disabled:opacity-40'
const card = 'rounded-xl border border-border bg-bg-elevated p-5'
const monthNow = () => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(new Date())
  return `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}`
}
const subscribe = (change: () => void) => {
  window.addEventListener('storage', change); window.addEventListener('sn-cost-preferences', change)
  return () => { window.removeEventListener('storage', change); window.removeEventListener('sn-cost-preferences', change) }
}
const snapshot = () => { try { return localStorage.getItem('sn-cost-preferences') ?? '{}' } catch { return '{}' } }
const serverSnapshot = () => '{}'

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className={card}><p className="text-sm text-text-secondary">{label}</p><p className="mt-2 text-3xl font-medium tracking-tight tabular-nums">{value}</p><p className="mt-2 text-sm text-text-tertiary">{hint}</p></div>
}
function Groups({ groups, fx, label }: { groups: CostGroup[]; fx: number; label: string }) {
  const max = Math.max(...groups.map(g => g.knownUsd), 0.01)
  return <div className={card}>
    <h2 className="mb-4 text-lg font-medium">{label}</h2>
    {!groups.length ? <p className="text-text-secondary">Sem operações registradas neste mês.</p> : <div className="space-y-5">{groups.map(g => <div key={g.key}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm"><span className="break-all font-medium">{g.label}</span><span className="tabular-nums">{g.pricedEntries > 0 ? money(g.knownUsd * fx) : 'Sem custo em moeda'}</span></div>
      <div className="my-2 h-1.5 overflow-hidden rounded-full bg-surface"><div className="h-full rounded-full bg-azul-destaques" style={{ width: `${g.knownUsd / max * 100}%` }} /></div>
      <p className="text-sm text-text-tertiary">{num(g.jobs)} operações · {num(g.delivered)} entregues · {num(g.fallbacks)} com fallback · {num(g.unknownCalls)} chamadas sem tarifa</p>
    </div>)}</div>}
  </div>
}

export default function CostsDashboardClient() {
  const [month, setMonth] = useState(monthNow)
  const [data, setData] = useState<CostsDashboard | null>(null)
  const [loading, setLoading] = useState(true), [error, setError] = useState('')
  const [revision, setRevision] = useState(0), [tab, setTab] = useState('overview')
  const preferencesRaw = useSyncExternalStore(subscribe, snapshot, serverSnapshot)
  let preferences: { fx?: number; budget?: number } = {}
  try { preferences = JSON.parse(preferencesRaw) } catch { /* optional device preferences */ }
  const [fxDraft, setFxText] = useState<string | null>(null), [budgetDraft, setBudgetText] = useState<string | null>(null)
  const fxText = fxDraft ?? (Number(preferences?.fx) > 0 ? String(preferences.fx) : '5.40')
  const budgetText = budgetDraft ?? (Number(preferences?.budget) > 0 ? String(preferences.budget) : '')
  const fx = Number(fxText) > 0 && Number.isFinite(Number(fxText)) ? Number(fxText) : 5.4
  const budget = Number(budgetText) > 0 && Number.isFinite(Number(budgetText)) ? Number(budgetText) : null
  const [invoiceProvider, setInvoiceProvider] = useState('fal'), [invoiceAmount, setInvoiceAmount] = useState('')
  const [invoiceCurrency, setInvoiceCurrency] = useState('USD'), [invoiceNote, setInvoiceNote] = useState('')
  const [saving, setSaving] = useState(false), [message, setMessage] = useState('')
  const [callsText, setCallsText] = useState('1000'), [tier, setTier] = useState('high'), [refsText, setRefsText] = useState('1')

  useEffect(() => {
    const controller = new AbortController()
    async function refresh() {
      setLoading(true); setError(''); setData(null); setMessage('')
      try {
        const response = await fetch(`/api/admin/costs?month=${encodeURIComponent(month)}`, { cache: 'no-store', signal: controller.signal })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error ?? 'Não foi possível carregar o painel.')
        setData(payload)
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Falha na consulta.') }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void refresh()
    return () => controller.abort()
  }, [month, revision])
  const savePreferences = () => {
    try { localStorage.setItem('sn-cost-preferences', JSON.stringify({ version: 1, fx, budget })); window.dispatchEvent(new Event('sn-cost-preferences')); setMessage('Câmbio e meta salvos neste dispositivo.') }
    catch { setMessage('Este navegador não permitiu salvar as preferências.') }
  }
  const saveInvoice = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setMessage('')
    try {
      const response = await fetch('/api/admin/costs/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: invoiceProvider, month, currency: invoiceCurrency, amount: Number(invoiceAmount), note: invoiceNote }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Não foi possível salvar a fatura.')
      setRevision(v => v + 1); setInvoiceAmount(''); setInvoiceNote('')
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Não foi possível salvar a fatura.') }
    finally { setSaving(false) }
  }
  const exportCsv = () => {
    if (!data) return
    const cell = (s: string | number) => { const value = typeof s === 'string' && /^[=+@-]/.test(s) ? `'${s}` : String(s); return `"${value.replaceAll('"', '""')}"` }
    const rows = [['tipo', 'fornecedor', 'mes', 'moeda', 'valor', 'operacoes', 'entregues', 'operacoes_com_valor'],
      ...data.providers.map(g => ['consumo_monitorado', g.label, month, 'USD', g.pricedEntries > 0 ? g.knownUsd : '', g.jobs, g.delivered, g.pricedJobs]),
      ...data.invoices.map(i => ['fatura_informada', i.provider, month, i.currency, i.amount, '', '', ''])]
    const blob = new Blob(['\ufeff' + rows.map(row => row.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `spacenode-custos-${month}.csv`; a.click(); URL.revokeObjectURL(url)
  }
  const totals = data?.totals, billed = data?.invoices.reduce((sum, i) => sum + invoiceBrl(i, fx), 0) ?? 0
  const calls = Math.floor(Math.min(1_000_000, Math.max(0, Number(callsText) || 0))), refs = Math.floor(Math.min(10, Math.max(1, Number(refsText) || 1)))
  const scenario = seedreamScenario(calls, tier === 'high' ? 2048 ** 2 : 1536 ** 2, refs)
  const maxDaily = Math.max(...(data?.daily.map(d => d.usd) ?? []), 0.001)
  const tabs = [['overview', 'Visão geral'], ['inventory', 'APIs e cobertura'], ['invoices', 'Faturas'], ['quality', 'Economia e qualidade']]

  return <div className="min-h-screen bg-bg text-text-primary">
    <header className="border-b border-border"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4">
      <Link href="/app" className="text-lg font-medium tracking-tight">spacenode <span className="ml-2 text-sm font-normal text-text-tertiary">controle de custos</span></Link>
      <div className="flex gap-4 text-sm text-text-secondary"><Link href="/admin/marketing">Administrativo</Link><Link href="/app">Voltar ao app</Link></div>
    </div></header>
    <main className="mx-auto max-w-7xl space-y-6 px-5 py-8">
      <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="text-xs uppercase tracking-[0.2em] text-text-tertiary">Gestão da SpaceNode</p><h1 className="mt-2 text-3xl font-medium tracking-tight">Custos das APIs</h1><p className="mt-2 max-w-2xl text-sm text-text-secondary">Entenda onde o dinheiro é gasto e compare o custo com a qualidade das entregas.</p></div>
        <div className="flex flex-wrap items-end gap-3"><label className="flex flex-col gap-2 text-sm">Mês<input type="month" min="2020-01" max="2100-12" value={month} onChange={e => setMonth(e.target.value)} className={input} /></label><button className={button} disabled={loading} onClick={() => setRevision(v => v + 1)}>Atualizar</button><button className={button} disabled={!data} onClick={exportCsv}>Exportar CSV</button></div>
      </div>
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border p-4"><label className="flex flex-col gap-2 text-sm">Câmbio · R$ por US$<input type="number" min="0.01" step="0.01" value={fxText} onChange={e => setFxText(e.target.value)} className={`${input} w-36`} /></label><label className="flex flex-col gap-2 text-sm">Meta mensal · R$<input type="number" min="0" step="1" value={budgetText} onChange={e => setBudgetText(e.target.value)} placeholder="Opcional" className={`${input} w-40`} /></label><button className={button} onClick={savePreferences}>Salvar preferências</button><p className="self-center text-xs text-text-tertiary">Câmbio manual e meta salvos neste dispositivo.</p></div>
      {message && <p role="status" className="rounded-lg border border-border-strong p-3 text-sm">{message}</p>}
      <nav aria-label="Visões de custos" className="flex flex-wrap gap-2 border-b border-border pb-3">{tabs.map(([id, title]) => <button key={id} aria-current={tab === id ? 'page' : undefined} className={`rounded-lg px-4 py-2 text-sm ${tab === id ? 'bg-inverse text-inverse-foreground' : 'text-text-secondary hover:bg-surface'}`} onClick={() => setTab(id)}>{title}</button>)}</nav>
      {loading && <div role="status" className={card}>Consultando operações e faturas…</div>}
      {error && <div role="alert" className={card}><p>{error}</p><button className={`${button} mt-3`} onClick={() => setRevision(v => v + 1)}>Tentar novamente</button></div>}
      {data && totals && <>
        {tab === 'overview' && <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Consumo monitorado" value={totals.pricedEntries > 0 ? money(totals.knownUsd * fx) : 'Sem valor registrado'} hint={`${money(totals.knownUsd, 'USD')} em valores conhecidos. Subtotal antes da reconciliação.`} />
            <Metric label="Faturas informadas" value={data.invoices.length ? money(billed) : 'A preencher'} hint={`${data.invoices.length} fornecedores. Separadas do consumo monitorado.`} />
            <Metric label="Operações com valor" value={pct(totals.pricedJobs, totals.jobs)} hint={`${num(totals.pricedJobs)} de ${num(totals.jobs)} operações; ${num(totals.unknownCalls)} chamadas sem tarifa.`} />
            <Metric label="Resultados entregues" value={num(totals.delivered)} hint={`${num(totals.failed)} falhas · ${num(totals.rejected)} rejeições registradas.`} />
          </div>
          {budget && <div className={card}><div className="flex flex-wrap justify-between gap-2"><span>Faturas / meta mensal</span><span>{data.invoices.length ? `${money(billed)} / ${money(budget)} · ${pct(billed, budget)}` : 'Preencha as faturas para acompanhar a meta.'}</span></div><div className="mt-3 h-2 rounded bg-surface"><div className={`h-full rounded ${billed > budget ? 'bg-error' : 'bg-azul-destaques'}`} style={{ width: `${Math.min(100, billed / budget * 100)}%` }} /></div></div>}
          <div className="grid gap-5 lg:grid-cols-2"><Groups groups={data.providers} fx={fx} label="Onde está o consumo monitorado" /><Groups groups={data.modules} fx={fx} label="Consumo por ferramenta" /></div>
          {data.invoices.length > 0 && <div className={card}><h2 className="text-lg font-medium">Maiores despesas nas faturas</h2><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[...data.invoices].sort((a, b) => invoiceBrl(b, fx) - invoiceBrl(a, fx)).map(i => <div key={i.provider} className="flex items-baseline justify-between gap-3 rounded-lg bg-surface px-4 py-3 text-sm"><span>{data.inventory.find(p => p.id === i.provider)?.name ?? i.provider}</span><span className="whitespace-nowrap tabular-nums">{money(invoiceBrl(i, fx))}</span></div>)}</div></div>}
          <div className={card}><div className="flex flex-wrap justify-between gap-2"><h2 className="text-lg font-medium">Consumo diário registrado</h2><span className="text-sm text-text-tertiary">USD · horário de São Paulo</span></div>
            {!data.daily.length ? <p className="mt-4 text-text-secondary">Sem dados neste período.</p> : <div className="mt-5 flex h-44 items-end gap-1.5 overflow-hidden" aria-label="Consumo diário em dólares">{data.daily.map(d => <div key={d.date} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-2" title={`${d.date}: ${money(d.usd, 'USD')} · ${d.jobs} operações`}><div className="min-h-0 rounded-t bg-azul-destaques" style={{ height: `${d.usd / maxDaily * 85}%` }} /><span className="text-center text-xs text-text-tertiary">{d.date.slice(-2)}</span></div>)}</div>}
            <details className="mt-4 text-sm"><summary className="cursor-pointer text-text-secondary">Ver valores por dia</summary><div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">{data.daily.map(d => <p key={d.date}>{d.date.slice(-2)} · {money(d.usd, 'USD')} · {d.jobs} op.</p>)}</div></details>
          </div>
        </>}
        {tab === 'inventory' && <>
          <p className="text-text-secondary">{data.inventory.length} integrações mapeadas. Credencial configurada indica disponibilidade; tráfego observado confirma uso.</p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.inventory.map(p => <article key={p.id} className={card}>
            <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-medium">{p.name}</h2><span className="text-xs text-text-tertiary">{p.category}</span></div><p className="mt-3 text-sm text-text-secondary">{p.purpose}</p>
            <p className="mt-3 text-sm">{data.providers.some(g => g.key === p.id && (g.jobs > 0 || g.pricedEntries > 0 || g.unknownCalls > 0)) ? 'Uso observado no período' : p.state === 'external' ? 'Integração externa a conferir' : p.configured === true ? 'Credencial configurada; sem uso observado' : p.configured === false ? 'Sem credencial neste ambiente' : 'Uso a conferir no fornecedor'}</p>
            <p className="mt-3 text-sm text-text-tertiary">{p.billing}</p><details className="mt-4 text-xs text-text-tertiary"><summary className="cursor-pointer">Origem do levantamento</summary><p className="mt-2 break-words">{p.evidence}</p></details>
          </article>)}</div>
          <div className={card}><h2 className="text-lg font-medium">Cobertura das fontes</h2><div className="mt-4 grid gap-3 md:grid-cols-2">{data.sources.map(s => <p key={s.table} className="text-sm"><span className="font-medium">{s.table}</span> · {s.available ? `${num(s.rows)} linhas${s.truncated ? ' · subtotal limitado' : ''}` : 'indisponível'}</p>)}</div><p className="mt-4 text-sm text-text-secondary">Canva, Runway, ChatGPT e Claude são ferramentas da equipe. Assinaturas pessoais não foram tratadas como APIs do produto. Vídeo, 3D, Nodi, visão e integrações fora dos caminhos monitorados precisam de reconciliação com os fornecedores.</p></div>
        </>}
        {tab === 'invoices' && <div className="grid gap-5 lg:grid-cols-[1fr_1.3fr]"><form onSubmit={saveInvoice} className={`${card} space-y-4`}><h2 className="text-lg font-medium">Registrar fatura de {month}</h2><p className="text-sm text-text-secondary">Informe o valor final atribuído à SpaceNode, após créditos, descontos e impostos. Recarga de saldo não é consumo. Cada fornecedor tem um total mensal; salvar novamente atualiza esse total.</p>
          <label className="flex flex-col gap-2 text-sm">Fornecedor<select value={invoiceProvider} onChange={e => setInvoiceProvider(e.target.value)} className={input}>{data.inventory.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-3"><label className="flex flex-col gap-2 text-sm">Moeda<select value={invoiceCurrency} onChange={e => setInvoiceCurrency(e.target.value)} className={input}><option>USD</option><option>BRL</option></select></label><label className="flex flex-col gap-2 text-sm">Valor final<input required type="number" min="0" max="1000000" step="0.0001" value={invoiceAmount} onChange={e => setInvoiceAmount(e.target.value)} className={input} /></label></div>
          <label className="flex flex-col gap-2 text-sm">Referência / observação<textarea maxLength={500} rows={3} value={invoiceNote} onChange={e => setInvoiceNote(e.target.value)} className={input} placeholder="Ex.: fatura de outubro, com créditos aplicados" /></label>
          <button className="rounded-lg bg-inverse px-4 py-2 text-sm text-inverse-foreground disabled:opacity-40" disabled={saving || !data.invoicesAvailable}>{saving ? 'Salvando…' : 'Salvar total mensal'}</button>
        </form><div className={card}><h2 className="text-lg font-medium">Faturas registradas</h2><p className="mt-1 text-sm text-text-tertiary">A conversão em reais usa o câmbio manual do painel.</p><div className="mt-5 space-y-5">{!data.invoices.length ? <p className="text-text-secondary">Nenhuma fatura registrada. O gasto total da operação ainda não está fechado.</p> : data.invoices.map(i => <div key={i.provider} className="border-b border-border pb-4"><div className="flex flex-wrap justify-between gap-3"><p>{data.inventory.find(p => p.id === i.provider)?.name ?? i.provider}</p><p className="tabular-nums">{money(i.amount, i.currency)}</p></div>{i.note && <p className="mt-2 text-sm text-text-tertiary">{i.note}</p>}<button className="mt-3 text-sm text-text-secondary underline" onClick={() => { setInvoiceProvider(i.provider); setInvoiceAmount(String(i.amount)); setInvoiceCurrency(i.currency); setInvoiceNote(i.note) }}>Editar total</button></div>)}</div><p className="mt-5 text-sm text-text-secondary">As faturas são salvas para a equipe. Não é necessário inserir chaves de API neste painel.</p></div></div>}
        {tab === 'quality' && <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Tentativas extras registradas" value={num(totals.retries)} hint="Retrabalho registrado nos jobs; retries internos históricos podem estar ausentes." /><Metric label="Operações com fallback" value={pct(totals.fallbacks, totals.jobs)} hint={`${num(totals.fallbacks)} operações trocaram de fornecedor ou modelo.`} /><Metric label="Resultados úteis" value={pct(totals.useful, totals.feedbackCount)} hint={`${totals.useful} de ${totals.feedbackCount} respostas. Amostra voluntária, sujeita a viés.`} /><Metric label="Aprovados no histórico" value={num(totals.approved)} hint="Aprovação registrada pelo usuário; não representa todas as entregas úteis." /></div>
          <div className={card}><h2 className="text-lg font-medium">Custo e qualidade por motor</h2><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-text-tertiary"><tr>{['Motor / modelo', 'Subtotal conhecido', 'Entregues', 'Subtotal / entrega', 'Com valor', 'Úteis / respostas', 'Tempo médio'].map(h => <th key={h} className="whitespace-nowrap px-3 py-3 font-normal">{h}</th>)}</tr></thead><tbody>{data.models.map(g => <tr key={g.key} className="border-t border-border"><td className="max-w-64 break-words px-3 py-4">{g.label}</td><td className="whitespace-nowrap px-3 py-4">{g.pricedEntries > 0 ? money(g.knownUsd * fx) : 'Desconhecido'}</td><td className="px-3 py-4">{g.delivered}</td><td className="whitespace-nowrap px-3 py-4">{g.delivered && g.pricedEntries > 0 ? money(g.knownUsd * fx / g.delivered) : '—'}</td><td className="px-3 py-4">{pct(g.pricedJobs, g.jobs)}</td><td className="px-3 py-4">{g.useful} / {g.feedbackCount}</td><td className="px-3 py-4">{g.durationMs === null ? '—' : `${num(g.durationMs / 1000)} s`}</td></tr>)}</tbody></table></div><p className="mt-3 text-sm text-text-secondary">Subtotal / entrega subestima o custo quando a cobertura é incompleta. Avalie falhas, aprovação e todas as tentativas antes de mudar o motor padrão.</p></div>
          <div className="grid gap-5 lg:grid-cols-2"><div className={`${card} space-y-4`}><h2 className="text-lg font-medium">Simular a rota do mesmo Seedream</h2><p className="text-sm text-text-secondary">Mesmo modelo e área de saída. Cenário nominal: exclui retries, falhas, taxas e créditos. Tarifas da tabela do produto de 09/2026.</p><div className="grid gap-3 sm:grid-cols-3"><label className="flex flex-col gap-2 text-sm">Chamadas<input type="number" min="0" max="1000000" step="1" value={callsText} onChange={e => setCallsText(e.target.value)} className={`${input} w-full`} /></label><label className="flex flex-col gap-2 text-sm">Saída<select value={tier} onChange={e => setTier(e.target.value)} className={`${input} w-full`}><option value="high">2048 × 2048</option><option value="low">1536 × 1536</option></select></label><label className="flex flex-col gap-2 text-sm">Imagens de entrada<input type="number" min="1" max="10" step="1" value={refsText} onChange={e => setRefsText(e.target.value)} className={`${input} w-full`} /></label></div><dl className="space-y-3 text-sm"><div className="flex justify-between"><dt>fal.ai</dt><dd>{money(scenario.fal * fx)}</dd></div><div className="flex justify-between"><dt>ModelArk direta</dt><dd>{money(scenario.ark * fx)}</dd></div><div className="flex justify-between border-t border-border pt-3 text-base"><dt>Economia potencial</dt><dd>{money(scenario.savings * fx)} · {pct(scenario.savings, scenario.fal)}</dd></div></dl><p className="text-sm text-text-tertiary">A rota direta já existe. A economia adicional depende do volume que ainda passa pela fal e de testes equivalentes de qualidade e latência.</p><div className="flex gap-4 text-sm"><a href="https://fal.ai/models/bytedance/seedream/v5/pro/edit" target="_blank" rel="noreferrer" className="underline">Tarifa fal.ai</a><a href="https://docs.byteplus.com/en/docs/ModelArk/1544106" target="_blank" rel="noreferrer" className="underline">Tarifa BytePlus</a></div></div>
            <div className={`${card} space-y-5`}><h2 className="text-lg font-medium">Próximas decisões de produto</h2>{[
              ['1. Reduzir retrabalho', 'Identificar causas de rejeição e melhorar materiais, geometria e seleção. Comparar custo por resultado aprovado, além da taxa de sucesso técnico.'],
              ['2. Preservar a rota direta', 'Medir por que Vertex ou ModelArk caem em fallback. Ajustar timeout e capacidade quando a entrega mantiver qualidade e tempo aceitáveis.'],
              ['3. Usar resolução adequada', 'Gerar pela área necessária e ampliar na entrega quando o teste preservar detalhes. Editar V4 já dimensiona a saída pelo crop.'],
              ['4. Testar com o mesmo projeto', 'Comparar rotas com as mesmas imagens e instruções. Avaliar fidelidade, aprovação, latência e o custo de todas as tentativas antes de adotar uma mudança.'],
            ].map(([title, text]) => <div key={title}><h3 className="font-medium">{title}</h3><p className="mt-1 text-sm text-text-secondary">{text}</p></div>)}</div>
          </div>
        </>}
        <details className={`${card} text-sm`} open={data.warnings.some(w => w.startsWith('Fonte indisponível'))}><summary className="cursor-pointer font-medium">Limites dos dados e reconciliação</summary><ul className="mt-4 list-disc space-y-2 pl-5 text-text-secondary">{data.warnings.map(w => <li key={w}>{w}</li>)}</ul><p className="mt-4 text-xs text-text-tertiary">Consultado em {new Date(data.generatedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. O painel consulta as fontes ao abrir e ao atualizar.</p></details>
      </>}
    </main>
  </div>
}

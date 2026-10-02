import { redirect } from 'next/navigation'
import type { CSSProperties } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { referralReward } from '@/lib/referrals'
import { CopyReferralLink } from './CopyReferralLink'

export const dynamic = 'force-dynamic'

type ReferralRow = {
  referred_user_id: string
  created_at: string
}
type ProfileRow = { id: string; email: string | null; plan: string }
type RewardRow = {
  referred_user_id: string | null
  nodes_initial: number
  purchased_at: string
}

function maskedEmail(email: string | null): string {
  if (!email) return 'Conta indicada'
  const [name, domain] = email.split('@')
  if (!name || !domain) return 'Conta indicada'
  return `${name[0]}***@${domain}`
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short' })
    .format(new Date(value))
}

const card: CSSProperties = {
  borderRadius: 'var(--r-card)', padding: 22,
  background: 'var(--color-surface)', border: '0.5px solid var(--color-border-strong)',
}

export default async function ParceriasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const [referralsResult, rewardsResult] = await Promise.all([
    admin.from('referrals')
      .select('referred_user_id, created_at')
      .eq('referrer_user_id', user.id)
      .order('created_at', { ascending: false }),
    admin.from('lumen_packs')
      .select('referred_user_id, nodes_initial, purchased_at')
      .eq('user_id', user.id)
      .eq('source_type', 'referral')
      .order('purchased_at', { ascending: false }),
  ])

  const referrals = (referralsResult.data ?? []) as ReferralRow[]
  const rewards = (rewardsResult.data ?? []) as RewardRow[]
  const ids = referrals.map(row => row.referred_user_id)
  const profilesResult = ids.length
    ? await admin.from('profiles').select('id, email, plan').in('id', ids)
    : { data: [] }
  const profiles = new Map(((profilesResult.data ?? []) as ProfileRow[]).map(p => [p.id, p]))
  const rewardsByReferred = new Map<string, RewardRow[]>()
  for (const reward of rewards) {
    if (!reward.referred_user_id) continue
    const previous = rewardsByReferred.get(reward.referred_user_id) ?? []
    previous.push(reward)
    rewardsByReferred.set(reward.referred_user_id, previous)
  }

  const active = referrals.filter(row => referralReward(profiles.get(row.referred_user_id)?.plan ?? '') > 0)
  const potential = active.reduce((total, row) => total + referralReward(profiles.get(row.referred_user_id)?.plan ?? ''), 0)
  const earned = rewards.reduce((total, row) => total + row.nodes_initial, 0)
  const path = `/r/${user.id}`

  return (
    <main style={{ flex: 1, overflowY: 'auto', padding: '40px 48px 80px' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 32 }}>
          SpaceNode <span aria-hidden="true">›</span> Parcerias
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.03em', marginBottom: 10 }}>
          Parcerias
        </h1>
        <p style={{ fontSize: 14, color: 'var(--color-text-tertiary)', lineHeight: 1.6, marginBottom: 30 }}>
          Convide profissionais para a SpaceNode. Você recebe Nodes quando cada indicado paga a primeira assinatura e a cada renovação paga.
        </p>

        <section style={{ ...card, marginBottom: 16 }} aria-labelledby="referral-link-title">
          <h2 id="referral-link-title" style={{ fontSize: 16, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 8 }}>
            Seu link de indicação
          </h2>
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 18 }}>
            Compartilhe este link antes de a pessoa criar a conta.
          </p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <code style={{ flex: 1, minWidth: 180, overflowWrap: 'anywhere', fontSize: 12, color: 'var(--color-text-primary)' }}>
              spacenode.app{path}
            </code>
            <CopyReferralLink path={path} />
          </div>
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 28 }}>
          <Stat label="Indicados em plano elegível" value={active.length.toLocaleString('pt-BR')} />
          <Stat label="Potencial por renovação" value={`${potential.toLocaleString('pt-BR')} Nodes`} detail="Se todos renovarem seus planos" />
          <Stat label="Nodes já recebidos" value={`${earned.toLocaleString('pt-BR')} Nodes`} />
        </div>

        <section style={card} aria-labelledby="referrals-title">
          <h2 id="referrals-title" style={{ fontSize: 18, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 8 }}>
            Suas indicações
          </h2>
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 20 }}>
            Essence: 200 Nodes · Pro: 400 Nodes · Studio: 800 Nodes por pagamento confirmado. Se a assinatura acabar, os próximos créditos param.
          </p>
          {referrals.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', padding: '20px 0' }}>
              Quando alguém se cadastrar pelo seu link, a indicação aparecerá aqui.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {referrals.map(row => {
                const profile = profiles.get(row.referred_user_id)
                const history = rewardsByReferred.get(row.referred_user_id) ?? []
                const amount = referralReward(profile?.plan ?? '')
                const legacyPaid = profile?.plan === 'starter' || profile?.plan === 'office'
                const status = amount > 0 ? 'Assinando' : legacyPaid ? 'Plano sem prêmio' : history.length > 0 ? 'Assinatura encerrada' : 'Aguardando assinatura'
                return (
                  <div key={row.referred_user_id} style={{
                    borderTop: '0.5px solid var(--color-border-strong)', padding: '15px 0',
                    display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
                  }}>
                    <div>
                      <div style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500 }}>{maskedEmail(profile?.email ?? null)}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>Indicou em {formatDate(row.created_at)} · {status}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>
                        {amount > 0 ? `${profile?.plan?.toUpperCase()} · +${amount} Nodes por ciclo` : 'Sem crédito no próximo ciclo'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                        {history.length > 0 ? `${history.length} pagamento${history.length === 1 ? '' : 's'} · ${history.reduce((sum, h) => sum + h.nodes_initial, 0)} Nodes recebidos · último em ${formatDate(history[0].purchased_at)}` : 'Aguardando o primeiro pagamento'}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 12 }}>{label}</div>
      <div style={{ fontSize: 22, color: 'var(--color-text-primary)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {detail && <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 7 }}>{detail}</div>}
    </div>
  )
}

'use client'

// Avatar com anel de consumo no rodapé da Sidebar.
// SVG: 2 círculos (track + arc dinâmico via stroke-dasharray).
// Cor por estado: saudável/atenção/crítico/zerado.
// Click → popover com mini-chart de uso, projeção, links pra planos/avulso.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { getBalanceState, BALANCE_COLORS, type BalanceState } from '@/lib/spaces/balance'
import { getPlanById, type PlanId } from '@/lib/plans'

interface Props {
  userName:   string
  userAvatar: string | null
  expanded:   boolean
  // saldo carregado do server pra primeira render (sem flicker)
  initialPlanBalance: number
  initialPlanTotal:   number
  initialLumenBalance: number
  initialPlanId:      PlanId
}

const RADIUS         = 19
const CIRCUMFERENCE  = 2 * Math.PI * RADIUS  // ~119.38

export function AvatarComConsumo({
  userName, userAvatar, expanded,
  initialPlanBalance, initialPlanTotal, initialLumenBalance, initialPlanId,
}: Props) {
  const [open, setOpen] = useState(false)
  const [planBalance, setPlanBalance]   = useState(initialPlanBalance)
  const [planTotal, setPlanTotal]       = useState(initialPlanTotal)
  const [lumenBalance, setLumenBalance] = useState(initialLumenBalance)
  const [planId, setPlanId]             = useState<PlanId>(initialPlanId)
  const [usageDays, setUsageDays]       = useState<{ day: string; nodes: number }[]>([])
  const [avgPerDay, setAvgPerDay]       = useState<number>(0)
  const popoverRef = useRef<HTMLDivElement | null>(null)

  const state = getBalanceState(planBalance, planTotal)
  const ratio = planTotal > 0 ? Math.max(0, Math.min(1, planBalance / planTotal)) : 0
  const arcLen = CIRCUMFERENCE * ratio

  const initials = userName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  const showUpgradePill = state === 'atencao' || state === 'critico'

  // Refresh on open + at most 1x per minute
  useEffect(() => {
    if (!open) return
    let cancelled = false
    Promise.all([
      fetch('/api/users/me/balance').then(r => r.ok ? r.json() : null),
      fetch('/api/users/me/usage').then(r => r.ok ? r.json() : null),
    ]).then(([bal, usage]) => {
      if (cancelled) return
      if (bal) {
        setPlanBalance(bal.plan_balance ?? 0)
        setPlanTotal(bal.plan_total ?? 0)
        setLumenBalance(bal.lumen_balance ?? 0)
        if (bal.plan_id) setPlanId(bal.plan_id as PlanId)
      }
      if (usage) {
        setUsageDays(usage.days ?? [])
        setAvgPerDay(usage.avg_per_day ?? 0)
      }
    })
    return () => { cancelled = true }
  }, [open])

  // Click outside fecha popover
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!popoverRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const daysUntilEmpty =
    avgPerDay > 0 && planBalance > 0 ? Math.ceil(planBalance / avgPerDay) : null

  return (
    <div style={{ position: 'relative' }} ref={popoverRef}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '4px 10px', height: 56, borderRadius: 8,
          background: 'transparent', width: '100%', textAlign: 'left',
        }}
      >
        <AvatarRing
          state={state}
          arcLen={arcLen}
          userAvatar={userAvatar}
          initials={initials}
        />
        <div style={{ opacity: expanded ? 1 : 0, transition: 'opacity 0.18s', minWidth: 0, overflow: 'hidden', flex: 1 }}>
          <div style={{
            fontSize: 13, color: '#ffffff', fontWeight: 600,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {userName}
          </div>
          <div style={{
            fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.5)', marginTop: 2,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span>{planBalance + lumenBalance} nodes</span>
          </div>
        </div>
        {showUpgradePill && expanded && (
          <UpgradePill state={state} />
        )}
      </button>

      {open && expanded && (
        <BalancePopover
          planId={planId}
          planBalance={planBalance}
          planTotal={planTotal}
          lumenBalance={lumenBalance}
          state={state}
          daysUntilEmpty={daysUntilEmpty}
          usageDays={usageDays}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}

// ── Ring SVG ──────────────────────────────────────────────────

function AvatarRing({ state, arcLen, userAvatar, initials }: {
  state:      BalanceState
  arcLen:     number
  userAvatar: string | null
  initials:   string
}) {
  const color = BALANCE_COLORS[state]
  return (
    <div style={{ position: 'relative', width: 42, height: 42, flexShrink: 0 }}>
      <svg width="42" height="42" viewBox="0 0 42 42">
        {/* track */}
        <circle cx="21" cy="21" r={RADIUS}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="2" />
        {/* arc */}
        <circle cx="21" cy="21" r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={`${arcLen} ${CIRCUMFERENCE - arcLen}`}
          transform="rotate(-90 21 21)"
          style={{ transition: 'stroke-dasharray 600ms ease-out, stroke 300ms' }} />
      </svg>
      <div style={{
        position: 'absolute', inset: 4, borderRadius: '50%',
        background: '#1a1a1a',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {userAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={userAvatar} alt=""
               style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: 12, fontWeight: 500, color: '#fff', letterSpacing: '0.02em' }}>
            {initials}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Pill "Upgrade" ────────────────────────────────────────────

function UpgradePill({ state }: { state: BalanceState }) {
  const isCritical = state === 'critico' || state === 'zerado'
  return (
    <Link
      href="/app/billing"
      onClick={(e) => e.stopPropagation()}
      className={isCritical ? 'avatar-upgrade-pulse' : undefined}
      style={{
        fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: BALANCE_COLORS[state], background: `${BALANCE_COLORS[state]}1F`,
        padding: '3px 7px', borderRadius: 5,
        flexShrink: 0,
      }}
    >
      Upgrade
      <style>{`
        @keyframes avatarUpgradePulse {
          0%, 100% { opacity: 0.85; }
          50%      { opacity: 1; }
        }
        .avatar-upgrade-pulse {
          animation: avatarUpgradePulse 3s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .avatar-upgrade-pulse { animation: none; }
        }
      `}</style>
    </Link>
  )
}

// ── Popover ───────────────────────────────────────────────────

function BalancePopover({ planId, planBalance, planTotal, lumenBalance, state, daysUntilEmpty, usageDays, onClose }: {
  planId:        PlanId
  planBalance:   number
  planTotal:     number
  lumenBalance:  number
  state:         BalanceState
  daysUntilEmpty: number | null
  usageDays:     { day: string; nodes: number }[]
  onClose:       () => void
}) {
  const plan = getPlanById(planId)
  const planName = plan?.name ?? (planId === 'free' ? 'Beta' : planId)
  const stateColor = BALANCE_COLORS[state]
  const stateLabel: Record<BalanceState, string> = {
    saudavel: 'Saudável', atencao: 'Atenção', critico: 'Crítico', zerado: 'Zerado',
  }

  return (
    <div style={{
      position: 'absolute', bottom: 56, left: 0,
      width: 320, padding: 18, zIndex: 50,
      background: '#161616',
      border: '0.5px solid rgba(255,255,255,0.12)',
      borderRadius: 14,
      boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{
            fontSize: 9, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.4)',
          }}>
            Plano {planName}
          </div>
          <div style={{
            fontSize: 22, fontWeight: 500, color: '#fff', letterSpacing: '-0.02em', marginTop: 4,
          }}>
            {planBalance + lumenBalance} <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: 400 }}>nodes</span>
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
            {planBalance} de {planTotal} do plano
            {lumenBalance > 0 && <> · {lumenBalance} avulsos</>}
          </div>
        </div>
        <span style={{
          fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: stateColor, background: `${stateColor}1F`,
          padding: '4px 8px', borderRadius: 5,
        }}>
          {stateLabel[state]}
        </span>
      </div>

      {/* Sparkline 7 dias */}
      <Sparkline days={usageDays} />

      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
        {daysUntilEmpty !== null
          ? <>No ritmo atual, zera em ~{daysUntilEmpty} dia{daysUntilEmpty === 1 ? '' : 's'}.</>
          : 'Sem consumo recente registrado.'}
      </div>

      <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
        <button
          onClick={() => { alert('Disponível em agosto.'); }}
          style={{
            flex: 1, padding: '9px 12px', borderRadius: 8,
            background: '#1f1f1f', color: '#bbb',
            border: '0.5px solid rgba(255,255,255,0.12)',
            fontSize: 11, fontWeight: 500,
          }}
        >
          Comprar avulso
        </button>
        <Link
          href="/app/billing"
          onClick={onClose}
          style={{
            flex: 1, padding: '9px 12px', borderRadius: 8,
            background: '#1D9E75', color: '#042818',
            fontSize: 11, fontWeight: 600, textAlign: 'center',
          }}
        >
          Ver planos
        </Link>
      </div>
    </div>
  )
}

function Sparkline({ days }: { days: { day: string; nodes: number }[] }) {
  if (days.length === 0) return (
    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', padding: '10px 0' }}>
      Sem consumo nos últimos 7 dias.
    </div>
  )
  const max = Math.max(...days.map(d => d.nodes), 1)
  const todayLabel = new Date().toISOString().slice(0, 10)
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 4, height: 48,
      }}>
        {days.map((d, i) => {
          const h = (d.nodes / max) * 100
          const isToday = d.day === todayLabel
          return (
            <div key={i} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              <div style={{
                width: '100%', height: `${Math.max(h, 4)}%`,
                background: isToday ? '#46d191' : 'rgba(255,255,255,0.18)',
                borderRadius: 2,
                transition: 'height 0.4s',
              }} title={`${d.day}: ${d.nodes} nodes`} />
            </div>
          )
        })}
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 6,
      }}>
        <span>7d atrás</span>
        <span>hoje</span>
      </div>
    </div>
  )
}

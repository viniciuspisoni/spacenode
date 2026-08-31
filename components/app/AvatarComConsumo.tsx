'use client'

// Avatar com anel de consumo no rodapé da Sidebar.
// SVG: 2 círculos (track + arc dinâmico via stroke-dasharray).
// Cor por estado: saudável/atenção/crítico/zerado.
// Click → popover com mini-chart de uso, projeção, links pra planos/avulso.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { getBalanceState, BALANCE_COLORS, type BalanceState } from '@/lib/spaces/balance'
import type { PlanId } from '@/lib/plans'
import { getPlanDisplayName } from '@/lib/plan-display'

interface Props {
  userName:   string
  userAvatar: string | null
  expanded:   boolean
  // saldo carregado do server pra primeira render (sem flicker)
  initialPlanBalance: number
  initialPlanTotal:   number
  /** Nodes extras (avulsos, sem validade). */
  initialExtraBalance: number
  initialPlanId:      PlanId
}

const RADIUS         = 18
const CIRCUMFERENCE  = 2 * Math.PI * RADIUS  // ~113.10

export function AvatarComConsumo({
  userName, userAvatar, expanded,
  initialPlanBalance, initialPlanTotal, initialExtraBalance, initialPlanId,
}: Props) {
  const [open, setOpen] = useState(false)
  const [planBalance, setPlanBalance]   = useState(initialPlanBalance)
  const [planTotal, setPlanTotal]       = useState(initialPlanTotal)
  const [extraBalance, setExtraBalance] = useState(initialExtraBalance)
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
        setExtraBalance(bal.extra_balance ?? 0)
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
          display: 'flex', alignItems: 'center', justifyContent: expanded ? 'flex-start' : 'center', gap: 10,
          padding: expanded ? '0 10px' : 0,
          height: 38,
          borderRadius: 12,
          background: expanded ? 'var(--color-surface)' : 'transparent',
          border: expanded ? '0.5px solid var(--color-border)' : '0.5px solid transparent',
          boxShadow: expanded ? 'inset 0 1px 0 rgba(255,255,255,0.03)' : 'none',
          width: expanded ? '100%' : 42,
          textAlign: 'left',
          transition: 'background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
        }}
      >
        <AvatarRing
          state={state}
          ratio={ratio}
          arcLen={arcLen}
          noQuota={planTotal <= 0}
          userAvatar={userAvatar}
          initials={initials}
        />
        <div style={{ opacity: expanded ? 1 : 0, transition: 'opacity 0.18s', minWidth: 0, overflow: 'hidden', flex: 1 }}>
          <div style={{
            fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 600,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {userName}
          </div>
          <div style={{
            fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
            color: 'var(--color-text-tertiary)', marginTop: 2,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span>{planBalance + extraBalance} nodes</span>
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
          extraBalance={extraBalance}
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

function AvatarRing({ state, ratio, arcLen, noQuota, userAvatar, initials }: {
  state:      BalanceState
  ratio:      number
  arcLen:     number
  noQuota:    boolean
  userAvatar: string | null
  initials:   string
}) {
  const color = BALANCE_COLORS[state]
  const showDot = !noQuota && state !== 'zerado' && ratio > 0.001
  // "Node" indicador na ponta do arco — começa às 12h, sentido horário.
  const angle = 2 * Math.PI * Math.min(1, ratio)
  const dotX = 21 + RADIUS * Math.sin(angle)
  const dotY = 21 - RADIUS * Math.cos(angle)
  return (
    <div style={{ position: 'relative', width: 42, height: 42, flexShrink: 0 }}>
      <svg width="42" height="42" viewBox="0 0 42 42" style={{ overflow: 'visible' }}>
        {noQuota ? (
          /* Sem cota mensal (conta gratuita): anel verde sutil e decorativo. */
          <circle cx="21" cy="21" r={RADIUS}
            fill="none"
            stroke="var(--color-accent-green-glow)"
            strokeWidth="2.5" />
        ) : (
          <>
            {/* track */}
            <circle cx="21" cy="21" r={RADIUS}
              fill="none"
              stroke="var(--color-surface-hover)"
              strokeWidth="3" />
            {/* arc */}
            <circle cx="21" cy="21" r={RADIUS}
              fill="none"
              stroke={color}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${arcLen} ${CIRCUMFERENCE - arcLen}`}
              transform="rotate(-90 21 21)"
              style={{ transition: 'stroke-dasharray 600ms ease-out, stroke 300ms' }} />
            {/* node luminoso na ponta do arco */}
            {showDot && (
              <>
                <circle cx={dotX} cy={dotY} r="3"
                  fill={color}
                  style={{ filter: `drop-shadow(0 0 4px ${color})`, transition: 'cx 600ms ease-out, cy 600ms ease-out, fill 300ms' }} />
                <circle cx={dotX} cy={dotY} r="1.2"
                  fill="#fff" opacity="0.95"
                  style={{ transition: 'cx 600ms ease-out, cy 600ms ease-out' }} />
              </>
            )}
          </>
        )}
      </svg>
      <div style={{
        position: 'absolute', inset: 5, borderRadius: '50%',
        background: 'var(--color-surface-hover)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {userAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={userAvatar} alt=""
               style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '0.02em' }}>
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

function BalancePopover({ planId, planBalance, planTotal, extraBalance, state, daysUntilEmpty, usageDays, onClose }: {
  planId:        PlanId
  planBalance:   number
  planTotal:     number
  extraBalance:  number
  state:         BalanceState
  daysUntilEmpty: number | null
  usageDays:     { day: string; nodes: number }[]
  onClose:       () => void
}) {
  const planName = getPlanDisplayName(planId)
  const noQuota = planTotal <= 0
  const stateLabel: Record<BalanceState, string> = {
    saudavel: 'Saudável', atencao: 'Atenção', critico: 'Crítico', zerado: 'Zerado',
  }
  // Conta gratuita não tem cota mensal: estado próprio (verde), em vez de "Zerado".
  const pillColor = noQuota ? '#30d158' : BALANCE_COLORS[state]
  const pillLabel = noQuota ? 'Gratuito' : stateLabel[state]

  return (
    <div style={{
      position: 'absolute', bottom: 56, left: 0,
      width: 248, padding: 16, zIndex: 50,
      background: 'var(--color-bg-elevated)',
      border: '0.5px solid var(--color-border-strong)',
      borderRadius: 14,
      boxShadow: 'var(--shadow-xl)',
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{
            fontSize: 9, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
            color: 'var(--color-text-tertiary)',
          }}>
            Plano {planName}
          </div>
          <div style={{
            fontSize: 22, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.02em', marginTop: 4,
          }}>
            {planBalance + extraBalance} <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontWeight: 400 }}>nodes</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
            {noQuota
              ? <>Sem assinatura ativa{extraBalance > 0 && <> · {extraBalance} extras</>}</>
              : <>{planBalance} de {planTotal} mensais{extraBalance > 0 && <> · {extraBalance} extras</>}</>}
          </div>
        </div>
        <span style={{
          fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: pillColor, background: `${pillColor}1F`,
          padding: '4px 8px', borderRadius: 5,
        }}>
          {pillLabel}
        </span>
      </div>

      {/* Sparkline 7 dias */}
      <Sparkline days={usageDays} />

      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
        {daysUntilEmpty !== null
          ? <>No ritmo atual, zera em ~{daysUntilEmpty} dia{daysUntilEmpty === 1 ? '' : 's'}.</>
          : 'Sem consumo recente registrado.'}
      </div>

      <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
        <Link
          href="/app/billing"
          onClick={onClose}
          style={{
            flex: 1, padding: '9px 12px', borderRadius: 8,
            background: 'var(--color-surface-hover)', color: 'var(--color-text-secondary)',
            border: '0.5px solid var(--color-border-strong)',
            fontSize: 11, fontWeight: 500, textAlign: 'center',
          }}
        >
          Comprar avulso
        </Link>
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
    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', padding: '10px 0' }}>
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
                background: isToday ? 'var(--color-accent-green)' : 'var(--color-surface-hover)',
                borderRadius: 2,
                transition: 'height 0.4s',
              }} title={`${d.day}: ${d.nodes} nodes`} />
            </div>
          )
        })}
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 9, color: 'var(--color-text-tertiary)', marginTop: 6,
      }}>
        <span>7d atrás</span>
        <span>hoje</span>
      </div>
    </div>
  )
}

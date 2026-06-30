'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import React from 'react'
import { ConstellationN, Logo } from '@/components/brand'
import { AvatarComConsumo } from './AvatarComConsumo'
import type { PlanId } from '@/lib/plans'

const IconDashboard = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="3" width="8" height="8" rx="1.5"/>
    <rect x="13" y="3" width="8" height="8" rx="1.5"/>
    <rect x="3" y="13" width="8" height="8" rx="1.5"/>
    <rect x="13" y="13" width="8" height="8" rx="1.5"/>
  </svg>
)
const IconGenerate = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>
)
const IconHistory = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="12" cy="12" r="9"/>
    <path d="M12 7v5l3 3"/>
  </svg>
)
const IconPlans = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2"/>
    <polyline points="2 17 12 22 22 17"/>
    <polyline points="2 12 12 17 22 12"/>
  </svg>
)
const IconEnhance = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l1.88 5.47L19 10l-5.12 1.53L12 17l-1.88-5.47L5 10l5.12-1.53L12 3z"/>
    <path d="M5 3l.94 2.06L8 6l-2.06.94L5 9l-.94-2.06L2 6l2.06-.94L5 3z"/>
    <path d="M19 13l.94 2.06L22 16l-2.06.94L19 19l-.94-2.06L16 16l2.06-.94L19 13z"/>
  </svg>
)
const IconVideo = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="23 7 16 12 23 17 23 7"/>
    <rect x="1" y="5" width="15" height="14" rx="2"/>
  </svg>
)
const IconSpaces = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>
  </svg>
)
const IconIdentity = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2"/>
    <path d="M8 21h8M12 17v4"/>
    <circle cx="9" cy="10" r="2"/>
    <path d="M13 10h4M13 13h3"/>
  </svg>
)
const IconAccount = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4"/>
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
  </svg>
)
const IconTeam = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="8" r="3"/>
    <path d="M3.5 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/>
    <path d="M16 5.6a2.6 2.6 0 0 1 0 4.8M17.5 20c0-2.3-1-4-2.6-4.9"/>
  </svg>
)
const IconRetocar = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9"/>
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
  </svg>
)
const IconFinalizar = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <path d="M3 14l5-4 4 3 3-2 6 4"/>
    <path d="M14.5 3.5L20 9"/>
  </svg>
)
const IconHumanizedPlan = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="1.5"/>
    <path d="M3 11h7M14 11h7M10 3v8M10 15v6"/>
    <circle cx="16.5" cy="16.5" r="1.5"/>
  </svg>
)
const IconIsometric = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z"/>
    <path d="M3 7l9 5 9-5M12 12v10"/>
  </svg>
)
const IconBoard = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="1.5"/>
    <rect x="6" y="6" width="6" height="5" rx="0.8"/>
    <rect x="14" y="6" width="4" height="5" rx="0.8"/>
    <path d="M6 14h12M6 17h8"/>
  </svg>
)
const IconProjects = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>
    <path d="M3 11h18"/>
  </svg>
)
const IconMoodboard = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9"/>
    <circle cx="12" cy="6.5" r="1.4" fill="currentColor" stroke="none"/>
    <circle cx="17" cy="10" r="1.4" fill="currentColor" stroke="none"/>
    <circle cx="16" cy="15.5" r="1.4" fill="currentColor" stroke="none"/>
    <circle cx="8" cy="15.5" r="1.4" fill="currentColor" stroke="none"/>
    <circle cx="7" cy="10" r="1.4" fill="currentColor" stroke="none"/>
  </svg>
)

const ChevronCollapse = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 7l-5 5 5 5"/><path d="M19 7l-5 5 5 5"/>
  </svg>
)
const ChevronExpand = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 7l5 5-5 5"/><path d="M5 7l5 5-5 5"/>
  </svg>
)

type NavItem = {
  label: string
  href: string | null
  exact?: boolean
  match?: (pathname: string) => boolean
  Icon: () => React.ReactElement
  badge?: string
  badgeTone?: 'green' | 'muted'
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'PROJETOS',
    items: [
      { label: 'meus projetos', href: '/app/spaces',   exact: false, match: (p) => p.startsWith('/app/spaces') && !p.startsWith('/app/spaces/new'), Icon: IconProjects },
      { label: 'dashboard',     href: '/app',          exact: true,  Icon: IconDashboard },
      { label: 'histórico',     href: '/app/history',  exact: false, Icon: IconHistory   },
    ],
  },
  {
    label: 'CRIAR',
    items: [
      { label: 'renderizar', href: '/app/generate',    exact: false, Icon: IconGenerate  },
      { label: 'spaces',     href: '/app/spaces/new',  exact: true,  Icon: IconSpaces    },
      { label: 'editar',     href: '/app/editar',      exact: false, Icon: IconRetocar, badge: 'novo', badgeTone: 'green' },
      { label: 'ampliar',    href: '/app/upscale',     exact: false, Icon: IconEnhance   },
      { label: 'animar',     href: '/app/video',       exact: false, Icon: IconVideo     },
      { label: 'finalizar',  href: '/app/finalizar',   exact: false, Icon: IconFinalizar, badge: 'novo', badgeTone: 'green' },
    ],
  },
  {
    label: 'APRESENTAR',
    items: [
      { label: 'planta humanizada', href: '/app/apresentar/planta-humanizada', exact: false, Icon: IconHumanizedPlan, badge: 'novo', badgeTone: 'green' },
      { label: 'isométricas',       href: '/app/apresentar/isometricas',       exact: false, Icon: IconIsometric,     badge: 'novo', badgeTone: 'green' },
      { label: 'prancha ia',        href: '/app/apresentar/prancha',           exact: false, Icon: IconBoard,         badge: 'beta', badgeTone: 'green' },
      { label: 'moodboard',         href: '/app/apresentar/moodboard',         exact: false, Icon: IconMoodboard,     badge: 'novo', badgeTone: 'green' },
    ],
  },
  {
    label: 'ESCRITÓRIO',
    items: [
      { label: 'equipe',     href: '/app/equipe',            exact: false, Icon: IconTeam, badge: 'novo', badgeTone: 'green' },
      { label: 'identidade', href: '/app/settings/identity', exact: false, Icon: IconIdentity },
      { label: 'conta',      href: '/app/conta',             exact: false, Icon: IconAccount  },
      { label: 'planos',     href: '/app/billing',           exact: false, Icon: IconPlans    },
    ],
  },
]

const SIDEBAR_COLLAPSED = 76
const SIDEBAR_EXPANDED = 276

interface SidebarProps {
  userName: string
  userAvatar: string | null
  planBalance: number
  planTotal: number
  lumenBalance: number
  planId: PlanId
}

export default function Sidebar({
  userName, userAvatar,
  planBalance, planTotal, lumenBalance, planId,
}: SidebarProps) {
  const pathname = usePathname()
  const [hovered, setHovered] = useState(false)
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const [togHover, setTogHover] = useState(false)

  // Colapso manual e persistido. Padrão: expandido no desktop, colapsado
  // abaixo de 1024px. O usuário controla via botão — sem colapso por hover.
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    const saved = localStorage.getItem('spn-sidebar-collapsed')
    if (saved !== null) setCollapsed(saved === '1')
    else setCollapsed(!window.matchMedia('(min-width: 1024px)').matches)
  }, [])

  const setCollapsedPersist = (next: boolean) => {
    setCollapsed(next)
    try { localStorage.setItem('spn-sidebar-collapsed', next ? '1' : '0') } catch {}
  }

  // Recolhida é a preferência fixada; o cursor sobre a sidebar abre em preview.
  const expanded = !collapsed || hovered

  return (
    <aside
      style={{
        width: expanded ? SIDEBAR_EXPANDED : SIDEBAR_COLLAPSED,
        transition: 'width 0.28s cubic-bezier(0.22,1,0.36,1), box-shadow 0.28s ease',
        background: 'linear-gradient(180deg, #101011 0%, #090909 100%)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
        border: '0.5px solid rgba(255,255,255,0.07)',
        borderRadius: 18,
        height: 'calc(100vh - 12px)',
        margin: 6,
        position: 'sticky',
        top: 6,
        boxShadow: '0 8px 30px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.03)',
        zIndex: 20,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Logo — wordmark horizontal limpo (igual à LP) quando expandido,
          símbolo "N" isolado quando colapsado. Botão para recolher/expandir. */}
      <div style={{
        position: 'relative',
        height: 78,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: expanded ? 'space-between' : 'center',
        paddingLeft: expanded ? 20 : 0,
        paddingRight: expanded ? 12 : 0,
        color: '#ffffff',
        transition: 'padding 0.28s cubic-bezier(0.22,1,0.36,1)',
      }}>
        {/* Símbolo isolado — visível só colapsado */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: expanded ? 0 : 1,
            transition: 'opacity 0.16s ease',
            pointerEvents: 'none',
          }}
        >
          <ConstellationN size={44} aria-hidden />
        </div>

        {/* Lockup horizontal compartilhado com a landing page — visível só expandido */}
        <div style={{
          opacity: expanded ? 1 : 0,
          transition: 'opacity 0.2s ease 0.04s',
          whiteSpace: 'nowrap',
        }}>
          <Logo symbolSize={42} color="#ffffff" />
        </div>

        {/* Toggle fixar/recolher — visível quando expandida (fixa ou em preview
            por hover). Recolher fixa o rail; durante o preview, fixa aberta.
            A expansão em si é por aproximação do cursor, sem botão no rail. */}
        {expanded && (
          <button
            type="button"
            onClick={() => setCollapsedPersist(!collapsed)}
            onMouseEnter={() => setTogHover(true)}
            onMouseLeave={() => setTogHover(false)}
            title={collapsed ? 'Fixar menu aberto' : 'Recolher menu'}
            aria-label={collapsed ? 'Fixar menu aberto' : 'Recolher menu'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30, borderRadius: 9, border: 'none', padding: 0,
              cursor: 'pointer', flexShrink: 0,
              background: togHover ? 'rgba(255,255,255,0.07)' : 'transparent',
              color: togHover ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.42)',
              transition: 'background 0.18s, color 0.18s',
            }}
          >
            {collapsed ? <ChevronExpand /> : <ChevronCollapse />}
          </button>
        )}
      </div>

      {/* Nav */}
      <nav
        className="spn-sidebar-nav"
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          padding: expanded ? '4px 12px 10px' : '4px 9px 10px',
        }}
      >
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.label} style={{ marginTop: expanded ? (gi === 0 ? 0 : 13) : (gi === 0 ? 0 : 10) }}>
            <div style={{
              fontSize: 11, fontWeight: 500, letterSpacing: '0.13em',
              textTransform: 'uppercase' as const,
              color: 'rgba(255,255,255,0.34)',
              padding: expanded ? '0 10px' : 0,
              height: expanded ? 22 : 8,
              display: 'flex', alignItems: 'center',
              whiteSpace: 'nowrap' as const,
              opacity: expanded ? 1 : 0,
              transition: 'opacity 0.18s, height 0.22s ease',
              marginBottom: expanded ? 2 : 0,
            }}>
              {group.label}
            </div>

            {group.items.map(({ label, href, exact, match, Icon, badge, badgeTone }) => {
              const active = href
                ? (match ? match(pathname) : exact ? pathname === href : pathname.startsWith(href))
                : false
              const disabled = href === null
              const itemKey = href || label
              const isItemHovered = hoveredItem === itemKey

              const badgeColor = badgeTone === 'muted'
                ? { color: 'rgba(255,255,255,0.3)', bg: 'rgba(255,255,255,0.06)' }
                : { color: '#30b46c', bg: 'rgba(48,180,108,0.18)' }

              const inner = (
                <>
                  {active && (
                    <span aria-hidden style={{
                      position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                      width: 3, height: expanded ? 20 : 22, borderRadius: 999,
                      background: 'var(--color-accent-green)',
                      boxShadow: '0 0 12px var(--color-accent-green-glow)',
                    }} />
                  )}
                  <div style={{
                    width: 30,
                    height: 30,
                    borderRadius: 10,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: disabled ? 'rgba(255,255,255,0.2)' : active ? '#ffffff' : isItemHovered ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.52)',
                    background: active
                      ? 'rgba(255,255,255,0.105)'
                      : isItemHovered
                        ? 'rgba(255,255,255,0.06)'
                        : 'transparent',
                    boxShadow: active ? 'inset 0 0 0 0.5px rgba(255,255,255,0.10)' : 'none',
                    transform: isItemHovered && !active ? 'translateY(-0.5px)' : 'translateY(0)',
                    transitionProperty: 'color, transform, background, box-shadow',
                    transitionDuration: '0.2s',
                  }}>
                    <span style={{ display: 'flex', transform: 'scale(0.92)' }}>
                      <Icon />
                    </span>
                  </div>
                  <span style={{
                    fontSize: 13,
                    color: disabled ? 'rgba(255,255,255,0.25)' : active ? '#ffffff' : isItemHovered ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.75)',
                    whiteSpace: 'nowrap' as const,
                    fontWeight: active ? 560 : 430,
                    letterSpacing: '-0.01em',
                    opacity: expanded ? 1 : 0,
                    transition: 'opacity 0.18s, color 0.2s',
                    flex: expanded ? 1 : '0 0 0px',
                    overflow: 'hidden',
                  }}>
                    {label}
                  </span>
                  {badge && expanded && (
                    <span style={{
                      fontSize: 8, fontWeight: 600, letterSpacing: '0.08em',
                      textTransform: 'uppercase' as const,
                      color: badgeColor.color,
                      background: badgeColor.bg,
                      padding: '2px 6px', borderRadius: 7,
                      whiteSpace: 'nowrap' as const, flexShrink: 0,
                    }}>
                      {badge}
                    </span>
                  )}
                </>
              )

              const sharedStyle: React.CSSProperties = {
                position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: expanded ? 'flex-start' : 'center', gap: expanded ? 10 : 0,
                padding: expanded ? '0 10px' : 0, height: 38, borderRadius: 12,
                textDecoration: 'none', flexShrink: 0,
                background: active
                  ? 'rgba(255,255,255,0.075)'
                  : isItemHovered
                    ? 'rgba(255,255,255,0.045)'
                    : 'transparent',
                boxShadow: active
                  ? 'inset 0 0 0 0.5px rgba(255,255,255,0.10)'
                  : isItemHovered
                    ? 'inset 0 0 0 0.5px rgba(255,255,255,0.07)'
                    : 'none',
                transition: 'background 0.2s, box-shadow 0.2s, transform 0.2s',
                cursor: disabled ? 'default' : 'pointer',
                opacity: disabled ? 0.5 : 1,
              }

              const hoverHandlers = disabled ? {} : {
                onMouseEnter: () => setHoveredItem(itemKey),
                onMouseLeave: () => setHoveredItem(null),
              }

              return href ? (
                <Link key={href} href={href} style={sharedStyle} {...hoverHandlers}>
                  {inner}
                </Link>
              ) : (
                <div key={label} style={sharedStyle} {...hoverHandlers}>
                  {inner}
                </div>
              )
            })}
          </div>
        ))}
      </nav>

      {/* User com anel de consumo */}
      <div style={{
        padding: expanded ? '10px 10px 12px' : '10px 8px 12px',
        borderTop: '0.5px solid rgba(255,255,255,0.07)',
        flexShrink: 0,
        position: 'relative',
      }}>
        <AvatarComConsumo
          userName={userName}
          userAvatar={userAvatar}
          expanded={expanded}
          initialPlanBalance={planBalance}
          initialPlanTotal={planTotal}
          initialLumenBalance={lumenBalance}
          initialPlanId={planId}
        />
        <div style={{
          position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
          opacity: expanded ? 1 : 0, transition: 'opacity 0.18s',
          pointerEvents: expanded ? 'auto' : 'none',
        }}>
          <form action="/auth/signout" method="POST">
            <button type="submit" title="Sair" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'rgba(255,255,255,0.4)', display: 'flex' }}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <path d="M5 2H2.5A1.5 1.5 0 0 0 1 3.5v7A1.5 1.5 0 0 0 2.5 12H5M9 10l3-3-3-3M12 7H5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </form>
        </div>
      </div>
    </aside>
  )
}

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import React from 'react'
import { ConstellationN } from '@/components/brand'
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
const IconRetocar = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9"/>
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
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
      { label: 'identidade', href: '/app/settings/identity', exact: false, Icon: IconIdentity },
      { label: 'conta',      href: '/app/conta',             exact: false, Icon: IconAccount  },
      { label: 'planos',     href: '/app/billing',           exact: false, Icon: IconPlans    },
    ],
  },
]

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

  return (
    <aside
      style={{
        width: hovered ? 264 : 72,
        transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)',
        background: '#0a0a0a',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
        borderRight: '0.5px solid rgba(255,255,255,0.06)',
        height: '100vh',
        position: 'sticky',
        top: 0,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Logo */}
      <div style={{ padding: '15px 20px 15px 14px', display: 'flex', alignItems: 'center', gap: 12, height: 72, flexShrink: 0, color: '#ffffff' }}>
        <div style={{ flexShrink: 0, display: 'flex' }}>
          <ConstellationN size={42} />
        </div>
        <span style={{
          fontSize: 14, fontWeight: 500, color: '#ffffff',
          letterSpacing: '-0.03em',
          whiteSpace: 'nowrap' as const,
          opacity: hovered ? 1 : 0, transition: 'opacity 0.18s',
        }}>
          spacenode
        </span>
      </div>

      {/* Nav */}
      <nav className="spn-sidebar-nav" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0, padding: '4px 10px 12px' }}>
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.label} style={{ marginTop: gi === 0 ? 0 : 20 }}>
            <div style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.13em',
              textTransform: 'uppercase' as const,
              color: 'rgba(255,255,255,0.28)',
              padding: '0 10px', height: 22,
              display: 'flex', alignItems: 'center',
              whiteSpace: 'nowrap' as const,
              opacity: hovered ? 1 : 0,
              transition: 'opacity 0.18s',
              marginBottom: 4,
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
                  <div style={{
                    flexShrink: 0, display: 'flex',
                    color: disabled ? 'rgba(255,255,255,0.2)' : active ? '#ffffff' : isItemHovered ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.4)',
                    transition: 'color 0.2s',
                    transform: isItemHovered && !active ? 'translateY(-0.5px)' : 'translateY(0)',
                    transitionProperty: 'color, transform',
                    transitionDuration: '0.2s',
                  }}>
                    <Icon />
                  </div>
                  <span style={{
                    fontSize: 14,
                    color: disabled ? 'rgba(255,255,255,0.25)' : active ? '#ffffff' : isItemHovered ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.75)',
                    whiteSpace: 'nowrap' as const,
                    fontWeight: active ? 600 : 500,
                    letterSpacing: '-0.01em',
                    opacity: hovered ? 1 : 0,
                    transition: 'opacity 0.18s, color 0.2s',
                    flex: 1,
                  }}>
                    {label}
                  </span>
                  {badge && hovered && (
                    <span style={{
                      fontSize: 8, fontWeight: 600, letterSpacing: '0.08em',
                      textTransform: 'uppercase' as const,
                      color: badgeColor.color,
                      background: badgeColor.bg,
                      padding: '2px 6px', borderRadius: 20,
                      whiteSpace: 'nowrap' as const, flexShrink: 0,
                    }}>
                      {badge}
                    </span>
                  )}
                </>
              )

              const sharedStyle: React.CSSProperties = {
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '0 12px', height: 42, borderRadius: 9,
                textDecoration: 'none', flexShrink: 0,
                background: active
                  ? 'rgba(255,255,255,0.13)'
                  : isItemHovered
                    ? 'rgba(255,255,255,0.055)'
                    : 'transparent',
                boxShadow: isItemHovered && !active ? 'inset 0 0 0 0.5px rgba(255,255,255,0.08)' : 'none',
                transition: 'background 0.2s, box-shadow 0.2s',
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
      <div style={{ padding: '10px 8px', borderTop: '0.5px solid rgba(255,255,255,0.07)', flexShrink: 0, position: 'relative' }}>
        <AvatarComConsumo
          userName={userName}
          userAvatar={userAvatar}
          expanded={hovered}
          initialPlanBalance={planBalance}
          initialPlanTotal={planTotal}
          initialLumenBalance={lumenBalance}
          initialPlanId={planId}
        />
        <div style={{
          position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
          opacity: hovered ? 1 : 0, transition: 'opacity 0.18s',
          pointerEvents: hovered ? 'auto' : 'none',
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

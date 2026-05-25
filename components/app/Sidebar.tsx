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
const IconRetocar = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9"/>
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
  </svg>
)
const IconAccount = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4"/>
    <path d="M4 21a8 8 0 0 1 16 0"/>
  </svg>
)

type NavItem = {
  label: string
  href: string | null
  exact?: boolean
  Icon: () => React.ReactElement
  badge?: string
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'PROJETOS',
    items: [
      { label: 'dashboard',  href: '/app',          exact: true,  Icon: IconDashboard },
      { label: 'spaces',     href: '/app/spaces',   exact: false, Icon: IconSpaces    },
      { label: 'histórico',  href: '/app/history',  exact: false, Icon: IconHistory   },
    ],
  },
  {
    label: 'FERRAMENTAS',
    items: [
      { label: 'renderizar', href: '/app/generate', exact: false, Icon: IconGenerate  },
      { label: 'spaces',     href: '/app/spaces',   exact: false, Icon: IconSpaces, badge: 'novo' },
      { label: 'melhorar',   href: '/app/upscale',  exact: false, Icon: IconEnhance   },
      { label: 'editar',     href: '/app/editar',   exact: false, Icon: IconRetocar, badge: 'novo' },
      { label: 'animar',     href: '/app/video',    exact: false, Icon: IconVideo     },
    ],
  },
  {
    label: 'ESCRITÓRIO',
    items: [
      { label: 'planos',     href: '/app/billing',     exact: false, Icon: IconPlans   },
      { label: 'conta',      href: '/app/conta',       exact: false, Icon: IconAccount },
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
        width: hovered ? 224 : 62,
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
      <div style={{ padding: '18px 18px 14px 10px', display: 'flex', alignItems: 'center', gap: 12, height: 62, flexShrink: 0, color: '#ffffff' }}>
        <div style={{ flexShrink: 0, display: 'flex' }}>
          <ConstellationN size={22} />
        </div>
        <span style={{
          fontSize: 12, fontWeight: 500, color: '#ffffff',
          letterSpacing: '-0.025em',
          whiteSpace: 'nowrap' as const,
          opacity: hovered ? 1 : 0, transition: 'opacity 0.18s',
        }}>
          spacenode
        </span>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0, padding: '4px 8px', overflow: 'hidden' as const }}>
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.label} style={{ marginTop: gi === 0 ? 0 : 16 }}>
            <div style={{
              fontSize: 9, fontWeight: 600, letterSpacing: '0.14em',
              textTransform: 'uppercase' as const,
              color: 'rgba(255,255,255,0.2)',
              padding: '0 10px', height: 20,
              display: 'flex', alignItems: 'center',
              whiteSpace: 'nowrap' as const,
              opacity: hovered ? 1 : 0,
              transition: 'opacity 0.18s',
              marginBottom: 2,
            }}>
              {group.label}
            </div>

            {group.items.map(({ label, href, exact, Icon, badge }) => {
              const active = href
                ? (exact ? pathname === href : pathname.startsWith(href))
                : false
              const disabled = href === null
              const itemKey = href || label
              const isItemHovered = hoveredItem === itemKey



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
                    fontSize: 12,
                    color: disabled ? 'rgba(255,255,255,0.25)' : active ? '#ffffff' : isItemHovered ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.75)',
                    whiteSpace: 'nowrap' as const,
                    fontWeight: 400,
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
                      color: '#30b46c',
                      background: 'rgba(48,180,108,0.18)',
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
                padding: '0 10px', height: 44, borderRadius: 8,
                textDecoration: 'none', flexShrink: 0,
                background: active
                  ? 'rgba(255,255,255,0.1)'
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

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import React from 'react'
import { ConstellationN, Logo } from '@/components/brand'
import { AvatarComConsumo } from './AvatarComConsumo'
import type { PlanId } from '@/lib/plans'
import {
  IconProjects, IconDashboard, IconHistory,
  IconGenerate, IconSpaces, IconRetocar, IconEnhance, IconVideo, IconFinalizar,
  IconHumanizedPlan, IconIsometric, IconBoard, IconMoodboard,
  IconTeam, IconIdentity, IconAccount, IconPlans,
} from './sidebar-icons'

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
      { label: 'Meus projetos', href: '/app/spaces',   exact: false, match: (p) => p.startsWith('/app/spaces') && !p.startsWith('/app/spaces/new'), Icon: IconProjects },
      { label: 'Dashboard',     href: '/app',          exact: true,  Icon: IconDashboard },
      { label: 'Histórico',     href: '/app/history',  exact: false, Icon: IconHistory   },
    ],
  },
  {
    label: 'CRIAR',
    items: [
      { label: 'Renderizar', href: '/app/generate',    exact: false, Icon: IconGenerate  },
      { label: 'Spaces',     href: '/app/spaces/new',  exact: true,  Icon: IconSpaces    },
      { label: 'Editar',     href: '/app/editar',      exact: false, Icon: IconRetocar   },
      { label: 'Ampliar',    href: '/app/upscale',     exact: false, Icon: IconEnhance   },
      { label: 'Animar',     href: '/app/video',       exact: false, Icon: IconVideo     },
      { label: 'Finalizar',  href: '/app/finalizar',   exact: false, Icon: IconFinalizar },
    ],
  },
  {
    label: 'APRESENTAR',
    items: [
      { label: 'Planta humanizada', href: '/app/apresentar/planta-humanizada', exact: false, Icon: IconHumanizedPlan },
      { label: 'Isométricas',       href: '/app/apresentar/isometricas',       exact: false, Icon: IconIsometric    },
      { label: 'Prancha IA',        href: '/app/apresentar/prancha',           exact: false, Icon: IconBoard        },
      { label: 'Moodboard',         href: '/app/apresentar/moodboard',         exact: false, Icon: IconMoodboard    },
    ],
  },
  {
    label: 'ESCRITÓRIO',
    items: [
      { label: 'Equipe',     href: '/app/equipe',            exact: false, Icon: IconTeam      },
      { label: 'Identidade', href: '/app/settings/identity', exact: false, Icon: IconIdentity },
      { label: 'Conta',      href: '/app/conta',             exact: false, Icon: IconAccount  },
      { label: 'Planos',     href: '/app/billing',           exact: false, Icon: IconPlans    },
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

  // Sem botões: rail por padrão; abre quando o cursor se aproxima da sidebar.
  const expanded = hovered

  return (
    <aside
      style={{
        width: expanded ? SIDEBAR_EXPANDED : SIDEBAR_COLLAPSED,
        transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1), box-shadow 0.45s ease',
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
        justifyContent: expanded ? 'flex-start' : 'center',
        paddingLeft: expanded ? 20 : 0,
        color: '#ffffff',
        transition: 'padding 0.5s cubic-bezier(0.4,0,0.2,1)',
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
            // Abrir: some rápido. Fechar: entra depois que o lockup já saiu.
            transition: expanded ? 'opacity 0.18s ease' : 'opacity 0.26s ease 0.18s',
            pointerEvents: 'none',
          }}
        >
          <ConstellationN size={44} aria-hidden />
        </div>

        {/* Lockup horizontal compartilhado com a landing page — visível só expandido */}
        <div style={{
          opacity: expanded ? 1 : 0,
          // Abrir: entra depois que o N já saiu. Fechar: some rápido.
          transition: expanded ? 'opacity 0.34s ease 0.16s' : 'opacity 0.16s ease',
          whiteSpace: 'nowrap',
        }}>
          <Logo symbolSize={42} color="#ffffff" />
        </div>
      </div>

      {/* Hairline sob o logo — estrutura (estilo header premium) */}
      <div
        aria-hidden
        style={{
          height: 0.5,
          background: 'rgba(255,255,255,0.11)',
          margin: expanded ? '0 16px' : '0 14px',
          flexShrink: 0,
          transition: 'margin 0.5s cubic-bezier(0.4,0,0.2,1)',
        }}
      />

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
          <div key={group.label} style={{ marginTop: expanded ? (gi === 0 ? 0 : 14) : (gi === 0 ? 0 : 12) }}>
            {gi > 0 && (
              <div aria-hidden style={{
                height: 0.5,
                background: 'rgba(255,255,255,0.10)',
                margin: expanded ? '0 10px 13px' : '0 14px 12px',
                flexShrink: 0,
              }} />
            )}
            <div style={{
              fontSize: 10, fontWeight: 500, letterSpacing: '0.16em',
              textTransform: 'uppercase' as const,
              color: 'rgba(255,255,255,0.30)',
              padding: expanded ? '0 10px' : 0,
              height: expanded ? 22 : 8,
              display: 'flex', alignItems: 'center',
              whiteSpace: 'nowrap' as const,
              opacity: expanded ? 1 : 0,
              transition: 'opacity 0.3s ease 0.1s, height 0.34s ease',
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
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: disabled ? 'rgba(255,255,255,0.2)' : active ? '#ffffff' : isItemHovered ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.55)',
                    transition: 'color 0.2s',
                  }}>
                    <span style={{ display: 'flex', transform: 'scale(0.92)' }}>
                      <Icon />
                    </span>
                  </div>
                  <span style={{
                    fontSize: 13,
                    color: disabled ? 'rgba(255,255,255,0.25)' : active ? '#ffffff' : isItemHovered ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.72)',
                    whiteSpace: 'nowrap' as const,
                    fontWeight: active ? 540 : 450,
                    letterSpacing: '-0.012em',
                    opacity: expanded ? 1 : 0,
                    transition: 'opacity 0.3s ease 0.08s, color 0.2s',
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
                  ? 'rgba(255,255,255,0.06)'
                  : isItemHovered
                    ? 'rgba(255,255,255,0.035)'
                    : 'transparent',
                boxShadow: 'none',
                transition: 'background 0.18s ease',
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
          opacity: expanded ? 1 : 0, transition: 'opacity 0.3s ease',
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

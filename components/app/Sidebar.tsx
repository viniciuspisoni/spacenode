'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const IconDashboard = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="3" width="8" height="8" rx="1.5"/>
    <rect x="13" y="3" width="8" height="8" rx="1.5"/>
    <rect x="3" y="13" width="8" height="8" rx="1.5"/>
    <rect x="13" y="13" width="8" height="8" rx="1.5"/>
  </svg>
)
const IconGenerate = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M12 5v14M5 12h14"/>
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

const NAV = [
  { label: 'dashboard', href: '/app',          exact: true,  Icon: IconDashboard },
  { label: 'gerar',     href: '/app/generate', exact: false, Icon: IconGenerate  },
  { label: 'histórico', href: '/app/history',  exact: false, Icon: IconHistory   },
  { label: 'planos',    href: '/app/plans',    exact: false, Icon: IconPlans     },
]

interface SidebarProps {
  userName: string
  userAvatar: string | null
}

export default function Sidebar({ userName, userAvatar }: SidebarProps) {
  const pathname = usePathname()
  const [hovered, setHovered] = useState(false)

  const initials = userName
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

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
      <div style={{ padding: '18px 18px 14px', display: 'flex', alignItems: 'center', gap: 10, height: 62, flexShrink: 0 }}>
        <div style={{ width: 26, height: 26, borderRadius: 6, background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#0a0a0a', letterSpacing: '-0.02em' }}>S</span>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 600, color: '#ffffff',
          letterSpacing: '0.09em', textTransform: 'uppercase' as const,
          whiteSpace: 'nowrap' as const,
          opacity: hovered ? 1 : 0, transition: 'opacity 0.18s',
        }}>
          Spacenode
        </span>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 8px', overflowY: 'auto' as const }}>
        {NAV.map(({ label, href, exact, Icon }) => {
          const active = exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '0 10px', height: 52, borderRadius: 8,
                textDecoration: 'none', flexShrink: 0,
                background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
                transition: 'background 0.15s',
              }}
            >
              <div style={{ flexShrink: 0, display: 'flex', color: active ? '#ffffff' : 'rgba(255,255,255,0.4)' }}>
                <Icon />
              </div>
              <span style={{
                fontSize: 12,
                color: active ? '#ffffff' : 'rgba(255,255,255,0.75)',
                whiteSpace: 'nowrap' as const,
                fontWeight: 400,
                letterSpacing: '-0.01em',
                opacity: hovered ? 1 : 0,
                transition: 'opacity 0.18s',
              }}>
                {label}
              </span>
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div style={{ padding: '10px 8px', borderTop: '0.5px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 10px', height: 52, borderRadius: 8 }}>
          {userAvatar ? (
            <img
              src={userAvatar}
              alt={userName}
              style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' as const, flexShrink: 0 }}
            />
          ) : (
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, fontSize: 11, fontWeight: 600, color: '#ffffff',
            }}>
              {initials}
            </div>
          )}
          <div style={{ opacity: hovered ? 1 : 0, transition: 'opacity 0.18s', minWidth: 0, overflow: 'hidden', flex: 1 }}>
            <div style={{ fontSize: 11, color: '#ffffff', fontWeight: 500, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {userName}
            </div>
            <div style={{ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
              Plano Beta
            </div>
          </div>
          <div style={{ opacity: hovered ? 1 : 0, transition: 'opacity 0.18s', flexShrink: 0 }}>
            <form action="/auth/signout" method="POST">
              <button type="submit" title="Sair" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'rgba(255,255,255,0.4)', display: 'flex' }}>
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                  <path d="M5 2H2.5A1.5 1.5 0 0 0 1 3.5v7A1.5 1.5 0 0 0 2.5 12H5M9 10l3-3-3-3M12 7H5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </form>
          </div>
        </div>
      </div>
    </aside>
  )
}

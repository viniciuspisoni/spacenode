'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactElement, SVGProps } from 'react'
import Logo from '@/components/Logo'
import styles from './Sidebar.module.css'

type IconProps = SVGProps<SVGSVGElement>
type IconComponent = (props: IconProps) => ReactElement

const IconDashboard: IconComponent = props => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.45" {...props}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
  </svg>
)

const IconGenerate: IconComponent = props => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="3.5" y="4" width="17" height="16" rx="2.4" />
    <circle cx="8.5" cy="9" r="1.45" />
    <path d="m4 17 5.2-5.2c.7-.7 1.8-.7 2.5 0l1.3 1.3" />
    <path d="m13 13.1 2.2-2.2c.7-.7 1.8-.7 2.5 0L20 13.2" />
  </svg>
)

const IconHistory: IconComponent = props => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M4.3 12a7.7 7.7 0 1 0 2.25-5.45" />
    <path d="M4 6.2v4.2h4.2" />
    <path d="M12 7.6v4.7l3.1 1.9" />
  </svg>
)

const IconPlans: IconComponent = props => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="m12 3.4 8 4.1-8 4.1-8-4.1 8-4.1Z" />
    <path d="m4 12 8 4.1 8-4.1" />
    <path d="m4 16.6 8 4 8-4" />
  </svg>
)

const IconEnhance: IconComponent = props => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="m12 3.5 1.65 4.85L18.5 10l-4.85 1.65L12 16.5l-1.65-4.85L5.5 10l4.85-1.65L12 3.5Z" />
    <path d="m5 3.6.85 1.9L7.8 6.4 5.85 7.25 5 9.2l-.85-1.95L2.2 6.4l1.95-.9L5 3.6Z" />
    <path d="m18.8 14.1.75 1.75 1.75.75-1.75.75-.75 1.75-.75-1.75-1.75-.75 1.75-.75.75-1.75Z" />
  </svg>
)

const IconVideo: IconComponent = props => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="3.3" y="6.2" width="12.8" height="11.6" rx="2.2" />
    <path d="m16.1 10.1 4.6-2.7v9.2l-4.6-2.7" />
  </svg>
)

const IconSpaces: IconComponent = props => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="2.8" />
    <path d="M12 3.2v3" />
    <path d="M12 17.8v3" />
    <path d="M3.2 12h3" />
    <path d="M17.8 12h3" />
    <path d="m5.8 5.8 2.1 2.1" />
    <path d="m16.1 16.1 2.1 2.1" />
    <path d="m5.8 18.2 2.1-2.1" />
    <path d="m16.1 7.9 2.1-2.1" />
  </svg>
)

const IconSignOut: IconComponent = props => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M9.4 4.8H6.8a2 2 0 0 0-2 2v10.4a2 2 0 0 0 2 2h2.6" />
    <path d="M14.6 8.2 18.4 12l-3.8 3.8" />
    <path d="M18.1 12H9.3" />
  </svg>
)

type NavItem = {
  label: string
  href: string
  exact?: boolean
  Icon: IconComponent
  badge?: string
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Principal',
    items: [
      { label: 'Dashboard', href: '/app', exact: true, Icon: IconDashboard },
      { label: 'Histórico', href: '/app/history', Icon: IconHistory },
    ],
  },
  {
    label: 'Criar',
    items: [
      { label: 'Renderizar', href: '/app/generate', Icon: IconGenerate },
      { label: 'Spaces', href: '/app/spaces', Icon: IconSpaces, badge: 'novo' },
      { label: 'Melhorar', href: '/app/upscale', Icon: IconEnhance },
      { label: 'Animar', href: '/app/video', Icon: IconVideo },
    ],
  },
  {
    label: 'Negócios',
    items: [
      { label: 'Planos', href: '/app/plans', Icon: IconPlans },
    ],
  },
]

interface SidebarProps {
  userName: string
  userAvatar: string | null
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

export default function Sidebar({ userName, userAvatar }: SidebarProps) {
  const pathname = usePathname()
  const initials = userName
    .split(' ')
    .map(word => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <aside className={styles.sidebar} aria-label="Navegação principal">
      <div className={styles.brand}>
        <div className={styles.logoMark} aria-hidden="true">
          <Logo size={34} />
        </div>
        <div className={styles.brandCopy}>
          <span className={styles.brandName}>Spacenode</span>
          <span className={styles.brandMeta}>Studio visual</span>
        </div>
      </div>

      <nav className={styles.nav}>
        {NAV_GROUPS.map(group => (
          <section className={styles.group} key={group.label} aria-label={group.label}>
            <div className={styles.groupLabel}>{group.label}</div>

            <div className={styles.groupItems}>
              {group.items.map(({ label, href, exact, Icon, badge }) => {
                const active = exact ? pathname === href : pathname.startsWith(href)

                return (
                  <Link
                    key={href}
                    href={href}
                    className={cx(styles.navItem, active && styles.navItemActive)}
                    aria-current={active ? 'page' : undefined}
                    title={label}
                  >
                    <span className={styles.activeRail} aria-hidden="true" />
                    <span className={styles.iconFrame} aria-hidden="true">
                      <Icon className={styles.icon} focusable="false" />
                    </span>
                    <span className={styles.navText}>{label}</span>
                    {badge && <span className={styles.badge}>{badge}</span>}
                  </Link>
                )
              })}
            </div>
          </section>
        ))}
      </nav>

      <div className={styles.footer}>
        <div className={styles.account}>
          {userAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.avatar} src={userAvatar} alt={userName} />
          ) : (
            <div className={styles.initials} aria-hidden="true">
              {initials || 'SN'}
            </div>
          )}

          <div className={styles.accountCopy}>
            <span className={styles.userName}>{userName}</span>
            <span className={styles.plan}>Plano Beta</span>
          </div>

          <form action="/auth/signout" method="POST" className={styles.signOutForm}>
            <button className={styles.signOut} type="submit" title="Sair" aria-label="Sair da Spacenode">
              <IconSignOut className={styles.signOutIcon} focusable="false" aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  )
}

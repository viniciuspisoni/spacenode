import type { ReactNode } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getMarketingStaffContext } from '@/lib/marketing/auth'

// ── Painel editorial (staff only) ──────────────────────────────────────────────
// Gate duro no layout: não-staff recebe 404 (o painel não anuncia a própria
// existência). Cada API do namespace repete a checagem — defesa em profundidade;
// o proxy já redireciona não-logados para /login.

const NAV = [
  { href: '/admin/marketing',            label: 'Dashboard' },
  { href: '/admin/marketing/ads',        label: 'Tráfego' },
  { href: '/admin/marketing/ideias',     label: 'Ideias' },
  { href: '/admin/marketing/briefings',  label: 'Briefings' },
  { href: '/admin/marketing/aprovacao',  label: 'Aprovação' },
  { href: '/admin/marketing/assets',     label: 'Assets' },
  { href: '/admin/marketing/templates',  label: 'Templates' },
]

export default async function AdminMarketingLayout({ children }: { children: ReactNode }) {
  const ctx = await getMarketingStaffContext()
  if (!ctx) notFound()

  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4">
          <Link href="/admin/marketing" className="flex items-baseline gap-2">
            <span className="text-sm font-semibold tracking-tight">SPACENODE</span>
            <span className="text-xs uppercase tracking-[0.28em] text-text-tertiary">conteúdo</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {NAV.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-1.5 text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-xs text-text-tertiary">
            <span>{ctx.user.email}</span>
            <Link href="/app" className="rounded-md border border-border px-2.5 py-1 transition-colors hover:bg-surface">
              Voltar ao app
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  )
}

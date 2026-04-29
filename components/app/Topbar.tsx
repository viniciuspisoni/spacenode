'use client'

import { usePathname } from 'next/navigation'

const TITLES: Record<string, string> = {
  '/app': 'DASHBOARD',
  '/app/generate': 'RENDERIZAR',
  '/app/history': 'HISTÓRICO',
  '/app/plans': 'PLANOS',
}

interface TopbarProps {
  credits: number
}

export default function Topbar({ credits }: TopbarProps) {
  const pathname = usePathname()
  const title = TITLES[pathname] ?? 'SPACENODE'

  return (
    <div className="flex items-center justify-between mb-10">
      <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#86868b] m-0">
        {title}
      </p>
      <div className="flex items-center gap-2 text-[11px] text-[#86868b] tracking-[-0.005em]">
        <span
          className="w-[5px] h-[5px] rounded-full bg-[#30b46c] shrink-0"
          style={{ boxShadow: '0 0 6px rgba(48,180,108,0.4)' }}
        />
        <span className="text-[12px] font-medium text-[#1a1a1a] tabular-nums">
          {credits}
        </span>
        <span>nodes</span>
      </div>
    </div>
  )
}

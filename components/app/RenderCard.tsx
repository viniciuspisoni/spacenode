import type { RenderJob } from '@/lib/mock-data'

export default function RenderCard({ render }: { render: RenderJob }) {
  return (
    <div className="rounded-[10px] overflow-hidden cursor-pointer transition-transform duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-0.5">

      {/* Gradient thumbnail */}
      <div
        className="relative aspect-[4/3] rounded-[10px] overflow-hidden"
        style={{ background: render.thumbGradient }}
      >
        {/* Status — bottom-left, subtle */}
        <span
          className="absolute bottom-[10px] left-3 inline-flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.12em] text-white/90"
          style={{ textShadow: '0 1px 2px rgba(0,0,0,0.35)' }}
        >
          <span
            className="w-[5px] h-[5px] rounded-full bg-[var(--color-accent-green)] shrink-0"
            style={{ boxShadow: '0 0 4px var(--color-accent-green-glow)' }}
          />
          pronto
        </span>
      </div>

      {/* Meta — no background, just text on page surface */}
      <div className="flex items-baseline justify-between pt-3 px-1">
        <div className="min-w-0 mr-2">
          <p className="text-[13px] font-medium text-[var(--color-text-primary)] tracking-[-0.015em] truncate">
            {render.title}
          </p>
          <p className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5 tracking-[-0.005em]">
            {render.subtitle}
          </p>
        </div>
        <span className="text-[10px] text-[var(--color-text-quaternary)] tracking-[0.05em] tabular-nums shrink-0">
          {render.dateLabel}
        </span>
      </div>

    </div>
  )
}

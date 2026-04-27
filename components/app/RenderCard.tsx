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
            className="w-[5px] h-[5px] rounded-full bg-[#30d158] shrink-0"
            style={{ boxShadow: '0 0 4px rgba(48,209,88,0.6)' }}
          />
          pronto
        </span>
      </div>

      {/* Meta — no background, just text on page surface */}
      <div className="flex items-baseline justify-between pt-3 px-1">
        <div className="min-w-0 mr-2">
          <p className="text-[13px] font-medium text-[#1a1a1a] tracking-[-0.015em] truncate">
            {render.title}
          </p>
          <p className="text-[11px] text-[#86868b] mt-0.5 tracking-[-0.005em]">
            {render.subtitle}
          </p>
        </div>
        <span className="text-[10px] text-[#c7c7cc] tracking-[0.05em] tabular-nums shrink-0">
          {render.dateLabel}
        </span>
      </div>

    </div>
  )
}

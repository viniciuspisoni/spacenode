'use client'

interface ConfigBlockProps {
  label: string
  options: string[]
  value: string | string[]
  onChange: (value: string | string[]) => void
  multi?: boolean
}

export default function ConfigBlock({
  label,
  options,
  value,
  onChange,
  multi = false,
}: ConfigBlockProps) {
  const isSelected = (opt: string) =>
    multi ? (value as string[]).includes(opt) : value === opt

  const handleClick = (opt: string) => {
    if (multi) {
      const arr = value as string[]
      onChange(arr.includes(opt) ? arr.filter((v) => v !== opt) : [...arr, opt])
    } else {
      onChange(value === opt ? '' : opt)
    }
  }

  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-text-tertiary mb-3">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const selected = isSelected(opt)
          return (
            <button
              key={opt}
              type="button"
              onClick={() => handleClick(opt)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-150 ${
                selected
                  ? 'bg-text-primary text-bg'
                  : 'bg-surface text-text-secondary border border-border hover:border-text-tertiary hover:text-text-primary'
              }`}
            >
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}

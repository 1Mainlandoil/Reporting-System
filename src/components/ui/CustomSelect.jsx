import { useEffect, useRef, useState } from 'react'

const CustomSelect = ({ value, onChange, options = [], placeholder = 'Select...', className = '', fullWidth = true }) => {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = options.find((o) => o.value === value)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className={`relative ${fullWidth ? 'w-full' : 'inline-block min-w-[140px]'} ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition ${
          open
            ? 'border-[#a9cd39]/40 bg-[#131929] text-white'
            : 'border-white/10 bg-[#131929] text-slate-200 hover:border-white/20'
        }`}
      >
        <span className={selected ? 'text-white' : 'text-slate-500'}>
          {selected ? selected.label : placeholder}
        </span>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={`shrink-0 text-slate-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Dropdown list */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-full overflow-hidden rounded-xl border border-white/10 bg-[#131929] shadow-2xl shadow-black/60">
          <div className="max-h-56 overflow-y-auto py-1">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => { onChange(option.value); setOpen(false) }}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition ${
                  option.value === value
                    ? 'bg-[#a9cd39]/10 text-[#a9cd39]'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center ${option.value === value ? 'text-[#a9cd39]' : 'text-transparent'}`}>
                  ✓
                </span>
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default CustomSelect

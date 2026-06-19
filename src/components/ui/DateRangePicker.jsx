import { useMemo, useState } from 'react'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const pad = (value) => String(value).padStart(2, '0')

const toIso = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

const fromIso = (iso) => {
  if (!iso) return null
  const [year, month, day] = String(iso).split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

const addDays = (iso, days) => {
  const date = fromIso(iso)
  if (!date) return iso
  date.setDate(date.getDate() + days)
  return toIso(date)
}

const clampIso = (iso, maxDate) => {
  if (!iso) return ''
  return maxDate && iso > maxDate ? maxDate : iso
}

const formatDisplayDate = (iso) => {
  const date = fromIso(iso)
  if (!date) return ''
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
}

const formatRangeLabel = (from, to, emptyLabel) => {
  if (!from && !to) return emptyLabel
  if (from && to) {
    if (from === to) return formatDisplayDate(from)
    return `${formatDisplayDate(from)} - ${formatDisplayDate(to)}`
  }
  return formatDisplayDate(from || to)
}

const startOfWeek = (iso) => {
  const date = fromIso(iso)
  if (!date) return iso
  date.setDate(date.getDate() - date.getDay())
  return toIso(date)
}

const startOfMonth = (iso) => {
  const date = fromIso(iso)
  if (!date) return iso
  return toIso(new Date(date.getFullYear(), date.getMonth(), 1))
}

const getMonthCells = (monthDate) => {
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - first.getDay())
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return {
      iso: toIso(date),
      day: date.getDate(),
      inMonth: date.getMonth() === month,
    }
  })
}

const DateRangePicker = ({
  from = '',
  to = '',
  maxDate = '',
  onChange,
  label = 'Date range',
  emptyLabel = 'All dates',
  allowClear = true,
  align = 'right',
}) => {
  const todayIso = maxDate || toIso(new Date())
  const [open, setOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState(() => fromIso(from || to || todayIso) || new Date())

  const normalizedFrom = from && to && from > to ? to : from
  const normalizedTo = from && to && from > to ? from : to
  const cells = useMemo(() => getMonthCells(viewMonth), [viewMonth])
  const title = `${MONTHS[viewMonth.getMonth()]} ${viewMonth.getFullYear()}`
  const valueLabel = formatRangeLabel(normalizedFrom, normalizedTo, emptyLabel)

  const applyRange = (nextFrom, nextTo = nextFrom) => {
    const start = clampIso(nextFrom, todayIso)
    const end = clampIso(nextTo, todayIso)
    onChange?.(start && end && start > end ? { from: end, to: start } : { from: start, to: end })
  }

  const handleDayClick = (iso) => {
    if (todayIso && iso > todayIso) return
    if (!normalizedFrom || (normalizedFrom && normalizedTo)) {
      onChange?.({ from: iso, to: '' })
      return
    }
    applyRange(normalizedFrom, iso)
  }

  const presets = [
    ['Today', todayIso, todayIso],
    ['Yesterday', addDays(todayIso, -1), addDays(todayIso, -1)],
    ['This week', startOfWeek(todayIso), todayIso],
    ['This month', startOfMonth(todayIso), todayIso],
  ]

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((next) => !next)}
        className="flex min-w-[220px] items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-left text-sm font-semibold text-white outline-none transition hover:bg-white/10 focus:border-[#a9cd39]/50"
      >
        <span>
          <span className="block text-[10px] uppercase tracking-widest text-slate-500">{label}</span>
          <span className="block">{valueLabel}</span>
        </span>
        <span className="text-[#a9cd39]">▾</span>
      </button>

      {open && (
        <div
          className={`absolute top-full z-50 mt-3 w-[min(92vw,360px)] rounded-2xl border border-white/10 bg-[#0b1220] p-4 shadow-2xl shadow-black/40 ${
            align === 'left' ? 'left-0' : 'right-0'
          }`}
        >
          <div className="mb-3 grid grid-cols-2 gap-2">
            {presets.map(([presetLabel, presetFrom, presetTo]) => (
              <button
                key={presetLabel}
                type="button"
                onClick={() => applyRange(presetFrom, presetTo)}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-[#a9cd39]/30 hover:text-[#a9cd39]"
              >
                {presetLabel}
              </button>
            ))}
          </div>

          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10"
            >
              ‹
            </button>
            <p className="text-sm font-bold text-white">{title}</p>
            <button
              type="button"
              onClick={() => setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((day) => (
              <span key={day} className="py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                {day}
              </span>
            ))}
            {cells.map(({ iso, day, inMonth }) => {
              const selected = iso === normalizedFrom || iso === normalizedTo
              const inRange = normalizedFrom && normalizedTo && iso > normalizedFrom && iso < normalizedTo
              const disabled = todayIso && iso > todayIso
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleDayClick(iso)}
                  className={`h-9 rounded-lg text-sm font-semibold transition ${
                    selected
                      ? 'bg-[#a9cd39] text-black'
                      : inRange
                        ? 'bg-[#a9cd39]/15 text-[#a9cd39]'
                        : inMonth
                          ? 'text-slate-200 hover:bg-white/10'
                          : 'text-slate-700 hover:bg-white/5'
                  } ${disabled ? 'cursor-not-allowed opacity-25 hover:bg-transparent' : ''}`}
                >
                  {day}
                </button>
              )
            })}
          </div>

          <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/10 pt-3">
            {allowClear ? (
              <button
                type="button"
                onClick={() => onChange?.({ from: '', to: '' })}
                className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-400 transition hover:bg-white/5 hover:text-white"
              >
                Clear
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl bg-[#a9cd39] px-4 py-2 text-xs font-bold text-black transition hover:bg-[#bcd94a]"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default DateRangePicker

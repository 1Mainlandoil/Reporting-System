import { useMemo, useState } from 'react'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

const pad = (v) => String(v).padStart(2, '0')
const toIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fromIso = (iso) => {
  if (!iso) return null
  const [y, m, day] = String(iso).split('-').map(Number)
  if (!y || !m || !day) return null
  return new Date(y, m - 1, day)
}
const addDays = (iso, days) => {
  const d = fromIso(iso)
  if (!d) return iso
  d.setDate(d.getDate() + days)
  return toIso(d)
}
const clampIso = (iso, max) => (!iso ? '' : max && iso > max ? max : iso)
const fmt = (iso) => {
  const d = fromIso(iso)
  if (!d) return ''
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}
const rangeLabel = (from, to, empty) => {
  if (!from && !to) return empty
  if (from && to) return from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`
  return fmt(from || to)
}
const startOfWeek = (iso) => { const d = fromIso(iso); if (!d) return iso; d.setDate(d.getDate() - d.getDay()); return toIso(d) }
const startOfMonth = (iso) => { const d = fromIso(iso); if (!d) return iso; return toIso(new Date(d.getFullYear(), d.getMonth(), 1)) }

const getMonthCells = (monthDate) => {
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - first.getDay())
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return { iso: toIso(d), day: d.getDate(), inMonth: d.getMonth() === month }
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
  const [draft, setDraft] = useState({ from, to })
  const [viewMonth, setViewMonth] = useState(() => fromIso(from || to || todayIso) || new Date())

  const nFrom = draft.from && draft.to && draft.from > draft.to ? draft.to : draft.from
  const nTo   = draft.from && draft.to && draft.from > draft.to ? draft.from : draft.to
  const cells = useMemo(() => getMonthCells(viewMonth), [viewMonth])
  const title = `${MONTHS[viewMonth.getMonth()]} ${viewMonth.getFullYear()}`

  // committed values (what's actually applied)
  const nFromC = from && to && from > to ? to : from
  const nToC   = from && to && from > to ? from : to

  const applyDraft = (nextFrom, nextTo = nextFrom) => {
    const s = clampIso(nextFrom, todayIso)
    const e = clampIso(nextTo, todayIso)
    const result = s && e && s > e ? { from: e, to: s } : { from: s, to: e }
    setDraft(result)
  }

  const handleDayClick = (iso) => {
    if (todayIso && iso > todayIso) return
    if (!nFrom || (nFrom && nTo)) { setDraft({ from: iso, to: '' }); return }
    applyDraft(nFrom, iso)
  }

  const handleApply = () => {
    const s = clampIso(nFrom, todayIso)
    const e = clampIso(nTo || nFrom, todayIso)
    const result = s && e && s > e ? { from: e, to: s } : { from: s, to: e }
    onChange?.(result)
    setOpen(false)
  }

  const handleOpen = () => {
    setDraft({ from, to })
    setViewMonth(fromIso(from || to || todayIso) || new Date())
    setOpen(true)
  }

  const handleCancel = () => {
    setDraft({ from, to })
    setOpen(false)
  }

  const presets = [
    ['Today',      todayIso,              todayIso],
    ['Yesterday',  addDays(todayIso, -1), addDays(todayIso, -1)],
    ['Last 7 days',addDays(todayIso, -6), todayIso],
    ['Last 30 days',addDays(todayIso,-29), todayIso],
    ['This week',  startOfWeek(todayIso), todayIso],
    ['This month', startOfMonth(todayIso), todayIso],
  ]

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleOpen}
        className="flex min-w-[220px] items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-left text-sm font-semibold text-white outline-none transition hover:bg-white/10 focus:border-[#a9cd39]/50"
      >
        <span>
          <span className="block text-[10px] uppercase tracking-widest text-slate-500">{label}</span>
          <span className="block">{rangeLabel(nFromC, nToC, emptyLabel)}</span>
        </span>
        <span className="text-[#a9cd39]">▾</span>
      </button>

      {open && (
        <>
          {/* backdrop */}
          <div className="fixed inset-0 z-40" onClick={handleCancel} />

          <div
            className={`absolute top-full z-50 mt-3 w-[min(92vw,340px)] rounded-2xl border border-white/10 bg-[#0b1220] p-4 shadow-2xl shadow-black/50 ${
              align === 'left' ? 'left-0' : 'right-0'
            }`}
          >
            {/* Presets */}
            <div className="mb-3 grid grid-cols-3 gap-1.5">
              {presets.map(([pl, pf, pt]) => {
                const active = nFrom === pf && nTo === pt
                return (
                  <button
                    key={pl}
                    type="button"
                    onClick={() => applyDraft(pf, pt)}
                    className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition ${
                      active
                        ? 'border-[#a9cd39]/40 bg-[#a9cd39]/15 text-[#a9cd39]'
                        : 'border-white/10 bg-white/5 text-slate-300 hover:border-[#a9cd39]/30 hover:text-[#a9cd39]'
                    }`}
                  >
                    {pl}
                  </button>
                )
              })}
            </div>

            {/* Month nav */}
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setViewMonth((p) => new Date(p.getFullYear(), p.getMonth() - 1, 1))}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-sm text-slate-300 hover:bg-white/10"
              >‹</button>
              <p className="text-sm font-bold text-white">{title}</p>
              <button
                type="button"
                onClick={() => setViewMonth((p) => new Date(p.getFullYear(), p.getMonth() + 1, 1))}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-sm text-slate-300 hover:bg-white/10"
              >›</button>
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-0.5 text-center">
              {WEEKDAYS.map((d) => (
                <span key={d} className="py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">{d}</span>
              ))}
              {cells.map(({ iso, day, inMonth }) => {
                const isStart = iso === nFrom
                const isEnd   = iso === nTo
                const selected = isStart || isEnd
                const inRange = nFrom && nTo && iso > nFrom && iso < nTo
                const disabled = todayIso && iso > todayIso
                return (
                  <button
                    key={iso}
                    type="button"
                    disabled={disabled}
                    onClick={() => handleDayClick(iso)}
                    className={`h-8 rounded-lg text-sm font-semibold transition ${
                      selected
                        ? 'bg-[#a9cd39] text-black'
                        : inRange
                          ? 'bg-[#a9cd39]/15 text-[#a9cd39]'
                          : inMonth
                            ? 'text-slate-200 hover:bg-white/10'
                            : 'text-slate-700 hover:bg-white/5'
                    } ${disabled ? 'cursor-not-allowed opacity-20 hover:bg-transparent' : ''}`}
                  >
                    {day}
                  </button>
                )
              })}
            </div>

            {/* Footer */}
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-3">
              {allowClear ? (
                <button
                  type="button"
                  onClick={() => { setDraft({ from: '', to: '' }); onChange?.({ from: '', to: '' }); setOpen(false) }}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-400 transition hover:bg-white/5 hover:text-white"
                >
                  Clear
                </button>
              ) : <span />}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  className="rounded-lg bg-[#a9cd39] px-4 py-1.5 text-xs font-bold text-black transition hover:bg-[#bcd94a]"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default DateRangePicker

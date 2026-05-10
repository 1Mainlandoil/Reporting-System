import { useMemo } from 'react'

const StationMultiSelect = ({
  stations,
  selectedIds,
  onChange,
  label = 'Stations',
  className = '',
}) => {
  const sorted = useMemo(
    () => [...stations].sort((a, b) => a.name.localeCompare(b.name)),
    [stations],
  )

  const summary = selectedIds.length === 0 ? 'All stations' : `${selectedIds.length} selected`

  const toggle = (id) => {
    if (selectedIds.length === 0) {
      onChange([id])
      return
    }
    if (selectedIds.includes(id)) {
      const next = selectedIds.filter((sid) => sid !== id)
      onChange(next)
    } else {
      onChange([...selectedIds, id])
    }
  }

  const btnSecondary =
    'inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 active:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'

  return (
    <details
      className={`w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-sm open:shadow-md dark:border-slate-700 dark:bg-slate-900 ${className}`.trim()}
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-3 marker:content-['']">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </span>
        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
          {summary}
        </span>
        <span className="ml-auto text-xs tabular-nums text-slate-400 dark:text-slate-500">{sorted.length} total</span>
      </summary>

      <div className="space-y-3 border-t border-slate-100 p-4 dark:border-slate-800">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onChange(sorted.map((s) => s.id))} className={btnSecondary}>
            Select all
          </button>
          <button type="button" onClick={() => onChange([])} className={btnSecondary}>
            Clear (all stations)
          </button>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/90 dark:border-slate-700 dark:bg-slate-950/50">
          <div className="max-h-52 space-y-1 overflow-y-auto p-2">
            {sorted.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-slate-500 dark:text-slate-400">No stations loaded.</p>
            ) : (
              sorted.map((s) => (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-slate-800 hover:bg-white dark:text-slate-200 dark:hover:bg-slate-800/80"
                >
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-900"
                    checked={selectedIds.length > 0 && selectedIds.includes(s.id)}
                    onChange={() => toggle(s.id)}
                  />
                  <span className="min-w-0 flex-1 truncate leading-snug">{s.name}</span>
                </label>
              ))
            )}
          </div>
        </div>

        <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
          Leave selection empty to include every station. Choose specific stations to narrow the table and Excel export.
        </p>
      </div>
    </details>
  )
}

export default StationMultiSelect

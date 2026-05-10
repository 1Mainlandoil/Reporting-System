import { useMemo } from 'react'

const btnSecondary =
  'inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 active:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'

const ColumnPicker = ({
  columns,
  visibleKeys,
  onToggleKey,
  onSelectAll,
  onResetDefaults,
  resetLabel = 'Default columns',
  summaryLabel = 'Columns',
  className = '',
}) => {
  const pickable = useMemo(() => {
    const list = columns.filter((c) => c.pickable !== false)
    return [...list].sort((a, b) => String(a.header).localeCompare(String(b.header)))
  }, [columns])

  const visibleCount = pickable.filter((c) => visibleKeys.has(c.key)).length
  const summary =
    pickable.length > 0 && visibleCount === pickable.length ? 'All columns' : `${visibleCount} shown`

  return (
    <div
      className={`flex w-full max-w-xl flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 ${className}`.trim()}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {summaryLabel}
        </span>
        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
          {summary}
        </span>
        <span className="ml-auto text-xs tabular-nums text-slate-400 dark:text-slate-500">
          {pickable.length} available
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onSelectAll} className={btnSecondary}>
          Select all
        </button>
        {typeof onResetDefaults === 'function' ? (
          <button type="button" onClick={onResetDefaults} className={btnSecondary}>
            {resetLabel}
          </button>
        ) : null}
      </div>

      <div className="min-h-[10rem] rounded-lg border border-slate-200 bg-slate-50/90 dark:border-slate-700 dark:bg-slate-950/50">
        <div className="max-h-52 space-y-1 overflow-y-auto p-2">
          {pickable.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-slate-500 dark:text-slate-400">No columns.</p>
          ) : (
            pickable.map((col) => (
              <label
                key={col.key}
                className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-slate-800 hover:bg-white dark:text-slate-200 dark:hover:bg-slate-800/80"
              >
                <input
                  type="checkbox"
                  className="size-4 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-900"
                  checked={visibleKeys.has(col.key)}
                  onChange={() => onToggleKey(col.key)}
                />
                <span className="min-w-0 flex-1 leading-snug">{col.header}</span>
              </label>
            ))
          )}
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
        Uncheck to hide from table and Excel export. At least one column must stay visible.
      </p>
    </div>
  )
}

export default ColumnPicker

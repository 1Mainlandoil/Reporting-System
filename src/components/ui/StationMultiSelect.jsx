import { useMemo } from 'react'

const StationMultiSelect = ({ stations, selectedIds, onChange, label = 'Stations', className = '' }) => {
  const sorted = useMemo(() => [...stations].sort((a, b) => a.name.localeCompare(b.name)), [stations])
  const summary = selectedIds.length === 0 ? 'All stations' : `${selectedIds.length} selected`

  const toggle = (id) => {
    if (selectedIds.length === 0) { onChange([id]); return }
    if (selectedIds.includes(id)) { onChange(selectedIds.filter((sid) => sid !== id)) }
    else { onChange([...selectedIds, id]) }
  }

  const btnCls = 'inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/10 transition'

  return (
    <details className={`w-full max-w-xl rounded-2xl border border-white/5 bg-white/5 ${className}`.trim()}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-3 marker:content-['']">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
        <span className="rounded-full bg-[#a9cd39]/15 px-2.5 py-0.5 text-xs font-medium text-[#a9cd39]">{summary}</span>
        <span className="ml-auto text-xs text-slate-500">{sorted.length} total</span>
      </summary>
      <div className="space-y-3 border-t border-white/5 p-4">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onChange(sorted.map((s) => s.id))} className={btnCls}>Select all</button>
          <button type="button" onClick={() => onChange([])} className={btnCls}>Clear</button>
        </div>
        <div className="rounded-xl border border-white/5 bg-black/20">
          <div className="max-h-52 space-y-0.5 overflow-y-auto p-2">
            {sorted.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-slate-500">No stations loaded.</p>
            ) : sorted.map((s) => (
              <label key={s.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm text-slate-300 hover:bg-white/5 transition">
                <input
                  type="checkbox"
                  className="size-4 shrink-0 rounded border-white/20 accent-[#a9cd39]"
                  checked={selectedIds.length > 0 && selectedIds.includes(s.id)}
                  onChange={() => toggle(s.id)}
                />
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
              </label>
            ))}
          </div>
        </div>
        <p className="text-xs text-slate-500">Leave empty to include all stations.</p>
      </div>
    </details>
  )
}

export default StationMultiSelect

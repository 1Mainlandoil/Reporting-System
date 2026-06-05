import StationMultiSelect from './StationMultiSelect'

const selectCls = 'h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 focus:border-[#a9cd39]/50 focus:outline-none'

const FilterBar = ({
  stations,
  filters,
  onFilterChange,
  onReset,
  variant = 'inline',
  statusTitle = 'Stock alert status',
  statusDescription = 'Narrow rows by how critical remaining stock is.',
}) => {
  const stationIds = Array.isArray(filters.stationIds) ? filters.stationIds : []

  const statusSelect = (
    <select
      value={filters.status}
      onChange={(event) => onFilterChange('status', event.target.value)}
      className={selectCls + ' sm:max-w-sm'}
    >
      <option value="all">All Statuses</option>
      <option value="critical">Critical</option>
      <option value="warning">Warning</option>
      <option value="safe">Safe</option>
    </select>
  )

  if (variant === 'stacked') {
    return (
      <div className="flex w-full flex-col gap-6">
        <StationMultiSelect
          stations={stations}
          selectedIds={stationIds}
          onChange={(ids) => onFilterChange('stationIds', ids)}
          label="Retail stations"
          className="max-w-none w-full"
        />
        <div className="rounded-2xl border border-white/5 bg-white/5 p-5">
          <header className="mb-4 border-b border-white/5 pb-3">
            <h3 className="text-sm font-semibold text-white">{statusTitle}</h3>
            <p className="mt-1 text-xs text-slate-500">{statusDescription}</p>
          </header>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">{statusSelect}</div>
            <button
              type="button"
              onClick={onReset}
              className="h-11 shrink-0 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/10 transition"
            >
              Reset filters
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(min(100%,18rem),28rem)_auto_auto] lg:items-start">
      <StationMultiSelect
        stations={stations}
        selectedIds={stationIds}
        onChange={(ids) => onFilterChange('stationIds', ids)}
        label="Retail stations"
      />
      {statusSelect}
      <button
        type="button"
        onClick={onReset}
        className="h-10 shrink-0 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/10 transition"
      >
        Reset
      </button>
    </div>
  )
}

export default FilterBar

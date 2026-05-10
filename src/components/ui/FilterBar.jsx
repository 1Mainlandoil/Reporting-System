import StationMultiSelect from './StationMultiSelect'

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
      className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 sm:max-w-sm"
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
          className="max-w-none w-full shadow-sm"
        />
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <header className="mb-4 border-b border-slate-100 pb-3 dark:border-slate-800">
            <h3 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">{statusTitle}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{statusDescription}</p>
          </header>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">{statusSelect}</div>
            <button
              type="button"
              onClick={onReset}
              className="h-11 shrink-0 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-600 dark:text-slate-200"
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
        className="h-10 shrink-0 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
      >
        Reset
      </button>
    </div>
  )
}

export default FilterBar

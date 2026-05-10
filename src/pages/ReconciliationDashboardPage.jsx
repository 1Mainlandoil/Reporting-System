import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Card from '../components/ui/Card'
import ColumnPicker from '../components/ui/ColumnPicker'
import DataTable from '../components/ui/DataTable'
import FilterBar from '../components/ui/FilterBar'
import StatusBadge from '../components/ui/StatusBadge'
import EmptyState from '../components/ui/EmptyState'
import ErrorNotice from '../components/ui/ErrorNotice'
import { useAppStore } from '../store/useAppStore'
import { buildReconciliationRow } from '../utils/reconciliation'
import { columnsToExportSpecs, filterColumnsForTable } from '../utils/columnVisibility'
import { exportReconciliationToExcel } from '../utils/exportExcel'
import { matchesStationMultiFilter } from '../utils/filterUtils'

const ReconciliationDashboardPage = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const stations = useAppStore((state) => state.stations)
  const reports = useAppStore((state) => state.reports)
  const filters = useAppStore((state) => state.filters)
  const setFilter = useAppStore((state) => state.setFilter)
  const clearFilters = useAppStore((state) => state.clearFilters)
  const refreshFromSupabase = useAppStore((state) => state.refreshFromSupabase)
  const productParam = searchParams.get('product')
  const productView = productParam === 'ago' ? 'ago' : 'pms'
  const reconciliationFiltersScreen = searchParams.get('filters') === '1'
  const setProductView = (product) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('product', product)
      next.delete('filters')
      return next
    })
  }
  const openReconciliationFiltersScreen = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('filters', '1')
      return next
    })
  }
  const closeReconciliationFiltersScreen = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('filters')
      return next
    })
  }
  const todayLabel = new Date().toLocaleDateString()

  const [reconciliationVisibleKeys, setReconciliationVisibleKeys] = useState(() => new Set())
  const [exportNotice, setExportNotice] = useState('')

  const rows = useMemo(
    () =>
      [...stations]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((station) => {
          const stationReports = reports.filter((report) => report.stationId === station.id)
          return buildReconciliationRow(station, stationReports, productView)
        }),
    [productView, reports, stations],
  )

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (!matchesStationMultiFilter(row.stationId, filters)) {
          return false
        }
        if (filters.status !== 'all' && row.status !== filters.status) {
          return false
        }
        return true
      }),
    [rows, filters],
  )

  const columns = useMemo(
    () => [
      {
        key: 'stationName',
        header: 'Retail Station',
        exportHeader: 'station',
        pickable: true,
        exportPick: (row) => row.stationName,
      },
      {
        key: 'stationId',
        header: 'Station ID',
        exportHeader: 'station_id',
        pickable: true,
        exportPick: (row) => row.stationId,
      },
      {
        key: '_product',
        header: 'Product',
        exportHeader: 'product',
        pickable: true,
        exportPick: () => productView.toUpperCase(),
      },
      {
        key: 'currentConstant',
        header: `Expected Remaining Stock as of ${todayLabel} (L)`,
        exportHeader: 'running_constant_litres',
        pickable: true,
        exportPick: (row) => Math.round(row.currentConstant),
        render: (row) => Math.round(row.currentConstant).toLocaleString(),
      },
      {
        key: 'latestOpening',
        header: 'Opening Stock Entered Today (L)',
        exportHeader: 'opening_stock_litres',
        pickable: true,
        exportPick: (row) => Math.round(row.latestOpening),
        render: (row) => Math.round(row.latestOpening).toLocaleString(),
      },
      {
        key: 'latestReceived',
        header: 'Product Received Today (L)',
        exportHeader: 'received_litres',
        pickable: true,
        exportPick: (row) => Math.round(row.latestReceived),
        render: (row) => Math.round(row.latestReceived).toLocaleString(),
      },
      {
        key: 'latestSales',
        header: 'Product Sold Today (L)',
        exportHeader: 'sales_litres',
        pickable: true,
        exportPick: (row) => Math.round(row.latestSales),
        render: (row) => Math.round(row.latestSales).toLocaleString(),
      },
      {
        key: 'variance',
        header: 'Variance (L)',
        exportHeader: 'variance_litres',
        pickable: true,
        exportPick: (row) => Math.round(row.variance),
        render: (row) => Math.round(row.variance).toLocaleString(),
      },
      {
        key: 'status',
        header: 'Stock Alert',
        exportHeader: 'status',
        pickable: true,
        exportPick: (row) => row.status,
        render: (row) => <StatusBadge status={row.status} />,
      },
      {
        key: 'reportDate',
        header: 'Report Date',
        exportHeader: 'report_date',
        pickable: true,
        exportPick: (row) => row.reportDate,
      },
    ],
    [productView, todayLabel],
  )

  useEffect(() => {
    setReconciliationVisibleKeys(new Set(columns.filter((c) => c.pickable !== false).map((c) => c.key)))
  }, [columns])

  const visibleReconciliationColumns = filterColumnsForTable(columns, reconciliationVisibleKeys)

  const reconciliationFiltersSummary = useMemo(() => {
    const ids = Array.isArray(filters.stationIds) ? filters.stationIds : []
    const stationPart = ids.length === 0 ? 'All stations' : `${ids.length} stations`
    const statusPart = filters.status === 'all' ? 'All statuses' : filters.status
    const pickable = columns.filter((c) => c.pickable !== false)
    const vis = pickable.filter((c) => reconciliationVisibleKeys.has(c.key)).length
    const colPart =
      pickable.length > 0 && vis >= pickable.length ? 'All columns' : `${vis}/${pickable.length} columns`
    return `${stationPart} · ${statusPart} · ${colPart}`
  }, [filters.stationIds, filters.status, columns, reconciliationVisibleKeys])

  const toggleReconciliationColumn = (key) => {
    setReconciliationVisibleKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        if (next.size <= 1) {
          return prev
        }
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const reconciliationFiltersPanel = (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <ColumnPicker
        columns={columns}
        visibleKeys={reconciliationVisibleKeys}
        onToggleKey={toggleReconciliationColumn}
        onSelectAll={() =>
          setReconciliationVisibleKeys(new Set(columns.filter((c) => c.pickable !== false).map((c) => c.key)))
        }
        summaryLabel="Reconciliation columns"
        className="max-w-none w-full"
      />
      <FilterBar
        variant="stacked"
        stations={stations}
        filters={filters}
        onFilterChange={setFilter}
        onReset={clearFilters}
      />
    </div>
  )

  const criticalCount = rows.filter((row) => row.status === 'critical').length
  const warningCount = rows.filter((row) => row.status === 'warning').length

  return (
    <div className="space-y-4">
      <Card className="hidden flex-col gap-3 md:flex md:flex-row">
        <button
          onClick={() => setProductView('pms')}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            productView === 'pms'
              ? 'bg-red-600/90 text-white'
              : 'border border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-200'
          }`}
        >
          PMS Reconciliation
        </button>
        <button
          onClick={() => setProductView('ago')}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            productView === 'ago'
              ? 'bg-red-600/90 text-white'
              : 'border border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-200'
          }`}
        >
          AGO Reconciliation
        </button>
      </Card>

      <Card
        className={
          reconciliationFiltersScreen
            ? 'mx-auto max-w-5xl space-y-8 overflow-hidden px-4 py-6 sm:px-8 sm:py-8'
            : 'space-y-4'
        }
      >
        {reconciliationFiltersScreen ? (
          <>
            <div className="flex flex-wrap items-start gap-4 border-b border-slate-200 pb-6 dark:border-slate-700">
              <button
                type="button"
                onClick={closeReconciliationFiltersScreen}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 dark:border-slate-600 dark:text-slate-200"
              >
                ← Back to overview
              </button>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
                  {productView === 'pms' ? 'PMS' : 'AGO'} reconciliation · Filters
                </h2>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                  Columns first, then retail stations and alert status. Use PMS / AGO tabs above to switch product
                  without losing filter choices.
                </p>
              </div>
            </div>
            {reconciliationFiltersPanel}
            <div className="-mx-4 flex justify-end border-t border-slate-200 bg-slate-50/90 px-4 py-5 pb-24 sm:-mx-8 sm:px-8 sm:pb-6 dark:border-slate-700 dark:bg-slate-900/60">
              <button
                type="button"
                onClick={closeReconciliationFiltersScreen}
                className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h3 className="text-lg font-semibold">
                {productView === 'pms' ? 'PMS' : 'AGO'} Reconciliation Overview
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={openReconciliationFiltersScreen}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm dark:bg-white dark:text-slate-900"
                >
                  Filters
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setExportNotice('')
                    if (!filteredRows.length) {
                      setExportNotice('No rows match the current filters. Adjust filters and try export again.')
                      return
                    }
                    exportReconciliationToExcel(
                      filteredRows,
                      productView,
                      columnsToExportSpecs(visibleReconciliationColumns),
                    )
                    await refreshFromSupabase()
                  }}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
                >
                  Export {productView.toUpperCase()} Reconciliation (filtered)
                </button>
              </div>
            </div>
            <ErrorNotice message={exportNotice} />
            <div className="rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                <span className="font-medium text-slate-800 dark:text-slate-100">Active filters:</span>{' '}
                {reconciliationFiltersSummary}
              </p>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Showing {filteredRows.length} of {rows.length} stations · export matches visible columns
            </p>
            {rows.length ? (
              filteredRows.length ? (
                <DataTable
                  columns={visibleReconciliationColumns}
                  rows={filteredRows}
                  onRowClick={(row) => navigate(`/stations/${row.stationId}`)}
                />
              ) : (
                <EmptyState
                  title="No stations match these filters"
                  message="Open Filters to adjust stations or status."
                />
              )
            ) : (
              <EmptyState
                title="No reconciliation data"
                message="Submit station reports to start automatic stock reconciliation."
              />
            )}
          </>
        )}
      </Card>
    </div>
  )
}

export default ReconciliationDashboardPage

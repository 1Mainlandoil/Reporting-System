import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Card from '../components/ui/Card'
import DataTable from '../components/ui/DataTable'
import EmptyState from '../components/ui/EmptyState'
import ErrorNotice from '../components/ui/ErrorNotice'
import StaffClosingReportForm from '../components/staff/StaffClosingReportForm'
import { useAppStore } from '../store/useAppStore'
import { ROLES } from '../constants/roles'
import { exportStationHistoryToExcel } from '../utils/exportExcel'
import { getClosingForProduct } from '../utils/reportFields'
import { addCalendarDaysIso, formatStaffCalendarDay, getOldestMissingReportDateUpTo } from '../utils/reportPending'

const REVIEW_STATUS_OPTIONS = ['Reviewed', 'Needs Attention', 'Escalated']

const getReceivedProductType = (row) => {
  if (row?.noSalesDay) {
    return 'No Sales Day'
  }
  if (!row?.receivedProduct) {
    return 'No'
  }
  const receivedPMS = Number(row.receivedPMS ?? 0)
  const receivedAGO = Number(row.receivedAGO ?? 0)
  if (receivedPMS > 0 && receivedAGO > 0) {
    return 'PMS + AGO'
  }

  if (row.receivedProductType === 'AGO' || row.receivedProductType === 'PMS') {
    return row.receivedProductType
  }

  if (Number(row.receivedAGO ?? 0) > 0) {
    return 'AGO'
  }

  return 'PMS'
}

const getReadingValue = (item) => {
  if (!item || typeof item !== 'object') {
    return null
  }
  if (item.closing != null && item.closing !== '') {
    return Number(item.closing)
  }
  if (item.end != null && item.end !== '') {
    return Number(item.end)
  }
  if (item.start != null && item.start !== '') {
    return Number(item.start)
  }
  return null
}

const buildPumpMeterRows = (priorMap, todayList = []) => {
  const todayMap = new Map()
  for (const item of todayList) {
    const label = String(item?.label || '').trim()
    if (!label) continue
    const reading = getReadingValue(item)
    if (reading == null || Number.isNaN(reading)) continue
    todayMap.set(label, reading)
  }

  const labels = new Set([...priorMap.keys(), ...todayMap.keys()])
  return [...labels]
    .sort((a, b) => a.localeCompare(b))
    .map((label) => {
      const opening = priorMap.has(label) ? priorMap.get(label) : null
      const todayClosing = todayMap.has(label) ? todayMap.get(label) : null
      if (todayClosing != null) {
        return {
          label,
          opening,
          closing: todayClosing,
          used: true,
          delta: opening != null ? todayClosing - opening : null,
        }
      }
      if (opening != null) {
        return { label, opening, closing: opening, used: false, delta: 0 }
      }
      return { label, opening: null, closing: null, used: false, delta: null, noBaseline: true }
    })
}

const StationReportHistoryPage = () => {
  const { stationId } = useParams()
  const role = useAppStore((state) => state.role)
  const currentUser = useAppStore((state) => state.currentUser)
  const stations = useAppStore((state) => state.stations)
  const storeReports = useAppStore((state) => state.reports)
  const submitReport = useAppStore((state) => state.submitReport)
  const updateReportSupervisorReview = useAppStore((state) => state.updateReportSupervisorReview)
  const reportingConfiguration = useAppStore((state) => state.appSettings.reportingConfiguration)
  const refreshFromSupabase = useAppStore((state) => state.refreshFromSupabase)
  const [reviewDrafts, setReviewDrafts] = useState({})
  const [selectedReportId, setSelectedReportId] = useState('')
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false)
  const [historyFilterDate, setHistoryFilterDate] = useState('')
  const [exportNotice, setExportNotice] = useState('')

  const station = stations.find((item) => item.id === stationId)

  const chronAsc = useMemo(
    () =>
      [...storeReports]
        .filter((report) => report.stationId === stationId && report.date)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [storeReports, stationId],
  )
  const reports = useMemo(() => [...chronAsc].reverse(), [chronAsc])

  const todayIso = new Date().toISOString().split('T')[0]
  const reportDatesSet = useMemo(() => new Set(chronAsc.map((r) => r.date)), [chronAsc])

  const reportSubmitOpening = useMemo(() => {
    if (!historyFilterDate) {
      return { pms: 0, ago: 0 }
    }
    const prior = [...chronAsc]
      .filter((r) => r.date < historyFilterDate)
      .sort((a, b) => b.date.localeCompare(a.date))[0]
    return {
      pms: prior ? getClosingForProduct(prior, 'pms') : 0,
      ago: prior ? getClosingForProduct(prior, 'ago') : 0,
    }
  }, [chronAsc, historyFilterDate])
  const reportSubmitCashBf = useMemo(() => {
    if (!historyFilterDate) {
      return 0
    }
    const prior = [...chronAsc]
      .filter((r) => r.date < historyFilterDate)
      .sort((a, b) => b.date.localeCompare(a.date))[0]
    return Number(prior?.closingBalance || 0)
  }, [chronAsc, historyFilterDate])

  const filterDateAlreadySubmitted = Boolean(historyFilterDate && reportDatesSet.has(historyFilterDate))

  const isStaffOwnStation = role === ROLES.STAFF && currentUser?.stationId === stationId

  /** Single date staff may file next (matches submitReport catch-up validation). */
  const nextAllowedSubmitDate = useMemo(() => {
    const oldest = getOldestMissingReportDateUpTo(todayIso, reportDatesSet)
    if (oldest != null) {
      return oldest
    }
    if (chronAsc.length === 0) {
      return todayIso
    }
    return null
  }, [todayIso, reportDatesSet, chronAsc.length])

  const staffReportDateSelectOptions = useMemo(() => {
    let rangeStart = chronAsc.length ? chronAsc[0].date : todayIso
    const capStart = addCalendarDaysIso(todayIso, -550)
    if (rangeStart < capStart) {
      rangeStart = capStart
    }
    const rows = []
    let d = rangeStart
    while (d <= todayIso) {
      const submitted = reportDatesSet.has(d)
      const isNextToFile =
        nextAllowedSubmitDate != null && d === nextAllowedSubmitDate && !submitted
      rows.push({
        iso: d,
        submitted,
        /** Submitted days greyed out; other missing days greyed until prior gaps are filed. */
        disabled: submitted || !isNextToFile,
      })
      d = addCalendarDaysIso(d, 1)
    }
    return rows
  }, [chronAsc, todayIso, reportDatesSet, nextAllowedSubmitDate])

  useEffect(() => {
    if (!isStaffOwnStation || !historyFilterDate) {
      return
    }
    if (reportDatesSet.has(historyFilterDate)) {
      setHistoryFilterDate('')
      return
    }
    if (
      nextAllowedSubmitDate != null &&
      historyFilterDate !== nextAllowedSubmitDate
    ) {
      setHistoryFilterDate(nextAllowedSubmitDate)
    }
  }, [isStaffOwnStation, historyFilterDate, reportDatesSet, nextAllowedSubmitDate])

  const filteredReports = reports.filter((report) => {
    if (historyFilterDate && report.date !== historyFilterDate) {
      return false
    }
    return true
  })
  const isSupervisor = role === ROLES.SUPERVISOR

  if (!station) {
    return <EmptyState title="Station not found" message="The selected retail station does not exist." />
  }

  const getExpenseTotal = (row) => {
    if (Array.isArray(row.expenseItems)) {
      return row.expenseItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
    }
    return Number(row.expenseAmount ?? 0)
  }

  const getExpenseDescription = (row) => {
    if (Array.isArray(row.expenseItems) && row.expenseItems.length) {
      return row.expenseItems
        .map((item) => `${item.label} (NGN ${Math.round(item.amount).toLocaleString()})`)
        .join(', ')
    }
    return row.expenseDescription || '-'
  }

  const getPaymentTotal = (row) => {
    if (Array.isArray(row.paymentBreakdown) && row.paymentBreakdown.length) {
      return row.paymentBreakdown.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
    }
    return Number(row.totalPaymentDeposits ?? 0)
  }
  const getPosValue = (row) => Number(row.posValue ?? 0)

  const getPaymentChannels = (row) => {
    if (!Array.isArray(row.paymentBreakdown) || row.paymentBreakdown.length === 0) {
      return '-'
    }
    return row.paymentBreakdown
      .map((item) => `${item.channel} (NGN ${Math.round(Number(item.amount) || 0).toLocaleString()})`)
      .join(', ')
  }

  const getCashMovementGap = (row) => {
    const totalAmount = Number(row.cashBf ?? 0) + Number(row.cashSales ?? 0)
    const closingBalance = Number(row.closingBalance ?? 0)
    return totalAmount - closingBalance - getPaymentTotal(row) - getPosValue(row)
  }

  const getPumpSummary = (row) => {
    if (Array.isArray(row.pumpMeterRows) && row.pumpMeterRows.length) {
      return row.pumpMeterRows
        .map((item) => {
          if (item.noBaseline) {
            return `${item.label}: no baseline`
          }
          const opening = item.opening == null ? '-' : item.opening
          const closing = item.closing == null ? '-' : item.closing
          const tag = item.used ? 'used' : 'unused'
          return `${item.label}: ${opening}-${closing} (${tag})`
        })
        .join(', ')
    }
    if (!Array.isArray(row.pumpReadings) || row.pumpReadings.length === 0) {
      return '-'
    }
    return row.pumpReadings
      .map((item) => {
        const closing = getReadingValue(item)
        return `${item.label}: closing ${closing ?? '-'}`
      })
      .join(', ')
  }

  const reportsWithReview = useMemo(() => {
    const priorClosings = new Map()
    const enrichedById = new Map()
    for (const report of chronAsc) {
      const pumpRows = buildPumpMeterRows(priorClosings, report.pumpReadings)
      for (const row of pumpRows) {
        if (row.closing != null) {
          priorClosings.set(row.label, row.closing)
        }
      }
      enrichedById.set(report.id, {
        ...report,
        pumpMeterRows: pumpRows,
      })
    }
    return filteredReports.map((report) => {
      const enriched = enrichedById.get(report.id) || report
      return {
        ...enriched,
        reviewStatus: report.supervisorReview?.status || '-',
        supervisorNote: report.supervisorReview?.remark || '-',
        reviewedBy: report.supervisorReview?.reviewedBy || '-',
      }
    })
  }, [chronAsc, filteredReports])
  const selectedReport =
    reportsWithReview.find((report) => report.id === selectedReportId) ||
    reports.find((report) => report.id === selectedReportId) ||
    null

  const columns = [
    { key: 'date', header: 'Date' },
    {
      key: 'openingPMS',
      header: 'Opening PMS (L)',
      render: (row) => Math.round(row.openingStockPMS ?? row.openingPMS ?? 0).toLocaleString(),
    },
    {
      key: 'openingAGO',
      header: 'Opening AGO (L)',
      render: (row) => Math.round(row.openingStockAGO ?? row.openingAGO ?? 0).toLocaleString(),
    },
    {
      key: 'closingPMS',
      header: 'Closing PMS (L)',
      render: (row) => Math.round(getClosingForProduct(row, 'pms')).toLocaleString(),
    },
    {
      key: 'closingAGO',
      header: 'Closing AGO (L)',
      render: (row) => Math.round(getClosingForProduct(row, 'ago')).toLocaleString(),
    },
    {
      key: 'receivedType',
      header: 'Received Product (PMS/AGO)',
      render: (row) => getReceivedProductType(row),
    },
    {
      key: 'receivedQuantity',
      header: 'Received Quantity (L)',
      render: (row) => Math.round(Number(row.receivedPMS ?? 0) + Number(row.receivedAGO ?? 0)).toLocaleString(),
    },
    {
      key: 'sales',
      header: 'Sales PMS / AGO (L)',
      render: (row) =>
        `${Math.round(row.totalSalesLitersPMS ?? row.salesPMS ?? 0).toLocaleString()} / ${Math.round(
          row.totalSalesLitersAGO ?? row.salesAGO ?? 0,
        ).toLocaleString()}`,
    },
    {
      key: 'expense',
      header: 'Expense (NGN)',
      render: (row) => Math.round(getExpenseTotal(row)).toLocaleString(),
    },
    {
      key: 'expenseDescription',
      header: 'Expense Description',
      render: (row) => getExpenseDescription(row),
    },
    {
      key: 'paymentTotal',
      header: 'Bank/Channel Total (NGN)',
      render: (row) => Math.round(getPaymentTotal(row)).toLocaleString(),
    },
    {
      key: 'paymentChannels',
      header: 'Bank/Channel Breakdown',
      render: (row) => getPaymentChannels(row),
    },
    {
      key: 'cashMovement',
      header: 'Cash Movement (NGN)',
      render: (row) =>
        `B/F ${Math.round(Number(row.cashBf ?? 0)).toLocaleString()} · Sales ${Math.round(
          Number(row.cashSales ?? 0),
        ).toLocaleString()} · Total ${Math.round(Number(row.cashBf ?? 0) + Number(row.cashSales ?? 0)).toLocaleString()} · Bank ${Math.round(
          getPaymentTotal(row),
        ).toLocaleString()} · POS ${Math.round(getPosValue(row)).toLocaleString()} · Closing ${Math.round(
          Number(row.closingBalance ?? 0),
        ).toLocaleString()}`,
    },
    {
      key: 'cashVariance',
      header: 'Variance (NGN)',
      render: (row) => Math.round(getCashMovementGap(row)).toLocaleString(),
    },
    {
      key: 'pumpReadings',
      header: 'Pump Readings',
      render: (row) => getPumpSummary(row),
    },
    {
      key: 'remark',
      header: 'Remark',
      render: (row) => row.remark || row.remarks || '-',
    },
    {
      key: 'reviewStatus',
      header: 'Supervisor Review Status',
      render: (row) => row.reviewStatus,
    },
    {
      key: 'supervisorNote',
      header: 'Supervisor Note',
      render: (row) => row.supervisorNote,
    },
    {
      key: 'reviewedBy',
      header: 'Reviewed By',
      render: (row) => row.reviewedBy,
    },
  ]

  const handleReviewSubmit = (report) => {
    const draft = reviewDrafts[report.id]
    if (!draft?.status || !draft?.remark?.trim()) {
      return
    }

    updateReportSupervisorReview({
      reportId: report.id,
      status: draft.status,
      remark: draft.remark.trim(),
    })
    setIsReviewModalOpen(false)
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold">{station.name} Report History</h2>
            <p className="text-sm text-slate-500">Daily submissions from this retail station.</p>
          </div>
          <Link
            to="/"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium dark:border-slate-700"
          >
            Back to Home
          </Link>
          <button
            type="button"
            onClick={async () => {
              setExportNotice('')
              if (!filteredReports.length) {
                setExportNotice(historyFilterDate ? 'No report saved for this date.' : 'No reports to export.')
                return
              }
              exportStationHistoryToExcel(station.name, filteredReports)
              await refreshFromSupabase()
            }}
            className="hidden rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white md:inline-flex"
            title="Exports rows matching the selected date (or all dates if cleared)"
          >
            Export to Excel (filtered)
          </button>
        </div>
        <ErrorNotice message={exportNotice} />
        <div className="mt-4 space-y-3 rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-600">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Report date
            {isStaffOwnStation ? (
              <span className="font-normal text-slate-500 dark:text-slate-400">
                {' '}
                — filters the table and sets which day you submit for
              </span>
            ) : null}
          </p>
          <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
            <label className="space-y-1">
              <span className="text-xs text-slate-500">Choose date</span>
              {isStaffOwnStation ? (
                <select
                  value={historyFilterDate}
                  onChange={(event) => setHistoryFilterDate(event.target.value)}
                  aria-label="Report date"
                  className="w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 md:w-72"
                >
                  <option value="">All dates (table only)</option>
                  {staffReportDateSelectOptions.map(({ iso, submitted, disabled }) => (
                    <option key={iso} value={iso} disabled={disabled}>
                      {formatStaffCalendarDay(iso)} ({iso})
                      {submitted ? ' · submitted' : ''}
                      {!submitted && disabled ? ' · earlier gaps first' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="date"
                  value={historyFilterDate}
                  max={todayIso}
                  onChange={(event) => setHistoryFilterDate(event.target.value)}
                  aria-label="Report date"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 md:w-52"
                />
              )}
            </label>
            <button
              type="button"
              onClick={() => setHistoryFilterDate('')}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
            >
              Show all dates
            </button>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Showing {filteredReports.length} of {reports.length} reports
              {historyFilterDate ? ` · ${historyFilterDate}` : ''}
            </span>
          </div>
        </div>

        {isStaffOwnStation && (
          <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-700">
            {!historyFilterDate ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Choose a report date above to submit for that day.
              </p>
            ) : filterDateAlreadySubmitted ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Already submitted for {historyFilterDate}.
              </p>
            ) : (
              <StaffClosingReportForm
                key={historyFilterDate}
                stationId={stationId}
                carriedOpening={reportSubmitOpening}
                carriedCashBf={reportSubmitCashBf}
                reportingConfiguration={reportingConfiguration}
                submitReport={submitReport}
                reportDate={historyFilterDate}
                openingBannerTitle="Opening stock for selected date (prior closing)"
                formDisabled={!reportingConfiguration.dailyOpeningStockFormatEnabled}
                submitButtonLabel={`Submit for ${historyFilterDate}`}
                onSubmitted={() => refreshFromSupabase()}
              />
            )}
          </div>
        )}
      </Card>

      {reports.length ? (
        filteredReports.length ? (
          <Card>
            <DataTable columns={columns} rows={reportsWithReview} />
          </Card>
        ) : (
          <EmptyState
            title={historyFilterDate ? 'No report on this date' : 'No matching reports'}
            message={
              historyFilterDate
                ? 'Try another date or clear the filter to show all submissions.'
                : 'Adjust or clear the filter to see historical submissions.'
            }
          />
        )
      ) : (
        <EmptyState
          title="No report history"
          message="This station has not submitted any report entries yet."
        />
      )}
      {isSupervisor && reports.length > 0 && reportingConfiguration.supervisorReviewWorkflowEnabled && (
        <Card className="space-y-4">
          <h3 className="text-lg font-semibold">Supervisor Review</h3>
          <p className="text-sm text-slate-500">
            Select report date, then open review modal. Reviewer: {currentUser?.name || 'Supervisor'}
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm font-medium">Select Report Date</span>
              <select
                value={selectedReportId}
                onChange={(event) => setSelectedReportId(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">Choose report date</option>
                {reports.map((report) => (
                  <option key={report.id} value={report.id}>
                    {report.date}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => selectedReport && setIsReviewModalOpen(true)}
                disabled={!selectedReport}
                className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Open Review
              </button>
            </div>
          </div>
        </Card>
      )}
      {isReviewModalOpen && selectedReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white p-5 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <h4 className="text-lg font-semibold">Review Report - {selectedReport.date}</h4>
              <button
                type="button"
                onClick={() => setIsReviewModalOpen(false)}
                className="text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-100"
              >
                Close
              </button>
            </div>
            {(() => {
              const existingReview = selectedReport.supervisorReview
              const draft = reviewDrafts[selectedReport.id] || {
                status: existingReview?.status || 'Reviewed',
                remark: existingReview?.remark || '',
              }
              return (
                <div className="space-y-3">
                  <p className="text-sm text-slate-500">
                    Opening PMS:{' '}
                    {Math.round(selectedReport.openingStockPMS ?? selectedReport.openingPMS ?? 0).toLocaleString()} L
                    {' · '}Closing PMS: {Math.round(getClosingForProduct(selectedReport, 'pms')).toLocaleString()} L
                  </p>
                  <p className="text-sm text-slate-500">
                    Bank/Channel deposits: NGN {Math.round(getPaymentTotal(selectedReport)).toLocaleString()}
                  </p>
                  <p className="text-sm text-slate-500">
                    Cash movement: B/F NGN {Math.round(Number(selectedReport.cashBf ?? 0)).toLocaleString()}
                    {' · '}Sales NGN {Math.round(Number(selectedReport.cashSales ?? 0)).toLocaleString()}
                    {' · '}Total NGN {Math.round(Number(selectedReport.cashBf ?? 0) + Number(selectedReport.cashSales ?? 0)).toLocaleString()}
                    {' · '}Bank NGN {Math.round(getPaymentTotal(selectedReport)).toLocaleString()}
                    {' · '}POS NGN {Math.round(getPosValue(selectedReport)).toLocaleString()}
                    {' · '}Closing NGN {Math.round(Number(selectedReport.closingBalance ?? 0)).toLocaleString()}
                  </p>
                  <p className="text-sm text-slate-500">
                    Variance (Total - Closing - Deposits): NGN{' '}
                    {Math.round(getCashMovementGap(selectedReport)).toLocaleString()}
                  </p>
                  <p className="text-sm text-slate-500">Pump readings: {getPumpSummary(selectedReport)}</p>
                  <label className="space-y-1">
                    <span className="text-sm font-medium">Review Status</span>
                    <select
                      value={draft.status}
                      onChange={(event) =>
                        setReviewDrafts((prev) => ({
                          ...prev,
                          [selectedReport.id]: { ...draft, status: event.target.value },
                        }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                    >
                      {REVIEW_STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-medium">Supervisor Remark</span>
                    <textarea
                      value={draft.remark}
                      onChange={(event) =>
                        setReviewDrafts((prev) => ({
                          ...prev,
                          [selectedReport.id]: { ...draft, remark: event.target.value },
                        }))
                      }
                      className="h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                      placeholder="Leave review note for admin visibility..."
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => handleReviewSubmit(selectedReport)}
                    className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
                  >
                    Submit Review
                  </button>
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

export default StationReportHistoryPage

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Card from '../components/ui/Card'
import ColumnPicker from '../components/ui/ColumnPicker'
import StatusBadge from '../components/ui/StatusBadge'
import DataTable from '../components/ui/DataTable'
import EmptyState from '../components/ui/EmptyState'
import FilterScreenSection from '../components/ui/FilterScreenSection'
import StationMultiSelect from '../components/ui/StationMultiSelect'
import { useAppStore } from '../store/useAppStore'
import { columnsToExportSpecs, filterColumnsForTable } from '../utils/columnVisibility'
import { matchesStationMultiFilter } from '../utils/filterUtils'
import { buildStationMetrics } from '../utils/stock'
import { getClosingForProduct } from '../utils/reportFields'
import {
  exportSupervisorDailyOpeningsToExcel,
  exportSupervisorCashFlowToExcel,
  exportSupervisorMonthEndSummaryToExcel,
  exportSupervisorExpenseQueueToExcel,
} from '../utils/exportExcel'
import { formatPendingSubmissionSummary, getDailyReportPendingInfo } from '../utils/reportPending'

const resolveReceivedProductType = (report) => {
  if (report?.noSalesDay) {
    return 'No Sales Day'
  }
  if (!report?.receivedProduct) {
    return null
  }
  const receivedPMS = Number(report.receivedPMS ?? 0)
  const receivedAGO = Number(report.receivedAGO ?? 0)
  if (receivedPMS > 0 && receivedAGO > 0) {
    return 'PMS + AGO'
  }

  if (report.receivedProductType === 'AGO' || report.receivedProductType === 'PMS') {
    return report.receivedProductType
  }

  if (Number(report.receivedAGO ?? 0) > 0) {
    return 'AGO'
  }

  return 'PMS'
}

const getPumpReadingValue = (item) => {
  if (!item || typeof item !== 'object') return null
  if (item.closing != null && item.closing !== '') return Number(item.closing)
  if (item.end != null && item.end !== '') return Number(item.end)
  if (item.start != null && item.start !== '') return Number(item.start)
  return null
}

const buildPumpRowsWithCarry = (previousReadings = [], todayReadings = []) => {
  const prevMap = new Map()
  for (const item of previousReadings) {
    const label = String(item?.label || '').trim()
    const reading = getPumpReadingValue(item)
    if (!label || reading == null || Number.isNaN(reading)) continue
    prevMap.set(label, reading)
  }
  const todayMap = new Map()
  for (const item of todayReadings) {
    const label = String(item?.label || '').trim()
    const reading = getPumpReadingValue(item)
    if (!label || reading == null || Number.isNaN(reading)) continue
    todayMap.set(label, reading)
  }

  const labels = new Set([...prevMap.keys(), ...todayMap.keys()])
  return [...labels]
    .sort((a, b) => a.localeCompare(b))
    .map((label) => {
      const opening = prevMap.has(label) ? prevMap.get(label) : null
      const closing = todayMap.has(label) ? todayMap.get(label) : opening
      const used = todayMap.has(label)
      return {
        label,
        opening,
        closing,
        used,
        delta: used && opening != null && closing != null ? closing - opening : 0,
        noBaseline: opening == null && !used,
      }
    })
}

const SupervisorDashboardPage = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const stations = useAppStore((state) => state.stations)
  const reports = useAppStore((state) => state.reports)
  const users = useAppStore((state) => state.users)
  const stockThresholds = useAppStore((state) => state.appSettings.stockThresholds)
  const currentUser = useAppStore((state) => state.currentUser)
  const interventionsState = useAppStore((state) => state.interventions)
  const flagStationIntervention = useAppStore((state) => state.flagStationIntervention)
  const escalateStationIntervention = useAppStore((state) => state.escalateStationIntervention)
  const revertEscalationIntervention = useAppStore((state) => state.revertEscalationIntervention)
  const unflagStationIntervention = useAppStore((state) => state.unflagStationIntervention)

  const productRequests = useAppStore((state) => state.productRequests)
  const reviewProductRequestBySupervisor = useAppStore((state) => state.reviewProductRequestBySupervisor)
  const dailyFinalizations = useAppStore((state) => state.dailyFinalizations)
  const finalizeSupervisorDailyReview = useAppStore((state) => state.finalizeSupervisorDailyReview)
  const monthEndFinalizations = useAppStore((state) => state.monthEndFinalizations)
  const finalizeSupervisorMonthEndSummary = useAppStore((state) => state.finalizeSupervisorMonthEndSummary)
  const refreshFromSupabase = useAppStore((state) => state.refreshFromSupabase)
  const [statusFilter, setStatusFilter] = useState('all')
  const [showFullDailyOpeningColumns, setShowFullDailyOpeningColumns] = useState(false)
  const [selectedDailyOpeningReport, setSelectedDailyOpeningReport] = useState(null)
  const [selectedRequestStationId, setSelectedRequestStationId] = useState(null)
  const [generalFinalizationRemark, setGeneralFinalizationRemark] = useState('')
  const [stationReviewDrafts, setStationReviewDrafts] = useState({})
  const [dailyQueueFilters, setDailyQueueFilters] = useState({
    stationIds: [],
    reportStatus: 'all',
  })
  const [expenseQueueFilters, setExpenseQueueFilters] = useState({
    stationIds: [],
    expenseStatus: 'all',
  })
  const [dailyOpeningVisibleKeys, setDailyOpeningVisibleKeys] = useState(
    () =>
      new Set([
        'stationName',
        'reportStatus',
        'managerName',
        'openingStockPMS',
        'openingStockAGO',
        'closingStockPMS',
        'closingStockAGO',
        'receivedProduct',
        'quantityReceived',
        'totalSalesLitersPMS',
        'totalSalesLitersAGO',
        'reportDate',
      ]),
  )
  const [expenseVisibleKeys, setExpenseVisibleKeys] = useState(
    () =>
      new Set([
        'stationName',
        'managerName',
        'expenseStatus',
        'totalExpense',
        'expenseLines',
        'topCategory',
        'reportDate',
      ]),
  )
  const [cashFlowVisibleKeys, setCashFlowVisibleKeys] = useState(
    () =>
      new Set([
        'stationName',
        'reportStatus',
        'cashBf',
        'cashSales',
        'totalAmount',
        'bankDeposits',
        'posValue',
        'closingBalance',
        'variance',
        'reportDate',
      ]),
  )
  const [monthEndStationIds, setMonthEndStationIds] = useState([])
  const [selectedMonthKey, setSelectedMonthKey] = useState(() => new Date().toISOString().slice(0, 7))
  const [monthEndSection, setMonthEndSection] = useState('stock-flow')
  const activeDashboardParam = searchParams.get('view')
  const activeDashboard = (() => {
    const nextView = String(activeDashboardParam || '')
    if (nextView === 'risk-monitor') {
      return 'dashboard'
    }
    if (nextView === 'daily-openings') {
      return 'stock-flow'
    }
    if (['dashboard', 'stock-flow', 'cash-flow', 'expense-monitor', 'month-end-summary', 'product-requests', 'history'].includes(nextView)) {
      return nextView
    }
    return 'dashboard'
  })()
  const filtersScreenOpen = searchParams.get('filters') === '1'
  const openFiltersScreen = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('filters', '1')
      return next
    })
  }
  const closeFiltersScreen = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('filters')
      return next
    })
  }
  const setActiveDashboard = (view) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('view', view)
      next.delete('filters')
      return next
    })
  }
  const interventions = Array.isArray(interventionsState) ? interventionsState : []
  const interventionByStationId = useMemo(
    () => new Map(interventions.map((item) => [item.stationId, item])),
    [interventions],
  )

  const portfolio = useMemo(() => {
    return stations.map((station) => {
      const stationReports = reports.filter((report) => report.stationId === station.id)
      return buildStationMetrics(station, stationReports, stockThresholds)
    })
  }, [reports, stations, stockThresholds])

  const filteredPortfolio = useMemo(() => {
    if (statusFilter === 'all') {
      return portfolio
    }
    return portfolio.filter((station) => station.status === statusFilter)
  }, [portfolio, statusFilter])

  const topRisk = useMemo(
    () =>
      [...portfolio]
        .filter((item) => item.status !== 'safe')
        .sort((a, b) => a.daysRemaining - b.daysRemaining)
        .slice(0, 4),
    [portfolio],
  )

  const criticalCount = portfolio.filter((item) => item.status === 'critical').length
  const warningCount = portfolio.filter((item) => item.status === 'warning').length
  const metricsByStationId = useMemo(
    () => new Map(portfolio.map((item) => [item.stationId, item])),
    [portfolio],
  )
  const today = new Date().toISOString().split('T')[0]
  const todayMonthKey = today.slice(0, 7)
  const monthEndMonthOptions = useMemo(() => {
    const options = []
    const base = new Date()
    for (let i = 0; i < 12; i += 1) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1)
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const key = `${year}-${month}`
      const label = d.toLocaleString(undefined, { month: 'long', year: 'numeric' })
      options.push({ key, label })
    }
    return options
  }, [])

  const reportDatesByStation = useMemo(() => {
    const byStation = new Map()
    for (const report of reports) {
      if (!report?.stationId || !report?.date) {
        continue
      }
      if (!byStation.has(report.stationId)) {
        byStation.set(report.stationId, new Set())
      }
      byStation.get(report.stationId).add(report.date)
    }
    return byStation
  }, [reports])

  const dailyOpeningQueueRows = useMemo(() => {
    const staffByStation = new Map(
      users.filter((user) => user.role === 'staff').map((user) => [user.stationId, user]),
    )

    return [...stations]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((station) => {
        const stationReportDates = reportDatesByStation.get(station.id) ?? new Set()
        const pendingInfo = getDailyReportPendingInfo(today, stationReportDates)
        const pendingFmt = formatPendingSubmissionSummary(pendingInfo, today)
        const stationReportsToday = reports.filter(
          (report) => report.stationId === station.id && report.date === today,
        )
        const latestToday = stationReportsToday.at(-1)
        const previousReport = [...reports]
          .filter((report) => report.stationId === station.id && report.date < today)
          .sort((a, b) => b.date.localeCompare(a.date))[0]
        const manager = staffByStation.get(station.id)
        const receivedProductType = latestToday ? resolveReceivedProductType(latestToday) : null
        const paymentBreakdown = Array.isArray(latestToday?.paymentBreakdown)
          ? latestToday.paymentBreakdown
          : []
        const totalPaymentDeposits = paymentBreakdown.length
          ? paymentBreakdown.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
          : Number(latestToday?.totalPaymentDeposits || 0)
        const posValue = Number(latestToday?.posValue || 0)
        const cashBf = Number(previousReport?.closingBalance || 0)
        const cashSales = Number(latestToday?.cashSales || 0)
        const totalAmount = cashBf + cashSales
        const closingBalance = totalAmount - totalPaymentDeposits - posValue
        // Variance = Total - Bank Lodgements - POS - Closing (should be 0 if rule is followed)
        const cashMovementVariance = totalAmount - totalPaymentDeposits - posValue - closingBalance
        const pumpReadings = Array.isArray(latestToday?.pumpReadings) ? latestToday.pumpReadings : []
        const priorPumpReadings = Array.isArray(previousReport?.pumpReadings) ? previousReport.pumpReadings : []
        const pumpMeterRows = buildPumpRowsWithCarry(priorPumpReadings, pumpReadings)

        return {
          stationId: station.id,
          stationName: station.name,
          managerName: manager?.name || 'Unassigned',
          reportStatus: latestToday ? (latestToday.noSalesDay ? 'No Sales Declared' : 'Submitted') : 'Pending',
          openingStockPMS: latestToday
            ? latestToday.openingStockPMS ?? latestToday.openingPMS ?? 0
            : 'Not Submitted',
          openingStockAGO: latestToday
            ? latestToday.openingStockAGO ?? latestToday.openingAGO ?? 0
            : 'Not Submitted',
          pmsPrice: latestToday ? latestToday.pmsPrice ?? 'Not Submitted' : 'Not Submitted',
          agoPrice: latestToday ? latestToday.agoPrice ?? 'Not Submitted' : 'Not Submitted',
          receivedProduct: latestToday
            ? latestToday.receivedProduct
              ? `Yes (${receivedProductType || 'Not specified'})`
              : 'No'
            : 'Not Submitted',
          quantityReceived: latestToday
            ? Math.round(Number(latestToday.receivedPMS ?? 0) + Number(latestToday.receivedAGO ?? 0)).toLocaleString()
            : 'Not Submitted',
          closingStockPMS: latestToday
            ? Math.round(getClosingForProduct(latestToday, 'pms')).toLocaleString()
            : 'Not Submitted',
          closingStockAGO: latestToday
            ? Math.round(getClosingForProduct(latestToday, 'ago')).toLocaleString()
            : 'Not Submitted',
          closingStockPMSRaw: latestToday ? getClosingForProduct(latestToday, 'pms') : null,
          closingStockAGORaw: latestToday ? getClosingForProduct(latestToday, 'ago') : null,
          totalSalesLitersPMS: latestToday
            ? Math.round(latestToday.totalSalesLitersPMS ?? latestToday.salesPMS ?? 0).toLocaleString()
            : 'Not Submitted',
          totalSalesLitersAGO: latestToday
            ? Math.round(latestToday.totalSalesLitersAGO ?? latestToday.salesAGO ?? 0).toLocaleString()
            : 'Not Submitted',
          rttPMS: latestToday ? latestToday.rttPMS ?? 'Not Submitted' : 'Not Submitted',
          rttAGO: latestToday ? latestToday.rttAGO ?? 'Not Submitted' : 'Not Submitted',
          managerRemark: latestToday ? latestToday.remark ?? latestToday.remarks ?? '-' : 'Not Submitted',
          reportDate: latestToday ? latestToday.date : 'Pending',
          expenseAmount: latestToday ? Number(latestToday.expenseAmount || 0) : 0,
          expenseDescription: latestToday ? latestToday.expenseDescription || '-' : 'Not Submitted',
          expenseItems: Array.isArray(latestToday?.expenseItems) ? latestToday.expenseItems : [],
          paymentBreakdown,
          totalPaymentDeposits,
          posValue,
          cashBf,
          cashSales,
          totalAmount,
          closingBalance,
          cashMovementVariance,
          pumpReadings,
          pumpMeterRows,
          pumpReadingsCount: pumpMeterRows.length,
          sortKey: station.name.toLowerCase(),
          pendingSubmissionDays: pendingInfo.pendingDays,
          pendingSubmissionNoHistory: pendingInfo.noPriorSubmissions,
          pendingSubmissionSummaryExport: pendingFmt.exportText,
          pendingSubmissionTableTitle: pendingFmt.tableTitle,
          pendingSubmissionTableSubtitle: pendingFmt.tableSubtitle || '',
        }
      })
  }, [reportDatesByStation, reports, stations, today, users])

  const filteredDailyOpeningQueueRows = useMemo(
    () =>
      dailyOpeningQueueRows.filter((row) => {
        if (!matchesStationMultiFilter(row.stationId, dailyQueueFilters)) {
          return false
        }
        if (dailyQueueFilters.reportStatus !== 'all' && row.reportStatus !== dailyQueueFilters.reportStatus) {
          return false
        }
        return true
      }),
    [dailyOpeningQueueRows, dailyQueueFilters],
  )
  const totalBankDepositsToday = useMemo(
    () =>
      filteredDailyOpeningQueueRows.reduce(
        (sum, row) => sum + Number(row.totalPaymentDeposits || 0),
        0,
      ),
    [filteredDailyOpeningQueueRows],
  )
  const totalCashVarianceToday = useMemo(
    () =>
      filteredDailyOpeningQueueRows.reduce(
        (sum, row) => sum + Number(row.cashMovementVariance || 0),
        0,
      ),
    [filteredDailyOpeningQueueRows],
  )
  const monthEndSummaryRows = useMemo(() => {
    const [yearText, monthText] = String(selectedMonthKey || '').split('-')
    const year = Number(yearText)
    const month = Number(monthText)
    if (!year || !month) {
      return []
    }
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
    const monthEndDate = new Date(year, month, 0)
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(monthEndDate.getDate()).padStart(2, '0')}`
    const effectiveEnd = selectedMonthKey === todayMonthKey ? today : monthEnd
    const expectedDays = Number(effectiveEnd.slice(8, 10))
    const staffByStation = new Map(
      users.filter((user) => user.role === 'staff').map((user) => [user.stationId, user]),
    )

    return stations
      .filter((station) => monthEndStationIds.length === 0 || monthEndStationIds.includes(station.id))
      .map((station) => {
        const monthReports = reports
          .filter(
            (report) =>
              report.stationId === station.id &&
              report.date >= monthStart &&
              report.date <= effectiveEnd,
          )
          .sort((a, b) => a.date.localeCompare(b.date))
        const dateSet = new Set(monthReports.map((report) => report.date))
        const submittedDays = dateSet.size
        const compliancePct = expectedDays > 0 ? Number(((submittedDays / expectedDays) * 100).toFixed(1)) : 0
        const salesPms = monthReports.reduce((sum, report) => sum + Number(report.totalSalesLitersPMS || 0), 0)
        const salesAgo = monthReports.reduce((sum, report) => sum + Number(report.totalSalesLitersAGO || 0), 0)
        const cashSalesTotal = monthReports.reduce((sum, report) => sum + Number(report.cashSales || 0), 0)
        const totalAmountTotal = monthReports.reduce((sum, report) => sum + Number(report.totalAmount || 0), 0)
        const expenseTotal = monthReports.reduce((sum, report) => sum + Number(report.expenseAmount || 0), 0)
        const expenseLines = monthReports.reduce(
          (sum, report) => sum + (Array.isArray(report.expenseItems) ? report.expenseItems.length : 0),
          0,
        )
        const bankLodgements = monthReports.reduce(
          (sum, report) => sum + Number(report.totalPaymentDeposits || 0),
          0,
        )
        const posTotal = monthReports.reduce((sum, report) => sum + Number(report.posValue || 0), 0)
        const varianceTotal = monthReports.reduce(
          (sum, report) =>
            sum +
            (Number(report.totalAmount || 0) -
              Number(report.totalPaymentDeposits || 0) -
              Number(report.posValue || 0) -
              Number(report.closingBalance || 0)),
          0,
        )
        const latestReport = monthReports.at(-1)
        const firstReport = monthReports[0]
        const manager = staffByStation.get(station.id)
        return {
          stationId: station.id,
          stationName: station.name,
          managerName: manager?.name || 'Unassigned',
          month: selectedMonthKey,
          submittedDays,
          expectedDays,
          compliancePct,
          salesPms,
          salesAgo,
          cashSalesTotal,
          totalAmountTotal,
          expenseTotal,
          expenseLines,
          bankLodgements,
          posTotal,
          varianceTotal,
          openingStockPms: Number(firstReport?.openingStockPMS || firstReport?.openingPMS || 0),
          openingStockAgo: Number(firstReport?.openingStockAGO || firstReport?.openingAGO || 0),
          closingStockPms: Number(latestReport?.closingStockPMS || latestReport?.closingPMS || 0),
          closingStockAgo: Number(latestReport?.closingStockAGO || latestReport?.closingAGO || 0),
          monthEndClosingBalance: Number(latestReport?.closingBalance || 0),
        }
      })
      .sort((a, b) => a.stationName.localeCompare(b.stationName))
  }, [monthEndStationIds, reports, selectedMonthKey, stations, today, todayMonthKey, users])
  const selectedMonthLabel =
    monthEndMonthOptions.find((option) => option.key === selectedMonthKey)?.label || selectedMonthKey
  const selectedMonthFinalization =
    monthEndFinalizations.find((item) => item.monthKey === selectedMonthKey) || null
  const monthEndStockColumns = useMemo(
    () => [
      { key: 'stationName', header: 'Retail Station', minWidth: 200 },
      { key: 'managerName', header: 'Manager', minWidth: 160 },
      { key: 'month', header: 'Month', minWidth: 110 },
      {
        key: 'compliance',
        header: 'Compliance',
        minWidth: 130,
        render: (row) => `${row.submittedDays}/${row.expectedDays} (${row.compliancePct}%)`,
      },
      { key: 'openingStockPms', header: 'Opening PMS (L)', minWidth: 140, render: (row) => Math.round(row.openingStockPms).toLocaleString() },
      { key: 'openingStockAgo', header: 'Opening AGO (L)', minWidth: 140, render: (row) => Math.round(row.openingStockAgo).toLocaleString() },
      { key: 'salesPms', header: 'PMS Sold (L)', minWidth: 130, render: (row) => Math.round(row.salesPms).toLocaleString() },
      { key: 'salesAgo', header: 'AGO Sold (L)', minWidth: 130, render: (row) => Math.round(row.salesAgo).toLocaleString() },
      { key: 'closingStockPms', header: 'Closing PMS (L)', minWidth: 140, render: (row) => Math.round(row.closingStockPms).toLocaleString() },
      { key: 'closingStockAgo', header: 'Closing AGO (L)', minWidth: 140, render: (row) => Math.round(row.closingStockAgo).toLocaleString() },
    ],
    [],
  )
  const monthEndCashColumns = useMemo(
    () => [
      { key: 'stationName', header: 'Retail Station', minWidth: 200 },
      { key: 'managerName', header: 'Manager', minWidth: 160 },
      { key: 'month', header: 'Month', minWidth: 110 },
      { key: 'cashSalesTotal', header: 'Cash Sales (NGN)', minWidth: 150, render: (row) => Math.round(row.cashSalesTotal).toLocaleString() },
      { key: 'totalAmountTotal', header: 'Total Amount (NGN)', minWidth: 160, render: (row) => Math.round(row.totalAmountTotal).toLocaleString() },
      { key: 'bankLodgements', header: 'Bank Lodgements (NGN)', minWidth: 180, render: (row) => Math.round(row.bankLodgements).toLocaleString() },
      { key: 'posTotal', header: 'POS (NGN)', minWidth: 130, render: (row) => Math.round(row.posTotal).toLocaleString() },
      { key: 'varianceTotal', header: 'Variance (NGN)', minWidth: 140, render: (row) => Math.round(row.varianceTotal).toLocaleString() },
      { key: 'monthEndClosingBalance', header: 'Month-End Closing (NGN)', minWidth: 190, render: (row) => Math.round(row.monthEndClosingBalance).toLocaleString() },
    ],
    [],
  )
  const monthEndExpenseColumns = useMemo(
    () => [
      { key: 'stationName', header: 'Retail Station', minWidth: 200 },
      { key: 'managerName', header: 'Manager', minWidth: 160 },
      { key: 'month', header: 'Month', minWidth: 110 },
      {
        key: 'compliance',
        header: 'Compliance',
        minWidth: 130,
        render: (row) => `${row.submittedDays}/${row.expectedDays} (${row.compliancePct}%)`,
      },
      { key: 'expenseLines', header: 'Expense Lines', minWidth: 130 },
      { key: 'expenseTotal', header: 'Expense (NGN)', minWidth: 150, render: (row) => Math.round(row.expenseTotal).toLocaleString() },
      { key: 'varianceTotal', header: 'Variance (NGN)', minWidth: 140, render: (row) => Math.round(row.varianceTotal).toLocaleString() },
    ],
    [],
  )
  const cashFlowColumnsDefs = useMemo(
    () => [
      { key: 'stationName', header: 'Retail Station', minWidth: 200 },
      {
        key: 'reportStatus',
        header: 'Submission',
        minWidth: 180,
        render: (row) => {
          if (row.reportStatus === 'Submitted') {
            return (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                Submitted
              </span>
            )
          }
          if (row.reportStatus === 'No Sales Declared') {
            return (
              <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-700/50 dark:text-slate-200">
                No Sales Declared
              </span>
            )
          }
          const late = !row.pendingSubmissionNoHistory && Number(row.pendingSubmissionDays || 0) >= 1
          const label = row.pendingSubmissionNoHistory
            ? 'Pending (Today)'
            : `Pending (${row.pendingSubmissionDays} day${row.pendingSubmissionDays === 1 ? '' : 's'})`
          return (
            <span
              className={
                late
                  ? 'rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
                  : 'rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
              }
            >
              {label}
            </span>
          )
        },
      },
      {
        key: 'cashBf',
        header: 'Cash B/F (NGN)',
        minWidth: 140,
        render: (row) => Math.round(Number(row.cashBf || 0)).toLocaleString(),
        pickable: true,
        exportHeader: 'cash_bf_ngn',
        exportPick: (row) => Math.round(Number(row.cashBf || 0)),
      },
      {
        key: 'cashSales',
        header: 'Cash Sales (NGN)',
        minWidth: 140,
        render: (row) => Math.round(Number(row.cashSales || 0)).toLocaleString(),
        pickable: true,
        exportHeader: 'cash_sales_ngn',
        exportPick: (row) => Math.round(Number(row.cashSales || 0)),
      },
      {
        key: 'totalAmount',
        header: 'Total Amount (NGN)',
        minWidth: 150,
        render: (row) => Math.round(Number(row.totalAmount || 0)).toLocaleString(),
        pickable: true,
        exportHeader: 'total_amount_ngn',
        exportPick: (row) => Math.round(Number(row.totalAmount || 0)),
      },
      {
        key: 'bankDeposits',
        header: 'Bank/Channel Deposits (NGN)',
        minWidth: 190,
        render: (row) => Math.round(Number(row.totalPaymentDeposits || 0)).toLocaleString(),
        pickable: true,
        exportHeader: 'bank_lodgements_ngn',
        exportPick: (row) => Math.round(Number(row.totalPaymentDeposits || 0)),
      },
      {
        key: 'closingBalance',
        header: 'Closing Balance (NGN)',
        minWidth: 160,
        render: (row) => Math.round(Number(row.closingBalance || 0)).toLocaleString(),
        pickable: true,
        exportHeader: 'closing_balance_ngn',
        exportPick: (row) => Math.round(Number(row.closingBalance || 0)),
      },
      {
        key: 'posValue',
        header: 'POS (NGN)',
        minWidth: 130,
        render: (row) => Math.round(Number(row.posValue || 0)).toLocaleString(),
        pickable: true,
        exportHeader: 'pos_ngn',
        exportPick: (row) => Math.round(Number(row.posValue || 0)),
      },
      {
        key: 'variance',
        header: 'Variance (NGN)',
        minWidth: 130,
        render: (row) => Math.round(Number(row.cashMovementVariance || 0)).toLocaleString(),
        pickable: true,
        exportHeader: 'variance_ngn',
        exportPick: (row) => Math.round(Number(row.cashMovementVariance || 0)),
      },
      {
        key: 'reportDate',
        header: 'Report Date',
        minWidth: 120,
        pickable: true,
        exportHeader: 'report_date',
        exportPick: (row) => row.reportDate,
      },
    ],
    [],
  )

  const cashFlowPickableKeys = useMemo(
    () => cashFlowColumnsDefs.filter((c) => c.pickable !== false).map((c) => c.key),
    [cashFlowColumnsDefs],
  )

  useEffect(() => {
    setCashFlowVisibleKeys((prev) => {
      if (prev && prev.size) return prev
      return new Set(cashFlowPickableKeys)
    })
  }, [cashFlowPickableKeys])

  const visibleCashFlowColumns = useMemo(
    () => filterColumnsForTable(cashFlowColumnsDefs, cashFlowVisibleKeys),
    [cashFlowColumnsDefs, cashFlowVisibleKeys],
  )

  const toggleCashFlowColumn = (key) => {
    setCashFlowVisibleKeys((prev) => {
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

  const selectAllCashFlowPickable = () => {
    setCashFlowVisibleKeys(new Set(cashFlowPickableKeys))
  }

  const pendingCount = dailyOpeningQueueRows.filter((row) => row.reportStatus === 'Pending').length
  const submittedCount = dailyOpeningQueueRows.length - pendingCount
  const todayFinalization = dailyFinalizations.find((item) => item.date === today) || null

  const finalizationRows = useMemo(
    () =>
      dailyOpeningQueueRows.map((row) => ({
        stationId: row.stationId,
        stationName: row.stationName,
        reportStatus: row.reportStatus,
        stationRemark: stationReviewDrafts[row.stationId] || '',
      })),
    [dailyOpeningQueueRows, stationReviewDrafts],
  )

  const finalizationColumns = [
    { key: 'stationName', header: 'Station', minWidth: 200 },
    { key: 'reportStatus', header: 'Report Status', minWidth: 140 },
    {
      key: 'stationRemark',
      header: 'Supervisor Station Remark',
      minWidth: 280,
      render: (row) => (
        <input
          value={row.stationRemark}
          onChange={(event) =>
            setStationReviewDrafts((prev) => ({
              ...prev,
              [row.stationId]: event.target.value,
            }))
          }
          onClick={(event) => event.stopPropagation()}
          placeholder="Station-specific note to admin"
          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
        />
      ),
    },
  ]

  const finalizationHistoryRows = useMemo(
    () =>
      [...dailyFinalizations]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((item) => ({
          ...item,
          stationCount: item.stationReviews?.length || 0,
          statusLabel: item.status === 'admin_acknowledged' ? 'Admin Acknowledged' : 'Finalized',
          adminAckLabel: item.adminAcknowledgedAt
            ? `${item.adminAcknowledgedBy || 'Admin'} (${item.adminAcknowledgedAt.split('T')[0]})`
            : 'Pending',
        })),
    [dailyFinalizations],
  )

  const finalizationHistoryColumns = [
    { key: 'date', header: 'Date', minWidth: 120 },
    { key: 'finalizedBy', header: 'Finalized By', minWidth: 170 },
    { key: 'statusLabel', header: 'Status', minWidth: 150 },
    { key: 'stationCount', header: 'Station Reviews', minWidth: 140 },
    { key: 'adminAckLabel', header: 'Admin Acknowledgement', minWidth: 220 },
    { key: 'generalRemark', header: 'General Daily Remark', minWidth: 320 },
  ]

  const expenseQueueRows = useMemo(() => {
    const staffByStation = new Map(
      users.filter((user) => user.role === 'staff').map((user) => [user.stationId, user]),
    )

    return [...stations]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((station) => {
        const stationReportDates = reportDatesByStation.get(station.id) ?? new Set()
        const pendingInfo = getDailyReportPendingInfo(today, stationReportDates)
        const pendingFmt = formatPendingSubmissionSummary(pendingInfo, today)
        const stationReportsToday = reports.filter(
          (report) => report.stationId === station.id && report.date === today,
        )
        const latestToday = stationReportsToday.at(-1)
        const manager = staffByStation.get(station.id)
        const expenseItems = Array.isArray(latestToday?.expenseItems) ? latestToday.expenseItems : []
        const totalExpense = expenseItems.length
          ? expenseItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
          : Number(latestToday?.expenseAmount || 0)

        const labels = expenseItems.length
          ? expenseItems.map((item) => item.label)
          : latestToday?.expenseDescription
            ? latestToday.expenseDescription.split(',').map((label) => label.trim())
            : []

        const countByCategory = labels.reduce((acc, label) => {
          acc[label] = (acc[label] || 0) + 1
          return acc
        }, {})

        const topCategory = Object.entries(countByCategory).sort((a, b) => b[1] - a[1])[0]?.[0] || '-'

        return {
          stationId: station.id,
          stationName: station.name,
          managerName: manager?.name || 'Unassigned',
          expenseStatus: latestToday ? (totalExpense > 0 ? 'Submitted' : 'No Expense') : 'Pending',
          totalExpense,
          expenseLines: expenseItems.length || (latestToday?.expenseDescription ? 1 : 0),
          topCategory,
          reportDate: latestToday ? latestToday.date : 'Pending',
          pendingSubmissionDays: pendingInfo.pendingDays,
          pendingSubmissionNoHistory: pendingInfo.noPriorSubmissions,
          pendingSubmissionSummaryExport: pendingFmt.exportText,
          pendingSubmissionTableTitle: pendingFmt.tableTitle,
          pendingSubmissionTableSubtitle: pendingFmt.tableSubtitle || '',
        }
      })
  }, [reportDatesByStation, reports, stations, today, users])

  const filteredExpenseQueueRows = useMemo(
    () =>
      expenseQueueRows.filter((row) => {
        if (!matchesStationMultiFilter(row.stationId, expenseQueueFilters)) {
          return false
        }
        if (expenseQueueFilters.expenseStatus !== 'all' && row.expenseStatus !== expenseQueueFilters.expenseStatus) {
          return false
        }
        return true
      }),
    [expenseQueueRows, expenseQueueFilters],
  )

  const dailyFiltersSummary = useMemo(() => {
    const stationsLabel =
      dailyQueueFilters.stationIds.length === 0 ? 'All stations' : `${dailyQueueFilters.stationIds.length} stations`
    const statusLabel =
      dailyQueueFilters.reportStatus === 'all' ? 'All statuses' : dailyQueueFilters.reportStatus
    return `${stationsLabel} · ${statusLabel}`
  }, [dailyQueueFilters])

  const expenseFiltersSummary = useMemo(() => {
    const stationsLabel =
      expenseQueueFilters.stationIds.length === 0 ? 'All stations' : `${expenseQueueFilters.stationIds.length} stations`
    const statusLabel =
      expenseQueueFilters.expenseStatus === 'all' ? 'All statuses' : expenseQueueFilters.expenseStatus
    return `${stationsLabel} · ${statusLabel}`
  }, [expenseQueueFilters])

  const expenseSubmittedCount = expenseQueueRows.filter((row) => row.expenseStatus === 'Submitted').length
  const totalExpenseToday = expenseQueueRows.reduce((sum, row) => sum + row.totalExpense, 0)
  const topSpendingStation = [...expenseQueueRows].sort((a, b) => b.totalExpense - a.totalExpense)[0]

  const columns = [
    { key: 'stationName', header: 'Retail Station' },
    {
      key: 'stockRemaining',
      header: 'Stock Remaining',
      render: (row) => `${Math.round(row.stockRemaining).toLocaleString()} L`,
    },
    {
      key: 'daysRemaining',
      header: 'Expected Days Remaining',
      render: (row) => row.daysRemaining.toFixed(2),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'action',
      header: 'Action',
      render: (row) => (
        <button
          onClick={(event) => {
            event.stopPropagation()
            flagStationIntervention({
              stationId: row.stationId,
              stationName: row.stationName,
              status: row.status,
            })
          }}
          disabled={Boolean(interventionByStationId.get(row.stationId))}
          className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {interventionByStationId.get(row.stationId) ? 'Flagged' : 'Flag Station'}
        </button>
      ),
    },
  ]

  const dailyOpeningColumnsCompactDefs = useMemo(
    () => [
      {
        key: 'stationName',
        header: 'Retail Station',
        minWidth: 220,
        pickable: true,
        exportHeader: 'station',
        exportPick: (row) => row.stationName,
      },
      {
        key: 'reportStatus',
        header: 'Submission Status',
        minWidth: 170,
        pickable: true,
        exportHeader: 'report_status',
        exportPick: (row) => {
          if (row.reportStatus === 'Pending') {
            return row.pendingSubmissionNoHistory
              ? 'Pending (Today)'
              : `Pending (${row.pendingSubmissionDays} days)`
          }
          return row.reportStatus
        },
        render: (row) => {
          if (row.reportStatus === 'Submitted') {
            return (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                Submitted
              </span>
            )
          }
          if (row.reportStatus === 'No Sales Declared') {
            return (
              <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-700/50 dark:text-slate-200">
                No Sales Declared
              </span>
            )
          }
          return (
            <span
              className={
                !row.pendingSubmissionNoHistory && Number(row.pendingSubmissionDays || 0) >= 1
                  ? 'rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
                  : 'rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
              }
            >
              {row.pendingSubmissionNoHistory
                ? 'Pending (Today)'
                : `Pending (${row.pendingSubmissionDays} day${row.pendingSubmissionDays === 1 ? '' : 's'})`}
            </span>
          )
        },
      },
      {
        key: 'managerName',
        header: 'Station Manager',
        minWidth: 170,
        pickable: true,
        exportHeader: 'manager',
        exportPick: (row) => row.managerName,
      },
      {
        key: 'openingStockPMS',
        header: 'Opening Stock PMS',
        minWidth: 150,
        pickable: true,
        exportHeader: 'opening_stock_pms',
      },
      {
        key: 'openingStockAGO',
        header: 'Opening Stock AGO',
        minWidth: 150,
        pickable: true,
        exportHeader: 'opening_stock_ago',
      },
      {
        key: 'closingStockPMS',
        header: 'Closing Stock PMS',
        minWidth: 150,
        pickable: true,
        exportHeader: 'closing_stock_pms',
        exportPick: (row) =>
          row.closingStockPMSRaw != null && row.closingStockPMSRaw !== '' ? row.closingStockPMSRaw : '',
      },
      {
        key: 'closingStockAGO',
        header: 'Closing Stock AGO',
        minWidth: 150,
        pickable: true,
        exportHeader: 'closing_stock_ago',
        exportPick: (row) =>
          row.closingStockAGORaw != null && row.closingStockAGORaw !== '' ? row.closingStockAGORaw : '',
      },
      {
        key: 'receivedProduct',
        header: 'Received Product (PMS/AGO)',
        minWidth: 200,
        pickable: true,
        exportHeader: 'received_product_type',
        exportPick: (row) => row.receivedProduct,
      },
      {
        key: 'quantityReceived',
        header: 'Input Quantity Received (L)',
        minWidth: 180,
        pickable: true,
        exportHeader: 'input_quantity_received_litres',
        exportPick: (row) => row.quantityReceived,
      },
      {
        key: 'totalSalesLitersPMS',
        header: 'Total Sales in Liters PMS',
        minWidth: 180,
        pickable: true,
        exportHeader: 'total_sales_in_liters_pms',
        exportPick: (row) => row.totalSalesLitersPMS,
      },
      {
        key: 'totalSalesLitersAGO',
        header: 'Total Sales in Liters AGO',
        minWidth: 180,
        pickable: true,
        exportHeader: 'total_sales_in_liters_ago',
        exportPick: (row) => row.totalSalesLitersAGO,
      },
      {
        key: 'reportDate',
        header: 'Report Date',
        minWidth: 130,
        pickable: true,
        exportHeader: 'submitted_date',
        exportPick: (row) => row.reportDate,
      },
      {
        key: 'viewReport',
        header: 'View Full Report',
        minWidth: 130,
        pickable: false,
        exportHeader: 'view_full_report',
        exportPick: (row) =>
          row.reportStatus === 'Pending'
            ? 'Pending — use app when submitted'
            : 'Open View Report in app for full breakdown',
        render: (row) => (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              setSelectedDailyOpeningReport(row)
            }}
            className="rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300"
          >
            View Report
          </button>
        ),
      },
    ],
    [],
  )

  const dailyOpeningColumnsFullExtraDefs = useMemo(
    () => [
      {
        key: 'pmsPrice',
        header: 'PMS Price',
        minWidth: 120,
        pickable: true,
        exportHeader: 'pms_price',
        exportPick: (row) => row.pmsPrice,
      },
      {
        key: 'agoPrice',
        header: 'AGO Price',
        minWidth: 120,
        pickable: true,
        exportHeader: 'ago_price',
        exportPick: (row) => row.agoPrice,
      },
      {
        key: 'rttPMS',
        header: 'RTT PMS',
        minWidth: 120,
        pickable: true,
        exportHeader: 'rtt_pms',
        exportPick: (row) => row.rttPMS,
      },
      {
        key: 'rttAGO',
        header: 'RTT AGO',
        minWidth: 120,
        pickable: true,
        exportHeader: 'rtt_ago',
        exportPick: (row) => row.rttAGO,
      },
      {
        key: 'managerRemark',
        header: 'Remark',
        minWidth: 220,
        pickable: true,
        exportHeader: 'remark',
        exportPick: (row) => row.managerRemark,
      },
      {
        key: 'totalPaymentDeposits',
        header: 'Bank/Channel Total (NGN)',
        minWidth: 180,
        pickable: true,
        exportHeader: 'bank_channel_total_ngn',
        exportPick: (row) => Math.round(Number(row.totalPaymentDeposits || 0)),
        render: (row) => Math.round(Number(row.totalPaymentDeposits || 0)).toLocaleString(),
      },
      {
        key: 'cashMovementSummary',
        header: 'Cash Movement (NGN)',
        minWidth: 260,
        pickable: true,
        exportHeader: 'cash_movement_ngn',
        exportPick: (row) =>
          `bf:${Math.round(Number(row.cashBf || 0))}|sales:${Math.round(Number(row.cashSales || 0))}|total:${Math.round(
            Number(row.totalAmount || 0),
          )}|bank:${Math.round(Number(row.totalPaymentDeposits || 0))}|pos:${Math.round(Number(row.posValue || 0))}|closing:${Math.round(Number(row.closingBalance || 0))}`,
        render: (row) =>
          `B/F ${Math.round(Number(row.cashBf || 0)).toLocaleString()} · Sales ${Math.round(
            Number(row.cashSales || 0),
          ).toLocaleString()} · Total ${Math.round(Number(row.totalAmount || 0)).toLocaleString()} · Bank ${Math.round(
            Number(row.totalPaymentDeposits || 0),
          ).toLocaleString()} · POS ${Math.round(Number(row.posValue || 0)).toLocaleString()} · Closing ${Math.round(
            Number(row.closingBalance || 0),
          ).toLocaleString()}`,
      },
      {
        key: 'cashMovementVariance',
        header: 'Variance (NGN)',
        minWidth: 140,
        pickable: true,
        exportHeader: 'cash_movement_variance_ngn',
        exportPick: (row) => Math.round(Number(row.cashMovementVariance || 0)),
        render: (row) => Math.round(Number(row.cashMovementVariance || 0)).toLocaleString(),
      },
      {
        key: 'pumpReadingsCount',
        header: 'Pump Lines',
        minWidth: 120,
        pickable: true,
        exportHeader: 'pump_lines',
        exportPick: (row) => Number(row.pumpReadingsCount || 0),
      },
    ],
    [],
  )

  const dailyOpeningColumns = useMemo(
    () =>
      showFullDailyOpeningColumns
        ? [...dailyOpeningColumnsCompactDefs, ...dailyOpeningColumnsFullExtraDefs]
        : dailyOpeningColumnsCompactDefs,
    [showFullDailyOpeningColumns, dailyOpeningColumnsCompactDefs, dailyOpeningColumnsFullExtraDefs],
  )

  const dailyOpeningPickableKeys = useMemo(
    () => dailyOpeningColumns.filter((c) => c.pickable !== false).map((c) => c.key),
    [dailyOpeningColumns],
  )

  useEffect(() => {
    setDailyOpeningVisibleKeys(new Set(dailyOpeningPickableKeys))
  }, [dailyOpeningPickableKeys])

  const visibleDailyOpeningColumns = useMemo(
    () => filterColumnsForTable(dailyOpeningColumns, dailyOpeningVisibleKeys),
    [dailyOpeningColumns, dailyOpeningVisibleKeys],
  )

  const dailyOpeningStickyColumns = useMemo(
    () =>
      ['stationName', 'reportStatus'].filter((key) =>
        dailyOpeningVisibleKeys.has(key),
      ),
    [dailyOpeningVisibleKeys],
  )

  const toggleDailyOpeningColumn = (key) => {
    setDailyOpeningVisibleKeys((prev) => {
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

  const selectAllDailyOpeningPickable = () => {
    setDailyOpeningVisibleKeys(new Set(dailyOpeningPickableKeys))
  }

  const expenseColumnsDefs = useMemo(
    () => [
      {
        key: 'stationName',
        header: 'Retail Station',
        pickable: true,
        exportHeader: 'station',
        exportPick: (row) => row.stationName,
      },
      {
        key: 'managerName',
        header: 'Station Manager',
        pickable: true,
        exportHeader: 'manager',
        exportPick: (row) => row.managerName,
      },
      {
        key: 'expenseStatus',
        header: 'Expense Status',
        pickable: true,
        exportHeader: 'expense_status',
        exportPick: (row) => {
          if (row.expenseStatus === 'Pending') {
            return row.pendingSubmissionNoHistory
              ? 'Pending (Today)'
              : `Pending (${row.pendingSubmissionDays} days)`
          }
          return row.expenseStatus
        },
        render: (row) =>
          row.expenseStatus === 'Submitted' ? (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
              Submitted
            </span>
          ) : row.expenseStatus === 'No Expense' ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-700/40 dark:text-slate-200">
              No Expense
            </span>
          ) : (
            <span
              className={
                !row.pendingSubmissionNoHistory && Number(row.pendingSubmissionDays || 0) >= 1
                  ? 'rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
                  : 'rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
              }
            >
              {row.pendingSubmissionNoHistory
                ? 'Pending (Today)'
                : `Pending (${row.pendingSubmissionDays} day${row.pendingSubmissionDays === 1 ? '' : 's'})`}
            </span>
          ),
      },
      {
        key: 'totalExpense',
        header: 'Total Expense (NGN)',
        pickable: true,
        exportHeader: 'total_expense_ngn',
        exportPick: (row) => Math.round(row.totalExpense),
        render: (row) => Math.round(row.totalExpense).toLocaleString(),
      },
      {
        key: 'expenseLines',
        header: 'Expense Lines',
        pickable: true,
        exportHeader: 'expense_lines',
        exportPick: (row) => row.expenseLines,
      },
      {
        key: 'topCategory',
        header: 'Top Expense Category',
        pickable: true,
        exportHeader: 'top_expense_category',
        exportPick: (row) => row.topCategory,
      },
      {
        key: 'reportDate',
        header: 'Report Date',
        pickable: true,
        exportHeader: 'submitted_date',
        exportPick: (row) => row.reportDate,
      },
    ],
    [],
  )

  const expensePickableKeys = useMemo(
    () => expenseColumnsDefs.filter((c) => c.pickable !== false).map((c) => c.key),
    [expenseColumnsDefs],
  )

  const visibleExpenseColumns = useMemo(
    () => filterColumnsForTable(expenseColumnsDefs, expenseVisibleKeys),
    [expenseColumnsDefs, expenseVisibleKeys],
  )

  const toggleExpenseColumn = (key) => {
    setExpenseVisibleKeys((prev) => {
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

  const selectAllExpensePickable = () => {
    setExpenseVisibleKeys(new Set(expensePickableKeys))
  }

  const supervisorQueueRows = useMemo(
    () =>
      productRequests
        .filter((request) => request.status === 'submitted')
        .map((request) => ({
          ...request,
          stationName: stations.find((station) => station.id === request.stationId)?.name || request.stationId,
          createdDate: request.createdAt?.split('T')[0] || '-',
          requestedLitersLabel: Math.round(request.requestedLiters).toLocaleString(),
        }))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [productRequests, stations],
  )

  const supervisorHistoryRows = useMemo(
    () =>
      productRequests
        .filter((request) => request.supervisorDecision)
        .map((request) => ({
          ...request,
          stationName: stations.find((station) => station.id === request.stationId)?.name || request.stationId,
          createdDate: request.createdAt?.split('T')[0] || '-',
          supervisorStatus:
            request.supervisorDecision === 'approved'
              ? 'Escalated to Admin'
              : 'Declined',
          reason: request.supervisorRemark || '-',
        }))
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)),
    [productRequests, stations],
  )

  const filteredSupervisorHistoryRows = useMemo(
    () =>
      selectedRequestStationId
        ? supervisorHistoryRows.filter((row) => row.stationId === selectedRequestStationId)
        : supervisorHistoryRows,
    [selectedRequestStationId, supervisorHistoryRows],
  )

  const supervisorQueueColumns = [
    { key: 'createdDate', header: 'Date', minWidth: 110 },
    { key: 'stationName', header: 'Station', minWidth: 190 },
    { key: 'managerName', header: 'Manager', minWidth: 170 },
    { key: 'requestedProductType', header: 'Requested Product', minWidth: 160 },
    { key: 'requestedLitersLabel', header: 'Requested Liters', minWidth: 150 },
    { key: 'managerRemark', header: 'Manager Remark', minWidth: 220 },
    {
      key: 'actions',
      header: 'Supervisor Action',
      minWidth: 280,
      render: (row) => (
        <div
          className="flex flex-wrap gap-2"
          onClick={(event) => {
            event.stopPropagation()
          }}
        >
          <button
            type="button"
            onClick={() =>
              reviewProductRequestBySupervisor({
                requestId: row.id,
                decision: 'approve',
                remark: `Escalated by ${currentUser?.name || 'Supervisor'}`,
              })
            }
            className="rounded-md border border-emerald-300 px-2 py-1 text-xs text-emerald-700"
          >
            Approve & Escalate
          </button>
          <button
            type="button"
            onClick={() =>
              reviewProductRequestBySupervisor({
                requestId: row.id,
                decision: 'decline',
                remark: 'Declined by supervisor',
              })
            }
            className="rounded-md border border-rose-300 px-2 py-1 text-xs text-rose-700"
          >
            Decline
          </button>
        </div>
      ),
    },
  ]

  const supervisorHistoryColumns = [
    { key: 'createdDate', header: 'Date', minWidth: 110 },
    { key: 'stationName', header: 'Station', minWidth: 190 },
    { key: 'requestedProductType', header: 'Requested Product', minWidth: 160 },
    {
      key: 'requestedLiters',
      header: 'Requested Liters',
      minWidth: 140,
      render: (row) => Math.round(row.requestedLiters).toLocaleString(),
    },
    { key: 'supervisorStatus', header: 'Supervisor Decision', minWidth: 180 },
    { key: 'reason', header: 'Reason / Remark', minWidth: 260 },
  ]

  const handleFinalizeDailyReview = () => {
    const confirmed = window.confirm(
      `Finalize supervisor review for ${today}? This will send the daily packet to admin.`,
    )
    if (!confirmed) {
      return
    }

    const stationReviewsPayload = dailyOpeningQueueRows.map((row) => ({
      stationId: row.stationId,
      stationName: row.stationName,
      reportStatus: row.reportStatus,
      stationRemark: String(stationReviewDrafts[row.stationId] || '').trim(),
    }))

    finalizeSupervisorDailyReview({
      date: today,
      generalRemark: generalFinalizationRemark,
      stationReviews: stationReviewsPayload,
    })
    setGeneralFinalizationRemark('')
    setStationReviewDrafts({})
  }

  const dailyQueueFiltersPanel = (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <ColumnPicker
        columns={dailyOpeningColumns}
        visibleKeys={dailyOpeningVisibleKeys}
        onToggleKey={toggleDailyOpeningColumn}
        onSelectAll={selectAllDailyOpeningPickable}
        summaryLabel="Queue columns"
        className="max-w-none w-full"
      />
      <StationMultiSelect
        stations={stations}
        selectedIds={dailyQueueFilters.stationIds}
        onChange={(stationIds) => setDailyQueueFilters((prev) => ({ ...prev, stationIds }))}
        label="Stations"
        className="max-w-none w-full"
      />
      <FilterScreenSection
        title="Submission status"
        description="Choose which daily opening rows appear: everyone, only submitted, or only pending."
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
          <div className="min-w-0 flex-1 lg:max-w-md">
            <label
              htmlFor="supervisor-daily-report-status"
              className="mb-2 block text-xs font-medium text-slate-600 dark:text-slate-400"
            >
              Report status
            </label>
            <select
              id="supervisor-daily-report-status"
              value={dailyQueueFilters.reportStatus}
              onChange={(event) =>
                setDailyQueueFilters((prev) => ({ ...prev, reportStatus: event.target.value }))
              }
              className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="all">All submission statuses</option>
              <option value="Submitted">Submitted</option>
              <option value="No Sales Declared">No Sales Declared</option>
              <option value="Pending">Pending</option>
            </select>
          </div>
          <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setDailyQueueFilters({ stationIds: [], reportStatus: 'all' })}
              className="h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 dark:border-slate-600 dark:text-slate-200"
            >
              Reset submission filters
            </button>
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Preview:{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {filteredDailyOpeningQueueRows.length} of {dailyOpeningQueueRows.length} stations
              </span>{' '}
              match right now.
            </p>
          </div>
        </div>
      </FilterScreenSection>
    </div>
  )

  const cashFlowFiltersPanel = (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <ColumnPicker
        columns={cashFlowColumnsDefs}
        visibleKeys={cashFlowVisibleKeys}
        onToggleKey={toggleCashFlowColumn}
        onSelectAll={selectAllCashFlowPickable}
        summaryLabel="Cash flow columns"
        className="max-w-none w-full"
      />
      <StationMultiSelect
        stations={stations}
        selectedIds={dailyQueueFilters.stationIds}
        onChange={(stationIds) => setDailyQueueFilters((prev) => ({ ...prev, stationIds }))}
        label="Stations"
        className="max-w-none w-full"
      />
      <FilterScreenSection
        title="Submission status"
        description="Choose which cash-flow rows appear: everyone, only submitted, or only pending."
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
          <div className="min-w-0 flex-1 lg:max-w-md">
            <label
              htmlFor="supervisor-cash-flow-status"
              className="mb-2 block text-xs font-medium text-slate-600 dark:text-slate-400"
            >
              Report status
            </label>
            <select
              id="supervisor-cash-flow-status"
              value={dailyQueueFilters.reportStatus}
              onChange={(event) =>
                setDailyQueueFilters((prev) => ({ ...prev, reportStatus: event.target.value }))
              }
              className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="all">All submission statuses</option>
              <option value="Submitted">Submitted</option>
              <option value="No Sales Declared">No Sales Declared</option>
              <option value="Pending">Pending</option>
            </select>
          </div>
          <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setDailyQueueFilters({ stationIds: [], reportStatus: 'all' })}
              className="h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 dark:border-slate-600 dark:text-slate-200"
            >
              Reset cash-flow filters
            </button>
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Preview:{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {filteredDailyOpeningQueueRows.length} of {dailyOpeningQueueRows.length} stations
              </span>{' '}
              match right now.
            </p>
          </div>
        </div>
      </FilterScreenSection>
    </div>
  )

  const expenseQueueFiltersPanel = (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <ColumnPicker
        columns={expenseColumnsDefs}
        visibleKeys={expenseVisibleKeys}
        onToggleKey={toggleExpenseColumn}
        onSelectAll={selectAllExpensePickable}
        summaryLabel="Expense columns"
        className="max-w-none w-full"
      />
      <StationMultiSelect
        stations={stations}
        selectedIds={expenseQueueFilters.stationIds}
        onChange={(stationIds) => setExpenseQueueFilters((prev) => ({ ...prev, stationIds }))}
        label="Stations"
        className="max-w-none w-full"
      />
      <FilterScreenSection
        title="Expense status"
        description="Filter by whether managers submitted expenses, reported none, or are still pending."
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
          <div className="min-w-0 flex-1 lg:max-w-md">
            <label
              htmlFor="supervisor-expense-status"
              className="mb-2 block text-xs font-medium text-slate-600 dark:text-slate-400"
            >
              Expense status
            </label>
            <select
              id="supervisor-expense-status"
              value={expenseQueueFilters.expenseStatus}
              onChange={(event) =>
                setExpenseQueueFilters((prev) => ({ ...prev, expenseStatus: event.target.value }))
              }
              className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="all">All expense statuses</option>
              <option value="Submitted">Submitted</option>
              <option value="No Expense">No Expense</option>
              <option value="Pending">Pending</option>
            </select>
          </div>
          <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setExpenseQueueFilters({ stationIds: [], expenseStatus: 'all' })}
              className="h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 dark:border-slate-600 dark:text-slate-200"
            >
              Reset expense filters
            </button>
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Preview:{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {filteredExpenseQueueRows.length} of {expenseQueueRows.length} stations
              </span>{' '}
              match right now.
            </p>
          </div>
        </div>
      </FilterScreenSection>
    </div>
  )

  return (
    <div className="space-y-4">
      {(activeDashboard === 'stock-flow' || activeDashboard === 'cash-flow' || activeDashboard === 'expense-monitor') && (
        <Card className="hidden space-y-3 md:block">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reports</p>
          <div className="flex flex-col gap-3 md:flex-row">
            <button
              onClick={() => setActiveDashboard('stock-flow')}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                activeDashboard === 'stock-flow'
                  ? 'bg-rose-600 text-white'
                  : 'border border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-200'
              }`}
            >
              Stock Flow
            </button>
            <button
              onClick={() => setActiveDashboard('cash-flow')}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                activeDashboard === 'cash-flow'
                  ? 'bg-rose-600 text-white'
                  : 'border border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-200'
              }`}
            >
              Cash Flow
            </button>
            <button
              onClick={() => setActiveDashboard('expense-monitor')}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                activeDashboard === 'expense-monitor'
                  ? 'bg-rose-600 text-white'
                  : 'border border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-200'
              }`}
            >
              Expenses
            </button>
          </div>
        </Card>
      )}

      {activeDashboard === 'dashboard' && (
        <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <p className="text-sm text-slate-500">Retail Stations Monitored</p>
          <p className="text-2xl font-bold">{portfolio.length}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Critical</p>
          <p className="text-2xl font-bold text-red-600">{criticalCount}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Warning</p>
          <p className="text-2xl font-bold text-yellow-600">{warningCount}</p>
        </Card>
      </div>

      <Card className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h3 className="text-lg font-semibold">Portfolio Monitoring</h3>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="all">All Statuses</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="safe">Safe</option>
          </select>
        </div>
        {filteredPortfolio.length ? (
          <DataTable
            columns={columns}
            rows={filteredPortfolio}
            onRowClick={(row) => navigate(`/stations/${row.stationId}`)}
          />
        ) : (
          <EmptyState
            title="No retail stations in this filter"
            message="Try another status filter to inspect your retail station portfolio."
          />
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="space-y-3">
          <h3 className="text-lg font-semibold">Top Risk Retail Stations</h3>
          {!topRisk.length && (
            <p className="text-sm text-slate-500">No risk stations in your current scope.</p>
          )}
          {topRisk.map((station) => (
            <div key={station.stationId} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <p className="font-medium">{station.stationName}</p>
                <StatusBadge status={station.status} />
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Approx. {station.daysRemaining.toFixed(2)} expected days remaining.
              </p>
              <Link
                to={`/stations/${station.stationId}`}
                className="mt-2 inline-block text-sm font-medium text-blue-600 dark:text-blue-300"
              >
                Open details
              </Link>
            </div>
          ))}
        </Card>

        <Card className="space-y-3">
          <h3 className="text-lg font-semibold">Recent Interventions</h3>
          {!interventions.length && (
            <p className="text-sm text-slate-500">No interventions logged yet.</p>
          )}
          {interventions.slice(0, 6).map((item) => (
            <div key={item.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    navigate(`/stations/${item.stationId}`)
                  }}
                  className="font-medium text-blue-600 hover:underline dark:text-blue-300"
                >
                  {item.stationName}
                </button>
                <StatusBadge status={item.status} />
              </div>
              <p className="mt-1 text-xs text-slate-500">{item.message}</p>
              <p className="mt-1 text-xs text-slate-500">
                Remaining stock:{' '}
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {Math.round(metricsByStationId.get(item.stationId)?.stockRemaining || 0).toLocaleString()} L
                </span>
              </p>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  navigate(`/stations/${item.stationId}/history`)
                }}
                className="mt-2 rounded-md border border-blue-300 px-2 py-1 text-xs font-medium text-blue-700 dark:border-blue-500/40 dark:text-blue-300"
              >
                Open Report History
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  escalateStationIntervention({ stationId: item.stationId })
                }}
                disabled={item.stage === 'escalated'}
                className="mt-2 rounded-md border border-amber-300 px-2 py-1 text-xs font-medium text-amber-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-500/40 dark:text-amber-300"
              >
                {item.stage === 'escalated' ? 'Escalated' : 'Escalate'}
              </button>
              {item.stage === 'escalated' && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    const confirmed = window.confirm('Revert escalation for this station?')
                    if (confirmed) {
                      revertEscalationIntervention({ stationId: item.stationId })
                    }
                  }}
                  className="ml-2 mt-2 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
                >
                  Revert Escalation
                </button>
              )}
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  const confirmed = window.confirm('Unflag this station intervention?')
                  if (confirmed) {
                    unflagStationIntervention({ stationId: item.stationId })
                  }
                }}
                className="ml-2 mt-2 rounded-md border border-rose-300 px-2 py-1 text-xs font-medium text-rose-700 dark:border-rose-500/40 dark:text-rose-300"
              >
                Unflag
              </button>
            </div>
          ))}
        </Card>
      </div>
        </>
      )}

      {activeDashboard === 'stock-flow' && (
        <>
          {!filtersScreenOpen && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Card>
                <p className="text-sm text-slate-500">Total Retail Stations</p>
                <p className="text-2xl font-bold">{dailyOpeningQueueRows.length}</p>
              </Card>
              <Card>
                <p className="text-sm text-slate-500">Submitted Today</p>
                <p className="text-2xl font-bold text-emerald-600">{submittedCount}</p>
              </Card>
              <Card>
                <p className="text-sm text-slate-500">Pending Today</p>
                <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
              </Card>
            </div>
          )}

          {filtersScreenOpen ? (
            <Card className="mx-auto max-w-5xl space-y-8 overflow-hidden px-4 py-6 sm:px-8 sm:py-8">
              <div className="flex flex-wrap items-start gap-4 border-b border-slate-200 pb-6 dark:border-slate-700">
                <button
                  type="button"
                  onClick={closeFiltersScreen}
                  className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 dark:border-slate-600 dark:text-slate-200"
                >
                  ← Back to queue
                </button>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
                    Daily opening · Filters
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                    Order: table columns, stations, then submission status—everything drives the queue table and Excel
                    export.
                  </p>
                </div>
              </div>
              {dailyQueueFiltersPanel}
              <div className="-mx-4 flex justify-end border-t border-slate-200 bg-slate-50/90 px-4 py-5 pb-24 sm:-mx-8 sm:px-8 sm:pb-6 dark:border-slate-700 dark:bg-slate-900/60">
                <button
                  type="button"
                  onClick={closeFiltersScreen}
                  className="rounded-lg bg-rose-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rose-700"
                >
                  Done
                </button>
              </div>
            </Card>
          ) : (
            <Card className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <h3 className="text-lg font-semibold">Daily Opening Stock Queue (Alphabetical)</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={openFiltersScreen}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm dark:bg-white dark:text-slate-900"
                  >
                    Filters
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowFullDailyOpeningColumns((prev) => !prev)}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    {showFullDailyOpeningColumns ? 'Compact View' : 'Full Columns'}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!filteredDailyOpeningQueueRows.length) {
                        window.alert('No rows match the current filters.')
                        return
                      }
                      exportSupervisorDailyOpeningsToExcel(
                        filteredDailyOpeningQueueRows,
                        columnsToExportSpecs(visibleDailyOpeningColumns),
                      )
                      await refreshFromSupabase()
                    }}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
                  >
                    Export Queue to Excel
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  <span className="font-medium text-slate-800 dark:text-slate-100">Active filters:</span>{' '}
                  {dailyFiltersSummary}
                  {' · '}
                  Showing {filteredDailyOpeningQueueRows.length} of {dailyOpeningQueueRows.length} stations
                </p>
              </div>
              {dailyOpeningQueueRows.length ? (
                filteredDailyOpeningQueueRows.length ? (
                  <DataTable
                    columns={visibleDailyOpeningColumns}
                    rows={filteredDailyOpeningQueueRows}
                    onRowClick={(row) => navigate(`/stations/${row.stationId}`)}
                    tableClassName={
                      showFullDailyOpeningColumns ? 'min-w-[2350px] table-fixed' : 'min-w-[1850px] table-fixed'
                    }
                    wrapHeaders={false}
                    wrapCells={false}
                    stickyColumns={dailyOpeningStickyColumns}
                    stickyColumnWidths={{
                      stationName: 220,
                      reportStatus: 180,
                      stationId: 120,
                    }}
                  />
                ) : (
                  <EmptyState
                    title="No stations match these filters"
                    message="Open Filters to adjust stations or status, or reset there."
                  />
                )
              ) : (
                <EmptyState
                  title="No retail stations found"
                  message="Add retail station records to start collecting opening stock submissions."
                />
              )}
            </Card>
          )}

          {!filtersScreenOpen && (
          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Daily Finalization to Admin ({today})</h3>
              <p className="text-sm text-slate-500">
                {todayFinalization
                  ? `Already finalized by ${todayFinalization.finalizedBy}`
                  : 'Not finalized yet'}
              </p>
            </div>
            <label className="space-y-1">
              <span className="text-sm font-medium">General Supervisor Remark</span>
              <textarea
                value={generalFinalizationRemark}
                onChange={(event) => setGeneralFinalizationRemark(event.target.value)}
                placeholder="Overall daily summary for admin..."
                className="h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <DataTable columns={finalizationColumns} rows={finalizationRows} tableClassName="min-w-[900px]" />
            <button
              type="button"
              onClick={handleFinalizeDailyReview}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white"
            >
              {todayFinalization ? 'Re-Finalize Daily Review' : 'Finalize Daily Review'}
            </button>
          </Card>
          )}

          {selectedDailyOpeningReport && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
              <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <h4 className="text-lg font-semibold text-slate-900 dark:text-white">
                      Full Daily Report - {selectedDailyOpeningReport.stationName}
                    </h4>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {selectedDailyOpeningReport.managerName} | {selectedDailyOpeningReport.reportDate}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedDailyOpeningReport(null)}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
                  >
                    Close
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <p className="text-xs uppercase text-slate-500">Submission Status</p>
                    <p className="font-medium">{selectedDailyOpeningReport.reportStatus}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <p className="text-xs uppercase text-slate-500">Received Product (PMS/AGO)</p>
                    <p className="font-medium">{selectedDailyOpeningReport.receivedProduct}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <p className="text-xs uppercase text-slate-500">Opening Stock PMS</p>
                    <p className="font-medium">{selectedDailyOpeningReport.openingStockPMS}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <p className="text-xs uppercase text-slate-500">Opening Stock AGO</p>
                    <p className="font-medium">{selectedDailyOpeningReport.openingStockAGO}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <p className="text-xs uppercase text-slate-500">Closing Stock PMS</p>
                    <p className="font-medium">{selectedDailyOpeningReport.closingStockPMS}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <p className="text-xs uppercase text-slate-500">Closing Stock AGO</p>
                    <p className="font-medium">{selectedDailyOpeningReport.closingStockAGO}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <p className="text-xs uppercase text-slate-500">PMS Price</p>
                    <p className="font-medium">{selectedDailyOpeningReport.pmsPrice}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <p className="text-xs uppercase text-slate-500">AGO Price</p>
                    <p className="font-medium">{selectedDailyOpeningReport.agoPrice}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <p className="text-xs uppercase text-slate-500">Input Quantity Received (L)</p>
                    <p className="font-medium">{selectedDailyOpeningReport.quantityReceived}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <p className="text-xs uppercase text-slate-500">Total Sales in Liters PMS</p>
                    <p className="font-medium">{selectedDailyOpeningReport.totalSalesLitersPMS}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <p className="text-xs uppercase text-slate-500">Total Sales in Liters AGO</p>
                    <p className="font-medium">{selectedDailyOpeningReport.totalSalesLitersAGO}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <p className="text-xs uppercase text-slate-500">RTT PMS</p>
                    <p className="font-medium">{selectedDailyOpeningReport.rttPMS}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <p className="text-xs uppercase text-slate-500">RTT AGO</p>
                    <p className="font-medium">{selectedDailyOpeningReport.rttAGO}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800 md:col-span-2">
                    <p className="text-xs uppercase text-slate-500">Remark</p>
                    <p className="font-medium">{selectedDailyOpeningReport.managerRemark}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <p className="text-xs uppercase text-slate-500">Expense Total (NGN)</p>
                    <p className="font-medium">
                      {Math.round(selectedDailyOpeningReport.expenseAmount).toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800 md:col-span-2">
                    <p className="text-xs uppercase text-slate-500">Expense Description</p>
                    <p className="font-medium">{selectedDailyOpeningReport.expenseDescription}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <p className="text-xs uppercase text-slate-500">Bank/Channel Deposits Total (NGN)</p>
                    <p className="font-medium">
                      {Math.round(Number(selectedDailyOpeningReport.totalPaymentDeposits || 0)).toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <p className="text-xs uppercase text-slate-500">Cash B/F (NGN)</p>
                    <p className="font-medium">{Math.round(Number(selectedDailyOpeningReport.cashBf || 0)).toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <p className="text-xs uppercase text-slate-500">Cash Sales (NGN)</p>
                    <p className="font-medium">{Math.round(Number(selectedDailyOpeningReport.cashSales || 0)).toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <p className="text-xs uppercase text-slate-500">Total Amount (NGN)</p>
                    <p className="font-medium">{Math.round(Number(selectedDailyOpeningReport.totalAmount || 0)).toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <p className="text-xs uppercase text-slate-500">POS (NGN)</p>
                    <p className="font-medium">{Math.round(Number(selectedDailyOpeningReport.posValue || 0)).toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <p className="text-xs uppercase text-slate-500">Closing Balance (NGN)</p>
                    <p className="font-medium">{Math.round(Number(selectedDailyOpeningReport.closingBalance || 0)).toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <p className="text-xs uppercase text-slate-500">Variance (NGN)</p>
                    <p className="font-medium">
                      {Math.round(Number(selectedDailyOpeningReport.cashMovementVariance || 0)).toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <p className="text-xs uppercase text-slate-500">Pump Reading Lines</p>
                    <p className="font-medium">{Number(selectedDailyOpeningReport.pumpReadingsCount || 0)}</p>
                  </div>
                </div>

                {selectedDailyOpeningReport.expenseItems.length > 0 && (
                  <div className="mt-4 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <p className="mb-2 text-xs uppercase text-slate-500">Expense Lines</p>
                    <div className="space-y-2">
                      {selectedDailyOpeningReport.expenseItems.map((item, index) => (
                        <p key={`${item.label}-${index}`} className="text-sm text-slate-700 dark:text-slate-200">
                          {item.label}: NGN {Math.round(Number(item.amount) || 0).toLocaleString()}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
                {selectedDailyOpeningReport.paymentBreakdown?.length > 0 && (
                  <div className="mt-4 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <p className="mb-2 text-xs uppercase text-slate-500">Bank/Channel Breakdown</p>
                    <div className="space-y-2">
                      {selectedDailyOpeningReport.paymentBreakdown.map((item, index) => (
                        <p key={`${item.channel}-${index}`} className="text-sm text-slate-700 dark:text-slate-200">
                          {item.channel}: NGN {Math.round(Number(item.amount) || 0).toLocaleString()}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
                {selectedDailyOpeningReport.pumpMeterRows?.length > 0 && (
                  <div className="mt-4 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <p className="mb-2 text-xs uppercase text-slate-500">Pump Readings</p>
                    <div className="space-y-2">
                      {selectedDailyOpeningReport.pumpMeterRows.map((item, index) => (
                        <p key={`${item.label}-${index}`} className="text-sm text-slate-700 dark:text-slate-200">
                          {item.label}:{' '}
                          {item.noBaseline
                            ? 'No baseline'
                            : `${item.opening ?? '-'} - ${item.closing ?? '-'} ${item.used ? '(used)' : '(unused)'}`}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {activeDashboard === 'cash-flow' && (
        <>
          {!filtersScreenOpen && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Card>
                <p className="text-sm text-slate-500">Stations in View</p>
                <p className="text-2xl font-bold">{filteredDailyOpeningQueueRows.length}</p>
              </Card>
              <Card>
                <p className="text-sm text-slate-500">Total Bank/Channel Deposits (NGN)</p>
                <p className="text-2xl font-bold">{Math.round(totalBankDepositsToday).toLocaleString()}</p>
              </Card>
              <Card>
                <p className="text-sm text-slate-500">Net Variance (NGN)</p>
                <p className="text-2xl font-bold">{Math.round(totalCashVarianceToday).toLocaleString()}</p>
              </Card>
            </div>
          )}

          {filtersScreenOpen ? (
            <Card className="mx-auto max-w-5xl space-y-8 overflow-hidden px-4 py-6 sm:px-8 sm:py-8">
              <div className="flex flex-wrap items-start gap-4 border-b border-slate-200 pb-6 dark:border-slate-700">
                <button
                  type="button"
                  onClick={closeFiltersScreen}
                  className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 dark:border-slate-600 dark:text-slate-200"
                >
                  ← Back to queue
                </button>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
                    Cash flow · Filters
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                    Reuse station/status filters from stock flow while reviewing cash and deposit movement.
                  </p>
                </div>
              </div>
              {cashFlowFiltersPanel}
              <div className="-mx-4 flex justify-end border-t border-slate-200 bg-slate-50/90 px-4 py-5 pb-24 sm:-mx-8 sm:px-8 sm:pb-6 dark:border-slate-700 dark:bg-slate-900/60">
                <button
                  type="button"
                  onClick={closeFiltersScreen}
                  className="rounded-lg bg-rose-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rose-700"
                >
                  Done
                </button>
              </div>
            </Card>
          ) : (
            <Card className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <h3 className="text-lg font-semibold">Cash Flow Queue</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={openFiltersScreen}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm dark:bg-white dark:text-slate-900"
                  >
                    Filters
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!filteredDailyOpeningQueueRows.length) {
                        window.alert('No rows match the current filters.')
                        return
                      }
                      exportSupervisorCashFlowToExcel(
                        filteredDailyOpeningQueueRows,
                        columnsToExportSpecs(visibleCashFlowColumns),
                      )
                      await refreshFromSupabase()
                    }}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
                  >
                    Export Cash Flow to Excel
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  <span className="font-medium text-slate-800 dark:text-slate-100">Active filters:</span>{' '}
                  {dailyFiltersSummary}
                  {' · '}
                  Showing {filteredDailyOpeningQueueRows.length} of {dailyOpeningQueueRows.length} stations
                </p>
              </div>
              {dailyOpeningQueueRows.length ? (
                filteredDailyOpeningQueueRows.length ? (
                  <DataTable
                    columns={visibleCashFlowColumns}
                    rows={filteredDailyOpeningQueueRows}
                    onRowClick={(row) => navigate(`/stations/${row.stationId}`)}
                    tableClassName="min-w-[1500px]"
                    wrapHeaders
                  />
                ) : (
                  <EmptyState
                    title="No stations match these filters"
                    message="Open Filters to adjust stations or status, or reset there."
                  />
                )
              ) : (
                <EmptyState
                  title="No retail stations found"
                  message="No cash flow data available for monitored retail stations."
                />
              )}
            </Card>
          )}
        </>
      )}

      {activeDashboard === 'expense-monitor' && (
        <>
          {!filtersScreenOpen && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Card>
                <p className="text-sm text-slate-500">Expense Reports Submitted</p>
                <p className="text-2xl font-bold text-emerald-600">{expenseSubmittedCount}</p>
              </Card>
              <Card>
                <p className="text-sm text-slate-500">Total Expense Today (NGN)</p>
                <p className="text-2xl font-bold">{Math.round(totalExpenseToday).toLocaleString()}</p>
              </Card>
              <Card>
                <p className="text-sm text-slate-500">Top Spending Station</p>
                <p className="text-sm font-semibold">{topSpendingStation?.stationName || '-'}</p>
                <p className="text-base font-bold">
                  NGN {Math.round(topSpendingStation?.totalExpense || 0).toLocaleString()}
                </p>
              </Card>
            </div>
          )}

          {filtersScreenOpen ? (
            <Card className="mx-auto max-w-5xl space-y-8 overflow-hidden px-4 py-6 sm:px-8 sm:py-8">
              <div className="flex flex-wrap items-start gap-4 border-b border-slate-200 pb-6 dark:border-slate-700">
                <button
                  type="button"
                  onClick={closeFiltersScreen}
                  className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 dark:border-slate-600 dark:text-slate-200"
                >
                  ← Back to queue
                </button>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
                    Expense queue · Filters
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                    Columns, stations, then expense status—applied to the table and Excel export.
                  </p>
                </div>
              </div>
              {expenseQueueFiltersPanel}
              <div className="-mx-4 flex justify-end border-t border-slate-200 bg-slate-50/90 px-4 py-5 pb-24 sm:-mx-8 sm:px-8 sm:pb-6 dark:border-slate-700 dark:bg-slate-900/60">
                <button
                  type="button"
                  onClick={closeFiltersScreen}
                  className="rounded-lg bg-rose-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rose-700"
                >
                  Done
                </button>
              </div>
            </Card>
          ) : (
            <Card className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <h3 className="text-lg font-semibold">Daily Expense Queue</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={openFiltersScreen}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm dark:bg-white dark:text-slate-900"
                  >
                    Filters
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!filteredExpenseQueueRows.length) {
                        window.alert('No rows match the current filters.')
                        return
                      }
                      exportSupervisorExpenseQueueToExcel(
                        filteredExpenseQueueRows,
                        columnsToExportSpecs(visibleExpenseColumns),
                      )
                      await refreshFromSupabase()
                    }}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
                  >
                    Export Expense Queue to Excel
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  <span className="font-medium text-slate-800 dark:text-slate-100">Active filters:</span>{' '}
                  {expenseFiltersSummary}
                  {' · '}
                  Showing {filteredExpenseQueueRows.length} of {expenseQueueRows.length} stations
                </p>
              </div>
              {expenseQueueRows.length ? (
                filteredExpenseQueueRows.length ? (
                  <DataTable
                    columns={visibleExpenseColumns}
                    rows={filteredExpenseQueueRows}
                    onRowClick={(row) => navigate(`/stations/${row.stationId}`)}
                    tableClassName="min-w-[1400px]"
                    wrapHeaders
                  />
                ) : (
                  <EmptyState
                    title="No stations match these filters"
                    message="Open Filters to adjust stations or status, or reset there."
                  />
                )
              ) : (
                <EmptyState
                  title="No retail stations found"
                  message="No expense queue data available for monitored retail stations."
                />
              )}
            </Card>
          )}
        </>
      )}
      {activeDashboard === 'month-end-summary' && (
        <Card className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h3 className="text-lg font-semibold">Month-End Summary by Station</h3>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  exportSupervisorMonthEndSummaryToExcel(monthEndSummaryRows)
                }
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
              >
                Export Month-End Summary
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-3 md:flex-row">
            <button
              type="button"
              onClick={() => setMonthEndSection('stock-flow')}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                monthEndSection === 'stock-flow'
                  ? 'bg-rose-600 text-white'
                  : 'border border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-200'
              }`}
            >
              Stock Flow
            </button>
            <button
              type="button"
              onClick={() => setMonthEndSection('cash-flow')}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                monthEndSection === 'cash-flow'
                  ? 'bg-rose-600 text-white'
                  : 'border border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-200'
              }`}
            >
              Cash Flow
            </button>
            <button
              type="button"
              onClick={() => setMonthEndSection('expense-monitor')}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                monthEndSection === 'expense-monitor'
                  ? 'bg-rose-600 text-white'
                  : 'border border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-200'
              }`}
            >
              Expenses
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Month</span>
              <select
                value={selectedMonthKey}
                onChange={(event) => setSelectedMonthKey(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                {monthEndMonthOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <StationMultiSelect
              stations={stations}
              selectedIds={monthEndStationIds}
              onChange={setMonthEndStationIds}
              label="Stations"
              className="max-w-none w-full"
            />
          </div>
          {monthEndSummaryRows.length ? (
            <>
              <DataTable
                columns={
                  monthEndSection === 'stock-flow'
                    ? monthEndStockColumns
                    : monthEndSection === 'cash-flow'
                      ? monthEndCashColumns
                      : monthEndExpenseColumns
                }
                rows={monthEndSummaryRows}
                tableClassName="min-w-[1650px]"
                wrapHeaders
              />
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3 dark:border-slate-700">
                <p className="text-sm text-slate-500">
                  {selectedMonthFinalization
                    ? `Finalized by ${selectedMonthFinalization.finalizedBy} (${selectedMonthFinalization.finalizedAt?.split('T')[0] || '-'})`
                    : `Ready to finalize ${selectedMonthLabel} summary for admin review.`}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const confirmed = window.confirm(
                      `Finalize ${selectedMonthLabel} month-end summary and send to admin?`,
                    )
                    if (!confirmed) {
                      return
                    }
                    finalizeSupervisorMonthEndSummary({
                      monthKey: selectedMonthKey,
                      monthLabel: selectedMonthLabel,
                      stationSummaries: monthEndSummaryRows,
                    })
                  }}
                  className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
                >
                  {selectedMonthFinalization ? 'Re-Finalize Month-End Summary' : 'Finalize Month-End Summary'}
                </button>
              </div>
            </>
          ) : (
            <EmptyState
              title="No summary rows"
              message="No monthly report data available for selected month/stations."
            />
          )}
        </Card>
      )}
      {activeDashboard === 'product-requests' && (
        <>
          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Manager Requests Awaiting Supervisor Decision</h3>
              <p className="text-sm text-slate-500">{supervisorQueueRows.length} pending</p>
            </div>
            {supervisorQueueRows.length ? (
              <DataTable
                columns={supervisorQueueColumns}
                rows={supervisorQueueRows}
                onRowClick={(row) => setSelectedRequestStationId(row.stationId)}
                tableClassName="min-w-[1700px]"
              />
            ) : (
              <EmptyState
                title="No pending manager requests"
                message="Submitted product requests from station managers will appear here."
              />
            )}
          </Card>
          <Card className="space-y-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <h3 className="text-lg font-semibold">
                Supervisor Request History
                {selectedRequestStationId &&
                  ` - ${stations.find((station) => station.id === selectedRequestStationId)?.name || selectedRequestStationId}`}
              </h3>
              <div className="flex items-center gap-3">
                <p className="text-sm text-slate-500">Approved, escalated, and declined records</p>
                {selectedRequestStationId && (
                  <button
                    type="button"
                    onClick={() => setSelectedRequestStationId(null)}
                    className="rounded-md border border-slate-300 px-3 py-1 text-xs dark:border-slate-700"
                  >
                    Clear Station Filter
                  </button>
                )}
              </div>
            </div>
            {filteredSupervisorHistoryRows.length ? (
              <DataTable
                columns={supervisorHistoryColumns}
                rows={filteredSupervisorHistoryRows}
                onRowClick={(row) => setSelectedRequestStationId(row.stationId)}
                tableClassName="min-w-[1300px]"
              />
            ) : (
              <EmptyState
                title={selectedRequestStationId ? 'No history for selected station' : 'No history yet'}
                message={
                  selectedRequestStationId
                    ? 'This station has no reviewed request records yet.'
                    : 'Once you review manager product requests, they appear in this history.'
                }
              />
            )}
          </Card>
        </>
      )}
      {activeDashboard === 'history' && (
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Supervisor Daily Finalization History</h3>
            <p className="text-sm text-slate-500">Date-attached packets sent to admin</p>
          </div>
          {finalizationHistoryRows.length ? (
            <DataTable
              columns={finalizationHistoryColumns}
              rows={finalizationHistoryRows}
              tableClassName="min-w-[1400px]"
              wrapCells
            />
          ) : (
            <EmptyState
              title="No finalized history yet"
              message="Finalize a daily review packet to create history records."
            />
          )}
        </Card>
      )}
    </div>
  )
}

export default SupervisorDashboardPage

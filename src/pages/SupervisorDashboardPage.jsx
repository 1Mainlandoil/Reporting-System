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
import { getClosingForProduct, getPumpHistoryKey, normalizePumpProductType } from '../utils/reportFields'
import {
  exportSupervisorDailyOpeningsToExcel,
  exportSupervisorCashFlowToExcel,
  exportSupervisorMonthEndSummaryToExcel,
  exportSupervisorExpenseQueueToExcel,
} from '../utils/exportExcel'
import { formatPendingSubmissionSummary, getDailyReportPendingInfo } from '../utils/reportPending'

const IconShell = ({ children, className = '' }) => (
  <svg
    className={`h-5 w-5 ${className}`}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
)

const StationIcon = ({ className = '' }) => (
  <IconShell className={className}>
    <path d="M3 10.5 12 4l9 6.5" />
    <path d="M5 10v9h14v-9" />
    <path d="M9 19v-5h6v5" />
  </IconShell>
)

const SafeIcon = ({ className = '' }) => (
  <IconShell className={className}>
    <path d="M20 6 9 17l-5-5" />
  </IconShell>
)

const WarningIcon = ({ className = '' }) => (
  <IconShell className={className}>
    <path d="M12 3 2.5 20h19L12 3z" />
    <path d="M12 9v5" />
    <path d="M12 17h.01" />
  </IconShell>
)

const CriticalIcon = ({ className = '' }) => (
  <IconShell className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 8l8 8" />
    <path d="M16 8l-8 8" />
  </IconShell>
)

const TrophyIcon = ({ className = '' }) => (
  <IconShell className={className}>
    <path d="M8 21h8" />
    <path d="M12 17v4" />
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" />
    <path d="M7 6H4a3 3 0 0 0 3 3" />
    <path d="M17 6h3a3 3 0 0 1-3 3" />
  </IconShell>
)

const RankIcon = ({ rank, className = '' }) => {
  const colors = ['text-yellow-300', 'text-slate-300', 'text-amber-600']
  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-current/25 bg-current/10 ${colors[rank] || 'text-slate-500'} ${className}`}>
      <TrophyIcon className="h-4 w-4" />
    </span>
  )
}

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

const normalizeDateRange = (from, to) => {
  const start = from && to && from > to ? to : from
  const end = from && to && from > to ? from : to
  return { start, end }
}

const eachDateInRange = (from, to) => {
  const { start, end } = normalizeDateRange(from, to)
  const dates = []
  if (!start || !end) return dates
  const cursor = new Date(`${start}T00:00:00`)
  const last = new Date(`${end}T00:00:00`)
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

const formatDateRangeLabel = (from, to) => {
  const { start, end } = normalizeDateRange(from, to)
  return start === end ? start : `${start} to ${end}`
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
    const productType = normalizePumpProductType(item?.productType)
    const key = getPumpHistoryKey(label, productType)
    const reading = getPumpReadingValue(item)
    if (!key || reading == null || Number.isNaN(reading)) continue
    prevMap.set(key, { label, productType, closing: reading })
  }
  const todayMap = new Map()
  const todayOpeningMap = new Map()
  const todayProductMap = new Map()
  for (const item of todayReadings) {
    const label = String(item?.label || '').trim()
    const productType = normalizePumpProductType(item?.productType)
    const key = getPumpHistoryKey(label, productType)
    const reading = getPumpReadingValue(item)
    if (!key || reading == null || Number.isNaN(reading)) continue
    todayMap.set(key, reading)
    const opening = item.opening != null && item.opening !== '' ? Number(item.opening) : null
    if (opening != null && !Number.isNaN(opening)) {
      todayOpeningMap.set(key, opening)
    }
    todayProductMap.set(key, { label, productType })
  }

  const keys = new Set([...todayMap.keys()])
  return [...keys]
    .sort((a, b) => {
      const aMeta = todayProductMap.get(a) || prevMap.get(a) || {}
      const bMeta = todayProductMap.get(b) || prevMap.get(b) || {}
      return `${aMeta.label || ''} ${aMeta.productType || ''}`.localeCompare(`${bMeta.label || ''} ${bMeta.productType || ''}`)
    })
    .map((key) => {
      const meta = todayProductMap.get(key) || prevMap.get(key) || {}
      const opening = todayOpeningMap.has(key)
        ? todayOpeningMap.get(key)
        : prevMap.has(key)
          ? prevMap.get(key).closing
          : null
      const closing = todayMap.has(key) ? todayMap.get(key) : opening
      const used = todayMap.has(key)
      return {
        label: meta.label || '',
        productType: meta.productType || 'PMS',
        opening,
        closing,
        used,
        delta: used && opening != null && closing != null ? closing - opening : 0,
        noBaseline: opening == null && !used,
      }
    })
}

const toFiniteNumber = (value, fallback = 0) => {
  const normalized = Number(String(value ?? '').replace(/,/g, ''))
  return Number.isFinite(normalized) ? normalized : fallback
}

const formatLiters = (value, digits = 0) => `${toFiniteNumber(value).toLocaleString(undefined, {
  maximumFractionDigits: digits,
  minimumFractionDigits: digits,
})} L`

const formatMoney = (value) => `NGN ${Math.round(toFiniteNumber(value)).toLocaleString()}`

const differenceTone = (value) => {
  const gap = Math.abs(toFiniteNumber(value))
  if (gap <= 1) return 'text-[#a9cd39]'
  if (gap <= 10) return 'text-amber-300'
  return 'text-red-300'
}

const reportStatusRank = (status) => {
  if (status === 'Submitted') return 0
  if (status === 'Partial') return 1
  if (status === 'Pending') return 2
  return 2
}

const portfolioStatusRank = (status) => {
  if (status === 'safe') return 0
  if (status === 'warning') return 1
  if (status === 'critical') return 2
  return 3
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
  const updateReportSupervisorReview = useAppStore((state) => state.updateReportSupervisorReview)
  const escalateStationIntervention = useAppStore((state) => state.escalateStationIntervention)
  const revertEscalationIntervention = useAppStore((state) => state.revertEscalationIntervention)
  const unflagStationIntervention = useAppStore((state) => state.unflagStationIntervention)
  const correctReportBySupervisor = useAppStore((state) => state.correctReportBySupervisor)
  const finalizeReportBySupervisor = useAppStore((state) => state.finalizeReportBySupervisor)

  const productRequests = useAppStore((state) => state.productRequests)
  const reviewProductRequestBySupervisor = useAppStore((state) => state.reviewProductRequestBySupervisor)
  const dailyFinalizations = useAppStore((state) => state.dailyFinalizations)
  const finalizeSupervisorDailyReview = useAppStore((state) => state.finalizeSupervisorDailyReview)
  const monthEndFinalizations = useAppStore((state) => state.monthEndFinalizations)
  const finalizeSupervisorMonthEndSummary = useAppStore((state) => state.finalizeSupervisorMonthEndSummary)
  const refreshFromSupabase = useAppStore((state) => state.refreshFromSupabase)
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedDailyOpeningReport, setSelectedDailyOpeningReport] = useState(null)
  const [reviewRemark, setReviewRemark] = useState('')
  const [correctionOpen, setCorrectionOpen] = useState(false)
  const [correctionReason, setCorrectionReason] = useState('')
  const [correctionDraft, setCorrectionDraft] = useState(null)
  const [finalizeRemark, setFinalizeRemark] = useState('')
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
    const rows = statusFilter === 'all'
      ? portfolio
      : portfolio.filter((station) => station.status === statusFilter)
    return [...rows].sort((a, b) => portfolioStatusRank(a.status) - portfolioStatusRank(b.status) || a.stationName.localeCompare(b.stationName))
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
  const [reportRangeFrom, setReportRangeFrom] = useState(today)
  const [reportRangeTo, setReportRangeTo] = useState(today)
  const reportRange = useMemo(() => normalizeDateRange(reportRangeFrom || today, reportRangeTo || reportRangeFrom || today), [reportRangeFrom, reportRangeTo, today])
  const reportRangeDates = useMemo(() => eachDateInRange(reportRange.start, reportRange.end), [reportRange.start, reportRange.end])
  const reportRangeLabel = useMemo(() => formatDateRangeLabel(reportRange.start, reportRange.end), [reportRange.start, reportRange.end])
  const isSingleReportDate = reportRange.start === reportRange.end
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
        const rangeReportDates = new Set(reportRangeDates.filter((date) => stationReportDates.has(date)))
        const pendingDaysInRange = Math.max(0, reportRangeDates.length - rangeReportDates.size)
        const pendingInfo = getDailyReportPendingInfo(reportRange.end, stationReportDates)
        const pendingFmt = formatPendingSubmissionSummary(
          { ...pendingInfo, pendingDays: isSingleReportDate ? pendingInfo.pendingDays : pendingDaysInRange },
          reportRange.end,
        )
        const stationReportsToday = reports.filter(
          (report) => report.stationId === station.id && report.date >= reportRange.start && report.date <= reportRange.end,
        )
        const latestToday = stationReportsToday.at(-1)
        const firstToday = stationReportsToday[0]
        const previousReport = [...reports]
          .filter((report) => report.stationId === station.id && report.date < reportRange.start)
          .sort((a, b) => b.date.localeCompare(a.date))[0]
        const manager = staffByStation.get(station.id)
        const receivedProductType = latestToday ? resolveReceivedProductType(latestToday) : null
        const paymentBreakdown = stationReportsToday.flatMap((report) => Array.isArray(report.paymentBreakdown) ? report.paymentBreakdown : [])
        const posTerminalBreakdown = Array.isArray(latestToday?.posTerminalBreakdown)
          ? latestToday.posTerminalBreakdown
          : []
        const totalPaymentDeposits = paymentBreakdown.length
          ? paymentBreakdown.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
          : stationReportsToday.reduce((sum, report) => sum + Number(report?.totalPaymentDeposits || 0), 0)
        const posValue = stationReportsToday.reduce((sum, report) => sum + Number(report?.posValue || 0), 0)
        const cashBf = Number(previousReport?.closingBalance || 0)
        const cashSales = stationReportsToday.reduce((sum, report) => sum + Number(report?.cashSales || 0), 0)
        const totalAmount = cashBf + cashSales
        const closingBalance = latestToday ? Number(latestToday.closingBalance || 0) : totalAmount - totalPaymentDeposits - posValue
        // Variance = Total - Bank Lodgements - POS - Closing (should be 0 if rule is followed)
        const cashMovementVariance = totalAmount - totalPaymentDeposits - posValue - closingBalance
        const pumpReadings = Array.isArray(latestToday?.pumpReadings) ? latestToday.pumpReadings : []
        const priorPumpReadings = Array.isArray(previousReport?.pumpReadings) ? previousReport.pumpReadings : []
        const pumpMeterRows = buildPumpRowsWithCarry(priorPumpReadings, pumpReadings)

        return {
          stationId: station.id,
          stationName: station.name,
          managerName: manager?.name || 'Unassigned',
          reportStatus: latestToday
            ? pendingDaysInRange > 0 && !isSingleReportDate
              ? 'Partial'
              : latestToday.noSalesDay ? 'No Sales Declared' : 'Submitted'
            : 'Pending',
          openingStockPMS: latestToday
            ? firstToday?.openingStockPMS ?? firstToday?.openingPMS ?? latestToday.openingStockPMS ?? latestToday.openingPMS ?? 0
            : 'Not Submitted',
          openingStockAGO: latestToday
            ? firstToday?.openingStockAGO ?? firstToday?.openingAGO ?? latestToday.openingStockAGO ?? latestToday.openingAGO ?? 0
            : 'Not Submitted',
          pmsPrice: latestToday ? latestToday.pmsPrice ?? 'Not Submitted' : 'Not Submitted',
          agoPrice: latestToday ? latestToday.agoPrice ?? 'Not Submitted' : 'Not Submitted',
          multiPricing: Boolean(latestToday?.multiPricing),
          priceBandsPMS: Array.isArray(latestToday?.priceBandsPMS) ? latestToday.priceBandsPMS : [],
          priceBandsAGO: Array.isArray(latestToday?.priceBandsAGO) ? latestToday.priceBandsAGO : [],
          salesAmountPMS: stationReportsToday.reduce((sum, report) => sum + Number(report?.salesAmountPMS || 0), 0),
          salesAmountAGO: stationReportsToday.reduce((sum, report) => sum + Number(report?.salesAmountAGO || 0), 0),
          totalSalesAmount: stationReportsToday.reduce((sum, report) => sum + Number(report?.totalSalesAmount || 0), 0),
          receivedProduct: latestToday
            ? latestToday.receivedProduct
              ? `Yes (${receivedProductType || 'Not specified'})`
              : 'No'
            : 'Not Submitted',
          quantityReceived: latestToday
            ? Math.round(Number(latestToday.receivedPMS ?? 0) + Number(latestToday.receivedAGO ?? 0)).toLocaleString()
            : 'Not Submitted',
          receivedPMS: stationReportsToday.reduce((sum, report) => sum + Number(report?.receivedPMS || 0), 0),
          receivedAGO: stationReportsToday.reduce((sum, report) => sum + Number(report?.receivedAGO || 0), 0),
          closingStockPMS: latestToday
            ? Math.round(getClosingForProduct(latestToday, 'pms')).toLocaleString()
            : 'Not Submitted',
          closingStockAGO: latestToday
            ? Math.round(getClosingForProduct(latestToday, 'ago')).toLocaleString()
            : 'Not Submitted',
          closingStockPMSRaw: latestToday ? getClosingForProduct(latestToday, 'pms') : null,
          closingStockAGORaw: latestToday ? getClosingForProduct(latestToday, 'ago') : null,
          totalSalesLitersPMS: latestToday
            ? Math.round(stationReportsToday.reduce((sum, report) => sum + Number(report?.totalSalesLitersPMS ?? report?.salesPMS ?? 0), 0)).toLocaleString()
            : 'Not Submitted',
          totalSalesLitersAGO: latestToday
            ? Math.round(stationReportsToday.reduce((sum, report) => sum + Number(report?.totalSalesLitersAGO ?? report?.salesAGO ?? 0), 0)).toLocaleString()
            : 'Not Submitted',
          managerEnteredSalesLitersPMS: latestToday?.managerEnteredSalesLitersPMS ?? null,
          managerEnteredSalesLitersAGO: latestToday?.managerEnteredSalesLitersAGO ?? null,
          dipSalesLitersPMS: latestToday
            ? latestToday.dipSalesLitersPMS ?? (
              Number(latestToday.openingStockPMS ?? latestToday.openingPMS ?? 0)
              + Number(latestToday.receivedPMS || 0)
              - getClosingForProduct(latestToday, 'pms')
              - Number(latestToday.rttPMS || 0)
            )
            : null,
          dipSalesLitersAGO: latestToday
            ? latestToday.dipSalesLitersAGO ?? (
              Number(latestToday.openingStockAGO ?? latestToday.openingAGO ?? 0)
              + Number(latestToday.receivedAGO || 0)
              - getClosingForProduct(latestToday, 'ago')
              - Number(latestToday.rttAGO || 0)
            )
            : null,
          pumpSalesLitersPMS: latestToday ? stationReportsToday.reduce((sum, report) => sum + Number(report?.pumpSalesLitersPMS || 0), 0) : null,
          pumpSalesLitersAGO: latestToday ? stationReportsToday.reduce((sum, report) => sum + Number(report?.pumpSalesLitersAGO || 0), 0) : null,
          rttPMS: latestToday ? latestToday.rttPMS ?? 'Not Submitted' : 'Not Submitted',
          rttAGO: latestToday ? latestToday.rttAGO ?? 'Not Submitted' : 'Not Submitted',
          managerRemark: latestToday ? latestToday.remark ?? latestToday.remarks ?? '-' : 'Not Submitted',
          reportDate: latestToday ? reportRangeLabel : 'Pending',
          expenseAmount: latestToday ? stationReportsToday.reduce((sum, report) => sum + Number(report?.expenseAmount || 0), 0) : 0,
          expenseDescription: latestToday ? latestToday.expenseDescription || '-' : 'Not Submitted',
          expenseItems: Array.isArray(latestToday?.expenseItems) ? latestToday.expenseItems : [],
          paymentBreakdown,
          totalPaymentDeposits,
          posValue,
          posTerminalBreakdown,
          eodAttachments: Array.isArray(latestToday?.eodAttachments) ? latestToday.eodAttachments : [],
          cashBf,
          cashSales,
          totalAmount,
          closingBalance,
          cashMovementVariance,
          pumpReadings,
          pumpMeterRows,
          pumpReadingsCount: pumpReadings.length,
          sortKey: station.name.toLowerCase(),
          pendingSubmissionDays: isSingleReportDate ? pendingInfo.pendingDays : pendingDaysInRange,
          pendingSubmissionNoHistory: pendingInfo.noPriorSubmissions,
          pendingSubmissionSummaryExport: pendingFmt.exportText,
          pendingSubmissionTableTitle: pendingFmt.tableTitle,
          pendingSubmissionTableSubtitle: pendingFmt.tableSubtitle || '',
        }
      })
  }, [isSingleReportDate, reportDatesByStation, reportRange.end, reportRange.start, reportRangeDates, reportRangeLabel, reports, stations, today, users])

  const filteredDailyOpeningQueueRows = useMemo(
    () =>
      dailyOpeningQueueRows
        .filter((row) => {
          if (!matchesStationMultiFilter(row.stationId, dailyQueueFilters)) {
            return false
          }
          if (dailyQueueFilters.reportStatus !== 'all' && row.reportStatus !== dailyQueueFilters.reportStatus) {
            return false
          }
          return true
        })
        .sort((a, b) => reportStatusRank(a.reportStatus) - reportStatusRank(b.reportStatus) || a.stationName.localeCompare(b.stationName)),
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
              <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-200 dark:bg-slate-700/50 dark:text-slate-200">
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
          className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs dark:border-slate-700 dark:bg-[#0d1220]"
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
        const rangeReportDates = new Set(reportRangeDates.filter((date) => stationReportDates.has(date)))
        const pendingDaysInRange = Math.max(0, reportRangeDates.length - rangeReportDates.size)
        const pendingInfo = getDailyReportPendingInfo(reportRange.end, stationReportDates)
        const pendingFmt = formatPendingSubmissionSummary(
          { ...pendingInfo, pendingDays: isSingleReportDate ? pendingInfo.pendingDays : pendingDaysInRange },
          reportRange.end,
        )
        const stationReportsToday = reports.filter(
          (report) => report.stationId === station.id && report.date >= reportRange.start && report.date <= reportRange.end,
        )
        const latestToday = stationReportsToday.at(-1)
        const manager = staffByStation.get(station.id)
        const expenseItems = stationReportsToday.flatMap((report) => Array.isArray(report.expenseItems) ? report.expenseItems : [])
        const totalExpense = expenseItems.length
          ? expenseItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
          : stationReportsToday.reduce((sum, report) => sum + Number(report?.expenseAmount || 0), 0)

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
          expenseStatus: latestToday
            ? pendingDaysInRange > 0 && !isSingleReportDate
              ? 'Partial'
              : totalExpense > 0 ? 'Submitted' : 'No Expense'
            : 'Pending',
          totalExpense,
          expenseLines: expenseItems.length || (latestToday?.expenseDescription ? 1 : 0),
          expenseItems,
          expenseDescription: latestToday?.expenseDescription || '',
          topCategory,
          reportDate: latestToday ? reportRangeLabel : 'Pending',
          pendingSubmissionDays: isSingleReportDate ? pendingInfo.pendingDays : pendingDaysInRange,
          pendingSubmissionNoHistory: pendingInfo.noPriorSubmissions,
          pendingSubmissionSummaryExport: pendingFmt.exportText,
          pendingSubmissionTableTitle: pendingFmt.tableTitle,
          pendingSubmissionTableSubtitle: pendingFmt.tableSubtitle || '',
        }
      })
  }, [isSingleReportDate, reportDatesByStation, reportRange.end, reportRange.start, reportRangeDates, reportRangeLabel, reports, stations, users])

  const filteredExpenseQueueRows = useMemo(
    () =>
      expenseQueueRows
        .filter((row) => {
          if (!matchesStationMultiFilter(row.stationId, expenseQueueFilters)) {
            return false
          }
          if (expenseQueueFilters.expenseStatus !== 'all' && row.expenseStatus !== expenseQueueFilters.expenseStatus) {
            return false
          }
          return true
        })
        .sort((a, b) => reportStatusRank(a.expenseStatus) - reportStatusRank(b.expenseStatus) || a.stationName.localeCompare(b.stationName)),
    [expenseQueueRows, expenseQueueFilters],
  )

  const dailyFiltersSummary = useMemo(() => {
    const stationsLabel =
      dailyQueueFilters.stationIds.length === 0 ? 'All stations' : `${dailyQueueFilters.stationIds.length} stations`
    const statusLabel =
      dailyQueueFilters.reportStatus === 'all' ? 'All statuses' : dailyQueueFilters.reportStatus
    return `${stationsLabel} - ${statusLabel}`
  }, [dailyQueueFilters])

  const expenseFiltersSummary = useMemo(() => {
    const stationsLabel =
      expenseQueueFilters.stationIds.length === 0 ? 'All stations' : `${expenseQueueFilters.stationIds.length} stations`
    const statusLabel =
      expenseQueueFilters.expenseStatus === 'all' ? 'All statuses' : expenseQueueFilters.expenseStatus
    return `${stationsLabel} - ${statusLabel}`
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
              <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-200 dark:bg-slate-700/50 dark:text-slate-200">
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
            ? 'Pending - use app when submitted'
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
          `B/F ${Math.round(Number(row.cashBf || 0)).toLocaleString()} - Sales ${Math.round(
            Number(row.cashSales || 0),
          ).toLocaleString()} - Total ${Math.round(Number(row.totalAmount || 0)).toLocaleString()} - Bank ${Math.round(
            Number(row.totalPaymentDeposits || 0),
          ).toLocaleString()} - POS ${Math.round(Number(row.posValue || 0)).toLocaleString()} - Closing ${Math.round(
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
    () => [...dailyOpeningColumnsCompactDefs, ...dailyOpeningColumnsFullExtraDefs],
    [dailyOpeningColumnsCompactDefs, dailyOpeningColumnsFullExtraDefs],
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
            <span className="rounded-full bg-white/8 px-3 py-1 text-xs font-semibold text-slate-200 dark:bg-slate-700/40 dark:text-slate-200">
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
              className="h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm dark:border-slate-700 dark:bg-[#0d1220]"
            >
              <option value="all">All submission statuses</option>
              <option value="Submitted">Submitted</option>
              <option value="No Sales Declared">No Sales Declared</option>
              <option value="Pending">Pending</option>
            </select>
          </div>
          <div className="flex flex-col gap-3 border-t border-white/5 pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setDailyQueueFilters({ stationIds: [], reportStatus: 'all' })}
              className="h-11 rounded-lg border border-white/10 px-4 text-sm font-medium text-slate-200 dark:border-slate-600 dark:text-slate-200"
            >
              Reset submission filters
            </button>
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Preview:{' '}
              <span className="font-medium text-slate-200 dark:text-slate-300">
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
              className="h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm dark:border-slate-700 dark:bg-[#0d1220]"
            >
              <option value="all">All submission statuses</option>
              <option value="Submitted">Submitted</option>
              <option value="No Sales Declared">No Sales Declared</option>
              <option value="Pending">Pending</option>
            </select>
          </div>
          <div className="flex flex-col gap-3 border-t border-white/5 pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setDailyQueueFilters({ stationIds: [], reportStatus: 'all' })}
              className="h-11 rounded-lg border border-white/10 px-4 text-sm font-medium text-slate-200 dark:border-slate-600 dark:text-slate-200"
            >
              Reset cash-flow filters
            </button>
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Preview:{' '}
              <span className="font-medium text-slate-200 dark:text-slate-300">
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
              className="h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm dark:border-slate-700 dark:bg-[#0d1220]"
            >
              <option value="all">All expense statuses</option>
              <option value="Submitted">Submitted</option>
              <option value="No Expense">No Expense</option>
              <option value="Pending">Pending</option>
            </select>
          </div>
          <div className="flex flex-col gap-3 border-t border-white/5 pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setExpenseQueueFilters({ stationIds: [], expenseStatus: 'all' })}
              className="h-11 rounded-lg border border-white/10 px-4 text-sm font-medium text-slate-200 dark:border-slate-600 dark:text-slate-200"
            >
              Reset expense filters
            </button>
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Preview:{' '}
              <span className="font-medium text-slate-200 dark:text-slate-300">
                {filteredExpenseQueueRows.length} of {expenseQueueRows.length} stations
              </span>{' '}
              match right now.
            </p>
          </div>
        </div>
      </FilterScreenSection>
    </div>
  )

  const selectedReportDetail = useMemo(() => {
    const row = selectedDailyOpeningReport
    if (!row) return null

    const directPumpDelta = { PMS: 0, AGO: 0 }
    for (const item of row.pumpReadings || []) {
      const product = String(item?.productType || 'PMS').toUpperCase() === 'AGO' ? 'AGO' : 'PMS'
      const opening = toFiniteNumber(item?.opening ?? item?.start, Number.NaN)
      const closing = toFiniteNumber(item?.closing ?? item?.end, Number.NaN)
      if (Number.isFinite(opening) && Number.isFinite(closing)) {
        directPumpDelta[product] += closing - opening
      }
    }

    const hasPmsMeter = row.pumpSalesLitersPMS != null || (row.pumpReadings || []).some((item) => String(item?.productType || 'PMS').toUpperCase() !== 'AGO')
    const hasAgoMeter = row.pumpSalesLitersAGO != null || (row.pumpReadings || []).some((item) => String(item?.productType || '').toUpperCase() === 'AGO')
    const systemPms = row.pumpSalesLitersPMS != null
      ? Math.max(0, toFiniteNumber(row.pumpSalesLitersPMS) - toFiniteNumber(row.rttPMS))
      : hasPmsMeter
        ? Math.max(0, directPumpDelta.PMS - toFiniteNumber(row.rttPMS))
        : toFiniteNumber(row.totalSalesLitersPMS)
    const systemAgo = row.pumpSalesLitersAGO != null
      ? Math.max(0, toFiniteNumber(row.pumpSalesLitersAGO) - toFiniteNumber(row.rttAGO))
      : hasAgoMeter
        ? Math.max(0, directPumpDelta.AGO - toFiniteNumber(row.rttAGO))
        : toFiniteNumber(row.totalSalesLitersAGO)
    const managerPms = toFiniteNumber(row.managerEnteredSalesLitersPMS ?? row.dipSalesLitersPMS ?? row.totalSalesLitersPMS)
    const managerAgo = toFiniteNumber(row.managerEnteredSalesLitersAGO ?? row.dipSalesLitersAGO ?? row.totalSalesLitersAGO)
    const bookPms = toFiniteNumber(row.openingStockPMS) + toFiniteNumber(row.receivedPMS) - toFiniteNumber(row.rttPMS) - toFiniteNumber(systemPms)
    const bookAgo = toFiniteNumber(row.openingStockAGO) + toFiniteNumber(row.receivedAGO) - toFiniteNumber(row.rttAGO) - toFiniteNumber(systemAgo)

    return {
      systemPms,
      systemAgo,
      managerPms,
      managerAgo,
      pmsDiff: toFiniteNumber(systemPms) - managerPms,
      agoDiff: toFiniteNumber(systemAgo) - managerAgo,
      bookPms,
      bookAgo,
      stockPmsDiff: toFiniteNumber(row.closingStockPMS) - bookPms,
      stockAgoDiff: toFiniteNumber(row.closingStockAGO) - bookAgo,
    }
  }, [selectedDailyOpeningReport])

  const selectedRawReport = useMemo(() => {
    if (!selectedDailyOpeningReport) return null
    return reports.find(
      (report) =>
        report.stationId === selectedDailyOpeningReport.stationId &&
        report.date === selectedDailyOpeningReport.reportDate,
    ) || null
  }, [reports, selectedDailyOpeningReport])

  const buildCorrectionDraft = (report) => {
    if (!report) return null
    const savedPumpReadings = Array.isArray(report.pumpReadings)
      ? report.pumpReadings
          .filter((item) => item && (item.label || item.opening != null || item.closing != null))
          .map((item) => ({
            label: item.label || '',
            productType: item.productType === 'AGO' ? 'AGO' : 'PMS',
            opening: item.opening ?? item.start ?? '',
            closing: item.closing ?? item.end ?? '',
          }))
      : []
    const visiblePumpRows = Array.isArray(selectedDailyOpeningReport?.pumpMeterRows)
      ? selectedDailyOpeningReport.pumpMeterRows
          .filter((item) => item && item.used)
          .map((item) => ({
            label: item.label || '',
            productType: item.productType === 'AGO' ? 'AGO' : 'PMS',
            opening: item.opening ?? '',
            closing: item.closing ?? '',
          }))
      : []
    return {
      openingStockPMS: report.openingStockPMS ?? report.openingPMS ?? 0,
      openingStockAGO: report.openingStockAGO ?? report.openingAGO ?? 0,
      closingStockPMS: getClosingForProduct(report, 'pms'),
      closingStockAGO: getClosingForProduct(report, 'ago'),
      receivedPMS: report.receivedPMS ?? 0,
      receivedAGO: report.receivedAGO ?? 0,
      rttPMS: report.rttPMS ?? 0,
      rttAGO: report.rttAGO ?? 0,
      cashBf: report.cashBf ?? 0,
      cashSales: report.cashSales ?? 0,
      posValue: report.posValue ?? 0,
      closingBalance: report.closingBalance ?? 0,
      remark: report.remark ?? report.remarks ?? '',
      pumpReadings: savedPumpReadings.length ? savedPumpReadings : visiblePumpRows,
      paymentBreakdown: Array.isArray(report.paymentBreakdown)
        ? report.paymentBreakdown.map((item) => ({ channel: item.channel || '', amount: item.amount || 0 }))
        : [],
      posTerminalBreakdown: Array.isArray(report.posTerminalBreakdown)
        ? report.posTerminalBreakdown.map((item) => ({
            terminalId: item.terminalId || '',
            bank: item.bank || '',
            label: item.label || item.channel || 'POS',
            channel: item.channel || 'POS',
            category: 'POS',
            amount: item.amount || 0,
          }))
        : [],
      expenseItems: Array.isArray(report.expenseItems)
        ? report.expenseItems.map((item) => ({ label: item.label || '', amount: item.amount || 0 }))
        : [],
    }
  }

  const finalisedReportRows = useMemo(
    () =>
      reports
        .filter((report) => report.finalizationStatus === 'finalized')
        .map((report) => {
          const station = stations.find((item) => item.id === report.stationId)
          const manager = users.find((user) => user.stationId === report.stationId)
          return {
            ...report,
            stationName: station?.name || report.stationId,
            managerName: manager?.name || 'Unassigned',
          }
        })
        .sort((a, b) => String(b.finalizedAt || b.date).localeCompare(String(a.finalizedAt || a.date))),
    [reports, stations, users],
  )

  return (
    <div className="space-y-4">
      {(activeDashboard === 'stock-flow' || activeDashboard === 'cash-flow' || activeDashboard === 'expense-monitor') && (
        <Card className="hidden md:block">
          <div className="flex flex-wrap items-center gap-3">
            <p className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Reports</p>
            {[
              ['stock-flow', 'Stock Flow'],
              ['cash-flow', 'Cash Flow'],
              ['expense-monitor', 'Expenses'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveDashboard(key)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  activeDashboard === key
                    ? 'bg-[#c4151d] text-white shadow-lg shadow-[#c4151d]/20'
                    : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                {label}
              </button>
            ))}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-slate-400">Date range</span>
              <input
                type="date"
                value={reportRangeFrom}
                max={today}
                onChange={(event) => {
                  const value = event.target.value || today
                  setReportRangeFrom(value)
                }}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white outline-none transition focus:border-[#a9cd39]/50"
              />
              <span className="text-xs text-slate-500">to</span>
              <input
                type="date"
                value={reportRangeTo}
                max={today}
                onChange={(event) => {
                  const value = event.target.value || today
                  setReportRangeTo(value)
                }}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white outline-none transition focus:border-[#a9cd39]/50"
              />
              {(reportRange.start !== today || reportRange.end !== today) && (
                <button
                  type="button"
                  onClick={() => {
                    setReportRangeFrom(today)
                    setReportRangeTo(today)
                  }}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/10"
                >
                  Today
                </button>
              )}
            </div>
          </div>
        </Card>
      )}

      {activeDashboard === 'dashboard' && (
        <>
        {/* Stat bar */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: 'Stations', value: portfolio.length, color: 'text-white', accent: 'border-white/10', icon: <StationIcon /> },
            { label: 'Safe', value: portfolio.filter(p => p.status === 'safe').length, color: 'text-[#a9cd39]', accent: 'border-[#a9cd39]/20', icon: <SafeIcon /> },
            { label: 'Warning', value: warningCount, color: 'text-amber-400', accent: 'border-amber-500/20', icon: <WarningIcon /> },
            { label: 'Critical', value: criticalCount, color: 'text-rose-400', accent: 'border-rose-500/20', icon: <CriticalIcon /> },
          ].map(({ label, value, color, accent, icon }) => (
            <button
              key={label}
              type="button"
              onClick={() => setStatusFilter(label === 'Stations' ? 'all' : label.toLowerCase())}
              className={`rounded-2xl border ${statusFilter === (label === 'Stations' ? 'all' : label.toLowerCase()) ? accent : 'border-white/8'} bg-white/5 p-4 text-left transition hover:scale-[1.01] hover:bg-white/10`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
                <span className={`flex items-center justify-center ${color}`}>{icon}</span>
              </div>
              <p className={`text-3xl font-bold ${color}`}>{value}</p>
            </button>
          ))}
        </div>

        {/* Portfolio */}
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-[#a9cd39]">Stock Portfolio</p>
              <h3 className="text-lg font-bold text-white">Station Inventory Status</h3>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-300">
              {statusFilter === 'all' ? 'All stations' : statusFilter}
            </span>
          </div>
          {filteredPortfolio.length ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredPortfolio.map((row) => {
                const isCritical = row.status === 'critical'
                const isWarning = row.status === 'warning'
                const pct = Math.min(100, Math.max(0, (row.stockRemaining / (row.avgDailySales * 30 || 1)) * 100))
                return (
                  <button
                    key={row.stationId}
                    type="button"
                    onClick={() => navigate(`/stations/${row.stationId}`)}
                    className={`rounded-2xl border p-4 text-left transition hover:scale-[1.01] ${
                      isCritical ? 'border-rose-500/25 bg-rose-500/5'
                      : isWarning ? 'border-amber-500/20 bg-amber-500/5'
                      : 'border-[#a9cd39]/15 bg-[#a9cd39]/5'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <p className="font-bold text-white truncate pr-2">{row.stationName}</p>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold uppercase ${
                        isCritical ? 'bg-rose-500/15 text-rose-400'
                        : isWarning ? 'bg-amber-500/15 text-amber-400'
                        : 'bg-[#a9cd39]/15 text-[#a9cd39]'
                      }`}>{row.status}</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Stock remaining</span>
                        <span className="font-semibold text-white">{Math.round(row.stockRemaining).toLocaleString()} L</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${isCritical ? 'bg-rose-500' : isWarning ? 'bg-amber-400' : 'bg-[#a9cd39]'}`} style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-xs text-slate-500">~{row.daysRemaining.toFixed(0)} days remaining</p>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <EmptyState title="No stations in this filter" message="Try another status." />
          )}
        </Card>

        {/* Bottom two panels */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card className="space-y-3">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-rose-400">
              <WarningIcon className="h-4 w-4" />
              Top Risk
            </p>
            <h3 className="text-base font-bold text-white -mt-1">Stations Needing Attention</h3>
            {!topRisk.length && <p className="text-sm text-slate-500">All stations are in good shape.</p>}
            {topRisk.map((station, i) => (
              <button
                key={station.stationId}
                type="button"
                onClick={() => navigate(`/stations/${station.stationId}`)}
                className="w-full flex items-center gap-3 rounded-xl border border-rose-500/15 bg-rose-500/5 p-3 text-left hover:bg-rose-500/10 transition"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-500/15 text-xs font-bold text-rose-400">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white truncate">{station.stationName}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{station.daysRemaining.toFixed(0)}d remaining - {Math.round(station.stockRemaining).toLocaleString()} L</p>
                </div>
                <StatusBadge status={station.status} />
              </button>
            ))}
          </Card>

          <Card className="space-y-3">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-400">
              <WarningIcon className="h-4 w-4" />
              Interventions
            </p>
            <h3 className="text-base font-bold text-white -mt-1">Active Flags</h3>
            {!interventions.length && <p className="text-sm text-slate-500">No interventions logged yet.</p>}
            {interventions.slice(0, 5).map((item) => (
              <div key={item.id} className="rounded-xl border border-amber-500/15 bg-amber-500/5 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <button type="button" onClick={() => navigate(`/stations/${item.stationId}`)} className="font-semibold text-white hover:text-[#a9cd39] transition truncate">{item.stationName}</button>
                  <StatusBadge status={item.status} />
                </div>
                <p className="text-xs text-slate-400">{item.message}</p>
                <p className="text-xs text-slate-500">Stock: <span className="text-white font-medium">{Math.round(metricsByStationId.get(item.stationId)?.stockRemaining || 0).toLocaleString()} L</span></p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button type="button" onClick={() => navigate(`/stations/${item.stationId}/history`)} className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/10 transition">History</button>
                  <button type="button" onClick={() => escalateStationIntervention({ stationId: item.stationId })} disabled={item.stage === 'escalated'} className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-400 hover:bg-amber-500/20 transition disabled:opacity-40">
                    {item.stage === 'escalated' ? 'Escalated' : 'Escalate'}
                  </button>
                  {item.stage === 'escalated' && (
                    <button type="button" onClick={() => { if(window.confirm('Revert escalation?')) revertEscalationIntervention({ stationId: item.stationId }) }} className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-400 hover:text-white transition">Revert</button>
                  )}
                  {item.stage !== 'escalated' && (
                    <button type="button" onClick={() => { if(window.confirm('Unflag this station?')) unflagStationIntervention({ stationId: item.stationId }) }} className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-2.5 py-1 text-xs text-rose-400 hover:bg-rose-500/10 transition">Unflag</button>
                  )}
                </div>
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
              <Card className="supervisor-light-stat">
                <p className="text-sm text-slate-500">Total Retail Stations</p>
                <p className="text-2xl font-bold">{dailyOpeningQueueRows.length}</p>
              </Card>
              <Card className="supervisor-light-stat">
                <p className="text-sm text-slate-500">Submitted Today</p>
                <p className="text-2xl font-bold text-emerald-600">{submittedCount}</p>
              </Card>
              <Card className="supervisor-light-stat">
                <p className="text-sm text-slate-500">Pending Today</p>
                <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
              </Card>
            </div>
          )}

          {filtersScreenOpen ? (
            <Card className="mx-auto max-w-5xl space-y-8 overflow-hidden px-4 py-6 sm:px-8 sm:py-8">
              <div className="flex flex-wrap items-start gap-4 border-b border-white/8 pb-6 dark:border-slate-700">
                <button
                  type="button"
                  onClick={closeFiltersScreen}
                  className="rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-200 dark:border-slate-600 dark:text-slate-200"
                >
                  Back to queue
                </button>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-semibold tracking-tight text-white dark:text-white">
                    Daily opening - Filters
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                    Order: table columns, stations, then submission status - everything drives the queue table and Excel
                    export.
                  </p>
                </div>
              </div>
              {dailyQueueFiltersPanel}
              <div className="-mx-4 flex justify-end border-t border-white/8 bg-white/5/90 px-4 py-5 pb-24 sm:-mx-8 sm:px-8 sm:pb-6 dark:border-slate-700 dark:bg-[#0d1220]/60">
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
            <Card className="supervisor-light-section space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <h3 className="text-lg font-semibold">Daily Opening Stock Queue</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={openFiltersScreen}
                    className="rounded-lg bg-[#0d1220] px-4 py-2 text-sm font-medium text-white shadow-sm dark:bg-white/5 dark:text-white"
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
              <div className="flex flex-col gap-3 rounded-xl border border-white/8 bg-white/5/90 px-4 py-3 dark:border-slate-700 dark:bg-[#0d1220]/50">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  <span className="font-medium text-slate-100 dark:text-slate-100">Active filters:</span>{' '}
                  {dailyFiltersSummary}
                  {' - '}
                  Showing {filteredDailyOpeningQueueRows.length} of {dailyOpeningQueueRows.length} stations
                  {' - '}
                  Range: {reportRangeLabel}
                </p>
              </div>
              {dailyOpeningQueueRows.length ? (
                filteredDailyOpeningQueueRows.length ? (
                  <div className="supervisor-light-queue-grid grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {filteredDailyOpeningQueueRows.map((row) => {
                      const submitted = row.reportStatus === 'Submitted'
                      const partial = row.reportStatus === 'Partial'
                      const noSales = row.reportStatus === 'No Sales Declared'
                      const pending = !submitted && !partial && !noSales
                      const late = pending && !row.pendingSubmissionNoHistory && Number(row.pendingSubmissionDays || 0) >= 1
                      return (
                        <button
                          key={row.stationId}
                          type="button"
                          onClick={() => {
                            if (submitted || noSales) {
                              setSelectedDailyOpeningReport(row)
                            } else {
                              navigate(`/stations/${row.stationId}/history`)
                            }
                          }}
                          className={`supervisor-light-queue-card ${submitted || partial ? 'is-submitted' : noSales ? 'is-no-sales' : late ? 'is-late' : 'is-pending'} rounded-2xl border p-4 text-left transition hover:scale-[1.01] ${
                            submitted || partial ? 'border-[#a9cd39]/25 bg-[#a9cd39]/5'
                            : noSales ? 'border-white/10 bg-white/5'
                            : late ? 'border-rose-500/25 bg-rose-500/5'
                            : 'border-amber-500/25 bg-amber-500/5'
                          }`}
                        >
                          {/* Station name + status */}
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div className="min-w-0">
                              <p className="font-bold text-white truncate">{row.stationName}</p>
                              <p className="text-xs text-slate-500 mt-0.5 truncate">{row.managerName}</p>
                            </div>
                            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${
                              submitted || partial ? 'bg-[#a9cd39]/15 text-[#a9cd39]'
                              : noSales ? 'bg-white/10 text-slate-400'
                              : late ? 'bg-rose-500/15 text-rose-400'
                              : 'bg-amber-500/15 text-amber-400'
                            }`}>
                              {submitted ? 'Submitted'
                               : partial ? `Partial (${row.pendingSubmissionDays} missing)`
                               : noSales ? 'No Sales'
                               : late ? `Late ${row.pendingSubmissionDays}d`
                               : 'Pending'}
                            </span>
                          </div>

                          {/* Key figures */}
                          {(submitted || partial) && (
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              {[
                                { label: 'PMS Closing', value: row.closingStockPMS + ' L' },
                                { label: 'AGO Closing', value: row.closingStockAGO + ' L' },
                                { label: 'Sales', value: 'NGN ' + Math.round(Number(row.totalSalesAmount || 0)).toLocaleString() },
                                { label: 'Variance', value: 'NGN ' + Math.round(Number(row.cashMovementVariance || 0)).toLocaleString() },
                              ].map(({ label, value }) => (
                                <div key={label} className="supervisor-light-metric rounded-lg bg-black/20 px-2.5 py-1.5">
                                  <p className="text-slate-500 text-xs">{label}</p>
                                  <p className={`font-semibold mt-0.5 ${label === 'Variance' && Math.abs(Number(row.cashMovementVariance || 0)) > 0 ? 'text-amber-400' : 'text-white'}`}>{value}</p>
                                </div>
                              ))}
                            </div>
                          )}
                          {noSales && row.managerRemark && row.managerRemark !== 'Not Submitted' && (
                            <p className="text-xs text-slate-400 mt-1 truncate">Reason: {row.managerRemark}</p>
                          )}
                          {pending && (
                            <p className="text-xs text-slate-500 mt-1">
                              {row.pendingSubmissionNoHistory ? 'No report today yet' : `${row.pendingSubmissionDays} day(s) without submission`}
                              <span className="ml-2 text-[#a9cd39]">View History</span>
                            </p>
                          )}

                          {/* Flags */}
                          {(row.hasDiscrepancy || (row.eodAttachments && row.eodAttachments.length > 0)) && (
                            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-white/5 pt-2">
                              {row.hasDiscrepancy && (
                                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">Discrepancy</span>
                              )}
                              {row.eodAttachments?.length > 0 && (
                                <span className="rounded-full bg-[#a9cd39]/10 px-2 py-0.5 text-xs text-[#a9cd39]">{row.eodAttachments.length} EOD</span>
                              )}
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
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


          {selectedDailyOpeningReport && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-[#0d1220] border border-white/10 shadow-2xl">
                {/* Modal header */}
                <div className="sticky top-0 bg-[#0d1220] border-b border-white/5 px-5 py-4 flex items-start justify-between gap-4 z-10">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-[#a9cd39]">Daily Report</p>
                    <h4 className="text-lg font-bold text-white mt-0.5">{selectedDailyOpeningReport.stationName}</h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {selectedDailyOpeningReport.managerName} - {selectedDailyOpeningReport.reportDate}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedDailyOpeningReport(null)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 text-slate-400 hover:text-white transition shrink-0"
                  >x</button>
                </div>

                <div className="space-y-4 p-5 text-sm">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {[
                      ['Status', selectedDailyOpeningReport.reportStatus, 'text-[#a9cd39]'],
                      ['Received', selectedDailyOpeningReport.receivedProduct, 'text-white'],
                      ['Pump lines', Number(selectedDailyOpeningReport.pumpReadingsCount || 0), 'text-white'],
                      ['Cash variance', formatMoney(selectedDailyOpeningReport.cashMovementVariance), differenceTone(selectedDailyOpeningReport.cashMovementVariance)],
                    ].map(([label, value, color]) => (
                      <div key={label} className="rounded-2xl border border-white/8 bg-white/[0.04] p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                        <p className={`mt-1 text-base font-black ${color}`}>{value}</p>
                      </div>
                    ))}
                  </div>

                  {selectedReportDetail && (
                    <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-black uppercase tracking-widest text-amber-300">Quantity sold</p>
                          <p className="mt-1 text-sm text-slate-300">System pump meters vs manager-entered sales reference.</p>
                        </div>
                        <span className={`rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-black ${
                          Math.abs(selectedReportDetail.pmsDiff) <= 1 && Math.abs(selectedReportDetail.agoDiff) <= 1
                            ? 'text-[#a9cd39]'
                            : 'text-amber-300'
                        }`}>
                          {Math.abs(selectedReportDetail.pmsDiff) <= 1 && Math.abs(selectedReportDetail.agoDiff) <= 1 ? 'Matched' : 'Check difference'}
                        </span>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {[
                          ['PMS', selectedReportDetail.systemPms, selectedReportDetail.managerPms, selectedReportDetail.pmsDiff, 'text-[#a9cd39]'],
                          ['AGO', selectedReportDetail.systemAgo, selectedReportDetail.managerAgo, selectedReportDetail.agoDiff, 'text-blue-300'],
                        ].map(([product, system, manager, diff, accent]) => (
                          <div key={product} className="rounded-2xl border border-white/8 bg-black/20 p-3">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{product}</p>
                              <p className={`text-xs font-black ${differenceTone(diff)}`}>Diff {formatLiters(diff, 2)}</p>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2">
                              <div className="rounded-xl bg-white/[0.04] p-3">
                                <p className="text-[11px] text-slate-500">System</p>
                                <p className={`text-lg font-black ${accent}`}>{system == null ? '-' : formatLiters(system, 2)}</p>
                              </div>
                              <div className="rounded-xl bg-white/[0.04] p-3">
                                <p className="text-[11px] text-slate-500">Manager ref</p>
                                <p className="text-lg font-black text-white">{formatLiters(manager, 2)}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedReportDetail && (
                    <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-4">
                      <p className="text-xs font-black uppercase tracking-widest text-slate-400">Stock check</p>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {[
                          ['PMS', selectedDailyOpeningReport.closingStockPMS, selectedReportDetail.bookPms, selectedReportDetail.stockPmsDiff],
                          ['AGO', selectedDailyOpeningReport.closingStockAGO, selectedReportDetail.bookAgo, selectedReportDetail.stockAgoDiff],
                        ].map(([product, tankDip, book, diff]) => (
                          <div key={product} className="rounded-2xl border border-white/8 bg-black/20 p-3">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{product}</p>
                            <div className="mt-2 space-y-1.5">
                              <div className="flex justify-between gap-3"><span className="text-slate-500">Tank dip</span><span className="font-bold text-white">{formatLiters(tankDip)}</span></div>
                              <div className="flex justify-between gap-3"><span className="text-slate-500">Book remaining</span><span className="font-bold text-white">{formatLiters(book, 2)}</span></div>
                              <div className="flex justify-between gap-3"><span className="text-slate-500">Difference</span><span className={`font-black ${differenceTone(diff)}`}>{formatLiters(diff, 2)}</span></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-4">
                      <p className="text-xs font-black uppercase tracking-widest text-slate-400">Stock flow</p>
                      <div className="mt-3 space-y-2 text-sm">
                        <div className="flex justify-between gap-3"><span className="text-slate-500">Opening PMS</span><span className="font-bold text-white">{formatLiters(selectedDailyOpeningReport.openingStockPMS)}</span></div>
                        <div className="flex justify-between gap-3"><span className="text-slate-500">Opening AGO</span><span className="font-bold text-white">{formatLiters(selectedDailyOpeningReport.openingStockAGO)}</span></div>
                        <div className="flex justify-between gap-3"><span className="text-slate-500">Received PMS</span><span className="font-bold text-white">{formatLiters(selectedDailyOpeningReport.receivedPMS)}</span></div>
                        <div className="flex justify-between gap-3"><span className="text-slate-500">Received AGO</span><span className="font-bold text-white">{formatLiters(selectedDailyOpeningReport.receivedAGO)}</span></div>
                        <div className="flex justify-between gap-3"><span className="text-slate-500">RTT PMS</span><span className="font-bold text-white">{formatLiters(selectedDailyOpeningReport.rttPMS)}</span></div>
                        <div className="flex justify-between gap-3"><span className="text-slate-500">RTT AGO</span><span className="font-bold text-white">{formatLiters(selectedDailyOpeningReport.rttAGO)}</span></div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-4">
                      <p className="text-xs font-black uppercase tracking-widest text-slate-400">Cash flow</p>
                      <div className="mt-3 space-y-2 text-sm">
                        <div className="flex justify-between gap-3"><span className="text-slate-500">Cash B/F</span><span className="font-bold text-white">{formatMoney(selectedDailyOpeningReport.cashBf)}</span></div>
                        <div className="flex justify-between gap-3"><span className="text-slate-500">Cash sales</span><span className="font-bold text-white">{formatMoney(selectedDailyOpeningReport.cashSales)}</span></div>
                        <div className="flex justify-between gap-3"><span className="text-slate-500">Bank</span><span className="font-bold text-white">{formatMoney(selectedDailyOpeningReport.totalPaymentDeposits)}</span></div>
                        <div className="flex justify-between gap-3"><span className="text-slate-500">POS</span><span className="font-bold text-white">{formatMoney(selectedDailyOpeningReport.posValue)}</span></div>
                        <div className="flex justify-between gap-3"><span className="text-slate-500">Closing</span><span className="font-bold text-white">{formatMoney(selectedDailyOpeningReport.closingBalance)}</span></div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-4">
                      <p className="text-xs font-black uppercase tracking-widest text-slate-400">Pricing & expense</p>
                      <div className="mt-3 space-y-2 text-sm">
                        <div className="flex justify-between gap-3"><span className="text-slate-500">PMS price</span><span className="font-bold text-white">{formatMoney(selectedDailyOpeningReport.pmsPrice)}/L</span></div>
                        <div className="flex justify-between gap-3"><span className="text-slate-500">AGO price</span><span className="font-bold text-white">{formatMoney(selectedDailyOpeningReport.agoPrice)}/L</span></div>
                        <div className="flex justify-between gap-3"><span className="text-slate-500">Expense</span><span className="font-bold text-white">{formatMoney(selectedDailyOpeningReport.expenseAmount)}</span></div>
                      </div>
                      {selectedDailyOpeningReport.managerRemark && selectedDailyOpeningReport.managerRemark !== '-' && (
                        <p className="mt-3 rounded-xl bg-black/20 p-3 text-sm text-slate-300">{selectedDailyOpeningReport.managerRemark}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="hidden">
                  <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                    <p className="text-xs uppercase text-slate-500">Submission Status</p>
                    <p className="font-medium text-white">{selectedDailyOpeningReport.reportStatus}</p>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                    <p className="text-xs uppercase text-slate-500">Received Product (PMS/AGO)</p>
                    <p className="font-medium text-white">{selectedDailyOpeningReport.receivedProduct}</p>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                    <p className="text-xs uppercase text-slate-500">Opening Stock PMS</p>
                    <p className="font-medium text-white">{selectedDailyOpeningReport.openingStockPMS}</p>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                    <p className="text-xs uppercase text-slate-500">Opening Stock AGO</p>
                    <p className="font-medium text-white">{selectedDailyOpeningReport.openingStockAGO}</p>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                    <p className="text-xs uppercase text-slate-500">Closing Stock PMS</p>
                    <p className="font-medium text-white">{selectedDailyOpeningReport.closingStockPMS}</p>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                    <p className="text-xs uppercase text-slate-500">Closing Stock AGO</p>
                    <p className="font-medium text-white">{selectedDailyOpeningReport.closingStockAGO}</p>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                    <p className="text-xs uppercase text-slate-500">PMS Price</p>
                    <p className="font-medium text-white">
                      {selectedDailyOpeningReport.multiPricing &&
                      (selectedDailyOpeningReport.priceBandsPMS || []).length > 1
                        ? `Avg NGN ${Number(selectedDailyOpeningReport.pmsPrice || 0).toLocaleString()}/L`
                        : selectedDailyOpeningReport.pmsPrice}
                    </p>
                    {(selectedDailyOpeningReport.priceBandsPMS || []).length > 0 && (
                      <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                        {selectedDailyOpeningReport.priceBandsPMS.map((band, index) => (
                          <li key={`pms-band-${index}`}>
                            NGN {Number(band.price || 0).toLocaleString()}/L x {Number(band.liters || 0).toLocaleString()} L
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                    <p className="text-xs uppercase text-slate-500">AGO Price</p>
                    <p className="font-medium text-white">
                      {selectedDailyOpeningReport.multiPricing &&
                      (selectedDailyOpeningReport.priceBandsAGO || []).length > 1
                        ? `Avg NGN ${Number(selectedDailyOpeningReport.agoPrice || 0).toLocaleString()}/L`
                        : selectedDailyOpeningReport.agoPrice}
                    </p>
                    {(selectedDailyOpeningReport.priceBandsAGO || []).length > 0 && (
                      <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                        {selectedDailyOpeningReport.priceBandsAGO.map((band, index) => (
                          <li key={`ago-band-${index}`}>
                            NGN {Number(band.price || 0).toLocaleString()}/L x {Number(band.liters || 0).toLocaleString()} L
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                    <p className="text-xs uppercase text-slate-500">Input Quantity Received (L)</p>
                    <p className="font-medium text-white">{selectedDailyOpeningReport.quantityReceived}</p>
                  </div>
                  {/* PMS Sales - side by side */}
                  <div className="rounded-xl border border-white/5 bg-white/5 p-3 md:col-span-2">
                    <p className="text-xs uppercase text-slate-500 mb-2">Sales PMS (L)</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-black/20 px-3 py-2">
                        <p className="text-xs text-slate-500">Pump meters</p>
                        <p className={`font-bold text-base ${selectedDailyOpeningReport.pumpSalesLitersPMS != null ? 'text-[#a9cd39]' : 'text-slate-500'}`}>
                          {selectedDailyOpeningReport.pumpSalesLitersPMS != null ? Math.round(selectedDailyOpeningReport.pumpSalesLitersPMS).toLocaleString() + ' L' : '-'}
                        </p>
                      </div>
                      <div className="rounded-lg bg-black/20 px-3 py-2">
                        <p className="text-xs text-slate-500">Tank dip (ref)</p>
                        <p className="font-bold text-base text-slate-300">{selectedDailyOpeningReport.totalSalesLitersPMS}</p>
                      </div>
                    </div>
                    {selectedDailyOpeningReport.pumpSalesLitersPMS != null && (() => {
                      const gap = Math.abs(selectedDailyOpeningReport.pumpSalesLitersPMS - Number(String(selectedDailyOpeningReport.totalSalesLitersPMS).replace(/,/g, '') || 0))
                      return gap > 10 ? (
                        <p className="mt-2 flex items-center gap-1 text-xs text-amber-400"><WarningIcon className="h-3.5 w-3.5" /> Gap of ~{Math.round(gap).toLocaleString()} L between pump and dip figures</p>
                      ) : null
                    })()}
                  </div>
                  {/* AGO Sales - side by side */}
                  <div className="rounded-xl border border-white/5 bg-white/5 p-3 md:col-span-2">
                    <p className="text-xs uppercase text-slate-500 mb-2">Sales AGO (L)</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-black/20 px-3 py-2">
                        <p className="text-xs text-slate-500">Pump meters</p>
                        <p className={`font-bold text-base ${selectedDailyOpeningReport.pumpSalesLitersAGO != null ? 'text-blue-400' : 'text-slate-500'}`}>
                          {selectedDailyOpeningReport.pumpSalesLitersAGO != null ? Math.round(selectedDailyOpeningReport.pumpSalesLitersAGO).toLocaleString() + ' L' : '-'}
                        </p>
                      </div>
                      <div className="rounded-lg bg-black/20 px-3 py-2">
                        <p className="text-xs text-slate-500">Tank dip (ref)</p>
                        <p className="font-bold text-base text-slate-300">{selectedDailyOpeningReport.totalSalesLitersAGO}</p>
                      </div>
                    </div>
                    {selectedDailyOpeningReport.pumpSalesLitersAGO != null && (() => {
                      const gap = Math.abs(selectedDailyOpeningReport.pumpSalesLitersAGO - Number(String(selectedDailyOpeningReport.totalSalesLitersAGO).replace(/,/g, '') || 0))
                      return gap > 10 ? (
                        <p className="mt-2 flex items-center gap-1 text-xs text-amber-400"><WarningIcon className="h-3.5 w-3.5" /> Gap of ~{Math.round(gap).toLocaleString()} L between pump and dip figures</p>
                      ) : null
                    })()}
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                    <p className="text-xs uppercase text-slate-500">RTT PMS</p>
                    <p className="font-medium text-white">{selectedDailyOpeningReport.rttPMS}</p>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                    <p className="text-xs uppercase text-slate-500">RTT AGO</p>
                    <p className="font-medium text-white">{selectedDailyOpeningReport.rttAGO}</p>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/5 p-3 md:col-span-2">
                    <p className="text-xs uppercase text-slate-500">Remark</p>
                    <p className="font-medium text-white">{selectedDailyOpeningReport.managerRemark}</p>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                    <p className="text-xs uppercase text-slate-500">Expense Total (NGN)</p>
                    <p className="font-medium text-white">
                      {Math.round(selectedDailyOpeningReport.expenseAmount).toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/5 p-3 md:col-span-2">
                    <p className="text-xs uppercase text-slate-500">Expense Description</p>
                    <p className="font-medium text-white">{selectedDailyOpeningReport.expenseDescription}</p>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                    <p className="text-xs uppercase text-slate-500">Bank/Channel Deposits Total (NGN)</p>
                    <p className="font-medium text-white">
                      {Math.round(Number(selectedDailyOpeningReport.totalPaymentDeposits || 0)).toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                    <p className="text-xs uppercase text-slate-500">Cash B/F (NGN)</p>
                    <p className="font-medium text-white">{Math.round(Number(selectedDailyOpeningReport.cashBf || 0)).toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                    <p className="text-xs uppercase text-slate-500">Cash Sales (NGN)</p>
                    <p className="font-medium text-white">{Math.round(Number(selectedDailyOpeningReport.cashSales || 0)).toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                    <p className="text-xs uppercase text-slate-500">Total Amount (NGN)</p>
                    <p className="font-medium text-white">{Math.round(Number(selectedDailyOpeningReport.totalAmount || 0)).toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                    <p className="text-xs uppercase text-slate-500">POS (NGN)</p>
                    <p className="font-medium text-white">{Math.round(Number(selectedDailyOpeningReport.posValue || 0)).toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                    <p className="text-xs uppercase text-slate-500">Closing Balance (NGN)</p>
                    <p className="font-medium text-white">{Math.round(Number(selectedDailyOpeningReport.closingBalance || 0)).toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                    <p className="text-xs uppercase text-slate-500">Variance (NGN)</p>
                    <p className="font-medium text-white">
                      {Math.round(Number(selectedDailyOpeningReport.cashMovementVariance || 0)).toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                    <p className="text-xs uppercase text-slate-500">Pump Reading Lines</p>
                    <p className="font-medium text-white">{Number(selectedDailyOpeningReport.pumpReadingsCount || 0)}</p>
                  </div>
                </div>

                {selectedDailyOpeningReport.expenseItems.length > 0 && (
                  <div className="mt-3 rounded-xl border border-white/5 bg-white/5 p-4">
                    <p className="mb-2 text-xs uppercase text-slate-500">Expense Lines</p>
                    <div className="space-y-2">
                      {selectedDailyOpeningReport.expenseItems.map((item, index) => (
                        <p key={`${item.label}-${index}`} className="text-sm text-slate-200 dark:text-slate-200">
                          {item.label}: NGN {Math.round(Number(item.amount) || 0).toLocaleString()}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
                {selectedDailyOpeningReport.paymentBreakdown?.length > 0 && (
                  <div className="mt-3 rounded-xl border border-white/5 bg-white/5 p-4">
                    <p className="mb-2 text-xs uppercase text-slate-500">Bank/Channel Breakdown</p>
                    <div className="space-y-2">
                      {selectedDailyOpeningReport.paymentBreakdown.map((item, index) => (
                        <p key={`${item.channel}-${index}`} className="text-sm text-slate-200 dark:text-slate-200">
                          {item.channel}: NGN {Math.round(Number(item.amount) || 0).toLocaleString()}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
                {selectedDailyOpeningReport.posTerminalBreakdown?.length > 0 && (
                  <div className="mt-3 rounded-xl border border-[#a9cd39]/20 bg-[#a9cd39]/5 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-xs font-bold uppercase tracking-widest text-[#a9cd39]">POS Terminal Breakdown</p>
                      <span className="rounded-full bg-[#a9cd39]/15 px-2.5 py-0.5 text-xs font-bold text-[#a9cd39]">
                        NGN {Math.round(Number(selectedDailyOpeningReport.posValue || 0)).toLocaleString()}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {selectedDailyOpeningReport.posTerminalBreakdown.map((item, index) => (
                        <p key={`${item.terminalId || item.label}-${index}`} className="text-sm text-slate-200 dark:text-slate-200">
                          {item.label || `${item.bank || 'POS'} ${item.terminalId || ''}`}: NGN {Math.round(Number(item.amount) || 0).toLocaleString()}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
                {selectedDailyOpeningReport.eodAttachments?.length > 0 && (
                  <div className="mt-3 rounded-xl border border-[#a9cd39]/20 bg-[#a9cd39]/5 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-xs font-bold uppercase tracking-widest text-[#a9cd39]">EOD Attachments</p>
                      <span className="rounded-full bg-[#a9cd39]/15 px-2.5 py-0.5 text-xs font-bold text-[#a9cd39]">
                        {selectedDailyOpeningReport.eodAttachments.length} file(s)
                      </span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {selectedDailyOpeningReport.eodAttachments.map((item, index) => (
                        <a
                          key={`${item.url || item.fileName || item.label}-${index}`}
                          href={item.url || '#'}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => {
                            if (!item.url) event.preventDefault()
                          }}
                          className="rounded-xl border border-white/8 bg-black/20 p-3 transition hover:bg-black/30"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-white">{item.label || item.category || 'EOD file'}</p>
                              <p className="mt-1 truncate text-xs text-slate-400">{item.fileName || 'Uploaded attachment'}</p>
                            </div>
                            <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-300">
                              {item.category || 'EOD'}
                            </span>
                          </div>
                          <p className={`mt-2 text-xs font-semibold ${item.url ? 'text-[#a9cd39]' : 'text-slate-500'}`}>
                            {item.url ? 'Open file' : 'No file link'}
                          </p>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {selectedDailyOpeningReport.pumpMeterRows?.length > 0 && (
                  <div className="mt-3 rounded-xl border border-white/5 bg-white/5 p-4">
                    <p className="mb-2 text-xs uppercase text-slate-500">Used Pump Readings</p>
                    <div className="space-y-2">
                      {selectedDailyOpeningReport.pumpMeterRows.map((item, index) => (
                        <p key={`${item.label}-${index}`} className="break-words text-sm leading-6 text-slate-200">
                          {item.label}{item.productType ? ` ${item.productType}` : ''}:{' '}
                          {item.noBaseline
                            ? 'No baseline'
                            : `${item.opening ?? '-'} to ${item.closing ?? '-'} ${item.used ? '(used)' : '(unused)'}`}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Supervisor Review Button */}
                {(!selectedDailyOpeningReport.pumpMeterRows || selectedDailyOpeningReport.pumpMeterRows.length === 0) &&
                  (selectedDailyOpeningReport.pumpSalesLitersPMS != null || selectedDailyOpeningReport.pumpSalesLitersAGO != null) && (
                    <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4">
                      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-amber-300">Pump detail unavailable</p>
                      <p className="text-sm text-slate-300">
                        This report has system pump totals, but no saved pump-line breakdown. Use Correct Report to add the exact pump label, product, opening and closing readings.
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-xl bg-black/20 p-3">
                          <p className="text-xs text-slate-500">PMS pump total</p>
                          <p className="font-bold text-[#a9cd39]">{formatLiters(selectedDailyOpeningReport.pumpSalesLitersPMS || 0, 2)}</p>
                        </div>
                        <div className="rounded-xl bg-black/20 p-3">
                          <p className="text-xs text-slate-500">AGO pump total</p>
                          <p className="font-bold text-blue-300">{formatLiters(selectedDailyOpeningReport.pumpSalesLitersAGO || 0, 2)}</p>
                        </div>
                      </div>
                    </div>
                  )}
                {(() => {
                  const report = selectedRawReport
                  const alreadyReviewed = report?.supervisorReview?.status === 'Reviewed'
                  const alreadyFinalised = report?.finalizationStatus === 'finalized'
                  return (
                    <div className="mx-3 mt-5 border-t border-white/5 px-1 pb-4 pt-5 sm:mx-4 sm:px-2">
                      {report && (
                        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <button
                            type="button"
                            disabled={alreadyFinalised}
                            onClick={() => {
                              setCorrectionDraft(buildCorrectionDraft(report))
                              setCorrectionReason('')
                              setCorrectionOpen(true)
                            }}
                            className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm font-bold text-amber-300 transition hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Correct Report
                          </button>
                          <button
                            type="button"
                            disabled={alreadyFinalised}
                            onClick={() => {
                              if (!window.confirm('Finalise this report as accounting-ready?')) return
                              finalizeReportBySupervisor({
                                reportId: report.id,
                                remark: finalizeRemark || reviewRemark || `Finalised by ${currentUser?.name || 'Supervisor'}`,
                              })
                              setFinalizeRemark('')
                              setReviewRemark('')
                              setSelectedDailyOpeningReport(null)
                            }}
                            className="rounded-xl border border-[#a9cd39]/25 bg-[#a9cd39]/10 px-4 py-3 text-sm font-bold text-[#a9cd39] transition hover:bg-[#a9cd39]/15 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {alreadyFinalised ? 'Finalised' : 'Finalise Report'}
                          </button>
                        </div>
                      )}
                      {alreadyFinalised && (
                        <div className="mb-4 rounded-xl border border-[#a9cd39]/25 bg-[#a9cd39]/5 px-4 py-3 text-sm text-[#a9cd39]">
                          Finalised by {report.finalizedBy || 'Supervisor'} on {report.finalizedAt?.split('T')[0] || 'saved date'}.
                        </div>
                      )}
                      {alreadyReviewed ? (
                        <div className="flex items-center gap-3 rounded-xl border border-[#a9cd39]/25 bg-[#a9cd39]/5 px-4 py-3">
                          <SafeIcon className="h-5 w-5 text-[#a9cd39]" />
                          <div>
                            <p className="text-sm font-semibold text-[#a9cd39]">Reviewed</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              by {report.supervisorReview.reviewedBy || currentUser?.name} - {report.supervisorReview.remark || ''}
                            </p>
                          </div>
                          <button type="button"
                            onClick={() => setSelectedDailyOpeningReport(null)}
                            className="ml-auto text-xs text-slate-500 hover:text-white underline transition">
                            Close
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <p className="text-sm font-semibold text-white">Mark this report as reviewed?</p>
                          <textarea
                            value={reviewRemark}
                            onChange={(e) => setReviewRemark(e.target.value)}
                            placeholder="Add a supervisor remark (optional)..."
                            rows={2}
                            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-[#a9cd39]/40 focus:outline-none resize-none"
                          />
                          <div className="flex gap-3">
                            <button
                              type="button"
                              onClick={() => setSelectedDailyOpeningReport(null)}
                              className="flex-1 rounded-xl border border-white/10 py-3 text-sm font-semibold text-slate-400 hover:bg-white/5 transition"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (report?.id) {
                                  updateReportSupervisorReview({
                                    reportId: report.id,
                                    status: 'Reviewed',
                                    remark: reviewRemark.trim() || `Reviewed by ${currentUser?.name || 'Supervisor'}`,
                                  })
                                }
                                setReviewRemark('')
                                setSelectedDailyOpeningReport(null)
                              }}
                              className="flex-1 rounded-xl bg-[#a9cd39] py-3 text-sm font-bold text-black hover:bg-[#bcd94a] transition"
                            >
                              Confirm Review
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>
          )}
          {correctionOpen && correctionDraft && selectedRawReport && (
            <div className="fixed inset-0 z-[80] overflow-y-auto bg-black/80 p-4 backdrop-blur-sm">
              <div className="mx-auto max-w-5xl rounded-3xl border border-white/10 bg-[#0d1220] p-5 shadow-2xl">
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-amber-300">Supervisor correction</p>
                    <h3 className="text-xl font-bold text-white">{selectedDailyOpeningReport.stationName}</h3>
                    <p className="text-sm text-slate-400">{selectedDailyOpeningReport.reportDate}</p>
                  </div>
                  <button type="button" onClick={() => setCorrectionOpen(false)} className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/10">Close</button>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <section className="rounded-2xl border border-white/8 bg-white/[0.04] p-4">
                    <p className="mb-3 text-xs font-black uppercase tracking-widest text-[#a9cd39]">Stock</p>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        ['openingStockPMS', 'Opening PMS'],
                        ['openingStockAGO', 'Opening AGO'],
                        ['closingStockPMS', 'Closing PMS'],
                        ['closingStockAGO', 'Closing AGO'],
                        ['receivedPMS', 'Received PMS'],
                        ['receivedAGO', 'Received AGO'],
                        ['rttPMS', 'RTT PMS'],
                        ['rttAGO', 'RTT AGO'],
                      ].map(([key, label]) => (
                        <label key={key} className="space-y-1">
                          <span className="text-xs text-slate-400">{label}</span>
                          <input
                            type="number"
                            value={correctionDraft[key]}
                            onChange={(event) => setCorrectionDraft((prev) => ({ ...prev, [key]: event.target.value }))}
                            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-[#a9cd39]/40"
                          />
                        </label>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-white/8 bg-white/[0.04] p-4">
                    <p className="mb-3 text-xs font-black uppercase tracking-widest text-[#a9cd39]">Cash</p>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        ['cashBf', 'Cash B/F'],
                        ['cashSales', 'Cash sales'],
                        ['posValue', 'POS'],
                        ['closingBalance', 'Closing cash'],
                      ].map(([key, label]) => (
                        <label key={key} className="space-y-1">
                          <span className="text-xs text-slate-400">{label}</span>
                          <input
                            type="number"
                            value={correctionDraft[key]}
                            onChange={(event) => setCorrectionDraft((prev) => ({ ...prev, [key]: event.target.value }))}
                            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-[#a9cd39]/40"
                          />
                        </label>
                      ))}
                    </div>
                  </section>
                </div>

                <section className="mt-4 rounded-2xl border border-white/8 bg-white/[0.04] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-black uppercase tracking-widest text-[#a9cd39]">Pump readings</p>
                    <button
                      type="button"
                      onClick={() => setCorrectionDraft((prev) => ({
                        ...prev,
                        pumpReadings: [...prev.pumpReadings, { label: '', productType: 'PMS', opening: '', closing: '' }],
                      }))}
                      className="rounded-lg border border-[#a9cd39]/20 bg-[#a9cd39]/10 px-3 py-1.5 text-xs font-bold text-[#a9cd39]"
                    >
                      Add pump
                    </button>
                  </div>
                  <div className="space-y-2">
                    {correctionDraft.pumpReadings.map((item, index) => (
                      <div key={index} className="grid grid-cols-2 gap-2 rounded-xl bg-black/20 p-3 md:grid-cols-5">
                        <input value={item.label} onChange={(event) => setCorrectionDraft((prev) => ({ ...prev, pumpReadings: prev.pumpReadings.map((row, i) => i === index ? { ...row, label: event.target.value } : row) }))} placeholder="Pump" className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
                        <select value={item.productType} onChange={(event) => setCorrectionDraft((prev) => ({ ...prev, pumpReadings: prev.pumpReadings.map((row, i) => i === index ? { ...row, productType: event.target.value } : row) }))} className="rounded-lg border border-white/10 bg-[#111827] px-3 py-2 text-sm text-white outline-none">
                          <option value="PMS">PMS</option>
                          <option value="AGO">AGO</option>
                        </select>
                        <input type="number" value={item.opening} onChange={(event) => setCorrectionDraft((prev) => ({ ...prev, pumpReadings: prev.pumpReadings.map((row, i) => i === index ? { ...row, opening: event.target.value } : row) }))} placeholder="Opening" className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
                        <input type="number" value={item.closing} onChange={(event) => setCorrectionDraft((prev) => ({ ...prev, pumpReadings: prev.pumpReadings.map((row, i) => i === index ? { ...row, closing: event.target.value } : row) }))} placeholder="Closing" className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
                        <button type="button" onClick={() => setCorrectionDraft((prev) => ({ ...prev, pumpReadings: prev.pumpReadings.filter((_, i) => i !== index) }))} className="rounded-lg border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-sm font-bold text-rose-300">Remove</button>
                      </div>
                    ))}
                  </div>
                </section>

                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <section className="rounded-2xl border border-white/8 bg-white/[0.04] p-4">
                    <p className="mb-3 text-xs font-black uppercase tracking-widest text-[#a9cd39]">Bank lodgements</p>
                    <div className="space-y-2">
                      {correctionDraft.paymentBreakdown.map((item, index) => (
                        <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                          <input value={item.channel} onChange={(event) => setCorrectionDraft((prev) => ({ ...prev, paymentBreakdown: prev.paymentBreakdown.map((row, i) => i === index ? { ...row, channel: event.target.value } : row) }))} placeholder="Bank/channel" className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none" />
                          <input type="number" value={item.amount} onChange={(event) => setCorrectionDraft((prev) => ({ ...prev, paymentBreakdown: prev.paymentBreakdown.map((row, i) => i === index ? { ...row, amount: event.target.value } : row) }))} placeholder="Amount" className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none" />
                          <button type="button" onClick={() => setCorrectionDraft((prev) => ({ ...prev, paymentBreakdown: prev.paymentBreakdown.filter((_, i) => i !== index) }))} className="rounded-lg border border-rose-400/20 px-3 text-rose-300">x</button>
                        </div>
                      ))}
                      <button type="button" onClick={() => setCorrectionDraft((prev) => ({ ...prev, paymentBreakdown: [...prev.paymentBreakdown, { channel: '', amount: '' }] }))} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-300">Add bank line</button>
                    </div>
                  </section>
                  <section className="rounded-2xl border border-white/8 bg-white/[0.04] p-4">
                    <p className="mb-3 text-xs font-black uppercase tracking-widest text-[#a9cd39]">Expenses</p>
                    <div className="space-y-2">
                      {correctionDraft.expenseItems.map((item, index) => (
                        <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                          <input value={item.label} onChange={(event) => setCorrectionDraft((prev) => ({ ...prev, expenseItems: prev.expenseItems.map((row, i) => i === index ? { ...row, label: event.target.value } : row) }))} placeholder="Expense" className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none" />
                          <input type="number" value={item.amount} onChange={(event) => setCorrectionDraft((prev) => ({ ...prev, expenseItems: prev.expenseItems.map((row, i) => i === index ? { ...row, amount: event.target.value } : row) }))} placeholder="Amount" className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none" />
                          <button type="button" onClick={() => setCorrectionDraft((prev) => ({ ...prev, expenseItems: prev.expenseItems.filter((_, i) => i !== index) }))} className="rounded-lg border border-rose-400/20 px-3 text-rose-300">x</button>
                        </div>
                      ))}
                      <button type="button" onClick={() => setCorrectionDraft((prev) => ({ ...prev, expenseItems: [...prev.expenseItems, { label: '', amount: '' }] }))} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-300">Add expense</button>
                    </div>
                  </section>
                </div>

                <label className="mt-4 block space-y-2">
                  <span className="text-xs font-black uppercase tracking-widest text-amber-300">Correction reason</span>
                  <textarea value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} rows={3} className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-amber-300/40" placeholder="Explain why this report is being corrected..." />
                </label>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <button type="button" onClick={() => setCorrectionOpen(false)} className="flex-1 rounded-xl border border-white/10 py-3 text-sm font-bold text-slate-300 hover:bg-white/10">Cancel</button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!correctionReason.trim()) {
                        window.alert('Enter a correction reason before saving.')
                        return
                      }
                      correctReportBySupervisor({ reportId: selectedRawReport.id, patch: correctionDraft, reason: correctionReason })
                      setCorrectionOpen(false)
                      setSelectedDailyOpeningReport(null)
                    }}
                    className="flex-1 rounded-xl bg-amber-400 py-3 text-sm font-black text-black hover:bg-amber-300"
                  >
                    Save Correction
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {activeDashboard === 'cash-flow' && (
        <>
          {!filtersScreenOpen && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Card className="supervisor-light-stat">
                <p className="text-sm text-slate-500">Stations in View</p>
                <p className="text-2xl font-bold">{filteredDailyOpeningQueueRows.length}</p>
              </Card>
              <Card className="supervisor-light-stat">
                <p className="text-sm text-slate-500">Total Bank/Channel Deposits (NGN)</p>
                <p className="text-2xl font-bold">{Math.round(totalBankDepositsToday).toLocaleString()}</p>
              </Card>
              <Card className="supervisor-light-stat">
                <p className="text-sm text-slate-500">Net Variance (NGN)</p>
                <p className="text-2xl font-bold">{Math.round(totalCashVarianceToday).toLocaleString()}</p>
              </Card>
            </div>
          )}

          {filtersScreenOpen ? (
            <Card className="mx-auto max-w-5xl space-y-8 overflow-hidden px-4 py-6 sm:px-8 sm:py-8">
              <div className="flex flex-wrap items-start gap-4 border-b border-white/8 pb-6 dark:border-slate-700">
                <button
                  type="button"
                  onClick={closeFiltersScreen}
                  className="rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-200 dark:border-slate-600 dark:text-slate-200"
                >
                  Back to queue
                </button>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-semibold tracking-tight text-white dark:text-white">
                    Cash flow - Filters
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                    Reuse station/status filters from stock flow while reviewing cash and deposit movement.
                  </p>
                </div>
              </div>
              {cashFlowFiltersPanel}
              <div className="-mx-4 flex justify-end border-t border-white/8 bg-white/5/90 px-4 py-5 pb-24 sm:-mx-8 sm:px-8 sm:pb-6 dark:border-slate-700 dark:bg-[#0d1220]/60">
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
            <Card className="supervisor-light-section space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <h3 className="text-lg font-semibold">Cash Flow Queue</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={openFiltersScreen}
                    className="rounded-lg bg-[#0d1220] px-4 py-2 text-sm font-medium text-white shadow-sm dark:bg-white/5 dark:text-white"
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
              <div className="flex flex-col gap-3 rounded-xl border border-white/8 bg-white/5/90 px-4 py-3 dark:border-slate-700 dark:bg-[#0d1220]/50">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  <span className="font-medium text-slate-100 dark:text-slate-100">Active filters:</span>{' '}
                  {dailyFiltersSummary}
                  {' - '}
                  Showing {filteredDailyOpeningQueueRows.length} of {dailyOpeningQueueRows.length} stations
                  {' - '}
                  Range: {reportRangeLabel}
                </p>
              </div>
              {dailyOpeningQueueRows.length ? (
                filteredDailyOpeningQueueRows.length ? (
                  <div className="supervisor-light-queue-grid grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {filteredDailyOpeningQueueRows.map((row) => {
                      const submitted = row.reportStatus === 'Submitted'
                      const partial = row.reportStatus === 'Partial'
                      const variance = Math.round(Number(row.cashMovementVariance || 0))
                      return (
                        <button
                          key={row.stationId}
                          type="button"
                          onClick={() => {
                            if (submitted || partial) {
                              setSelectedDailyOpeningReport(row)
                            } else {
                              navigate(`/stations/${row.stationId}/history`)
                            }
                          }}
                          className={`supervisor-light-queue-card ${submitted || partial ? 'is-submitted' : 'is-pending'} rounded-2xl border p-4 text-left transition hover:scale-[1.01] ${submitted || partial ? 'border-white/10 bg-white/5' : 'border-amber-500/20 bg-amber-500/5'}`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div className="min-w-0">
                              <p className="font-bold text-white truncate">{row.stationName}</p>
                              <p className="text-xs text-slate-500 mt-0.5">{row.managerName}</p>
                            </div>
                            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${submitted || partial ? 'bg-[#a9cd39]/15 text-[#a9cd39]' : 'bg-amber-500/15 text-amber-400'}`}>
                              {submitted ? 'Submitted' : partial ? `Partial (${row.pendingSubmissionDays} missing)` : 'Pending'}
                            </span>
                          </div>
                          {(submitted || partial) && (
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              {[
                                { label: 'Cash B/F', value: 'NGN ' + Math.round(Number(row.cashBf || 0)).toLocaleString() },
                                { label: 'Cash Sales', value: 'NGN ' + Math.round(Number(row.cashSales || 0)).toLocaleString() },
                                { label: 'Bank Deposits', value: 'NGN ' + Math.round(Number(row.totalPaymentDeposits || 0)).toLocaleString() },
                                { label: 'Closing Bal', value: 'NGN ' + Math.round(Number(row.closingBalance || 0)).toLocaleString() },
                                { label: 'POS', value: 'NGN ' + Math.round(Number(row.posValue || 0)).toLocaleString() },
                                { label: 'Variance', value: 'NGN ' + variance.toLocaleString() },
                              ].map(({ label, value }) => (
                                <div key={label} className="supervisor-light-metric rounded-lg bg-black/20 px-2.5 py-1.5">
                                  <p className="text-slate-500 text-xs">{label}</p>
                                  <p className={`font-semibold mt-0.5 ${label === 'Variance' && Math.abs(variance) > 0 ? 'text-amber-400' : 'text-white'}`}>{value}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
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
              <Card className="supervisor-light-stat">
                <p className="text-sm text-slate-500">Expense Reports Submitted</p>
                <p className="text-2xl font-bold text-emerald-600">{expenseSubmittedCount}</p>
              </Card>
              <Card className="supervisor-light-stat">
                <p className="text-sm text-slate-500">Total Expense Today (NGN)</p>
                <p className="text-2xl font-bold">{Math.round(totalExpenseToday).toLocaleString()}</p>
              </Card>
              <Card className="supervisor-light-stat">
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
              <div className="flex flex-wrap items-start gap-4 border-b border-white/8 pb-6 dark:border-slate-700">
                <button
                  type="button"
                  onClick={closeFiltersScreen}
                  className="rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-200 dark:border-slate-600 dark:text-slate-200"
                >
                  Back to queue
                </button>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-semibold tracking-tight text-white dark:text-white">
                    Expense queue - Filters
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                    Columns, stations, then expense status - applied to the table and Excel export.
                  </p>
                </div>
              </div>
              {expenseQueueFiltersPanel}
              <div className="-mx-4 flex justify-end border-t border-white/8 bg-white/5/90 px-4 py-5 pb-24 sm:-mx-8 sm:px-8 sm:pb-6 dark:border-slate-700 dark:bg-[#0d1220]/60">
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
            <Card className="supervisor-light-section space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <h3 className="text-lg font-semibold">Daily Expense Queue</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={openFiltersScreen}
                    className="rounded-lg bg-[#0d1220] px-4 py-2 text-sm font-medium text-white shadow-sm dark:bg-white/5 dark:text-white"
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
              <div className="flex flex-col gap-3 rounded-xl border border-white/8 bg-white/5/90 px-4 py-3 dark:border-slate-700 dark:bg-[#0d1220]/50">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  <span className="font-medium text-slate-100 dark:text-slate-100">Active filters:</span>{' '}
                  {expenseFiltersSummary}
                  {' - '}
                  Showing {filteredExpenseQueueRows.length} of {expenseQueueRows.length} stations
                  {' - '}
                  Range: {reportRangeLabel}
                </p>
              </div>
              {expenseQueueRows.length ? (
                filteredExpenseQueueRows.length ? (
                  <div className="supervisor-light-queue-grid grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {filteredExpenseQueueRows.map((row) => {
                      const submitted = row.expenseStatus === 'Submitted'
                      const partial = row.expenseStatus === 'Partial'
                      const pending = row.expenseStatus === 'Pending'
                      const statusClass = submitted
                        ? 'bg-[#a9cd39]/15 text-[#a9cd39]'
                        : partial
                          ? 'bg-[#a9cd39]/15 text-[#a9cd39]'
                        : pending
                          ? 'bg-amber-500/15 text-amber-400'
                          : 'bg-slate-500/15 text-slate-300'
                      const expenseLines = Array.isArray(row.expenseItems) && row.expenseItems.length
                        ? row.expenseItems
                        : row.expenseDescription
                          ? [{ label: row.expenseDescription, amount: row.totalExpense }]
                          : []
                      return (
                        <button
                          key={row.stationId}
                          type="button"
                          onClick={() => navigate(`/stations/${row.stationId}`)}
                          className={`supervisor-light-queue-card ${submitted || partial ? 'is-submitted' : pending ? 'is-pending' : 'is-no-sales'} rounded-2xl border p-4 text-left transition hover:scale-[1.01] ${
                            submitted || partial
                              ? 'border-white/10 bg-white/5'
                              : pending
                                ? 'border-amber-500/20 bg-amber-500/5'
                                : 'border-slate-500/15 bg-white/[0.03]'
                          }`}
                        >
                          <div className="mb-3 flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate font-bold text-white">{row.stationName}</p>
                              <p className="mt-0.5 text-xs text-slate-500">{row.managerName}</p>
                            </div>
                            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${statusClass}`}>
                              {submitted ? 'Submitted' : partial ? `Partial (${row.pendingSubmissionDays} missing)` : row.expenseStatus}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="supervisor-light-metric rounded-lg bg-black/20 px-2.5 py-1.5">
                              <p className="text-xs text-slate-500">Total Expense</p>
                              <p className="mt-0.5 font-semibold text-white">NGN {Math.round(Number(row.totalExpense || 0)).toLocaleString()}</p>
                            </div>
                            <div className="supervisor-light-metric rounded-lg bg-black/20 px-2.5 py-1.5">
                              <p className="text-xs text-slate-500">Lines</p>
                              <p className="mt-0.5 font-semibold text-white">{row.expenseLines}</p>
                            </div>
                            <div className="supervisor-light-metric rounded-lg bg-black/20 px-2.5 py-1.5">
                              <p className="text-xs text-slate-500">Top Type</p>
                              <p className="mt-0.5 truncate font-semibold text-white">{row.topCategory}</p>
                            </div>
                            <div className="supervisor-light-metric rounded-lg bg-black/20 px-2.5 py-1.5">
                              <p className="text-xs text-slate-500">Date</p>
                              <p className="mt-0.5 font-semibold text-white">{row.reportDate}</p>
                            </div>
                          </div>

                          {(submitted || partial) && expenseLines.length > 0 && (
                            <div className="mt-3 space-y-1.5 rounded-xl border border-white/8 bg-black/15 p-3">
                              {expenseLines.slice(0, 4).map((item, index) => (
                                <div key={`${item.label}-${index}`} className="flex justify-between gap-3 text-xs">
                                  <span className="truncate text-slate-400">{item.label || 'Expense'}</span>
                                  <span className="shrink-0 font-semibold text-white">NGN {Math.round(Number(item.amount || 0)).toLocaleString()}</span>
                                </div>
                              ))}
                              {expenseLines.length > 4 && (
                                <p className="text-xs font-semibold text-slate-500">+ {expenseLines.length - 4} more line(s)</p>
                              )}
                            </div>
                          )}

                          {pending && (
                            <p className="mt-3 text-xs text-amber-300">{row.pendingSubmissionTableTitle || 'Report pending'}</p>
                          )}
                        </button>
                      )
                    })}
                  </div>
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
        <div className="space-y-5">
          {/* Header controls */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-[#a9cd39]">Monthly Summary</p>
              <h3 className="text-2xl font-bold text-white">{selectedMonthLabel}</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={selectedMonthKey}
                onChange={(e) => setSelectedMonthKey(e.target.value)}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none"
              >
                {monthEndMonthOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              <button type="button" onClick={() => exportSupervisorMonthEndSummaryToExcel(monthEndSummaryRows)}
                className="rounded-xl border border-[#a9cd39]/20 bg-[#a9cd39]/5 px-4 py-2 text-sm font-semibold text-[#a9cd39] hover:bg-[#a9cd39]/10 transition">
                Export
              </button>
            </div>
          </div>

          {/* Station filter */}
          <StationMultiSelect stations={stations} selectedIds={monthEndStationIds} onChange={setMonthEndStationIds} label="Filter stations" className="max-w-none w-full" />

          {monthEndSummaryRows.length ? (() => {
            // Compute rankings
            const maxSales = Math.max(...monthEndSummaryRows.map(r => r.salesPms + r.salesAgo), 1)
            const ranked = [...monthEndSummaryRows]
              .map(r => ({
                ...r,
                totalSalesL: r.salesPms + r.salesAgo,
                score: (r.compliancePct * 0.4) + ((r.salesPms + r.salesAgo) / maxSales * 100 * 0.4) + (Math.max(0, 100 - Math.abs(r.varianceTotal) / 1000) * 0.2),
              }))
              .sort((a, b) => b.score - a.score)

            const podiumColors = [
              'border-yellow-400/30 bg-yellow-400/5',
              'border-slate-400/30 bg-slate-400/5',
              'border-amber-700/30 bg-amber-700/5',
            ]

            return (
              <>
                {/* Podium - top 3 */}
                {ranked.length >= 1 && (
                  <div>
                    <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
                      <TrophyIcon className="h-4 w-4 text-[#a9cd39]" />
                      Top Performers
                    </p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {ranked.slice(0, 3).map((row, i) => (
                        <div key={row.stationId} className={`rounded-2xl border p-5 ${podiumColors[i] || 'border-white/10 bg-white/5'}`}>
                          <div className="flex items-center gap-2 mb-3">
                            <RankIcon rank={i} />
                            <div>
                              <p className="font-bold text-white">{row.stationName}</p>
                              <p className="text-xs text-slate-500">{row.managerName}</p>
                            </div>
                          </div>
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-slate-400">Compliance</span>
                              <span className="font-bold text-white">{row.compliancePct}%</span>
                            </div>
                            <div className="h-1 w-full rounded-full bg-white/5">
                              <div className="h-full rounded-full bg-[#a9cd39] transition-all" style={{ width: `${row.compliancePct}%` }} />
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Sales (L)</span>
                              <span className="font-semibold text-white">{Math.round(row.totalSalesL).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Days filed</span>
                              <span className="font-semibold text-white">{row.submittedDays}/{row.expectedDays}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Variance</span>
                              <span className={`font-semibold ${Math.abs(row.varianceTotal) > 1000 ? 'text-amber-400' : 'text-[#a9cd39]'}`}>NGN {Math.round(row.varianceTotal).toLocaleString()}</span>
                            </div>
                          </div>
                          <div className="mt-3 text-right">
                            <span className="text-xs text-slate-500">Score: <span className="font-bold text-white">{row.score.toFixed(0)}</span>/100</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Full leaderboard */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Full Rankings</p>
                  <div className="space-y-2">
                    {ranked.map((row, i) => (
                      <div key={row.stationId} className="flex items-center gap-4 rounded-xl border border-white/5 bg-white/5 px-4 py-3">
                        {i < 3 ? <RankIcon rank={i} className="h-6 w-6" /> : <span className="w-6 shrink-0 text-center text-sm font-bold text-slate-500">#{i + 1}</span>}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <p className="font-semibold text-white truncate">{row.stationName}</p>
                            <span className="text-xs font-bold text-[#a9cd39] shrink-0">{row.compliancePct}% compliance</span>
                          </div>
                          <div className="h-1 w-full rounded-full bg-white/5">
                            <div className="h-full rounded-full bg-[#a9cd39]/60 transition-all" style={{ width: `${row.compliancePct}%` }} />
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-white">{Math.round(row.totalSalesL).toLocaleString()} L</p>
                          <p className="text-xs text-slate-500">{row.submittedDays}/{row.expectedDays} days</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section tabs + data */}
                <Card className="space-y-4">
                  <div className="flex gap-2 flex-wrap">
                    {[['stock-flow','Stock Flow'],['cash-flow','Cash Flow'],['expense-monitor','Expenses']].map(([key, label]) => (
                      <button key={key} type="button" onClick={() => setMonthEndSection(key)}
                        className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${monthEndSection === key ? 'bg-[#a9cd39] text-black' : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {monthEndSummaryRows.map((row) => (
                      <div key={row.stationId} className="rounded-xl border border-white/5 bg-white/5 p-4 space-y-2">
                        <p className="font-semibold text-white text-sm">{row.stationName}</p>
                        {monthEndSection === 'stock-flow' && (
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {[
                              { l: 'PMS Sales', v: Math.round(row.salesPms).toLocaleString() + ' L' },
                              { l: 'AGO Sales', v: Math.round(row.salesAgo).toLocaleString() + ' L' },
                              { l: 'Days Filed', v: `${row.submittedDays}/${row.expectedDays}` },
                              { l: 'Compliance', v: row.compliancePct + '%' },
                            ].map(({ l, v }) => (
                              <div key={l} className="rounded-lg bg-black/20 px-2 py-1.5">
                                <p className="text-slate-500 text-xs">{l}</p>
                                <p className="font-semibold text-white">{v}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        {monthEndSection === 'cash-flow' && (
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {[
                              { l: 'Cash Sales', v: 'NGN ' + Math.round(row.cashSalesTotal).toLocaleString() },
                              { l: 'Bank Deposits', v: 'NGN ' + Math.round(row.bankLodgements).toLocaleString() },
                              { l: 'POS', v: 'NGN ' + Math.round(row.posTotal).toLocaleString() },
                              { l: 'Variance', v: 'NGN ' + Math.round(row.varianceTotal).toLocaleString() },
                            ].map(({ l, v }) => (
                              <div key={l} className="rounded-lg bg-black/20 px-2 py-1.5">
                                <p className="text-slate-500 text-xs">{l}</p>
                                <p className="font-semibold text-white">{v}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        {monthEndSection === 'expense-monitor' && (
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {[
                              { l: 'Total Expenses', v: 'NGN ' + Math.round(row.expenseTotal).toLocaleString() },
                              { l: 'Expense Lines', v: row.expenseLines },
                            ].map(({ l, v }) => (
                              <div key={l} className="rounded-lg bg-black/20 px-2 py-1.5">
                                <p className="text-slate-500 text-xs">{l}</p>
                                <p className="font-semibold text-white">{v}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>

                {/* Finalize */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/5 bg-white/5 px-5 py-4">
                  <p className="text-sm text-slate-400">
                    {selectedMonthFinalization
                      ? `Finalized by ${selectedMonthFinalization.finalizedBy} on ${selectedMonthFinalization.finalizedAt?.split('T')[0]}`
                      : `Ready to finalize ${selectedMonthLabel} for admin.`}
                  </p>
                  <button type="button"
                    onClick={() => { if(window.confirm(`Finalize ${selectedMonthLabel} and send to admin?`)) finalizeSupervisorMonthEndSummary({ monthKey: selectedMonthKey, monthLabel: selectedMonthLabel, stationSummaries: monthEndSummaryRows }) }}
                    className="rounded-xl bg-[#c4151d] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#a01018] transition">
                    {selectedMonthFinalization ? 'Re-Finalize' : 'Finalize Month-End'}
                  </button>
                </div>
              </>
            )
          })() : (
            <EmptyState title="No data for this month" message="Select a different month or add station filters." />
          )}
        </div>
      )}
      {activeDashboard === 'product-requests' && (
        <div className="space-y-6">
          {/* Pending requests */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-amber-400">Pending Action</p>
                <h3 className="text-xl font-bold text-white">Product Requests</h3>
              </div>
              <span className="rounded-full bg-amber-500/15 px-3 py-1 text-sm font-bold text-amber-400">{supervisorQueueRows.length} pending</span>
            </div>
            {supervisorQueueRows.length ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {supervisorQueueRows.map((row) => (
                  <div key={row.id} className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-white">{row.stationName}</p>
                        <p className="text-sm text-slate-400 mt-0.5">{row.managerName || '-'} - {row.createdDate}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold text-amber-400">Pending</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-xl bg-black/20 px-3 py-2">
                        <p className="text-xs text-slate-500">Product</p>
                        <p className="font-semibold text-white">{row.requestedProductType}</p>
                      </div>
                      <div className="rounded-xl bg-black/20 px-3 py-2">
                        <p className="text-xs text-slate-500">Quantity</p>
                        <p className="font-semibold text-white">{row.requestedLitersLabel} L</p>
                      </div>
                    </div>
                    {row.managerRemark && (
                      <p className="text-sm text-slate-400 italic">"{row.managerRemark}"</p>
                    )}
                    <div className="flex gap-2 pt-1">
                      <button type="button"
                        onClick={() => reviewProductRequestBySupervisor({ requestId: row.id, decision: 'approve', remark: `Escalated by ${currentUser?.name || 'Supervisor'}` })}
                        className="flex-1 rounded-xl border border-[#a9cd39]/30 bg-[#a9cd39]/10 py-2.5 text-sm font-semibold text-[#a9cd39] hover:bg-[#a9cd39]/20 transition">
                        Approve & Escalate
                      </button>
                      <button type="button"
                        onClick={() => reviewProductRequestBySupervisor({ requestId: row.id, decision: 'decline', remark: 'Declined by supervisor' })}
                        className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-2.5 text-sm font-semibold text-rose-400 hover:bg-rose-500/10 transition">
                        x
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No pending requests" message="All product requests have been reviewed." />
            )}
          </div>

          {/* History */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">History</p>
                <h3 className="text-xl font-bold text-white">Reviewed Requests</h3>
              </div>
              {selectedRequestStationId && (
                <button type="button" onClick={() => setSelectedRequestStationId(null)}
                  className="rounded-xl border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5 transition">
                  Clear filter
                </button>
              )}
            </div>
            {filteredSupervisorHistoryRows.length ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filteredSupervisorHistoryRows.map((row) => {
                  const approved = row.supervisorDecision === 'approve' || row.supervisorStatus === 'Escalated to Admin'
                  return (
                    <div key={row.id} className={`rounded-2xl border p-4 space-y-2 cursor-pointer hover:scale-[1.01] transition ${approved ? 'border-[#a9cd39]/15 bg-[#a9cd39]/5' : 'border-rose-500/15 bg-rose-500/5'}`}
                      onClick={() => setSelectedRequestStationId(row.stationId === selectedRequestStationId ? null : row.stationId)}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-white">{row.stationName}</p>
                          <p className="text-sm text-slate-400">{row.createdDate}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${approved ? 'bg-[#a9cd39]/15 text-[#a9cd39]' : 'bg-rose-500/15 text-rose-400'}`}>
                          {approved ? 'Escalated' : 'Declined'}
                        </span>
                      </div>
                      <p className="text-sm text-slate-300">{row.requestedProductType} - {Math.round(row.requestedLiters).toLocaleString()} L</p>
                      {row.reason && row.reason !== '-' && <p className="text-sm text-slate-500 italic">"{row.reason}"</p>}
                    </div>
                  )
                })}
              </div>
            ) : (
              <EmptyState title={selectedRequestStationId ? 'No history for this station' : 'No history yet'} message="Reviewed requests appear here." />
            )}
          </div>
        </div>
      )}

      {activeDashboard === 'history' && (
        <div>
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Archive</p>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#a9cd39]">Trusted archive</p>
            <h3 className="text-xl font-bold text-white">Finalised Reports</h3>
            <p className="mt-1 text-sm text-slate-400">Confirmed reports stay here as the clean source for future P/L.</p>
          </div>
          {finalisedReportRows.length ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {finalisedReportRows.map((row) => (
                <div key={row.id} className="rounded-2xl border border-[#a9cd39]/20 bg-[#a9cd39]/5 p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold text-white">{row.date || row.monthKey || '-'}</p>
                      <p className="text-sm text-slate-400 mt-0.5">by {row.finalizedBy || '-'}</p>
                    </div>
                    <span className="rounded-full bg-[#a9cd39]/15 px-2.5 py-0.5 text-xs font-bold text-[#a9cd39]">Finalised</span>
                  </div>
                  <p className="text-sm font-semibold text-white">{row.stationName} - {row.managerName}</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-black/20 px-2.5 py-2"><p className="text-slate-500">PMS sold</p><p className="font-bold text-white">{formatLiters(row.totalSalesLitersPMS)}</p></div>
                    <div className="rounded-lg bg-black/20 px-2.5 py-2"><p className="text-slate-500">AGO sold</p><p className="font-bold text-white">{formatLiters(row.totalSalesLitersAGO)}</p></div>
                    <div className="rounded-lg bg-black/20 px-2.5 py-2"><p className="text-slate-500">Cash sales</p><p className="font-bold text-white">{formatMoney(row.cashSales)}</p></div>
                    <div className="rounded-lg bg-black/20 px-2.5 py-2"><p className="text-slate-500">Expense</p><p className="font-bold text-white">{formatMoney(row.expenseAmount)}</p></div>
                  </div>
                  <p className="text-xs text-slate-400">Finalised by {row.finalizedBy || 'Supervisor'} on {row.finalizedAt?.split('T')[0] || 'saved date'}</p>
                  {Array.isArray(row.supervisorCorrectionHistory) && row.supervisorCorrectionHistory.length > 0 && (
                    <p className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-2.5 py-1.5 text-xs font-semibold text-amber-300">{row.supervisorCorrectionHistory.length} correction(s)</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No finalised reports yet" message="Reports confirmed by supervisors will appear here." />
          )}
        </div>
      )}
    </div>
  )
}

export default SupervisorDashboardPage




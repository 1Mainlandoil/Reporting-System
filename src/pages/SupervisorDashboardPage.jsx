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
  if (status === 'Pending') return 1
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
  const [reportViewDate, setReportViewDate] = useState(today)
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
        const pendingInfo = getDailyReportPendingInfo(reportViewDate, stationReportDates)
        const pendingFmt = formatPendingSubmissionSummary(pendingInfo, reportViewDate)
        const stationReportsToday = reports.filter(
          (report) => report.stationId === station.id && report.date === reportViewDate,
        )
        const latestToday = stationReportsToday.at(-1)
        const previousReport = [...reports]
          .filter((report) => report.stationId === station.id && report.date < reportViewDate)
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
          multiPricing: Boolean(latestToday?.multiPricing),
          priceBandsPMS: Array.isArray(latestToday?.priceBandsPMS) ? latestToday.priceBandsPMS : [],
          priceBandsAGO: Array.isArray(latestToday?.priceBandsAGO) ? latestToday.priceBandsAGO : [],
          salesAmountPMS: Number(latestToday?.salesAmountPMS || 0),
          salesAmountAGO: Number(latestToday?.salesAmountAGO || 0),
          totalSalesAmount: Number(latestToday?.totalSalesAmount || 0),
          receivedProduct: latestToday
            ? latestToday.receivedProduct
              ? `Yes (${receivedProductType || 'Not specified'})`
              : 'No'
            : 'Not Submitted',
          quantityReceived: latestToday
            ? Math.round(Number(latestToday.receivedPMS ?? 0) + Number(latestToday.receivedAGO ?? 0)).toLocaleString()
            : 'Not Submitted',
          receivedPMS: Number(latestToday?.receivedPMS || 0),
          receivedAGO: Number(latestToday?.receivedAGO || 0),
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
          pumpSalesLitersPMS: latestToday?.pumpSalesLitersPMS ?? null,
          pumpSalesLitersAGO: latestToday?.pumpSalesLitersAGO ?? null,
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
          eodAttachments: Array.isArray(latestToday?.eodAttachments) ? latestToday.eodAttachments : [],
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
  }, [reportDatesByStation, reportViewDate, reports, stations, today, users])

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
        const pendingInfo = getDailyReportPendingInfo(reportViewDate, stationReportDates)
        const pendingFmt = formatPendingSubmissionSummary(pendingInfo, reportViewDate)
        const stationReportsToday = reports.filter(
          (report) => report.stationId === station.id && report.date === reportViewDate,
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
          expenseItems,
          expenseDescription: latestToday?.expenseDescription || '',
          topCategory,
          reportDate: latestToday ? latestToday.date : 'Pending',
          pendingSubmissionDays: pendingInfo.pendingDays,
          pendingSubmissionNoHistory: pendingInfo.noPriorSubmissions,
          pendingSubmissionSummaryExport: pendingFmt.exportText,
          pendingSubmissionTableTitle: pendingFmt.tableTitle,
          pendingSubmissionTableSubtitle: pendingFmt.tableSubtitle || '',
        }
      })
  }, [reportDatesByStation, reportViewDate, reports, stations, users])

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
      ? toFiniteNumber(row.pumpSalesLitersPMS) + toFiniteNumber(row.receivedPMS) - toFiniteNumber(row.rttPMS)
      : hasPmsMeter
        ? directPumpDelta.PMS + toFiniteNumber(row.receivedPMS) - toFiniteNumber(row.rttPMS)
        : toFiniteNumber(row.totalSalesLitersPMS)
    const systemAgo = row.pumpSalesLitersAGO != null
      ? toFiniteNumber(row.pumpSalesLitersAGO) + toFiniteNumber(row.receivedAGO) - toFiniteNumber(row.rttAGO)
      : hasAgoMeter
        ? directPumpDelta.AGO + toFiniteNumber(row.receivedAGO) - toFiniteNumber(row.rttAGO)
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
            <div className="ml-auto flex items-center gap-2">
              <span className="text-sm font-medium text-slate-400">Date</span>
              <input
                type="date"
                value={reportViewDate}
                max={today}
                onChange={(event) => setReportViewDate(event.target.value || today)}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white outline-none transition focus:border-[#a9cd39]/50"
              />
              {reportViewDate !== today && (
                <button
                  type="button"
                  onClick={() => setReportViewDate(today)}
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
        {/* ── Stat bar ── */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: 'Stations', value: portfolio.length, color: 'text-white', accent: 'border-white/10', icon: '⌂' },
            { label: 'Safe', value: portfolio.filter(p => p.status === 'safe').length, color: 'text-[#a9cd39]', accent: 'border-[#a9cd39]/20', icon: '✓' },
            { label: 'Warning', value: warningCount, color: 'text-amber-400', accent: 'border-amber-500/20', icon: '⚠' },
            { label: 'Critical', value: criticalCount, color: 'text-rose-400', accent: 'border-rose-500/20', icon: '⛔' },
          ].map(({ label, value, color, accent, icon }) => (
            <button
              key={label}
              type="button"
              onClick={() => setStatusFilter(label === 'Stations' ? 'all' : label.toLowerCase())}
              className={`rounded-2xl border ${statusFilter === (label === 'Stations' ? 'all' : label.toLowerCase()) ? accent : 'border-white/8'} bg-white/5 p-4 text-left transition hover:scale-[1.01] hover:bg-white/10`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
                <span className={`text-lg ${color}`}>{icon}</span>
              </div>
              <p className={`text-3xl font-bold ${color}`}>{value}</p>
            </button>
          ))}
        </div>

        {/* ── Portfolio ── */}
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

        {/* ── Bottom two panels ── */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-rose-400">⚠ Top Risk</p>
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
                  <p className="text-xs text-slate-500 mt-0.5">{station.daysRemaining.toFixed(0)}d remaining · {Math.round(station.stockRemaining).toLocaleString()} L</p>
                </div>
                <StatusBadge status={station.status} />
              </button>
            ))}
          </Card>

          <Card className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-amber-400">🚩 Interventions</p>
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
                    {item.stage === 'escalated' ? '✓ Escalated' : 'Escalate'}
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
              <div className="flex flex-wrap items-start gap-4 border-b border-white/8 pb-6 dark:border-slate-700">
                <button
                  type="button"
                  onClick={closeFiltersScreen}
                  className="rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-200 dark:border-slate-600 dark:text-slate-200"
                >
                  ← Back to queue
                </button>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-semibold tracking-tight text-white dark:text-white">
                    Daily opening · Filters
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                    Order: table columns, stations, then submission status—everything drives the queue table and Excel
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
            <Card className="space-y-4">
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
                  {' · '}
                  Showing {filteredDailyOpeningQueueRows.length} of {dailyOpeningQueueRows.length} stations
                </p>
              </div>
              {dailyOpeningQueueRows.length ? (
                filteredDailyOpeningQueueRows.length ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {filteredDailyOpeningQueueRows.map((row) => {
                      const submitted = row.reportStatus === 'Submitted'
                      const noSales = row.reportStatus === 'No Sales Declared'
                      const pending = !submitted && !noSales
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
                          className={`rounded-2xl border p-4 text-left transition hover:scale-[1.01] ${
                            submitted ? 'border-[#a9cd39]/25 bg-[#a9cd39]/5'
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
                              submitted ? 'bg-[#a9cd39]/15 text-[#a9cd39]'
                              : noSales ? 'bg-white/10 text-slate-400'
                              : late ? 'bg-rose-500/15 text-rose-400'
                              : 'bg-amber-500/15 text-amber-400'
                            }`}>
                              {submitted ? '✓ Submitted'
                               : noSales ? 'No Sales'
                               : late ? `Late ${row.pendingSubmissionDays}d`
                               : 'Pending'}
                            </span>
                          </div>

                          {/* Key figures */}
                          {submitted && (
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              {[
                                { label: 'PMS Closing', value: row.closingStockPMS + ' L' },
                                { label: 'AGO Closing', value: row.closingStockAGO + ' L' },
                                { label: 'Sales', value: 'NGN ' + Math.round(Number(row.totalSalesAmount || 0)).toLocaleString() },
                                { label: 'Variance', value: 'NGN ' + Math.round(Number(row.cashMovementVariance || 0)).toLocaleString() },
                              ].map(({ label, value }) => (
                                <div key={label} className="rounded-lg bg-black/20 px-2.5 py-1.5">
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
                              <span className="ml-2 text-[#a9cd39]">→ View History</span>
                            </p>
                          )}

                          {/* Flags */}
                          {(row.hasDiscrepancy || (row.eodAttachments && row.eodAttachments.length > 0)) && (
                            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-white/5 pt-2">
                              {row.hasDiscrepancy && (
                                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">⚠ Discrepancy</span>
                              )}
                              {row.eodAttachments?.length > 0 && (
                                <span className="rounded-full bg-[#a9cd39]/10 px-2 py-0.5 text-xs text-[#a9cd39]">📎 {row.eodAttachments.length} EOD</span>
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
                      {selectedDailyOpeningReport.managerName} · {selectedDailyOpeningReport.reportDate}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedDailyOpeningReport(null)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 text-slate-400 hover:text-white transition shrink-0"
                  >✕</button>
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
                        ? `Avg ₦${Number(selectedDailyOpeningReport.pmsPrice || 0).toLocaleString()}/L`
                        : selectedDailyOpeningReport.pmsPrice}
                    </p>
                    {(selectedDailyOpeningReport.priceBandsPMS || []).length > 0 && (
                      <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                        {selectedDailyOpeningReport.priceBandsPMS.map((band, index) => (
                          <li key={`pms-band-${index}`}>
                            ₦{Number(band.price || 0).toLocaleString()}/L × {Number(band.liters || 0).toLocaleString()} L
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
                        ? `Avg ₦${Number(selectedDailyOpeningReport.agoPrice || 0).toLocaleString()}/L`
                        : selectedDailyOpeningReport.agoPrice}
                    </p>
                    {(selectedDailyOpeningReport.priceBandsAGO || []).length > 0 && (
                      <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                        {selectedDailyOpeningReport.priceBandsAGO.map((band, index) => (
                          <li key={`ago-band-${index}`}>
                            ₦{Number(band.price || 0).toLocaleString()}/L × {Number(band.liters || 0).toLocaleString()} L
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                    <p className="text-xs uppercase text-slate-500">Input Quantity Received (L)</p>
                    <p className="font-medium text-white">{selectedDailyOpeningReport.quantityReceived}</p>
                  </div>
                  {/* PMS Sales — side by side */}
                  <div className="rounded-xl border border-white/5 bg-white/5 p-3 md:col-span-2">
                    <p className="text-xs uppercase text-slate-500 mb-2">Sales PMS (L)</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-black/20 px-3 py-2">
                        <p className="text-xs text-slate-500">Pump meters</p>
                        <p className={`font-bold text-base ${selectedDailyOpeningReport.pumpSalesLitersPMS != null ? 'text-[#a9cd39]' : 'text-slate-500'}`}>
                          {selectedDailyOpeningReport.pumpSalesLitersPMS != null ? Math.round(selectedDailyOpeningReport.pumpSalesLitersPMS).toLocaleString() + ' L' : '—'}
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
                        <p className="mt-2 text-xs text-amber-400">⚠ Gap of ~{Math.round(gap).toLocaleString()} L between pump and dip figures</p>
                      ) : null
                    })()}
                  </div>
                  {/* AGO Sales — side by side */}
                  <div className="rounded-xl border border-white/5 bg-white/5 p-3 md:col-span-2">
                    <p className="text-xs uppercase text-slate-500 mb-2">Sales AGO (L)</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-black/20 px-3 py-2">
                        <p className="text-xs text-slate-500">Pump meters</p>
                        <p className={`font-bold text-base ${selectedDailyOpeningReport.pumpSalesLitersAGO != null ? 'text-blue-400' : 'text-slate-500'}`}>
                          {selectedDailyOpeningReport.pumpSalesLitersAGO != null ? Math.round(selectedDailyOpeningReport.pumpSalesLitersAGO).toLocaleString() + ' L' : '—'}
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
                        <p className="mt-2 text-xs text-amber-400">⚠ Gap of ~{Math.round(gap).toLocaleString()} L between pump and dip figures</p>
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
                    <p className="mb-2 text-xs uppercase text-slate-500">Pump Readings</p>
                    <div className="space-y-2">
                      {selectedDailyOpeningReport.pumpMeterRows.map((item, index) => (
                        <p key={`${item.label}-${index}`} className="text-sm text-slate-200">
                          {item.label}:{' '}
                          {item.noBaseline
                            ? 'No baseline'
                            : `${item.opening ?? '-'} → ${item.closing ?? '-'} ${item.used ? '(used)' : '(unused)'}`}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Supervisor Review Button ── */}
                {(() => {
                  const report = reports.find((r) =>
                    r.stationId === selectedDailyOpeningReport.stationId &&
                    r.date === selectedDailyOpeningReport.reportDate
                  )
                  const alreadyReviewed = report?.supervisorReview?.status === 'Reviewed'
                  return (
                    <div className="mt-5 border-t border-white/5 pt-5">
                      {alreadyReviewed ? (
                        <div className="flex items-center gap-3 rounded-xl border border-[#a9cd39]/25 bg-[#a9cd39]/5 px-4 py-3">
                          <span className="text-[#a9cd39] text-xl">✓</span>
                          <div>
                            <p className="text-sm font-semibold text-[#a9cd39]">Reviewed</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              by {report.supervisorReview.reviewedBy || currentUser?.name} · {report.supervisorReview.remark || ''}
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
                              ✓ Confirm Review
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
              <div className="flex flex-wrap items-start gap-4 border-b border-white/8 pb-6 dark:border-slate-700">
                <button
                  type="button"
                  onClick={closeFiltersScreen}
                  className="rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-200 dark:border-slate-600 dark:text-slate-200"
                >
                  ← Back to queue
                </button>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-semibold tracking-tight text-white dark:text-white">
                    Cash flow · Filters
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
            <Card className="space-y-4">
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
                  {' · '}
                  Showing {filteredDailyOpeningQueueRows.length} of {dailyOpeningQueueRows.length} stations
                </p>
              </div>
              {dailyOpeningQueueRows.length ? (
                filteredDailyOpeningQueueRows.length ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {filteredDailyOpeningQueueRows.map((row) => {
                      const submitted = row.reportStatus === 'Submitted'
                      const variance = Math.round(Number(row.cashMovementVariance || 0))
                      return (
                        <button
                          key={row.stationId}
                          type="button"
                          onClick={() => {
                            if (submitted) {
                              setSelectedDailyOpeningReport(row)
                            } else {
                              navigate(`/stations/${row.stationId}/history`)
                            }
                          }}
                          className={`rounded-2xl border p-4 text-left transition hover:scale-[1.01] ${submitted ? 'border-white/10 bg-white/5' : 'border-amber-500/20 bg-amber-500/5'}`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div className="min-w-0">
                              <p className="font-bold text-white truncate">{row.stationName}</p>
                              <p className="text-xs text-slate-500 mt-0.5">{row.managerName}</p>
                            </div>
                            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${submitted ? 'bg-[#a9cd39]/15 text-[#a9cd39]' : 'bg-amber-500/15 text-amber-400'}`}>
                              {submitted ? '✓' : 'Pending'}
                            </span>
                          </div>
                          {submitted && (
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              {[
                                { label: 'Cash B/F', value: 'NGN ' + Math.round(Number(row.cashBf || 0)).toLocaleString() },
                                { label: 'Cash Sales', value: 'NGN ' + Math.round(Number(row.cashSales || 0)).toLocaleString() },
                                { label: 'Bank Deposits', value: 'NGN ' + Math.round(Number(row.totalPaymentDeposits || 0)).toLocaleString() },
                                { label: 'Closing Bal', value: 'NGN ' + Math.round(Number(row.closingBalance || 0)).toLocaleString() },
                                { label: 'POS', value: 'NGN ' + Math.round(Number(row.posValue || 0)).toLocaleString() },
                                { label: 'Variance', value: 'NGN ' + variance.toLocaleString() },
                              ].map(({ label, value }) => (
                                <div key={label} className="rounded-lg bg-black/20 px-2.5 py-1.5">
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
              <div className="flex flex-wrap items-start gap-4 border-b border-white/8 pb-6 dark:border-slate-700">
                <button
                  type="button"
                  onClick={closeFiltersScreen}
                  className="rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-200 dark:border-slate-600 dark:text-slate-200"
                >
                  ← Back to queue
                </button>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-semibold tracking-tight text-white dark:text-white">
                    Expense queue · Filters
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                    Columns, stations, then expense status—applied to the table and Excel export.
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
            <Card className="space-y-4">
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
                  {' · '}
                  Showing {filteredExpenseQueueRows.length} of {expenseQueueRows.length} stations
                </p>
              </div>
              {expenseQueueRows.length ? (
                filteredExpenseQueueRows.length ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {filteredExpenseQueueRows.map((row) => {
                      const submitted = row.expenseStatus === 'Submitted'
                      const pending = row.expenseStatus === 'Pending'
                      const statusClass = submitted
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
                          className={`rounded-2xl border p-4 text-left transition hover:scale-[1.01] ${
                            submitted
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
                              {submitted ? 'Submitted' : row.expenseStatus}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded-lg bg-black/20 px-2.5 py-1.5">
                              <p className="text-xs text-slate-500">Total Expense</p>
                              <p className="mt-0.5 font-semibold text-white">NGN {Math.round(Number(row.totalExpense || 0)).toLocaleString()}</p>
                            </div>
                            <div className="rounded-lg bg-black/20 px-2.5 py-1.5">
                              <p className="text-xs text-slate-500">Lines</p>
                              <p className="mt-0.5 font-semibold text-white">{row.expenseLines}</p>
                            </div>
                            <div className="rounded-lg bg-black/20 px-2.5 py-1.5">
                              <p className="text-xs text-slate-500">Top Type</p>
                              <p className="mt-0.5 truncate font-semibold text-white">{row.topCategory}</p>
                            </div>
                            <div className="rounded-lg bg-black/20 px-2.5 py-1.5">
                              <p className="text-xs text-slate-500">Date</p>
                              <p className="mt-0.5 font-semibold text-white">{row.reportDate}</p>
                            </div>
                          </div>

                          {submitted && expenseLines.length > 0 && (
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

            const medals = ['🥇', '🥈', '🥉']
            const podiumColors = [
              'border-yellow-400/30 bg-yellow-400/5',
              'border-slate-400/30 bg-slate-400/5',
              'border-amber-700/30 bg-amber-700/5',
            ]

            return (
              <>
                {/* Podium — top 3 */}
                {ranked.length >= 1 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">🏆 Top Performers</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {ranked.slice(0, 3).map((row, i) => (
                        <div key={row.stationId} className={`rounded-2xl border p-5 ${podiumColors[i] || 'border-white/10 bg-white/5'}`}>
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-2xl">{medals[i]}</span>
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
                        <span className="w-6 shrink-0 text-center text-sm font-bold text-slate-500">{i < 3 ? medals[i] : `#${i + 1}`}</span>
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
                      ? `✓ Finalized by ${selectedMonthFinalization.finalizedBy} on ${selectedMonthFinalization.finalizedAt?.split('T')[0]}`
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
                <p className="text-xs font-semibold uppercase tracking-widest text-amber-400">⬒ Pending Action</p>
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
                        <p className="text-sm text-slate-400 mt-0.5">{row.managerName || '—'} · {row.createdDate}</p>
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
                        ✓ Approve & Escalate
                      </button>
                      <button type="button"
                        onClick={() => reviewProductRequestBySupervisor({ requestId: row.id, decision: 'decline', remark: 'Declined by supervisor' })}
                        className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-2.5 text-sm font-semibold text-rose-400 hover:bg-rose-500/10 transition">
                        ✗
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
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">🕘 History</p>
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
                      <p className="text-sm text-slate-300">{row.requestedProductType} · {Math.round(row.requestedLiters).toLocaleString()} L</p>
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
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">🕘 Archive</p>
            <h3 className="text-xl font-bold text-white">Supervisor History</h3>
          </div>
          {finalizationHistoryRows.length ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {finalizationHistoryRows.map((row, i) => (
                <div key={i} className="rounded-2xl border border-white/8 bg-white/5 p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold text-white">{row.date || row.monthKey || '—'}</p>
                      <p className="text-sm text-slate-400 mt-0.5">by {row.finalizedBy || '—'}</p>
                    </div>
                    <span className="rounded-full bg-[#a9cd39]/15 px-2.5 py-0.5 text-xs font-bold text-[#a9cd39]">Finalized</span>
                  </div>
                  {row.generalRemark && <p className="text-sm text-slate-400 italic">"{row.generalRemark}"</p>}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No history yet" message="Finalized daily reviews will appear here." />
          )}
        </div>
      )}
    </div>
  )
}

export default SupervisorDashboardPage

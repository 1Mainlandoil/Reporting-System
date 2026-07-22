import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Card from '../components/ui/Card'
import EmptyState from '../components/ui/EmptyState'
import ErrorNotice from '../components/ui/ErrorNotice'
import StaffClosingReportForm from '../components/staff/StaffClosingReportForm'
import DateRangePicker from '../components/ui/DateRangePicker'
import { useAppStore } from '../store/useAppStore'
import { ROLES } from '../constants/roles'
import { exportStationHistoryToExcel } from '../utils/exportExcel'
import { getClosingForProduct, getPumpHistoryKey, normalizePumpProductType } from '../utils/reportFields'
import { addCalendarDaysIso, formatStaffCalendarDay, getOldestMissingReportDateUpTo } from '../utils/reportPending'
import { getReportingDateIso } from '../utils/dateFormat'

const REVIEW_STATUS_OPTIONS = ['Reviewed', 'Needs Attention', 'Escalated']

const formatNumber = (value, digits = 0) =>
  Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })

const formatMoney = (value) => `NGN ${formatNumber(Math.round(Number(value || 0)))}`
const formatLiters = (value, digits = 0) => `${formatNumber(Number(value || 0), digits)} L`
const normalizeStationKey = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')

const normalizeDateRange = (from, to) => {
  const start = from && to && from > to ? to : from
  const end = from && to && from > to ? from : to
  return { start, end }
}

const formatDateRangeLabel = (from, to) => {
  const { start, end } = normalizeDateRange(from, to)
  if (!start && !end) return 'All dates'
  if (start && !end) return `${start} onward`
  if (!start && end) return `Up to ${end}`
  return start === end ? start : `${start} to ${end}`
}

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
  const todayOpeningMap = new Map()
  const todayMetaMap = new Map()
  for (const item of todayList) {
    const label = String(item?.label || '').trim()
    const productType = normalizePumpProductType(item?.productType)
    const key = getPumpHistoryKey(label, productType)
    if (!key) continue
    const reading = getReadingValue(item)
    if (reading == null || Number.isNaN(reading)) continue
    todayMap.set(key, reading)
    todayMetaMap.set(key, { label, productType })
    const opening = item.opening != null && item.opening !== '' ? Number(item.opening) : null
    if (opening != null && !Number.isNaN(opening)) {
      todayOpeningMap.set(key, opening)
    }
  }

  const keys = new Set([...priorMap.keys(), ...todayMap.keys()])
  return [...keys]
    .sort((a, b) => {
      const aMeta = todayMetaMap.get(a) || priorMap.get(a) || {}
      const bMeta = todayMetaMap.get(b) || priorMap.get(b) || {}
      return `${aMeta.label || ''} ${aMeta.productType || ''}`.localeCompare(`${bMeta.label || ''} ${bMeta.productType || ''}`)
    })
    .map((key) => {
      const meta = todayMetaMap.get(key) || priorMap.get(key) || {}
      const opening = todayOpeningMap.has(key)
        ? todayOpeningMap.get(key)
        : priorMap.has(key)
          ? priorMap.get(key).closing
          : null
      const todayClosing = todayMap.has(key) ? todayMap.get(key) : null
      if (todayClosing != null) {
        return {
          label: meta.label || '',
          productType: meta.productType || 'PMS',
          opening,
          closing: todayClosing,
          used: true,
          delta: opening != null ? todayClosing - opening : null,
        }
      }
      if (opening != null) {
        return { label: meta.label || '', productType: meta.productType || 'PMS', opening, closing: opening, used: false, delta: 0 }
      }
      return { label: meta.label || '', productType: meta.productType || 'PMS', opening: null, closing: null, used: false, delta: null, noBaseline: true }
    })
}

const StationReportHistoryPage = () => {
  const { stationId } = useParams()
  const role = useAppStore((state) => state.role)
  const currentUser = useAppStore((state) => state.currentUser)
  const stations = useAppStore((state) => state.stations)
  const storeReports = useAppStore((state) => state.reports)
  const posTerminals = useAppStore((state) => state.posTerminals)
  const productRequests = useAppStore((state) => state.productRequests)
  const submitReport = useAppStore((state) => state.submitReport)
  const updateReportSupervisorReview = useAppStore((state) => state.updateReportSupervisorReview)
  const reportingConfiguration = useAppStore((state) => state.appSettings.reportingConfiguration)
  const refreshFromSupabase = useAppStore((state) => state.refreshFromSupabase)
  const [reviewDrafts, setReviewDrafts] = useState({})
  const [selectedReportId, setSelectedReportId] = useState('')
  const [selectedHistoryReportId, setSelectedHistoryReportId] = useState('')
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false)
  const [historyFilterDate, setHistoryFilterDate] = useState('')
  const [historyRangeFrom, setHistoryRangeFrom] = useState('')
  const [historyRangeTo, setHistoryRangeTo] = useState('')
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

  const todayIso = getReportingDateIso()
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

  const isSupervisor = role === ROLES.SUPERVISOR
  const historyTabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'dispatch', label: 'Dispatch / Received Product' },
    { key: 'reports', label: 'Daily Reports' },
    ...(isSupervisor && reportingConfiguration.supervisorReviewWorkflowEnabled ? [{ key: 'review', label: 'Supervisor Review' }] : []),
  ]
  const [activeHistoryTab, setActiveHistoryTab] = useState(() => (isStaffOwnStation ? 'reports' : 'overview'))
  const effectiveHistoryTab = historyTabs.some((tab) => tab.key === activeHistoryTab) ? activeHistoryTab : historyTabs[0].key
  const historyRange = useMemo(() => normalizeDateRange(historyRangeFrom, historyRangeTo), [historyRangeFrom, historyRangeTo])
  const activeHistoryRangeLabel = useMemo(
    () => isStaffOwnStation ? (historyFilterDate || 'All dates') : formatDateRangeLabel(historyRange.start, historyRange.end),
    [historyFilterDate, historyRange.end, historyRange.start, isStaffOwnStation],
  )
  const filteredReports = reports.filter((report) => {
    if (isStaffOwnStation) {
      if (historyFilterDate && report.date !== historyFilterDate) {
        return false
      }
      return true
    }
    if (historyRange.start && report.date < historyRange.start) return false
    if (historyRange.end && report.date > historyRange.end) return false
    return true
  })

  const deliveryHistory = useMemo(() => {
    const stationKey = normalizeStationKey(station?.name)
    return [...(productRequests || [])]
      .filter((request) => {
        if (!request) return false
        if (request.stationId === stationId || request.managerId === currentUser?.id) return true
        const requestStationKey = normalizeStationKey(request.stationName || request.station || request.stationLabel)
        return Boolean(stationKey && requestStationKey && requestStationKey === stationKey)
      })
      .filter((request) => {
        if (isStaffOwnStation && historyFilterDate) {
          const eventDate = String(
            request.receivedReportDate ||
              request.receivedAt ||
              request.terminalReviewedAt ||
              request.updatedAt ||
              request.createdAt ||
              '',
          ).slice(0, 10)
          return eventDate === historyFilterDate
        }
        if (!isStaffOwnStation && (historyRange.start || historyRange.end)) {
          const eventDate = String(
            request.receivedReportDate ||
              request.receivedAt ||
              request.terminalReviewedAt ||
              request.updatedAt ||
              request.createdAt ||
              '',
          ).slice(0, 10)
          if (historyRange.start && eventDate < historyRange.start) return false
          if (historyRange.end && eventDate > historyRange.end) return false
        }
        return true
      })
      .sort((a, b) =>
        String(b.receivedAt || b.terminalReviewedAt || b.updatedAt || b.createdAt || '').localeCompare(
          String(a.receivedAt || a.terminalReviewedAt || a.updatedAt || a.createdAt || ''),
        ),
      )
  }, [currentUser?.id, historyFilterDate, historyRange.end, historyRange.start, isStaffOwnStation, productRequests, station?.name, stationId])

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
          const pumpLabel = `${item.label}${item.productType ? ` ${item.productType}` : ''}`
          if (item.noBaseline) {
            return `${pumpLabel}: no baseline`
          }
          const opening = item.opening == null ? '-' : item.opening
          const closing = item.closing == null ? '-' : item.closing
          const tag = item.used ? 'used' : 'unused'
          return `${pumpLabel}: ${opening}-${closing} (${tag})`
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

const getSalesPms = (row) => Number(row.totalSalesLitersPMS ?? row.salesPMS ?? 0)
const getSalesAgo = (row) => Number(row.totalSalesLitersAGO ?? row.salesAGO ?? 0)

const getReportTotalLiters = (row) => getSalesPms(row) + getSalesAgo(row)

  const getSystemSalesFromPumpRows = (row, productType) => {
    const product = String(productType || 'PMS').toUpperCase() === 'AGO' ? 'AGO' : 'PMS'
    const sourceRows = Array.isArray(row?.pumpMeterRows) && row.pumpMeterRows.length
      ? row.pumpMeterRows.filter((item) => item?.used !== false)
      : Array.isArray(row?.pumpReadings)
        ? row.pumpReadings
        : []
    let total = 0
    let count = 0
    for (const item of sourceRows) {
      const itemProduct = String(item?.productType || 'PMS').toUpperCase() === 'AGO' ? 'AGO' : 'PMS'
      if (itemProduct !== product) continue
      const opening = item?.opening ?? item?.start
      const closing = item?.closing ?? item?.end ?? getReadingValue(item)
      const openingNumber = Number(opening)
      const closingNumber = Number(closing)
      if (!Number.isFinite(openingNumber) || !Number.isFinite(closingNumber)) continue
      total += closingNumber - openingNumber
      count += 1
    }
    if (!count) {
      const stored = product === 'AGO'
        ? row?.calculatedSalesLitersAGO ?? row?.pumpSalesLitersAGO ?? row?.totalSalesLitersAGO ?? row?.salesAGO
        : row?.calculatedSalesLitersPMS ?? row?.pumpSalesLitersPMS ?? row?.totalSalesLitersPMS ?? row?.salesPMS
      return Number(stored ?? 0)
    }
    const rtt = product === 'AGO' ? Number(row?.rttAGO || 0) : Number(row?.rttPMS || 0)
    return Math.max(0, total - rtt)
  }

  const getManagerEnteredSales = (row, productType) => {
    const product = String(productType || 'PMS').toUpperCase() === 'AGO' ? 'AGO' : 'PMS'
    return product === 'AGO'
      ? Number(row?.managerEnteredSalesLitersAGO ?? row?.totalSalesLitersAGO ?? row?.salesAGO ?? 0)
      : Number(row?.managerEnteredSalesLitersPMS ?? row?.totalSalesLitersPMS ?? row?.salesPMS ?? 0)
  }

  const getReviewClass = (status) => {
    if (status === 'Reviewed') return 'border-[#a9cd39]/25 bg-[#a9cd39]/10 text-[#a9cd39]'
    if (status === 'Needs Attention') return 'border-amber-400/25 bg-amber-400/10 text-amber-300'
    if (status === 'Escalated') return 'border-red-400/25 bg-red-400/10 text-red-300'
    return 'border-white/10 bg-white/5 text-slate-300'
  }

  const reportsWithReview = useMemo(() => {
    const priorClosings = new Map()
    const enrichedById = new Map()
    for (const report of chronAsc) {
      const pumpRows = buildPumpMeterRows(priorClosings, report.pumpReadings)
      for (const row of pumpRows) {
        if (row.closing != null) {
          const key = getPumpHistoryKey(row.label, row.productType)
          if (key) priorClosings.set(key, { label: row.label, productType: row.productType, closing: row.closing })
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
  const selectedHistoryReport =
    reportsWithReview.find((report) => report.id === selectedHistoryReportId) ||
    reports.find((report) => report.id === selectedHistoryReportId) ||
    null

  const historyInsights = (() => {
    const source = [...filteredReports].sort((a, b) => a.date.localeCompare(b.date))
    const totalReports = source.length
    const totalPms = source.reduce((sum, row) => sum + getSalesPms(row), 0)
    const totalAgo = source.reduce((sum, row) => sum + getSalesAgo(row), 0)
    const totalCashSales = source.reduce((sum, row) => sum + Number(row.cashSales ?? 0), 0)
    const totalBank = source.reduce((sum, row) => sum + getPaymentTotal(row), 0)
    const totalPos = source.reduce((sum, row) => sum + getPosValue(row), 0)
    const totalExpenses = source.reduce((sum, row) => sum + getExpenseTotal(row), 0)
    const reviewedReports = source.filter((row) => row.supervisorReview?.status === 'Reviewed').length
    const reportsWithEod = source.filter((row) => Array.isArray(row.eodAttachments) && row.eodAttachments.length > 0).length
    const flaggedReports = source.filter(
      (row) =>
        row.hasDiscrepancy ||
        (Array.isArray(row.discrepancies) && row.discrepancies.length > 0) ||
        Math.abs(getCashMovementGap(row)) > 0.5,
    ).length
    const highestSalesReport = [...source].sort((a, b) => getReportTotalLiters(b) - getReportTotalLiters(a))[0]
    const lastReport = source[source.length - 1]
    const oldestMissing = getOldestMissingReportDateUpTo(todayIso, reportDatesSet)
    let missingDays = 0
    if (oldestMissing) {
      let cursor = oldestMissing
      while (cursor <= todayIso) {
        if (!reportDatesSet.has(cursor)) missingDays += 1
        cursor = addCalendarDaysIso(cursor, 1)
      }
    }
    const expenseLabels = new Map()
    source.forEach((row) => {
      if (!Array.isArray(row.expenseItems)) return
      row.expenseItems.forEach((item) => {
        const label = String(item.label || 'Other').trim() || 'Other'
        expenseLabels.set(label, (expenseLabels.get(label) || 0) + 1)
      })
    })
    const commonExpense = [...expenseLabels.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'None yet'

    return {
      totalReports,
      totalPms,
      totalAgo,
      totalCashSales,
      totalBank,
      totalPos,
      totalExpenses,
      reviewedReports,
      reportsWithEod,
      flaggedReports,
      highestSalesReport,
      lastReport,
      oldestMissing,
      missingDays,
      commonExpense,
    }
  })()

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
    {
      key: 'eodAttachments',
      header: 'EOD Attachments',
      render: (row) => {
        const attachments = Array.isArray(row.eodAttachments) ? row.eodAttachments : []
        if (!attachments.length) return <span className="text-slate-500">—</span>
        return (
          <div className="flex flex-wrap gap-2">
            {attachments.map((att, i) => (
              <a
                key={i}
                href={att.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-[#a9cd39]/20 bg-[#a9cd39]/5 px-2.5 py-1 text-xs font-medium text-[#a9cd39] hover:bg-[#a9cd39]/15 transition"
              >
                📎 {att.label || `File ${i + 1}`}
              </a>
            ))}
          </div>
        )
      },
    },
    {
      key: 'discrepancyFlag',
      header: 'Flags',
      render: (row) => row.hasDiscrepancy
        ? <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">⚠ Discrepancy</span>
        : <span className="text-slate-500">—</span>,
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
    <div className="space-y-4 mx-auto max-w-4xl">
      <Card>
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <Link
            to="/"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white transition"
            title="Back to home"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#a9cd39]">Report History</p>
            <h2 className="text-xl font-bold text-white truncate">{station.name}</h2>
          </div>
          {reports.length > 0 && (
            <button
              type="button"
              onClick={async () => {
                setExportNotice('')
                if (!filteredReports.length) { setExportNotice(activeHistoryRangeLabel === 'All dates' ? 'No reports to export.' : 'No report in this date range.'); return }
                exportStationHistoryToExcel(station.name, filteredReports)
                await refreshFromSupabase()
              }}
              className="shrink-0 rounded-xl border border-[#a9cd39]/20 bg-[#a9cd39]/5 px-3 py-2 text-xs font-semibold text-[#a9cd39] hover:bg-[#a9cd39]/10 transition"
            >
              Export Excel
            </button>
          )}
        </div>
        <ErrorNotice message={exportNotice} />

        {/* Date filter — only show if there are reports */}
        {reports.length > 0 && (
          <div className="rounded-2xl border border-white/5 bg-white/5 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">
                Filter by date range
              </p>
              <span className="text-xs text-slate-500">
                {filteredReports.length} of {reports.length} report{reports.length !== 1 ? 's' : ''} - {activeHistoryRangeLabel}
              </span>
            </div>

            {isStaffOwnStation ? (
              /* Staff calendar — tap a date card */
              <div className="space-y-2">
                <p className="text-xs text-slate-500">Select a date to view or submit a report for that day</p>
                <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto pr-1">
                  {/* All dates option */}
                  <button
                    type="button"
                    onClick={() => setHistoryFilterDate('')}
                    className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition ${
                      !historyFilterDate
                        ? 'border-[#a9cd39]/40 bg-[#a9cd39]/10 text-[#a9cd39]'
                        : 'border-white/5 bg-white/3 text-slate-300 hover:border-white/10 hover:bg-white/5'
                    }`}
                  >
                    <span className="font-medium">All dates</span>
                    {!historyFilterDate && <span className="text-xs">✓ selected</span>}
                  </button>
                  {staffReportDateSelectOptions.slice().reverse().map(({ iso, submitted, disabled }) => (
                    <button
                      key={iso}
                      type="button"
                      disabled={disabled}
                      onClick={() => !disabled && setHistoryFilterDate(iso)}
                      className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition ${
                        historyFilterDate === iso
                          ? 'border-[#a9cd39]/40 bg-[#a9cd39]/10'
                          : submitted
                            ? 'border-white/5 bg-white/5'
                            : disabled
                              ? 'border-white/3 bg-white/2 opacity-40 cursor-not-allowed'
                              : 'border-amber-500/20 bg-amber-500/5 hover:border-amber-500/30'
                      }`}
                    >
                      <div>
                        <p className={`font-medium ${historyFilterDate === iso ? 'text-[#a9cd39]' : submitted ? 'text-white' : disabled ? 'text-slate-600' : 'text-amber-300'}`}>
                          {formatStaffCalendarDay(iso)}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">{iso}</p>
                      </div>
                      <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                        submitted ? 'bg-[#a9cd39]/15 text-[#a9cd39]'
                        : disabled ? 'bg-white/5 text-slate-600'
                        : 'bg-amber-500/15 text-amber-400'
                      }`}>
                        {submitted ? 'Submitted' : disabled ? 'Locked' : 'Pending'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Admin/supervisor date range picker */
              <div className="flex flex-wrap items-end gap-3">
                <DateRangePicker
                  from={historyRangeFrom}
                  to={historyRangeTo}
                  maxDate={todayIso}
                  label="Date range"
                  emptyLabel="All dates"
                  align="left"
                  onChange={({ from, to }) => {
                    setHistoryRangeFrom(from)
                    setHistoryRangeTo(to)
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Staff catch-up form */}
        {isStaffOwnStation && (
          <div className="mt-5 border-t border-white/5 pt-5">
            {!historyFilterDate ? (
              <p className="text-sm text-slate-500">Select a pending date above to submit a report for that day.</p>
            ) : filterDateAlreadySubmitted ? (
              <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-slate-400">
                ✓ Report already submitted for <span className="font-semibold text-white">{historyFilterDate}</span>.
              </div>
            ) : (
              <StaffClosingReportForm
                key={historyFilterDate}
                stationId={stationId}
                carriedOpening={reportSubmitOpening}
                carriedCashBf={reportSubmitCashBf}
                reportingConfiguration={reportingConfiguration}
                submitReport={submitReport}
                reportDate={historyFilterDate}
                receivedDispatches={deliveryHistory.filter((request) => request.dispatchStatus === 'received')}
                openingBannerTitle="Opening stock for selected date (prior closing)"
                formDisabled={!reportingConfiguration.dailyOpeningStockFormatEnabled}
                submitButtonLabel={`Submit for ${historyFilterDate}`}
                posTerminals={posTerminals}
                onSubmitted={() => refreshFromSupabase()}
              />
            )}
          </div>
        )}
      </Card>

      {reports.length > 0 && (
        <div className="flex flex-wrap gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1">
          {historyTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveHistoryTab(tab.key)}
              className={`flex-1 min-w-[130px] rounded-xl px-3 py-2 text-xs font-black transition ${
                effectiveHistoryTab === tab.key
                  ? 'bg-[#a9cd39]/15 text-[#a9cd39]'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {effectiveHistoryTab === 'dispatch' && (
        deliveryHistory.length > 0 ? (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-[#a9cd39]">Product delivery trail</p>
              <h3 className="text-xl font-bold text-white">Terminal dispatches and received products</h3>
              <p className="mt-1 text-sm text-slate-400">
                Shows product sent to this station, manager receipt, and tank dip after delivery.
              </p>
            </div>
            <span className="rounded-full border border-[#a9cd39]/20 bg-[#a9cd39]/10 px-3 py-1 text-xs font-bold text-[#a9cd39]">
              {deliveryHistory.length} record{deliveryHistory.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {deliveryHistory.map((request) => {
              const status = request.dispatchStatus || request.status || 'requested'
              const statusLabel =
                status === 'received'
                  ? 'Received'
                  : status === 'issue_reported'
                    ? 'Issue reported'
                    : status === 'called_back'
                      ? 'Recalled'
                      : status === 'dispatched'
                        ? 'On the way'
                        : status
              const quantity = Number(request.approvedLiters ?? request.quantity ?? request.liters ?? 0)
              const productType = request.productType || request.product || 'Product'
              const receivedDate = String(request.receivedAt || request.receivedReportDate || '').slice(0, 10)
              const dispatchDate = String(request.terminalReviewedAt || request.updatedAt || request.createdAt || '').slice(0, 10)
              const tankDip = request.receivedTankDip ?? request.tankDipAfterDelivery
              return (
                <div
                  key={request.id}
                  className="rounded-2xl border border-white/10 bg-[#111827]/85 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.18)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{dispatchDate || 'Dispatch'}</p>
                      <h4 className="mt-1 text-lg font-bold text-white">{productType} - {formatLiters(quantity)}</h4>
                    </div>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-bold ${
                        status === 'received'
                          ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
                          : status === 'issue_reported'
                            ? 'border-amber-400/20 bg-amber-400/10 text-amber-300'
                            : status === 'called_back'
                              ? 'border-rose-400/20 bg-rose-400/10 text-rose-300'
                              : 'border-sky-400/20 bg-sky-400/10 text-sky-300'
                      }`}
                    >
                      {statusLabel}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-black/20 px-3 py-2">
                      <p className="text-xs text-slate-500">Truck</p>
                      <p className="text-sm font-bold text-white">{request.truckNumber || '-'}</p>
                    </div>
                    <div className="rounded-xl bg-black/20 px-3 py-2">
                      <p className="text-xs text-slate-500">Driver</p>
                      <p className="text-sm font-bold text-white">{request.truckDriver || '-'}</p>
                    </div>
                    <div className="rounded-xl bg-black/20 px-3 py-2">
                      <p className="text-xs text-slate-500">Tank dip after delivery</p>
                      <p className="text-sm font-bold text-white">{tankDip != null && tankDip !== '' ? formatLiters(tankDip) : '-'}</p>
                    </div>
                    <div className="rounded-xl bg-black/20 px-3 py-2">
                      <p className="text-xs text-slate-500">Report trail</p>
                      <p className="text-sm font-bold text-white">{request.receivedReportDate || receivedDate || 'Not in report yet'}</p>
                    </div>
                  </div>

                  {request.receivedRemark && (
                    <p className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300">
                      {request.receivedRemark}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
        ) : (
          <EmptyState title="No delivery records" message="Terminal dispatch and received-product records for this station will appear here." />
        )
      )}

      {effectiveHistoryTab === 'overview' && (
        reports.length ? (
        filteredReports.length ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                ['Reports', formatNumber(historyInsights.totalReports), `${historyInsights.missingDays} missing`],
                ['PMS sold', formatLiters(historyInsights.totalPms), 'pump readings'],
                ['AGO sold', formatLiters(historyInsights.totalAgo), 'pump readings'],
                ['Cash sales', formatMoney(historyInsights.totalCashSales), 'total reported'],
                ['Bank paid', formatMoney(historyInsights.totalBank), 'lodgements'],
                ['POS', formatMoney(historyInsights.totalPos), 'card payments'],
                ['Expenses', formatMoney(historyInsights.totalExpenses), historyInsights.commonExpense],
                ['Reviewed', `${historyInsights.reviewedReports}/${historyInsights.totalReports}`, `${historyInsights.flaggedReports} flagged`],
              ].map(([label, value, hint]) => (
                <div
                  key={label}
                  className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/8 to-white/[0.03] p-4 shadow-[0_18px_45px_rgba(0,0,0,0.18)]"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
                  <p className="mt-2 text-lg font-bold text-white">{value}</p>
                  <p className="mt-1 text-xs text-slate-400">{hint}</p>
                </div>
              ))}
            </div>
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
            title={deliveryHistory.length ? 'No daily report history' : 'No report history'}
            message={deliveryHistory.length ? 'Product delivery records exist, but this station has not submitted daily reports yet.' : 'This station has not submitted any report entries yet.'}
          />
        )
      )}

      {effectiveHistoryTab === 'reports' && (
        reports.length ? (
        filteredReports.length ? (
            <Card className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-[#a9cd39]">Station timeline</p>
                  <h3 className="text-xl font-bold text-white">Tap any report to open the full breakdown</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    Last report: {historyInsights.lastReport?.date || 'None'}.
                    {historyInsights.highestSalesReport
                      ? ` Best volume: ${historyInsights.highestSalesReport.date} (${formatLiters(getReportTotalLiters(historyInsights.highestSalesReport))}).`
                      : ''}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                  <span className="text-slate-500">EOD attached</span>{' '}
                  <strong className="text-white">{historyInsights.reportsWithEod}/{historyInsights.totalReports}</strong>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {reportsWithReview.map((report) => {
                  const attachmentCount = Array.isArray(report.eodAttachments) ? report.eodAttachments.length : 0
                  const hasFlag =
                    report.hasDiscrepancy ||
                    (Array.isArray(report.discrepancies) && report.discrepancies.length > 0) ||
                    Math.abs(getCashMovementGap(report)) > 0.5
                  return (
                    <button
                      key={report.id}
                      type="button"
                      onClick={() => setSelectedHistoryReportId(report.id)}
                      className="group rounded-2xl border border-white/10 bg-[#111827]/80 p-4 text-left shadow-[0_18px_45px_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5 hover:border-[#a9cd39]/35 hover:bg-[#141d2d]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a9cd39]">{report.date}</p>
                          <h4 className="mt-1 text-lg font-bold text-white">{report.managerName || report.submittedBy || 'Manager report'}</h4>
                        </div>
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getReviewClass(report.reviewStatus)}`}>
                          {report.reviewStatus === '-' ? 'Not reviewed' : report.reviewStatus}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <div className="rounded-xl bg-black/20 px-3 py-2">
                          <p className="text-xs text-slate-500">PMS sold</p>
                          <p className="text-sm font-bold text-white">{formatLiters(getSalesPms(report), 1)}</p>
                        </div>
                        <div className="rounded-xl bg-black/20 px-3 py-2">
                          <p className="text-xs text-slate-500">AGO sold</p>
                          <p className="text-sm font-bold text-white">{formatLiters(getSalesAgo(report), 1)}</p>
                        </div>
                        <div className="rounded-xl bg-black/20 px-3 py-2">
                          <p className="text-xs text-slate-500">Cash sales</p>
                          <p className="text-sm font-bold text-white">{formatMoney(report.cashSales)}</p>
                        </div>
                        <div className="rounded-xl bg-black/20 px-3 py-2">
                          <p className="text-xs text-slate-500">Expenses</p>
                          <p className="text-sm font-bold text-white">{formatMoney(getExpenseTotal(report))}</p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-slate-300">
                          {attachmentCount} EOD file{attachmentCount === 1 ? '' : 's'}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-slate-300">
                          {Array.isArray(report.pumpReadings) ? report.pumpReadings.length : 0} pump line{Array.isArray(report.pumpReadings) && report.pumpReadings.length === 1 ? '' : 's'}
                        </span>
                        {hasFlag && (
                          <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 font-semibold text-amber-300">
                            Needs check
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
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
            title={deliveryHistory.length ? 'No daily report history' : 'No report history'}
            message={deliveryHistory.length ? 'Product delivery records exist, but this station has not submitted daily reports yet.' : 'This station has not submitted any report entries yet.'}
          />
        )
      )}
      {selectedHistoryReport && (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-[#060a12]/95 p-3 backdrop-blur-xl md:p-6">
          <div className="mx-auto max-w-6xl space-y-4">
            <div className="sticky top-0 z-10 -mx-3 border-b border-white/10 bg-[#060a12]/95 px-3 py-3 backdrop-blur-xl md:-mx-6 md:px-6">
              <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-widest text-[#a9cd39]">Full report</p>
                  <h3 className="truncate text-xl font-bold text-white">{station.name} - {selectedHistoryReport.date}</h3>
                  <p className="truncate text-sm text-slate-400">{selectedHistoryReport.managerName || selectedHistoryReport.submittedBy || 'Manager submission'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedHistoryReportId('')}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-xl text-slate-300 transition hover:bg-white/10 hover:text-white"
                  aria-label="Close report"
                >
                  x
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <section className="rounded-3xl border border-white/10 bg-[#101722] p-5 lg:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Stock and sales</p>
                    <h4 className="text-lg font-bold text-white">Product movement</h4>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getReviewClass(selectedHistoryReport.reviewStatus)}`}>
                    {!selectedHistoryReport.reviewStatus || selectedHistoryReport.reviewStatus === '-' ? 'Not reviewed' : selectedHistoryReport.reviewStatus}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                  {[
                    ['Opening PMS', formatLiters(selectedHistoryReport.openingStockPMS ?? selectedHistoryReport.openingPMS)],
                    ['Opening AGO', formatLiters(selectedHistoryReport.openingStockAGO ?? selectedHistoryReport.openingAGO)],
                    ['Closing PMS', formatLiters(getClosingForProduct(selectedHistoryReport, 'pms'))],
                    ['Closing AGO', formatLiters(getClosingForProduct(selectedHistoryReport, 'ago'))],
                    ['Received PMS', formatLiters(selectedHistoryReport.receivedPMS)],
                    ['Received AGO', formatLiters(selectedHistoryReport.receivedAGO)],
                    ['PMS sold', formatLiters(getSalesPms(selectedHistoryReport), 1)],
                    ['AGO sold', formatLiters(getSalesAgo(selectedHistoryReport), 1)],
                    ['RTT PMS', formatLiters(selectedHistoryReport.rttPMS, 1)],
                    ['RTT AGO', formatLiters(selectedHistoryReport.rttAGO, 1)],
                    ['PMS price', `${formatMoney(selectedHistoryReport.pmsPrice)}/L`],
                    ['AGO price', `${formatMoney(selectedHistoryReport.agoPrice)}/L`],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-white/8 bg-black/20 p-3">
                      <p className="text-xs text-slate-500">{label}</p>
                      <p className="mt-1 text-sm font-bold text-white">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-amber-300">Quantity sold check</p>
                      <p className="mt-1 text-sm text-slate-300">System calculated vs manager entered.</p>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {[
                      ['PMS', getSystemSalesFromPumpRows(selectedHistoryReport, 'PMS'), getManagerEnteredSales(selectedHistoryReport, 'PMS'), 'text-[#a9cd39]'],
                      ['AGO', getSystemSalesFromPumpRows(selectedHistoryReport, 'AGO'), getManagerEnteredSales(selectedHistoryReport, 'AGO'), 'text-blue-300'],
                    ].map(([product, system, manager, accent]) => {
                      const diff = Number(system || 0) - Number(manager || 0)
                      return (
                        <div key={`history-quantity-${product}`} className="rounded-2xl border border-white/8 bg-black/20 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{product}</p>
                            <p className={`text-xs font-black ${Math.abs(diff) <= 1 ? 'text-[#a9cd39]' : 'text-amber-300'}`}>
                              Diff {formatLiters(diff, 2)}
                            </p>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <div className="rounded-xl bg-white/[0.04] p-3">
                              <p className="text-[11px] text-slate-500">System</p>
                              <p className={`text-sm font-black ${accent}`}>{formatLiters(system, 2)}</p>
                            </div>
                            <div className="rounded-xl bg-white/[0.04] p-3">
                              <p className="text-[11px] text-slate-500">Manager</p>
                              <p className="text-sm font-black text-white">{formatLiters(manager, 2)}</p>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
                {((selectedHistoryReport.priceBandsPMS || []).length > 0 || (selectedHistoryReport.priceBandsAGO || []).length > 0) && (
                  <div className="mt-4 rounded-2xl border border-white/8 bg-black/20 p-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Price lines</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {(selectedHistoryReport.priceBandsPMS || []).length > 0 && (
                        <div className="space-y-2 rounded-xl bg-white/[0.04] p-3">
                          <p className="text-xs font-bold text-[#a9cd39]">PMS</p>
                          {selectedHistoryReport.priceBandsPMS.map((band, index) => (
                            <div key={`history-pms-band-${index}`} className="flex justify-between gap-3 text-xs text-slate-300">
                              <span>{formatMoney(band.price)}/L x {formatLiters(band.liters)}</span>
                              <span className="font-bold text-white">{formatMoney(Number(band.price || 0) * Number(band.liters || 0))}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {(selectedHistoryReport.priceBandsAGO || []).length > 0 && (
                        <div className="space-y-2 rounded-xl bg-white/[0.04] p-3">
                          <p className="text-xs font-bold text-blue-300">AGO</p>
                          {selectedHistoryReport.priceBandsAGO.map((band, index) => (
                            <div key={`history-ago-band-${index}`} className="flex justify-between gap-3 text-xs text-slate-300">
                              <span>{formatMoney(band.price)}/L x {formatLiters(band.liters)}</span>
                              <span className="font-bold text-white">{formatMoney(Number(band.price || 0) * Number(band.liters || 0))}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-3xl border border-white/10 bg-[#101722] p-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Cash</p>
                <h4 className="text-lg font-bold text-white">Money movement</h4>
                <div className="mt-4 space-y-2">
                  {[
                    ['Cash B/F', formatMoney(selectedHistoryReport.cashBf)],
                    ['Cash sales', formatMoney(selectedHistoryReport.cashSales)],
                    ['Total cash', formatMoney(Number(selectedHistoryReport.cashBf ?? 0) + Number(selectedHistoryReport.cashSales ?? 0))],
                    ['Bank lodgements', formatMoney(getPaymentTotal(selectedHistoryReport))],
                    ['POS', formatMoney(getPosValue(selectedHistoryReport))],
                    ['Closing cash', formatMoney(selectedHistoryReport.closingBalance)],
                    ['Variance', formatMoney(getCashMovementGap(selectedHistoryReport))],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-3 rounded-xl bg-black/20 px-3 py-2">
                      <span className="text-sm text-slate-400">{label}</span>
                      <strong className="text-sm text-white">{value}</strong>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <section className="rounded-3xl border border-white/10 bg-[#101722] p-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Pump readings</p>
                <h4 className="text-lg font-bold text-white">Meters used for sales</h4>
                <div className="mt-4 space-y-2">
                  {(Array.isArray(selectedHistoryReport.pumpMeterRows) && selectedHistoryReport.pumpMeterRows.length
                    ? selectedHistoryReport.pumpMeterRows
                    : selectedHistoryReport.pumpReadings || []
                  ).map((item, index) => {
                    const label = item.label || `Pump ${index + 1}`
                    const opening = item.opening ?? item.start ?? '-'
                    const closing = item.closing ?? item.end ?? getReadingValue(item) ?? '-'
                    const sold = item.delta != null ? item.delta : Number(closing) - Number(opening)
                    return (
                      <div key={`${label}-${index}`} className="rounded-2xl border border-white/8 bg-black/20 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-semibold text-white">{label}</p>
                          {item.productType && (
                            <span className="rounded-full border border-[#a9cd39]/20 bg-[#a9cd39]/10 px-2 py-0.5 text-xs font-semibold text-[#a9cd39]">
                              {item.productType}
                            </span>
                          )}
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                          <div>
                            <p className="text-xs text-slate-500">Opening</p>
                            <p className="font-bold text-white">{opening}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Closing</p>
                            <p className="font-bold text-white">{closing}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Sold</p>
                            <p className="font-bold text-white">{Number.isFinite(sold) ? formatLiters(sold, 1) : '-'}</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {(!selectedHistoryReport.pumpReadings || selectedHistoryReport.pumpReadings.length === 0) &&
                    (!selectedHistoryReport.pumpMeterRows || selectedHistoryReport.pumpMeterRows.length === 0) && (
                      <p className="rounded-2xl border border-white/8 bg-black/20 p-4 text-sm text-slate-400">No pump readings recorded.</p>
                    )}
                </div>
              </section>

              <section className="rounded-3xl border border-white/10 bg-[#101722] p-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Expenses</p>
                <h4 className="text-lg font-bold text-white">Expense breakdown</h4>
                <div className="mt-4 space-y-2">
                  {Array.isArray(selectedHistoryReport.expenseItems) && selectedHistoryReport.expenseItems.length ? (
                    selectedHistoryReport.expenseItems.map((item, index) => (
                      <div key={`${item.label}-${index}`} className="flex items-center justify-between gap-3 rounded-xl bg-black/20 px-3 py-2">
                        <span className="text-sm text-slate-300">{item.label || `Expense ${index + 1}`}</span>
                        <strong className="text-sm text-white">{formatMoney(item.amount)}</strong>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-2xl border border-white/8 bg-black/20 p-4 text-sm text-slate-400">
                      {selectedHistoryReport.expenseDescription || 'No expenses recorded.'}
                    </p>
                  )}
                  <div className="mt-3 rounded-2xl border border-[#a9cd39]/20 bg-[#a9cd39]/10 p-3">
                    <p className="text-xs text-[#a9cd39]">Total expense</p>
                    <p className="text-lg font-bold text-white">{formatMoney(getExpenseTotal(selectedHistoryReport))}</p>
                  </div>
                </div>
              </section>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <section className="rounded-3xl border border-white/10 bg-[#101722] p-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Bank, POS and EOD</p>
                <h4 className="text-lg font-bold text-white">Payments and evidence</h4>
                <div className="mt-4 space-y-2">
                  {Array.isArray(selectedHistoryReport.paymentBreakdown) && selectedHistoryReport.paymentBreakdown.length ? (
                    selectedHistoryReport.paymentBreakdown.map((item, index) => (
                      <div key={`${item.channel}-${index}`} className="flex items-center justify-between gap-3 rounded-xl bg-black/20 px-3 py-2">
                        <span className="text-sm text-slate-300">{item.channel || `Bank ${index + 1}`}</span>
                        <strong className="text-sm text-white">{formatMoney(item.amount)}</strong>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-2xl border border-white/8 bg-black/20 p-4 text-sm text-slate-400">No bank lodgement recorded.</p>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {Array.isArray(selectedHistoryReport.eodAttachments) && selectedHistoryReport.eodAttachments.length ? (
                    selectedHistoryReport.eodAttachments.map((att, index) => (
                      <a
                        key={`${att.url || att.fileName}-${index}`}
                        href={att.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl border border-[#a9cd39]/20 bg-[#a9cd39]/10 px-3 py-2 text-sm font-semibold text-[#a9cd39] transition hover:bg-[#a9cd39]/15"
                      >
                        {att.label || att.category || `EOD file ${index + 1}`}
                      </a>
                    ))
                  ) : (
                    <span className="rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-slate-400">No EOD files attached.</span>
                  )}
                </div>
              </section>

              <section className="rounded-3xl border border-white/10 bg-[#101722] p-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Notes</p>
                <h4 className="text-lg font-bold text-white">Remarks and review</h4>
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
                    <p className="text-xs text-slate-500">Manager remark</p>
                    <p className="mt-1 text-sm text-white">{selectedHistoryReport.remark || selectedHistoryReport.remarks || 'No remark added.'}</p>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
                    <p className="text-xs text-slate-500">Supervisor note</p>
                    <p className="mt-1 text-sm text-white">{selectedHistoryReport.supervisorNote || 'No supervisor note yet.'}</p>
                    <p className="mt-2 text-xs text-slate-500">Reviewed by: {selectedHistoryReport.reviewedBy || '-'}</p>
                  </div>
                  {isSupervisor && reportingConfiguration.supervisorReviewWorkflowEnabled && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedReportId(selectedHistoryReport.id)
                        setSelectedHistoryReportId('')
                        setIsReviewModalOpen(true)
                      }}
                      className="w-full rounded-2xl border border-[#a9cd39]/25 bg-[#a9cd39]/10 px-4 py-3 text-sm font-bold text-[#a9cd39] transition hover:bg-[#a9cd39]/15"
                    >
                      Review this report
                    </button>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
      {effectiveHistoryTab === 'review' && isSupervisor && reports.length > 0 && reportingConfiguration.supervisorReviewWorkflowEnabled && (
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
                className="w-full rounded-xl border border-white/10 bg-[#0d1220] px-3 py-2 text-white outline-none focus:border-[#a9cd39]/40"
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
                      className="w-full rounded-xl border border-white/10 bg-[#0d1220] px-3 py-2 text-white outline-none focus:border-[#a9cd39]/40"
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

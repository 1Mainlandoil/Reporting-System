import { useEffect, useMemo, useState } from 'react'
import Card from '../components/ui/Card'
import StaffClosingReportForm from '../components/staff/StaffClosingReportForm'
import LpgReportForm from '../components/staff/LpgReportForm'
import { useAppStore } from '../store/useAppStore'
import { getClosingForProduct, getPumpHistoryKey, normalizePumpProductType } from '../utils/reportFields'
import { formatStaffCalendarDay, getDailyReportPendingInfo, getOldestMissingReportDateUpTo, listMissedReportDatesInclusive } from '../utils/reportPending'
import { getReportingDateIso } from '../utils/dateFormat'

const normalizeStationKey = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

const StaffDashboardPage = () => {
  const currentUser = useAppStore((state) => state.currentUser)
  const stations = useAppStore((state) => state.stations)
  const submitReport = useAppStore((state) => state.submitReport)
  const refreshFromSupabase = useAppStore((state) => state.refreshFromSupabase)
  const reports = useAppStore((state) => state.reports)
  const productRequests = useAppStore((state) => state.productRequests)
  const confirmDispatchReceived = useAppStore((state) => state.confirmDispatchReceived)
  const reportDispatchIssue = useAppStore((state) => state.reportDispatchIssue)
  const markReceivedDispatchesReported = useAppStore((state) => state.markReceivedDispatchesReported)
  const reportingConfiguration = useAppStore((state) => state.appSettings.reportingConfiguration)
  const rejectedReports = useAppStore((state) => state.rejectedReports)

  const todayIso = getReportingDateIso()

  const stationReportDates = useMemo(() => {
    const sid = currentUser?.stationId
    if (!sid) return new Set()
    const dates = new Set()
    for (const report of reports) {
      if (report.stationId === sid && (report.reportType || 'fuel') !== 'lpg' && report.date) dates.add(report.date)
    }
    return dates
  }, [reports, currentUser?.stationId])

  const isFirstReport = useMemo(() => {
    const sid = currentUser?.stationId
    if (!sid) return false
    return !reports.some((r) => r.stationId === sid && (r.reportType || 'fuel') !== 'lpg')
  }, [reports, currentUser?.stationId])

  const pastCatchUpNeeded = useMemo(() => {
    const oldest = getOldestMissingReportDateUpTo(todayIso, stationReportDates)
    return Boolean(oldest && oldest < todayIso)
  }, [todayIso, stationReportDates])

  const submissionReminder = useMemo(() => {
    const sid = currentUser?.stationId
    if (!sid) return null
    const info = getDailyReportPendingInfo(todayIso, stationReportDates)
    if (info.pendingDays === 0 && !info.noPriorSubmissions) return null
    if (info.noPriorSubmissions) return { shortLine: 'First report due.' }
    const missedDates = listMissedReportDatesInclusive(info.firstMissingIso, todayIso)
    const n = missedDates.length
    return { shortLine: n === 1 ? 'One day missing.' : `${n} days missing.` }
  }, [currentUser?.stationId, stationReportDates, todayIso])

  const backlogDates = useMemo(() => {
    const oldest = getOldestMissingReportDateUpTo(todayIso, stationReportDates)
    if (!oldest) return []
    return listMissedReportDatesInclusive(oldest, todayIso).filter((date) => !stationReportDates.has(date))
  }, [stationReportDates, todayIso])

  const earliestBacklogDate = backlogDates[0] || ''
  const availableReportDate = earliestBacklogDate || (stationReportDates.has(todayIso) ? '' : todayIso)
  const [reportStarted, setReportStarted] = useState(false)
  const [reportMode, setReportMode] = useState('fuel')
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [receiveTarget, setReceiveTarget] = useState(null)
  const [receiveDraft, setReceiveDraft] = useState({ tankDip: '', remark: '' })
  const [receiveSubmitting, setReceiveSubmitting] = useState(false)
  const [issueTarget, setIssueTarget] = useState(null)
  const [issueReason, setIssueReason] = useState('')
  const lpgReportDates = useMemo(() => {
    const sid = currentUser?.stationId
    if (!sid) return new Set()
    return new Set(reports.filter((report) => report.stationId === sid && report.reportType === 'lpg' && report.date).map((report) => report.date))
  }, [currentUser?.stationId, reports])
  const fuelReportDates = useMemo(() => {
    const sid = currentUser?.stationId
    if (!sid) return new Set()
    return new Set(reports.filter((report) => report.stationId === sid && (report.reportType || 'fuel') !== 'lpg' && report.date).map((report) => report.date))
  }, [currentUser?.stationId, reports])
  const selectedReportDates = reportMode === 'lpg' ? lpgReportDates : fuelReportDates
  const selectedOldest = getOldestMissingReportDateUpTo(todayIso, selectedReportDates)
  const selectedBacklogDates = selectedOldest ? listMissedReportDatesInclusive(selectedOldest, todayIso).filter((date) => !selectedReportDates.has(date)) : []
  const selectedActiveReportDate = selectedBacklogDates[0] || (selectedReportDates.has(todayIso) ? '' : todayIso)
  const activeReportDate = selectedActiveReportDate

  useEffect(() => {
    setReportStarted(false)
  }, [activeReportDate, reportMode])

  useEffect(() => {
    if (currentUser?.stationId) {
      refreshFromSupabase()
    }
  }, [currentUser?.stationId, refreshFromSupabase])

  const recentSevenStats = useMemo(() => {
    let completed = 0
    const days = []
    for (let i = 6; i >= 0; i -= 1) {
      const date = new Date(`${todayIso}T00:00:00Z`)
      date.setUTCDate(date.getUTCDate() - i)
      const iso = date.toISOString().slice(0, 10)
      days.push(iso)
      if (stationReportDates.has(iso)) completed += 1
    }
    return { completed, total: days.length, days }
  }, [stationReportDates, todayIso])

  const managerRating = useMemo(() => {
    const sid = currentUser?.stationId
    if (!sid) {
      return {
        overall: 0,
        label: 'No station',
        tone: 'text-slate-300 bg-slate-500/10 border-slate-400/15',
        metrics: [
          ['Compliance', 0],
          ['Accuracy', 0],
          ['EOD', 0],
          ['Review', 0],
        ],
      }
    }

    const recentReports = reports.filter((report) => (
      report.stationId === sid
      && (report.reportType || 'fuel') !== 'lpg'
      && recentSevenStats.days.includes(report.date)
    ))

    const compliance = backlogDates.length === 0
      ? 100
      : Math.round((recentSevenStats.completed / Math.max(recentSevenStats.total, 1)) * 100)

    const discrepancyHits = recentReports.reduce((sum, report) => {
      const discrepancyCount = Array.isArray(report.discrepancies) ? report.discrepancies.length : 0
      return sum + (report.hasDiscrepancy || discrepancyCount > 0 ? 1 : 0)
    }, 0)

    const meterGapHits = recentReports.reduce((sum, report) => {
      const pmsGap = Math.abs(Number(report.pumpSalesLitersPMS || 0) - Number(report.dipSalesLitersPMS || 0))
      const agoGap = Math.abs(Number(report.pumpSalesLitersAGO || 0) - Number(report.dipSalesLitersAGO || 0))
      return sum + (pmsGap > 10 || agoGap > 10 ? 1 : 0)
    }, 0)

    const accuracy = recentReports.length
      ? Math.max(0, 100 - (discrepancyHits * 12) - (meterGapHits * 8))
      : 100

    const evidenceRequired = recentReports.filter((report) => (
      Number(report.totalPaymentDeposits || 0) > 0
      || Number(report.expenseAmount || 0) > 0
    ))
    const evidenceComplete = evidenceRequired.filter((report) => Array.isArray(report.eodAttachments) && report.eodAttachments.length > 0)
    const eod = evidenceRequired.length
      ? Math.round((evidenceComplete.length / evidenceRequired.length) * 100)
      : 100

    const reviewedReports = recentReports.filter((report) => report.supervisorReview?.status)
    const approvedReviews = reviewedReports.filter((report) => {
      const status = String(report.supervisorReview?.status || '').toLowerCase()
      return status.includes('review') || status.includes('good') || status.includes('approved')
    })
    const review = reviewedReports.length
      ? Math.round((approvedReviews.length / reviewedReports.length) * 100)
      : 100

    const overall = Math.round((compliance * 0.35) + (accuracy * 0.35) + (eod * 0.15) + (review * 0.15))
    const label = overall >= 90 ? 'Excellent' : overall >= 75 ? 'Good' : overall >= 60 ? 'Watch' : 'Needs work'
    const tone = overall >= 90
      ? 'border-[#a9cd39]/25 bg-[#a9cd39]/10 text-[#a9cd39]'
      : overall >= 75
        ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
        : overall >= 60
          ? 'border-amber-400/20 bg-amber-400/10 text-amber-300'
          : 'border-[#c4151d]/25 bg-[#c4151d]/10 text-red-300'

    return {
      overall,
      label,
      tone,
      metrics: [
        ['Compliance', compliance],
        ['Accuracy', accuracy],
        ['EOD', eod],
        ['Review', review],
      ],
    }
  }, [backlogDates.length, currentUser?.stationId, recentSevenStats, reports])

  const calendarDays = useMemo(() => {
    const baseIso = activeReportDate || todayIso
    const [year, month] = baseIso.split('-').map(Number)
    const firstDay = new Date(Date.UTC(year, month - 1, 1))
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
    const days = Array.from({ length: firstDay.getUTCDay() }, () => null)
    for (let day = 1; day <= daysInMonth; day += 1) {
      const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      days.push({
        iso,
        day,
        active: iso === activeReportDate,
        submitted: selectedReportDates.has(iso),
        locked: selectedBacklogDates.includes(iso) && iso !== selectedBacklogDates[0],
        future: iso > todayIso,
      })
    }
    return days
  }, [activeReportDate, selectedBacklogDates, selectedReportDates, todayIso])

  const calendarLabel = useMemo(() => {
    const baseIso = activeReportDate || todayIso
    const [year, month] = baseIso.split('-').map(Number)
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    })
  }, [activeReportDate, todayIso])

  const priorReport = useMemo(() => {
    const sid = currentUser?.stationId
    if (!sid) return null
    return [...reports]
      .filter((r) => r.stationId === sid && r.date < activeReportDate && (r.reportType || 'fuel') !== 'lpg')
      .sort((a, b) => b.date.localeCompare(a.date))[0] || null
  }, [activeReportDate, reports, currentUser?.stationId])

  const lpgPriorReport = useMemo(() => {
    const sid = currentUser?.stationId
    if (!sid) return null
    return [...reports]
      .filter((r) => r.stationId === sid && r.date < activeReportDate && r.reportType === 'lpg')
      .sort((a, b) => b.date.localeCompare(a.date))[0] || null
  }, [activeReportDate, reports, currentUser?.stationId])

  const lpgCarriedOpeningKg = useMemo(() => Number(lpgPriorReport?.lpgReport?.closingStockKg || 0), [lpgPriorReport])
  const lpgCarriedCashBf = useMemo(() => Number(lpgPriorReport?.closingBalance || lpgPriorReport?.lpgReport?.closingBalance || 0), [lpgPriorReport])
  const lpgCarriedMeterClosings = useMemo(() => {
    const meterLines = lpgPriorReport?.lpgReport?.meterLines || []
    const map = {}
    for (const line of meterLines) {
      if (line?.label && line.closing != null) map[line.label] = Number(line.closing)
    }
    return map
  }, [lpgPriorReport])

  const carriedOpening = useMemo(() => {
    if (!priorReport) return { pms: 0, ago: 0 }
    return { pms: getClosingForProduct(priorReport, 'pms'), ago: getClosingForProduct(priorReport, 'ago') }
  }, [priorReport])

  const carriedCashBf = useMemo(() => Number(priorReport?.closingBalance || 0), [priorReport])

  const priorPrices = useMemo(() => ({
    pms: Number(priorReport?.pmsPrice || 0),
    ago: Number(priorReport?.agoPrice || 0),
    date: priorReport?.date || '',
  }), [priorReport])

  // Per-pump last closing: { [label]: { closing, date } } — scans ALL history not just yesterday
  const pumpLastClosings = useMemo(() => {
    const sid = currentUser?.stationId
    if (!sid) return {}
    const sorted = [...reports]
      .filter((r) => r.stationId === sid && r.date < activeReportDate && (r.reportType || 'fuel') !== 'lpg' && Array.isArray(r.pumpReadings))
      .sort((a, b) => a.date.localeCompare(b.date))
    const map = {}
    for (const r of sorted) {
      for (const p of r.pumpReadings) {
        if (p?.label && p.closing != null) {
          const productType = normalizePumpProductType(p.productType)
          const key = getPumpHistoryKey(p.label, productType)
          if (key) {
            map[key] = { closing: Number(p.closing), date: r.date, productType }
          }
        }
      }
    }
    return map
  }, [activeReportDate, reports, currentUser?.stationId])

  const activeDispatches = useMemo(() => {
    const sid = currentUser?.stationId
    if (!sid) return []
    const currentStation = stations.find((station) => station.id === sid)
    const managerKeys = new Set([
      normalizeStationKey(sid),
      normalizeStationKey(currentStation?.name),
    ].filter(Boolean))
    const matchesManagerStation = (request) => {
      const requestStation = stations.find((station) => station.id === request.stationId)
      return [
        normalizeStationKey(request.stationId),
        normalizeStationKey(requestStation?.name),
      ].some((key) => managerKeys.has(key))
    }
    return productRequests
      .filter((request) => matchesManagerStation(request) && request.dispatchStatus === 'dispatched')
      .sort((a, b) => new Date(b.terminalReviewedAt || b.updatedAt || 0) - new Date(a.terminalReviewedAt || a.updatedAt || 0))
  }, [currentUser?.stationId, productRequests, stations])

  const receivedDispatchesForReport = useMemo(() => {
    const sid = currentUser?.stationId
    if (!sid || !activeReportDate) return []
    const currentStation = stations.find((station) => station.id === sid)
    const managerKeys = new Set([
      normalizeStationKey(sid),
      normalizeStationKey(currentStation?.name),
    ].filter(Boolean))
    const matchesManagerStation = (request) => {
      const requestStation = stations.find((station) => station.id === request.stationId)
      return [
        normalizeStationKey(request.stationId),
        normalizeStationKey(requestStation?.name),
      ].some((key) => managerKeys.has(key))
    }
    return productRequests
      .filter((request) => {
        if (!matchesManagerStation(request) || request.dispatchStatus !== 'received' || request.receivedReportId) return false
        const receivedDate = request.receivedAt?.split('T')[0] || ''
        return receivedDate && receivedDate <= activeReportDate
      })
      .sort((a, b) => new Date(a.receivedAt || 0) - new Date(b.receivedAt || 0))
  }, [activeReportDate, currentUser?.stationId, productRequests, stations])

  const submitDispatchIssue = () => {
    if (!issueTarget) return
    if (!String(issueReason || '').trim()) {
      window.alert('Enter the issue with this dispatch.')
      return
    }
    reportDispatchIssue({ requestId: issueTarget.id, reason: issueReason })
    setIssueTarget(null)
    setIssueReason('')
  }

  const submitDispatchReceived = async () => {
    if (!receiveTarget) return
    const tankDip = Number(receiveDraft.tankDip || 0)
    if (tankDip <= 0) {
      window.alert('Enter tank dip after delivery.')
      return
    }
    setReceiveSubmitting(true)
    const result = await confirmDispatchReceived({
      requestId: receiveTarget.id,
      tankDip,
      remark: receiveDraft.remark,
    }).finally(() => setReceiveSubmitting(false))
    if (result?.ok === false) {
      window.alert(result.message || 'Could not save received product confirmation.')
      return
    }
    setReceiveTarget(null)
    setReceiveDraft({ tankDip: '', remark: '' })
  }

  const historyPath = currentUser?.stationId ? `/stations/${currentUser.stationId}/history` : '/staff/report'

  const pendingRejections = rejectedReports.filter(
    (r) => r.stationId === currentUser?.stationId && !stationReportDates.has(r.date),
  )

  return (
    <div className="mx-auto flex min-h-[calc(100vh-96px)] max-w-3xl flex-col space-y-3">
      {pendingRejections.map((rej) => (
        <div key={`${rej.stationId}-${rej.date}`} className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-4">
          <p className="text-xs font-black uppercase tracking-widest text-red-400 mb-1">Report Rejected</p>
          <p className="text-sm font-semibold text-white">
            Your report for <span className="text-red-300">{rej.date}</span> was rejected by {rej.rejectedBy || 'your supervisor'}
          </p>
          {rej.reason && (
            <p className="mt-1 text-sm text-slate-300">Reason: {rej.reason}</p>
          )}
          <p className="mt-2 text-xs text-slate-400">Please fill and resubmit your report for this date.</p>
        </div>
      ))}
      {!currentUser?.stationId && (
        <Card>
          <p className="text-sm font-semibold text-white">Station assignment required</p>
          <p className="mt-1 text-sm text-slate-400">
            Your account is not linked to a retail station. Ask an administrator to assign you.
          </p>
        </Card>
      )}

      {!reportStarted && activeDispatches.length > 0 && (
        <Card className="border-[#a9cd39]/20 bg-[#a9cd39]/5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a9cd39]">Product dispatch</p>
          <h3 className="mt-1 text-lg font-black text-white">Product is on the way to your station</h3>
          <p className="mt-1 text-sm text-slate-400">Confirm only after the truck arrives and delivery is completed.</p>
          <div className="mt-4 space-y-3">
            {activeDispatches.map((dispatch) => (
              <div key={dispatch.id} className="rounded-2xl border border-white/10 bg-slate-900 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-black text-white">
                      {dispatch.approvedProductType || dispatch.requestedProductType} - {Math.round(Number(dispatch.approvedLiters || dispatch.requestedLiters || 0)).toLocaleString()} L
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Truck: {dispatch.truckNumber || '-'} | Driver: {dispatch.truckDriver || '-'}
                    </p>
                    {dispatch.terminalReviewedAt ? (
                      <p className="mt-1 text-xs text-slate-500">
                        Dispatched {dispatch.terminalReviewedAt.split('T')[0]}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setReceiveTarget(dispatch)
                        setReceiveDraft({ tankDip: '', remark: '' })
                      }}
                      className="rounded-xl bg-[#a9cd39] px-4 py-2 text-sm font-black text-black"
                    >
                      Received?
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIssueTarget(dispatch)
                        setIssueReason('')
                      }}
                      className="rounded-xl border border-[#c4151d]/30 bg-[#c4151d]/10 px-4 py-2 text-sm font-bold text-red-200"
                    >
                      Report issue
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {!reportStarted && (
        <Card className="relative flex min-h-[calc(100vh-112px)] flex-1 overflow-hidden p-4 sm:min-h-[560px] sm:p-5">
          <div className="pointer-events-none absolute -right-12 -top-16 h-36 w-36 rounded-full bg-[#a9cd39]/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-16 h-40 w-40 rounded-full bg-[#c4151d]/10 blur-3xl" />

          <div className="relative flex w-full flex-col">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a9cd39]">Manager Desk</p>
              <h2 className="mt-1 text-xl font-semibold text-white">Welcome back</h2>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                ['Completed', `${recentSevenStats.completed}/${recentSevenStats.total} days`, 'text-white'],
                ['Due', backlogDates.length ? `${backlogDates.length} missing` : stationReportDates.has(todayIso) ? '0 missing' : 'Report day', backlogDates.length ? 'text-amber-300' : 'text-[#a9cd39]'],
                ['Action', backlogDates.length ? 'Oldest first' : stationReportDates.has(todayIso) ? 'Up to date' : 'Submit prior day', 'text-[#a9cd39]'],
              ].map(([label, value, color]) => (
                <div key={label} className="min-w-0 rounded-xl border border-white/5 bg-black/20 p-2.5 shadow-inner shadow-white/5">
                  <p className="truncate text-[11px] text-slate-400">{label}</p>
                  <p className={`mt-0.5 text-sm font-black leading-tight sm:text-base ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-auto rounded-2xl border border-white/8 bg-white/5 p-3">
              <div className="mb-3 rounded-2xl border border-white/8 bg-black/25 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Manager rating</p>
                    <p className="mt-1 text-3xl font-black leading-none text-white">{managerRating.overall}%</p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-black ${managerRating.tone}`}>
                    {managerRating.label}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-1.5">
                  {managerRating.metrics.map(([label, value]) => (
                    <div key={label} className="min-w-0 rounded-xl border border-white/5 bg-white/[0.04] px-2 py-2 text-center">
                      <p className="truncate text-[10px] font-semibold text-slate-400">{label}</p>
                      <p className="mt-0.5 text-sm font-black text-white">{value}%</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-3 grid grid-cols-2 gap-2 rounded-2xl border border-white/8 bg-black/20 p-1">
                {[
                  ['fuel', 'PMS/AGO Reporting'],
                  ['lpg', 'LPG Reporting'],
                ].map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => { setReportMode(mode); setReportStarted(false) }}
                    className={`rounded-xl px-3 py-3 text-xs font-black transition ${
                      reportMode === mode ? 'bg-[#a9cd39] text-black' : 'text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setCalendarOpen(true)}
                className="w-full rounded-2xl border border-[#a9cd39]/15 bg-[#a9cd39]/5 p-4 text-center transition hover:bg-[#a9cd39]/10"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a9cd39]">Report date</p>
                <p className="mt-2 text-2xl font-black text-white">{activeReportDate || 'No due date'}</p>
                <p className="mt-1 text-sm text-slate-400">
                  {activeReportDate
                    ? selectedBacklogDates.length
                      ? 'Oldest missing report'
                      : 'Ready for submission'
                    : 'All caught up'}
                </p>
                {activeReportDate && (
                  <p className="mt-2 text-xs text-slate-500">{formatStaffCalendarDay(activeReportDate)}</p>
                )}
              </button>
              <button
                type="button"
                disabled={!activeReportDate}
                onClick={() => setReportStarted(true)}
                className="mt-3 w-full rounded-xl bg-[#a9cd39] px-4 py-4 text-sm font-black text-black shadow-lg shadow-[#a9cd39]/20 transition hover:bg-[#bde14d] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {activeReportDate ? 'Start Report' : 'No report due'}
              </button>
            </div>
          </div>
        </Card>
      )}

      {reportStarted && (
      <Card>
        {reportMode === 'lpg' ? (
          <LpgReportForm
            key={`lpg-${activeReportDate}`}
            stationId={currentUser?.stationId}
            reportDate={activeReportDate}
            submitReport={submitReport}
            onSubmitted={() => refreshFromSupabase()}
            carriedOpeningKg={lpgCarriedOpeningKg}
            carriedCashBf={lpgCarriedCashBf}
            carriedMeterClosings={lpgCarriedMeterClosings}
          />
        ) : (
          <StaffClosingReportForm
            key={`fuel-${activeReportDate}`}
            stationId={currentUser?.stationId}
            carriedOpening={carriedOpening}
            carriedCashBf={carriedCashBf}
            isFirstReport={isFirstReport}
            priorPrices={priorPrices}
            pumpLastClosings={pumpLastClosings}
            receivedDispatches={receivedDispatchesForReport}
            submissionReminder={submissionReminder}
            pastCatchUpNeeded={pastCatchUpNeeded}
            historyPath={historyPath}
            reportDate={activeReportDate}
            reportingConfiguration={reportingConfiguration}
            submitReport={submitReport}
            formDisabled={!reportingConfiguration.dailyOpeningStockFormatEnabled || !activeReportDate}
            onSubmitted={(result) => {
              if (result?.reportId && receivedDispatchesForReport.length) {
                markReceivedDispatchesReported({
                  requestIds: receivedDispatchesForReport.map((request) => request.id),
                  reportId: result.reportId,
                  reportDate: activeReportDate,
                })
              }
              refreshFromSupabase()
            }}
          />
        )}
      </Card>
      )}

      {calendarOpen && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0d1220] p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a9cd39]">Report Calendar</p>
                <p className="text-lg font-bold text-white">{calendarLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => setCalendarOpen(false)}
                className="rounded-lg border border-white/10 px-3 py-2 text-sm font-bold text-slate-300"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-slate-500">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-1">
              {calendarDays.map((item, index) => (
                item ? (
                  <div
                    key={item.iso}
                    className={`flex aspect-square items-center justify-center rounded-lg border text-xs font-black ${
                      item.active
                        ? 'border-[#a9cd39] bg-[#a9cd39] text-black'
                        : item.submitted
                          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                          : item.locked
                            ? 'border-amber-500/20 bg-amber-500/10 text-amber-300'
                            : item.future
                              ? 'border-white/5 bg-white/3 text-slate-700'
                              : 'border-white/5 bg-white/5 text-slate-400'
                    }`}
                  >
                    {item.day}
                  </div>
                ) : (
                  <div key={`blank-${index}`} className="aspect-square" />
                )
              ))}
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              <span className="rounded-full bg-[#a9cd39]/10 px-2 py-1 font-semibold text-[#a9cd39]">Active</span>
              <span className="rounded-full bg-emerald-500/10 px-2 py-1 font-semibold text-emerald-300">Submitted</span>
              <span className="rounded-full bg-amber-500/10 px-2 py-1 font-semibold text-amber-300">Locked</span>
            </div>
          </div>
        </div>
      )}

      {issueTarget && (
        <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0d1220] p-4 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-300">Report issue</p>
            <h3 className="mt-1 text-lg font-black text-white">
              {issueTarget.approvedProductType || issueTarget.requestedProductType} - {Math.round(Number(issueTarget.approvedLiters || issueTarget.requestedLiters || 0)).toLocaleString()} L
            </h3>
            <p className="mt-2 text-sm text-slate-400">
              Tell terminal/admin what is wrong with this dispatch.
            </p>
            <textarea
              value={issueReason}
              onChange={(event) => setIssueReason(event.target.value)}
              rows={4}
              className="mt-4 w-full resize-none rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-semibold text-white outline-none focus:border-red-300/60"
              placeholder="e.g. Truck has not arrived, quantity differs, wrong product..."
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={submitDispatchIssue}
                className="flex-1 rounded-xl bg-[#c4151d] px-4 py-3 text-sm font-black text-white"
              >
                Send issue
              </button>
              <button
                type="button"
                onClick={() => {
                  setIssueTarget(null)
                  setIssueReason('')
                }}
                className="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-slate-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {receiveTarget && (
        <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0d1220] p-4 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a9cd39]">Confirm receipt</p>
            <h3 className="mt-1 text-lg font-black text-white">
              {receiveTarget.approvedProductType || receiveTarget.requestedProductType} - {Math.round(Number(receiveTarget.approvedLiters || receiveTarget.requestedLiters || 0)).toLocaleString()} L
            </h3>
            <p className="mt-2 text-sm text-slate-400">
              Enter tank dip after the truck finishes delivery.
            </p>
            <label className="mt-4 block space-y-1">
              <span className="text-sm font-semibold text-slate-300">Tank dip after delivery</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={receiveDraft.tankDip}
                onChange={(event) => setReceiveDraft((prev) => ({ ...prev, tankDip: event.target.value }))}
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-semibold text-white outline-none focus:border-[#a9cd39]/60"
                placeholder="e.g. 49900"
              />
            </label>
            <label className="mt-3 block space-y-1">
              <span className="text-sm font-semibold text-slate-300">Remark</span>
              <textarea
                value={receiveDraft.remark}
                onChange={(event) => setReceiveDraft((prev) => ({ ...prev, remark: event.target.value }))}
                rows={3}
                className="w-full resize-none rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-semibold text-white outline-none focus:border-[#a9cd39]/60"
                placeholder="Optional note"
              />
            </label>
            <div className="mt-4 rounded-xl border border-[#a9cd39]/20 bg-[#a9cd39]/10 p-3 text-sm font-semibold text-[#a9cd39]">
              This locks the dispatch as received and blocks callback.
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={submitDispatchReceived}
                className="flex-1 rounded-xl bg-[#a9cd39] px-4 py-3 text-sm font-black text-black"
              >
                Save receipt
              </button>
              <button
                type="button"
                onClick={() => {
                  setReceiveTarget(null)
                  setReceiveDraft({ tankDip: '', remark: '' })
                }}
                className="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-slate-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default StaffDashboardPage

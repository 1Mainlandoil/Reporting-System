import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import Card from '../components/ui/Card'
import StaffClosingReportForm from '../components/staff/StaffClosingReportForm'
import { useAppStore } from '../store/useAppStore'
import { getClosingForProduct } from '../utils/reportFields'
import { getDailyReportPendingInfo, getOldestMissingReportDateUpTo, listMissedReportDatesInclusive } from '../utils/reportPending'

const StaffDashboardPage = () => {
  const currentUser = useAppStore((state) => state.currentUser)
  const getCurrentStation = useAppStore((state) => state.getCurrentStation)
  const submitReport = useAppStore((state) => state.submitReport)
  const refreshFromSupabase = useAppStore((state) => state.refreshFromSupabase)
  const reports = useAppStore((state) => state.reports)
  const reportingConfiguration = useAppStore((state) => state.appSettings.reportingConfiguration)
  const station = getCurrentStation()

  const todayIso = new Date().toISOString().split('T')[0]

  const stationReportDates = useMemo(() => {
    const sid = currentUser?.stationId
    if (!sid) {
      return new Set()
    }
    const dates = new Set()
    for (const report of reports) {
      if (report.stationId === sid && report.date) {
        dates.add(report.date)
      }
    }
    return dates
  }, [reports, currentUser?.stationId])

  const pastCatchUpNeeded = useMemo(() => {
    const oldest = getOldestMissingReportDateUpTo(todayIso, stationReportDates)
    return Boolean(oldest && oldest < todayIso)
  }, [todayIso, stationReportDates])

  const submissionReminder = useMemo(() => {
    const sid = currentUser?.stationId
    if (!sid) {
      return null
    }
    const info = getDailyReportPendingInfo(todayIso, stationReportDates)
    if (info.pendingDays === 0 && !info.noPriorSubmissions) {
      return null
    }

    if (info.noPriorSubmissions) {
      return { shortLine: 'First report due.' }
    }

    const missedDates = listMissedReportDatesInclusive(info.firstMissingIso, todayIso)
    const n = missedDates.length
    const shortLine = n === 1 ? 'One day missing.' : `${n} days missing.`
    return { shortLine }
  }, [currentUser?.stationId, stationReportDates, todayIso])

  const carriedOpening = useMemo(() => {
    const sid = currentUser?.stationId
    if (!sid) {
      return { pms: 0, ago: 0 }
    }
    const prior = [...reports]
      .filter((r) => r.stationId === sid && r.date < todayIso)
      .sort((a, b) => b.date.localeCompare(a.date))[0]
    if (!prior) {
      return { pms: 0, ago: 0 }
    }
    return {
      pms: getClosingForProduct(prior, 'pms'),
      ago: getClosingForProduct(prior, 'ago'),
    }
  }, [reports, currentUser?.stationId, todayIso])
  const carriedCashBf = useMemo(() => {
    const sid = currentUser?.stationId
    if (!sid) {
      return 0
    }
    const prior = [...reports]
      .filter((r) => r.stationId === sid && r.date < todayIso)
      .sort((a, b) => b.date.localeCompare(a.date))[0]
    return Number(prior?.closingBalance || 0)
  }, [reports, currentUser?.stationId, todayIso])

  const historyPath = currentUser?.stationId ? `/stations/${currentUser.stationId}/history` : '/staff/report'

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card className="bg-gradient-to-r from-blue-50 to-white dark:from-slate-900 dark:to-slate-900">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Daily Retail Station Report</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Reporting as {currentUser?.name || 'Manager'} {station ? `for ${station.name}` : ''}.
            </p>
          </div>
        </div>
      </Card>

      {!currentUser?.stationId && (
        <Card className="border border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-900/60">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Station assignment required
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Your account is not linked to a retail station. Ask an administrator to assign you before you can submit
            daily reports.
          </p>
        </Card>
      )}

      {submissionReminder && (
        <Card className="border border-amber-400 bg-amber-50 px-4 py-3 dark:border-amber-600 dark:bg-amber-950/35">
          <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
            {submissionReminder.shortLine}
            {pastCatchUpNeeded && currentUser?.stationId ? (
              <>
                {' '}
                <Link to={historyPath} className="font-semibold underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-50">
                  History
                </Link>
              </>
            ) : null}
          </p>
        </Card>
      )}

      <Card>
        <StaffClosingReportForm
          stationId={currentUser?.stationId}
          carriedOpening={carriedOpening}
          carriedCashBf={carriedCashBf}
          reportingConfiguration={reportingConfiguration}
          submitReport={submitReport}
          formDisabled={!reportingConfiguration.dailyOpeningStockFormatEnabled}
          onSubmitted={() => refreshFromSupabase()}
        />
      </Card>
    </div>
  )
}

export default StaffDashboardPage

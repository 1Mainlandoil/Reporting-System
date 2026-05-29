import { Link } from 'react-router-dom'
import Card from '../components/ui/Card'
import StaffClosingReportForm from '../components/staff/StaffClosingReportForm'
import { useAppStore } from '../store/useAppStore'

const StaffDashboardPage = () => {
  const currentUser = useAppStore((state) => state.currentUser)
  const getCurrentStation = useAppStore((state) => state.getCurrentStation)
  const submitReport = useAppStore((state) => state.submitReport)
  const refreshFromSupabase = useAppStore((state) => state.refreshFromSupabase)
  const reportingConfiguration = useAppStore((state) => state.appSettings.reportingConfiguration)
  const station = getCurrentStation()

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

      {currentUser?.stationId && (
        <Card className="border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/60">
          <p className="text-sm text-slate-700 dark:text-slate-200">
            Submitting for today. To file a different date, use{' '}
            <Link to={historyPath} className="font-semibold underline underline-offset-2">
              Report History
            </Link>
            .
          </p>
        </Card>
      )}

      <Card>
        <StaffClosingReportForm
          stationId={currentUser?.stationId}
          isFirstReport
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

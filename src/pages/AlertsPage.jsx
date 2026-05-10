import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import Card from '../components/ui/Card'
import StatusBadge from '../components/ui/StatusBadge'
import EmptyState from '../components/ui/EmptyState'
import { useAppStore } from '../store/useAppStore'
import { buildStationMetrics } from '../utils/stock'

const AlertsPage = () => {
  const stations = useAppStore((state) => state.stations)
  const reports = useAppStore((state) => state.reports)
  const users = useAppStore((state) => state.users)
  const productRequests = useAppStore((state) => state.productRequests)
  const stockThresholds = useAppStore((state) => state.appSettings.stockThresholds)
  const notificationPreferences = useAppStore((state) => state.appSettings.notificationPreferences)
  const { critical, warning } = useMemo(() => {
    const metrics = stations.map((station) => {
      const stationReports = reports.filter((report) => report.stationId === station.id)
      return buildStationMetrics(station, stationReports, stockThresholds)
    })
    return {
      critical: metrics.filter((item) => item.status === 'critical'),
      warning: metrics.filter((item) => item.status === 'warning'),
    }
  }, [reports, stations, stockThresholds])
  const lowStockAlerts = [...critical, ...warning]
  const today = new Date().toISOString().split('T')[0]

  const pendingDailyReportAlerts = useMemo(
    () =>
      stations
        .filter((station) => !reports.some((report) => report.stationId === station.id && report.date === today))
        .map((station) => ({
          stationId: station.id,
          stationName: station.name,
          managerName:
            users.find((user) => user.role === 'staff' && user.stationId === station.id)?.name || 'Unassigned',
        })),
    [reports, stations, today, users],
  )

  const escalationAlerts = useMemo(
    () =>
      productRequests
        .filter((request) => request.status === 'pending_admin')
        .map((request) => ({
          id: request.id,
          stationId: request.stationId,
          stationName: stations.find((station) => station.id === request.stationId)?.name || request.stationId,
          managerName: request.managerName,
          requestedProductType: request.requestedProductType,
          requestedLiters: request.requestedLiters,
          supervisorRemark: request.supervisorRemark || 'Escalated to admin',
        })),
    [productRequests, stations],
  )
  const showLowStock = notificationPreferences.lowStockAlertsEnabled
  const showPendingReports = notificationPreferences.pendingDailyReportAlertsEnabled
  const showEscalations = notificationPreferences.escalationAlertsEnabled
  const hasVisibleAlerts =
    (showLowStock && lowStockAlerts.length > 0) ||
    (showPendingReports && pendingDailyReportAlerts.length > 0) ||
    (showEscalations && escalationAlerts.length > 0)

  if (!hasVisibleAlerts) {
    return <EmptyState title="No active alerts" message="No low-stock, pending-report, or escalation alerts." />
  }

  return (
    <div className="space-y-4">
      {showLowStock && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {lowStockAlerts.map((alert) => (
            <Card key={`low-stock-${alert.stationId}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold">{alert.stationName}</p>
                  <p className="text-sm text-slate-500">
                    {alert.daysRemaining.toFixed(2)} expected days remaining
                  </p>
                </div>
                <StatusBadge status={alert.status} />
              </div>
              <Link
                to={`/stations/${alert.stationId}`}
                className="mt-4 inline-block text-sm font-medium text-blue-600 dark:text-blue-300"
              >
                View station details
              </Link>
            </Card>
          ))}
        </div>
      )}

      {showPendingReports && pendingDailyReportAlerts.length > 0 && (
        <Card className="space-y-2">
          <h3 className="font-semibold">Pending Daily Report Alerts</h3>
          {pendingDailyReportAlerts.map((item) => (
            <p key={`pending-report-${item.stationId}`} className="text-sm text-slate-600 dark:text-slate-300">
              {item.stationName}: no daily report submitted today ({item.managerName})
            </p>
          ))}
        </Card>
      )}

      {showEscalations && escalationAlerts.length > 0 && (
        <Card className="space-y-2">
          <h3 className="font-semibold">Escalation Alerts</h3>
          {escalationAlerts.map((item) => (
            <p key={item.id} className="text-sm text-slate-600 dark:text-slate-300">
              {item.stationName}: {item.requestedLiters.toLocaleString()}L {item.requestedProductType} escalated by
              supervisor ({item.supervisorRemark})
            </p>
          ))}
        </Card>
      )}

    </div>
  )
}

export default AlertsPage

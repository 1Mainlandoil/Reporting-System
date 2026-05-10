import { useMemo } from 'react'
import Card from '../components/ui/Card'
import DataTable from '../components/ui/DataTable'
import { useAppStore } from '../store/useAppStore'

const AnalyticsPage = () => {
  const stations = useAppStore((state) => state.stations)
  const reports = useAppStore((state) => state.reports)

  const stationRows = useMemo(
    () =>
      stations.map((station) => {
        const stationReports = reports.filter((report) => report.stationId === station.id)
        const pmsSold = stationReports.reduce(
          (sum, report) => sum + Number(report.totalSalesLitersPMS ?? report.salesPMS ?? 0),
          0,
        )
        const agoSold = stationReports.reduce(
          (sum, report) => sum + Number(report.totalSalesLitersAGO ?? report.salesAGO ?? 0),
          0,
        )
        const submittedDays = new Set(stationReports.map((report) => report.date)).size
        return {
          stationId: station.id,
          stationName: station.name,
          pmsSold,
          agoSold,
          totalSold: pmsSold + agoSold,
          submittedDays,
        }
      }),
    [reports, stations],
  )

  const topStation = [...stationRows].sort((a, b) => b.totalSold - a.totalSold)[0]
  const totalPms = stationRows.reduce((sum, row) => sum + row.pmsSold, 0)
  const totalAgo = stationRows.reduce((sum, row) => sum + row.agoSold, 0)

  const columns = [
    { key: 'stationName', header: 'Retail Station', minWidth: 220 },
    { key: 'submittedDays', header: 'Submitted Days', minWidth: 140 },
    {
      key: 'pmsSold',
      header: 'PMS Sales (L)',
      minWidth: 140,
      render: (row) => Math.round(row.pmsSold).toLocaleString(),
    },
    {
      key: 'agoSold',
      header: 'AGO Sales (L)',
      minWidth: 140,
      render: (row) => Math.round(row.agoSold).toLocaleString(),
    },
    {
      key: 'totalSold',
      header: 'Total Sales (L)',
      minWidth: 150,
      render: (row) => Math.round(row.totalSold).toLocaleString(),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <p className="text-sm text-slate-500">Total PMS Sales (L)</p>
          <p className="text-2xl font-bold">{Math.round(totalPms).toLocaleString()}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Total AGO Sales (L)</p>
          <p className="text-2xl font-bold">{Math.round(totalAgo).toLocaleString()}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Top Performing Station</p>
          <p className="text-base font-semibold">{topStation?.stationName || '-'}</p>
          <p className="text-sm text-slate-500">
            {topStation ? `${Math.round(topStation.totalSold).toLocaleString()} L sold` : 'No data'}
          </p>
        </Card>
      </div>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">Station Performance Summary</h2>
        <DataTable columns={columns} rows={stationRows} tableClassName="min-w-[950px]" stickyColumns={['stationName']} />
      </Card>
    </div>
  )
}

export default AnalyticsPage

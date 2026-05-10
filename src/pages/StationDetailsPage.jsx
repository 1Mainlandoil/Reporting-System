import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import Card from '../components/ui/Card'
import EmptyState from '../components/ui/EmptyState'
import LoadingSkeleton from '../components/ui/LoadingSkeleton'
import DataTable from '../components/ui/DataTable'
import { useAppStore } from '../store/useAppStore'
import { getStockRemaining } from '../utils/stock'
import { getOpeningForProduct, getReceivedForProduct, getSalesForProduct } from '../utils/reportFields'

const StationDetailsPage = () => {
  const { stationId } = useParams()
  const stations = useAppStore((state) => state.stations)
  const getStationReports = useAppStore((state) => state.getStationReports)
  const getStationRequestHistory = useAppStore((state) => state.getStationRequestHistory)
  const [loading, setLoading] = useState(true)

  const station = stations.find((item) => item.id === stationId)
  const reports = getStationReports(stationId)
  const requestHistory = getStationRequestHistory(stationId)

  useEffect(() => {
    const id = setTimeout(() => setLoading(false), 450)
    return () => clearTimeout(id)
  }, [stationId])

  const chartData = useMemo(
    () =>
      reports.map((item) => ({
        date: item.date.slice(5),
        sales: getSalesForProduct(item, 'pms') + getSalesForProduct(item, 'ago'),
        stock:
          getStockRemaining(
            getOpeningForProduct(item, 'pms'),
            getReceivedForProduct(item, 'pms'),
            getSalesForProduct(item, 'pms'),
          ) +
          getStockRemaining(
            getOpeningForProduct(item, 'ago'),
            getReceivedForProduct(item, 'ago'),
            getSalesForProduct(item, 'ago'),
          ),
      })),
    [reports],
  )

  const requestHistoryRows = useMemo(
    () =>
      requestHistory.map((request) => ({
        ...request,
        date: request.createdAt?.split('T')[0] || '-',
        finalStatus:
          request.status === 'approved'
            ? 'Approved'
            : request.status === 'declined'
              ? 'Declined'
              : request.status === 'pending_admin'
                ? 'Pending Admin'
                : 'Requested',
        reasonOrRemark:
          request.status === 'declined'
            ? request.adminRemark || request.supervisorRemark || '-'
            : request.adminRemark || request.supervisorRemark || request.managerRemark || '-',
      })),
    [requestHistory],
  )

  const requestHistoryColumns = [
    { key: 'date', header: 'Date', minWidth: 110 },
    { key: 'managerName', header: 'Manager', minWidth: 160 },
    { key: 'requestedProductType', header: 'Requested Product', minWidth: 150 },
    {
      key: 'requestedLiters',
      header: 'Requested Liters',
      minWidth: 140,
      render: (row) => Math.round(row.requestedLiters).toLocaleString(),
    },
    { key: 'finalStatus', header: 'Status', minWidth: 130 },
    {
      key: 'approvedProductType',
      header: 'Approved Product',
      minWidth: 150,
      render: (row) => row.approvedProductType || '-',
    },
    {
      key: 'approvedLiters',
      header: 'Approved Liters',
      minWidth: 140,
      render: (row) => (row.approvedLiters ? Math.round(row.approvedLiters).toLocaleString() : '-'),
    },
    { key: 'reasonOrRemark', header: 'Reason / Remark', minWidth: 260 },
  ]

  if (loading) {
    return <LoadingSkeleton />
  }

  if (!station || !reports.length) {
    return (
      <EmptyState
        title="No retail station data"
        message="There is no history available for this retail station yet."
      />
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold">{station.name}</h2>
            <p className="text-sm text-slate-500">Historical trends for sales and stock levels.</p>
          </div>
          <Link
            to={`/stations/${stationId}/history`}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
          >
            View Station Report History
          </Link>
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-semibold">Sales Trend</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="sales" stroke="#2563eb" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <h3 className="mb-3 font-semibold">Stock Trend</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="stock" stroke="#10b981" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>
      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Station Product Request History</h3>
          <p className="text-sm text-slate-500">Approved/declined requests with reasons and remarks</p>
        </div>
        {requestHistoryRows.length ? (
          <DataTable columns={requestHistoryColumns} rows={requestHistoryRows} tableClassName="min-w-[1500px]" />
        ) : (
          <EmptyState
            title="No product request history yet"
            message="This station has not raised product requests yet."
          />
        )}
      </Card>
    </div>
  )
}

export default StationDetailsPage

import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '../components/ui/Card'
import DataTable from '../components/ui/DataTable'
import EmptyState from '../components/ui/EmptyState'
import { useAppStore } from '../store/useAppStore'

const StationsPage = () => {
  const navigate = useNavigate()
  const stations = useAppStore((state) => state.stations)
  const users = useAppStore((state) => state.users)

  const managerByStation = useMemo(
    () =>
      new Map(
        users
          .filter((user) => user.role === 'staff' && user.stationId)
          .map((user) => [user.stationId, user.name]),
      ),
    [users],
  )

  const stationRows = useMemo(
    () =>
      stations.map((station) => {
        return {
          stationId: station.id,
          stationName: station.name,
          location: station.location,
          managerName: managerByStation.get(station.id) || 'Unassigned',
          accountStatus: managerByStation.has(station.id) ? 'Approved' : 'Pending',
        }
      }),
    [managerByStation, stations],
  )

  const columns = [
    { key: 'stationName', header: 'Retail Station', minWidth: 220 },
    { key: 'location', header: 'Location', minWidth: 130 },
    { key: 'managerName', header: 'Manager', minWidth: 170 },
    {
      key: 'accountStatus',
      header: 'Manager Login Status',
      minWidth: 170,
      render: (row) =>
        row.accountStatus === 'Approved' ? (
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
            Approved
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
            Pending
          </span>
        ),
    },
  ]

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Stations Directory</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              All registered stations and assigned managers. Click any station to view full details and
              performance history.
            </p>
          </div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Total Stations: {stationRows.length}
          </p>
        </div>
      </Card>

      <Card>
        {stationRows.length ? (
          <DataTable
            columns={columns}
            rows={stationRows}
            onRowClick={(row) => navigate(`/stations/${row.stationId}`)}
            tableClassName="min-w-[900px]"
            stickyColumns={['stationName']}
            stickyColumnWidths={{ stationName: 220 }}
          />
        ) : (
          <EmptyState
            title="No stations registered yet"
            message="Add station records to begin monitoring manager submissions and performance."
          />
        )}
      </Card>
    </div>
  )
}

export default StationsPage

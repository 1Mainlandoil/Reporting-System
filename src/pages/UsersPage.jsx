import { useMemo } from 'react'
import Card from '../components/ui/Card'
import DataTable from '../components/ui/DataTable'
import { useAppStore } from '../store/useAppStore'

const UsersPage = () => {
  const users = useAppStore((state) => state.users)
  const stations = useAppStore((state) => state.stations)
  const currentUser = useAppStore((state) => state.currentUser)
  const openChatWithUser = useAppStore((state) => state.openChatWithUser)

  const stationById = useMemo(() => new Map(stations.map((station) => [station.id, station.name])), [stations])

  const rows = useMemo(
    () =>
      users.map((user) => ({
        id: user.id,
        name: user.name,
        role: user.role === 'staff' ? 'Manager' : user.role === 'supervisor' ? 'Supervisor' : 'Admin',
        assignedStation: user.stationId ? stationById.get(user.stationId) || 'Unknown' : 'All Stations',
        status: 'Active',
        canChat: user.id !== currentUser?.id,
      })),
    [currentUser?.id, stationById, users],
  )

  const columns = [
    { key: 'name', header: 'Name', minWidth: 180 },
    { key: 'role', header: 'Role', minWidth: 120 },
    { key: 'assignedStation', header: 'Assigned Station', minWidth: 240 },
    {
      key: 'status',
      header: 'Status',
      minWidth: 120,
      render: (row) => (
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
          {row.status}
        </span>
      ),
    },
    {
      key: 'chat',
      header: 'Chat',
      minWidth: 100,
      render: (row) =>
        row.canChat ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              openChatWithUser(row.id)
            }}
            className="rounded-md border border-blue-300 px-2 py-1 text-xs font-medium text-blue-700 dark:border-blue-500/40 dark:text-blue-300"
          >
            💬 Chat
          </button>
        ) : (
          <span className="text-xs text-slate-400">Current User</span>
        ),
    },
  ]

  const staffCount = rows.filter((row) => row.role === 'staff').length
  const supervisorCount = rows.filter((row) => row.role === 'supervisor').length
  const adminCount = rows.filter((row) => row.role === 'admin').length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <p className="text-sm text-slate-500">Manager Accounts</p>
          <p className="text-2xl font-bold">{staffCount}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Supervisor Accounts</p>
          <p className="text-2xl font-bold">{supervisorCount}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Admin Accounts</p>
          <p className="text-2xl font-bold">{adminCount}</p>
        </Card>
      </div>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">User Management</h2>
        <DataTable columns={columns} rows={rows} tableClassName="min-w-[760px]" />
      </Card>
    </div>
  )
}

export default UsersPage

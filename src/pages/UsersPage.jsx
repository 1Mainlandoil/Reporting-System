import { useMemo } from 'react'
import Card from '../components/ui/Card'
import EmptyState from '../components/ui/EmptyState'
import { useAppStore } from '../store/useAppStore'

const ROLE_COLORS = {
  Manager: { bg: 'bg-blue-500/15', text: 'text-blue-400' },
  Supervisor: { bg: 'bg-purple-500/15', text: 'text-purple-400' },
  Admin: { bg: 'bg-[#a9cd39]/15', text: 'text-[#a9cd39]' },
}

const UsersPage = () => {
  const users = useAppStore((state) => state.users)
  const stations = useAppStore((state) => state.stations)
  const currentUser = useAppStore((state) => state.currentUser)
  const openChatWithUser = useAppStore((state) => state.openChatWithUser)

  const stationById = useMemo(() => new Map(stations.map((s) => [s.id, s.name])), [stations])

  const rows = useMemo(() =>
    [...users]
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .map((user) => ({
        id: user.id,
        name: user.name,
        roleLabel: user.role === 'staff' ? 'Manager' : user.role === 'supervisor' ? 'Supervisor' : 'Admin',
        station: user.stationId ? stationById.get(user.stationId) || 'Unknown' : 'All Stations',
        canChat: user.id !== currentUser?.id,
      })),
  [currentUser?.id, stationById, users])

  const managerCount = rows.filter((r) => r.roleLabel === 'Manager').length
  const supervisorCount = rows.filter((r) => r.roleLabel === 'Supervisor').length
  const adminCount = rows.filter((r) => r.roleLabel === 'Admin').length

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Managers', value: managerCount, color: 'text-blue-400' },
          { label: 'Supervisors', value: supervisorCount, color: 'text-purple-400' },
          { label: 'Admins', value: adminCount, color: 'text-[#a9cd39]' },
        ].map(({ label, value, color }) => (
          <Card key={label} className="text-center py-3">
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
          </Card>
        ))}
      </div>

      {/* User cards */}
      {rows.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => {
            const colors = ROLE_COLORS[row.roleLabel] || ROLE_COLORS.Manager
            return (
              <div key={row.id} className="rounded-2xl border border-white/8 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${colors.bg} ${colors.text}`}>
                      {String(row.name || '?')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-white truncate">{row.name}</p>
                      <p className="text-xs text-slate-500 truncate">{row.station}</p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${colors.bg} ${colors.text}`}>
                    {row.roleLabel}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-[#a9cd39]/10 px-2.5 py-0.5 text-xs font-semibold text-[#a9cd39]">
                    Active
                  </span>
                  {row.canChat ? (
                    <button
                      type="button"
                      onClick={() => openChatWithUser(row.id)}
                      className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white transition"
                    >
                      💬 Chat
                    </button>
                  ) : (
                    <span className="text-xs text-slate-600">You</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState title="No users found" message="User accounts will appear here once provisioned." />
      )}
    </div>
  )
}

export default UsersPage

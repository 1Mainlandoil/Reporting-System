import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '../components/ui/Card'
import EmptyState from '../components/ui/EmptyState'
import { useAppStore } from '../store/useAppStore'
import { getReportingDateIso } from '../utils/dateFormat'

const StationsPage = () => {
  const navigate = useNavigate()
  const stations = useAppStore((state) => state.stations)
  const users = useAppStore((state) => state.users)
  const reports = useAppStore((state) => state.reports)

  const today = getReportingDateIso()

  const managerByStation = useMemo(
    () => new Map(users.filter((u) => u.role === 'staff' && u.stationId).map((u) => [u.stationId, u])),
    [users],
  )

  const stationRows = useMemo(() =>
    [...stations].sort((a, b) => a.name.localeCompare(b.name)).map((station) => {
      const manager = managerByStation.get(station.id)
      const todayReport = reports.find((r) => r.stationId === station.id && r.date === today)
      const submitted = Boolean(todayReport)
      const noSales = todayReport?.noSalesDay
      return { station, manager, submitted, noSales }
    }),
  [stations, managerByStation, reports, today])

  const submittedCount = stationRows.filter((r) => r.submitted).length

  return (
    <div className="space-y-5">
      {/* Header stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Stations', value: stationRows.length, color: 'text-white' },
          { label: 'Submitted Today', value: submittedCount, color: 'text-[#a9cd39]' },
          { label: 'Pending', value: stationRows.length - submittedCount, color: 'text-amber-400' },
        ].map(({ label, value, color }) => (
          <Card key={label} className="text-center py-3">
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
          </Card>
        ))}
      </div>

      {/* Station cards */}
      {stationRows.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {stationRows.map(({ station, manager, submitted, noSales }) => (
            <button
              key={station.id}
              type="button"
              onClick={() => navigate(`/stations/${station.id}`)}
              className={`rounded-2xl border p-4 text-left transition hover:scale-[1.01] ${
                submitted
                  ? 'border-[#a9cd39]/20 bg-[#a9cd39]/5'
                  : 'border-white/8 bg-white/5'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-white truncate">{station.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{station.location}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${
                  submitted ? 'bg-[#a9cd39]/15 text-[#a9cd39]'
                  : 'bg-amber-500/15 text-amber-400'
                }`}>
                  {noSales ? 'No Sales' : submitted ? '✓ Done' : 'Pending'}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${manager ? 'bg-[#a9cd39]/20 text-[#a9cd39]' : 'bg-white/10 text-slate-500'}`}>
                    {manager ? String(manager.name || '?')[0].toUpperCase() : '?'}
                  </div>
                  <span className="text-xs text-slate-400 truncate">{manager?.name || 'Unassigned'}</span>
                </div>
                <span className="text-xs text-slate-600">→ View</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState title="No stations registered" message="Add station records to begin monitoring." />
      )}
    </div>
  )
}

export default StationsPage

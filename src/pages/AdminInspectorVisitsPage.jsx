import { useMemo, useState } from 'react'
import Card from '../components/ui/Card'
import EmptyState from '../components/ui/EmptyState'
import InspectorVisitDetailModal from '../components/reports/InspectorVisitDetailModal'
import { useAppStore } from '../store/useAppStore'

const AdminInspectorVisitsPage = () => {
  const stations = useAppStore((state) => state.stations)
  const inspectorVisits = useAppStore((state) => state.inspectorVisits)
  const [stationFilter, setStationFilter] = useState('')
  const [detailVisit, setDetailVisit] = useState(null)

  const rows = useMemo(
    () =>
      inspectorVisits
        .filter((visit) => !stationFilter || visit.stationId === stationFilter)
        .map((visit) => ({
          ...visit,
          stationName: stations.find((station) => station.id === visit.stationId)?.name || visit.stationId,
        }))
        .sort((a, b) => {
          const byDate = String(b.visitDate).localeCompare(String(a.visitDate))
          if (byDate !== 0) {
            return byDate
          }
          return String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
        }),
    [inspectorVisits, stationFilter, stations],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Inspector Visits</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Read-only oversight of station inspection reports submitted by field inspectors.
          </p>
        </div>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Filter by station</span>
          <select
            value={stationFilter}
            onChange={(event) => setStationFilter(event.target.value)}
            className="rounded-xl border border-white/10 bg-[#0d1220] px-3 py-2 text-sm text-white outline-none focus:border-[#a9cd39]/40"
          >
            <option value="">All stations</option>
            {stations.map((station) => (
              <option key={station.id} value={station.id}>
                {station.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No inspector visits" description="Visits will appear here once inspectors submit reports." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Station</th>
                <th className="px-3 py-2">Inspector</th>
                <th className="px-3 py-2">Manager</th>
                <th className="px-3 py-2">Arrival</th>
                <th className="px-3 py-2">Departure</th>
                <th className="px-3 py-2">Cash</th>
                <th className="px-3 py-2">POS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((visit) => (
                <tr
                  key={visit.id}
                  onClick={() => setDetailVisit(visit)}
                  className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/60"
                >
                  <td className="px-3 py-3">{visit.visitDate}</td>
                  <td className="px-3 py-3 font-medium">{visit.stationName}</td>
                  <td className="px-3 py-3">{visit.inspectorName || '—'}</td>
                  <td className="px-3 py-3">{visit.managerInCharge || '—'}</td>
                  <td className="px-3 py-3">{visit.arrivalTime || '—'}</td>
                  <td className="px-3 py-3">{visit.departureTime || '—'}</td>
                  <td className="px-3 py-3">{Number(visit.cash || 0).toLocaleString()}</td>
                  <td className="px-3 py-3">{Number(visit.pos || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <InspectorVisitDetailModal visit={detailVisit} onClose={() => setDetailVisit(null)} title="Inspector visit" />
    </div>
  )
}

export default AdminInspectorVisitsPage

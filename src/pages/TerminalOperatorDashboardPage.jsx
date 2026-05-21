import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Card from '../components/ui/Card'
import DataTable from '../components/ui/DataTable'
import EmptyState from '../components/ui/EmptyState'
import { useAppStore } from '../store/useAppStore'

const TerminalOperatorDashboardPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const stations = useAppStore((state) => state.stations)
  const productRequests = useAppStore((state) => state.productRequests)
  const currentUser = useAppStore((state) => state.currentUser)
  const resolveProductRequestByTerminalOperator = useAppStore(
    (state) => state.resolveProductRequestByTerminalOperator,
  )
  const [requestDrafts, setRequestDrafts] = useState({})
  const [selectedStationId, setSelectedStationId] = useState(null)

  const activeView = searchParams.get('view') === 'history' ? 'history' : 'queue'

  const pendingRows = useMemo(
    () =>
      productRequests
        .filter((request) => request.status === 'submitted' || request.status === 'pending_admin')
        .map((request) => ({
          ...request,
          stationName: stations.find((station) => station.id === request.stationId)?.name || request.stationId,
          createdDate: request.createdAt?.split('T')[0] || '-',
        }))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [productRequests, stations],
  )

  const historyRows = useMemo(
    () =>
      productRequests
        .filter((request) => request.status === 'approved' || request.status === 'declined')
        .map((request) => ({
          ...request,
          stationName: stations.find((station) => station.id === request.stationId)?.name || request.stationId,
          createdDate: request.createdAt?.split('T')[0] || '-',
          finalStatus: request.status === 'approved' ? 'Approved' : 'Declined',
          reasonOrRemark: request.adminRemark || request.managerRemark || '-',
        }))
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)),
    [productRequests, stations],
  )

  const filteredHistoryRows = useMemo(
    () =>
      selectedStationId ? historyRows.filter((row) => row.stationId === selectedStationId) : historyRows,
    [historyRows, selectedStationId],
  )

  const pendingColumns = [
    { key: 'createdDate', header: 'Date', minWidth: 110 },
    { key: 'stationName', header: 'Station', minWidth: 180 },
    { key: 'managerName', header: 'Manager', minWidth: 160 },
    { key: 'requestedProductType', header: 'Requested Product', minWidth: 160 },
    {
      key: 'requestedLiters',
      header: 'Requested Liters',
      minWidth: 140,
      render: (row) => Math.round(row.requestedLiters).toLocaleString(),
    },
    { key: 'managerRemark', header: 'Manager Remark', minWidth: 220 },
    {
      key: 'terminalAction',
      header: 'Terminal Operator Decision',
      minWidth: 420,
      render: (row) => {
        const draft = requestDrafts[row.id] || {
          approvedProductType: row.requestedProductType,
          approvedLiters: row.requestedLiters,
          remark: 'Expect product in 24hrs',
        }
        return (
          <div
            className="space-y-2"
            onClick={(event) => {
              event.stopPropagation()
            }}
          >
            <div className="flex flex-wrap gap-2">
              <select
                value={draft.approvedProductType}
                onChange={(event) =>
                  setRequestDrafts((prev) => ({
                    ...prev,
                    [row.id]: { ...draft, approvedProductType: event.target.value },
                  }))
                }
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="PMS">PMS</option>
                <option value="AGO">AGO</option>
              </select>
              <input
                type="number"
                min="1"
                value={draft.approvedLiters}
                onChange={(event) =>
                  setRequestDrafts((prev) => ({
                    ...prev,
                    [row.id]: { ...draft, approvedLiters: event.target.value },
                  }))
                }
                className="w-28 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
            <input
              value={draft.remark}
              onChange={(event) =>
                setRequestDrafts((prev) => ({
                  ...prev,
                  [row.id]: { ...draft, remark: event.target.value },
                }))
              }
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
              placeholder="Terminal operator remark"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  resolveProductRequestByTerminalOperator({
                    requestId: row.id,
                    decision: 'approve',
                    approvedProductType: draft.approvedProductType,
                    approvedLiters: Number(draft.approvedLiters || 0),
                    remark: draft.remark,
                  })
                }
                className="rounded-md border border-emerald-300 px-2 py-1 text-xs text-emerald-700"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() =>
                  resolveProductRequestByTerminalOperator({
                    requestId: row.id,
                    decision: 'decline',
                    remark: draft.remark || 'Declined by terminal operator',
                  })
                }
                className="rounded-md border border-rose-300 px-2 py-1 text-xs text-rose-700"
              >
                Decline
              </button>
            </div>
          </div>
        )
      },
    },
  ]

  const historyColumns = [
    { key: 'createdDate', header: 'Date', minWidth: 110 },
    { key: 'stationName', header: 'Station', minWidth: 180 },
    { key: 'managerName', header: 'Manager', minWidth: 160 },
    { key: 'requestedProductType', header: 'Requested Product', minWidth: 150 },
    {
      key: 'requestedLiters',
      header: 'Requested Liters',
      minWidth: 140,
      render: (row) => Math.round(row.requestedLiters).toLocaleString(),
    },
    { key: 'finalStatus', header: 'Final Status', minWidth: 130 },
    { key: 'approvedProductType', header: 'Approved Product', minWidth: 150 },
    {
      key: 'approvedLiters',
      header: 'Approved Liters',
      minWidth: 140,
      render: (row) => (row.approvedLiters ? Math.round(row.approvedLiters).toLocaleString() : '-'),
    },
    { key: 'reasonOrRemark', header: 'Reason / Remark', minWidth: 260 },
    { key: 'adminName', header: 'Decided By', minWidth: 160 },
  ]

  const setView = (view) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (view === 'history') {
        next.set('view', 'history')
      } else {
        next.delete('view')
      }
      return next
    })
  }

  return (
    <div className="space-y-4">
      <Card className="bg-gradient-to-r from-slate-900 to-blue-900 text-white">
        <h2 className="text-xl font-bold">Terminal Operator — Product Requests</h2>
        <p className="text-sm text-slate-200">
          Final approval for manager stock requests · Signed in as {currentUser?.name || 'Terminal Operator'}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setView('queue')}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              activeView === 'queue' ? 'bg-white text-slate-900' : 'bg-white/15 text-white hover:bg-white/25'
            }`}
          >
            Pending Queue ({pendingRows.length})
          </button>
          <button
            type="button"
            onClick={() => setView('history')}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              activeView === 'history' ? 'bg-white text-slate-900' : 'bg-white/15 text-white hover:bg-white/25'
            }`}
          >
            Decision History
          </button>
        </div>
      </Card>

      {activeView === 'queue' && (
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Manager Requests Awaiting Decision</h3>
            <p className="text-sm text-slate-500">{pendingRows.length} pending</p>
          </div>
          {pendingRows.length ? (
            <DataTable columns={pendingColumns} rows={pendingRows} tableClassName="min-w-[1850px]" />
          ) : (
            <EmptyState
              title="No pending requests"
              message="New manager product requests will appear here for your final decision."
            />
          )}
        </Card>
      )}

      {activeView === 'history' && (
        <Card className="space-y-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <h3 className="text-lg font-semibold">
              Request Decision History
              {selectedStationId &&
                ` — ${stations.find((station) => station.id === selectedStationId)?.name || selectedStationId}`}
            </h3>
            {selectedStationId && (
              <button
                type="button"
                onClick={() => setSelectedStationId(null)}
                className="rounded-md border border-slate-300 px-3 py-1 text-xs dark:border-slate-700"
              >
                Clear Station Filter
              </button>
            )}
          </div>
          {filteredHistoryRows.length ? (
            <DataTable
              columns={historyColumns}
              rows={filteredHistoryRows}
              onRowClick={(row) => setSelectedStationId(row.stationId)}
              tableClassName="min-w-[1650px]"
            />
          ) : (
            <EmptyState
              title="No decision history yet"
              message="Approved and declined requests will be listed here."
            />
          )}
        </Card>
      )}
    </div>
  )
}

export default TerminalOperatorDashboardPage

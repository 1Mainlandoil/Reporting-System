import { useMemo, useState } from 'react'
import Card from '../components/ui/Card'
import DataTable from '../components/ui/DataTable'
import EmptyState from '../components/ui/EmptyState'
import FormInput from '../components/ui/FormInput'
import { useAppStore } from '../store/useAppStore'

const StaffStockOrderingPage = () => {
  const createProductRequest = useAppStore((state) => state.createProductRequest)
  const productRequests = useAppStore((state) => state.productRequests)
  const currentUser = useAppStore((state) => state.currentUser)
  const stations = useAppStore((state) => state.stations)
  const [activeTab, setActiveTab] = useState('submit')
  const [requestFilter, setRequestFilter] = useState('pending')
  const [requestDraft, setRequestDraft] = useState({
    requestedProductType: 'PMS',
    requestedLiters: '',
    remark: '',
  })

  const stationName =
    stations.find((station) => station.id === currentUser?.stationId)?.name || currentUser?.stationId || '-'

  const myRequests = useMemo(
    () =>
      productRequests
        .filter((request) => request.managerId === currentUser?.id)
        .map((request) => ({
          ...request,
          createdDate: request.createdAt?.split('T')[0] || '-',
          decidedDate: request.terminalReviewedAt?.split('T')[0] || '-',
          statusLabel:
            request.status === 'approved'
              ? 'Approved'
              : request.status === 'declined'
                ? 'Rejected'
                : 'Pending',
        }))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [productRequests, currentUser?.id],
  )

  const filteredRequests = useMemo(() => {
    if (requestFilter === 'approved') {
      return myRequests.filter((request) => request.status === 'approved')
    }
    if (requestFilter === 'rejected') {
      return myRequests.filter((request) => request.status === 'declined')
    }
    return myRequests.filter((request) => ['submitted', 'pending_admin'].includes(request.status))
  }, [myRequests, requestFilter])

  const pendingCount = myRequests.filter((request) => ['submitted', 'pending_admin'].includes(request.status)).length
  const approvedCount = myRequests.filter((request) => request.status === 'approved').length
  const rejectedCount = myRequests.filter((request) => request.status === 'declined').length

  const handleRequestSubmit = (event) => {
    event.preventDefault()
    createProductRequest({
      requestedProductType: requestDraft.requestedProductType,
      requestedLiters: Number(requestDraft.requestedLiters || 0),
      remark: requestDraft.remark,
    })
    setRequestDraft({
      requestedProductType: 'PMS',
      requestedLiters: '',
      remark: '',
    })
    setActiveTab('requests')
    setRequestFilter('pending')
  }

  const requestColumns = [
    { key: 'createdDate', header: 'Submitted', minWidth: 110 },
    { key: 'requestedProductType', header: 'Product', minWidth: 100 },
    {
      key: 'requestedLiters',
      header: 'Requested',
      minWidth: 110,
      render: (row) => Math.round(row.requestedLiters).toLocaleString(),
    },
    {
      key: 'statusLabel',
      header: 'Status',
      minWidth: 110,
      render: (row) => (
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            row.status === 'approved'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
              : row.status === 'declined'
                ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
          }`}
        >
          {row.statusLabel}
        </span>
      ),
    },
    ...(requestFilter === 'approved'
      ? [
          {
            key: 'approvedLiters',
            header: 'Sent Liters',
            minWidth: 110,
            render: (row) => (row.approvedLiters ? Math.round(row.approvedLiters).toLocaleString() : '-'),
          },
          { key: 'truckNumber', header: 'Truck No.', minWidth: 110 },
          { key: 'truckDriver', header: 'Driver', minWidth: 130 },
          { key: 'terminalRemark', header: 'Dispatch Remark', minWidth: 180 },
          { key: 'decidedDate', header: 'Approved On', minWidth: 110 },
        ]
      : []),
    ...(requestFilter === 'rejected'
      ? [
          { key: 'terminalRemark', header: 'Reason', minWidth: 220 },
          { key: 'decidedDate', header: 'Rejected On', minWidth: 110 },
        ]
      : []),
    ...(requestFilter === 'pending'
      ? [{ key: 'managerRemark', header: 'Your Remark', minWidth: 180 }]
      : []),
  ]

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Card className="bg-gradient-to-r from-indigo-900 to-blue-900 text-white">
        <h2 className="text-xl font-bold">Order Product</h2>
        <p className="text-sm text-indigo-100">
          Submit stock requests and track terminal operator decisions · {stationName}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('submit')}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              activeTab === 'submit' ? 'bg-white text-slate-900' : 'bg-white/15 text-white hover:bg-white/25'
            }`}
          >
            New Request
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('requests')}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              activeTab === 'requests' ? 'bg-white text-slate-900' : 'bg-white/15 text-white hover:bg-white/25'
            }`}
          >
            My Requests ({myRequests.length})
          </button>
        </div>
      </Card>

      {activeTab === 'submit' && (
        <Card className="space-y-4">
          <h3 className="text-lg font-semibold">Submit Product Request</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Your request goes to the terminal operator for approval and dispatch details.
          </p>
          <form onSubmit={handleRequestSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <label className="space-y-1">
              <span className="text-sm font-medium">Requested Product</span>
              <select
                value={requestDraft.requestedProductType}
                onChange={(event) =>
                  setRequestDraft((prev) => ({ ...prev, requestedProductType: event.target.value }))
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="PMS">PMS</option>
                <option value="AGO">AGO</option>
              </select>
            </label>
            <FormInput
              type="number"
              min="1"
              required
              label="Requested Liters"
              value={requestDraft.requestedLiters}
              onChange={(event) => setRequestDraft((prev) => ({ ...prev, requestedLiters: event.target.value }))}
            />
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm font-medium">Remark</span>
              <input
                value={requestDraft.remark}
                onChange={(event) => setRequestDraft((prev) => ({ ...prev, remark: event.target.value }))}
                placeholder="Reason for request"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <div className="md:col-span-4">
              <button className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white">
                Submit Product Request
              </button>
            </div>
          </form>
        </Card>
      )}

      {activeTab === 'requests' && (
        <Card className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h3 className="text-lg font-semibold">My Product Requests</h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setRequestFilter('pending')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  requestFilter === 'pending'
                    ? 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200'
                    : 'border border-slate-300 dark:border-slate-600'
                }`}
              >
                Pending ({pendingCount})
              </button>
              <button
                type="button"
                onClick={() => setRequestFilter('approved')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  requestFilter === 'approved'
                    ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200'
                    : 'border border-slate-300 dark:border-slate-600'
                }`}
              >
                Approved ({approvedCount})
              </button>
              <button
                type="button"
                onClick={() => setRequestFilter('rejected')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  requestFilter === 'rejected'
                    ? 'bg-rose-100 text-rose-900 dark:bg-rose-500/20 dark:text-rose-200'
                    : 'border border-slate-300 dark:border-slate-600'
                }`}
              >
                Rejected ({rejectedCount})
              </button>
            </div>
          </div>
          {filteredRequests.length ? (
            <DataTable columns={requestColumns} rows={filteredRequests} tableClassName="min-w-[900px]" />
          ) : (
            <EmptyState
              title={
                requestFilter === 'pending'
                  ? 'No pending requests'
                  : requestFilter === 'approved'
                    ? 'No approved requests yet'
                    : 'No rejected requests'
              }
              message={
                requestFilter === 'pending'
                  ? 'Submit a new product request and it will appear here while waiting on the terminal operator.'
                  : 'Decisions from the terminal operator will show up here.'
              }
            />
          )}
        </Card>
      )}
    </div>
  )
}

export default StaffStockOrderingPage

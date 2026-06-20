import clsx from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Card from '../components/ui/Card'
import EmptyState from '../components/ui/EmptyState'
import EvidencePhotoList from '../components/ui/EvidencePhotoList'
import { useAppStore } from '../store/useAppStore'
import { buildStationMetrics, getStockRemaining } from '../utils/stock'
import { getOpeningForProduct, getReceivedForProduct, getSalesForProduct } from '../utils/reportFields'

const emptyApproveDraft = {
  approvedLiters: '',
  costPricePerLiter: '',
  transportCostPerLiter: '',
  truckNumber: '',
  truckDriver: '',
  remark: '',
}

const formatNaira = (value) => `NGN ${Number(value || 0).toLocaleString()}`

const DetailField = ({ label, value, className = '' }) => (
  <div className={className}>
    <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">{value || '—'}</p>
  </div>
)

const TerminalOperatorDashboardPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const stations = useAppStore((state) => state.stations)
  const reports = useAppStore((state) => state.reports)
  const stockThresholds = useAppStore((state) => state.appSettings.stockThresholds)
  const productRequests = useAppStore((state) => state.productRequests)
  const currentUser = useAppStore((state) => state.currentUser)
  const resolveProductRequestByTerminalOperator = useAppStore(
    (state) => state.resolveProductRequestByTerminalOperator,
  )
  const [detailRequest, setDetailRequest] = useState(null)
  const [declineRemark, setDeclineRemark] = useState('')
  const [approveTarget, setApproveTarget] = useState(null)
  const [approveDraft, setApproveDraft] = useState(emptyApproveDraft)

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
        .filter((request) => request.terminalReviewedAt)
        .map((request) => ({
          ...request,
          stationName: stations.find((station) => station.id === request.stationId)?.name || request.stationId,
          createdDate: request.createdAt?.split('T')[0] || '-',
          decidedDate: request.terminalReviewedAt?.split('T')[0] || '-',
          finalStatus: request.status === 'approved' ? 'Approved' : 'Declined',
          reasonOrRemark: request.terminalRemark || request.managerRemark || '-',
        }))
        .sort((a, b) => new Date(b.terminalReviewedAt) - new Date(a.terminalReviewedAt)),
    [productRequests, stations],
  )

  const activeRows = activeView === 'history' ? historyRows : pendingRows
  const approveLiters = Number(approveDraft.approvedLiters || 0)
  const approveCostPerLiter = Number(approveDraft.costPricePerLiter || 0)
  const approveTransportPerLiter = Number(approveDraft.transportCostPerLiter || 0)
  const approveLandingPerLiter = approveCostPerLiter + approveTransportPerLiter
  const approveTotalLandingCost = approveLiters * approveLandingPerLiter

  const stationStockById = useMemo(() => {
    const map = new Map()
    for (const station of stations) {
      const stationReports = reports.filter((report) => report.stationId === station.id)
      const metrics = buildStationMetrics(station, stationReports, stockThresholds)
      const latest = [...stationReports].sort((a, b) => a.date.localeCompare(b.date)).at(-1)
      let pmsRemaining = 0
      let agoRemaining = 0
      if (latest) {
        pmsRemaining = getStockRemaining(
          getOpeningForProduct(latest, 'pms'),
          getReceivedForProduct(latest, 'pms'),
          getSalesForProduct(latest, 'pms'),
        )
        agoRemaining = getStockRemaining(
          getOpeningForProduct(latest, 'ago'),
          getReceivedForProduct(latest, 'ago'),
          getSalesForProduct(latest, 'ago'),
        )
      }
      map.set(station.id, {
        ...metrics,
        pmsRemaining,
        agoRemaining,
        latestReportDate: latest?.date || null,
      })
    }
    return map
  }, [stations, reports, stockThresholds])

  useEffect(() => {
    setDetailRequest(null)
    setDeclineRemark('')
  }, [activeView])

  useEffect(() => {
    if (detailRequest && !activeRows.some((request) => request.id === detailRequest.id)) {
      setDetailRequest(null)
    }
  }, [activeRows, detailRequest])

  useEffect(() => {
    setDeclineRemark('')
  }, [detailRequest?.id])

  const openDetail = (request) => {
    setDetailRequest(request)
  }

  const closeDetail = () => {
    setDetailRequest(null)
    setDeclineRemark('')
  }

  const openApproveForm = (request) => {
    setApproveTarget(request)
    setApproveDraft({
      approvedLiters: String(request.requestedLiters || ''),
      costPricePerLiter: request.costPricePerLiter ? String(request.costPricePerLiter) : '',
      transportCostPerLiter: request.transportCostPerLiter ? String(request.transportCostPerLiter) : '',
      truckNumber: '',
      truckDriver: '',
      remark: '',
    })
  }

  const closeApproveForm = () => {
    setApproveTarget(null)
    setApproveDraft(emptyApproveDraft)
  }

  const submitApprove = () => {
    if (!approveTarget) {
      return
    }
    const liters = Number(approveDraft.approvedLiters || 0)
    if (liters <= 0) {
      window.alert('Enter how many liters you are sending.')
      return
    }
    const costPricePerLiter = Number(approveDraft.costPricePerLiter || 0)
    if (costPricePerLiter <= 0) {
      window.alert('Enter the product cost price per liter.')
      return
    }
    const transportCostPerLiter = Number(approveDraft.transportCostPerLiter || 0)
    if (transportCostPerLiter < 0) {
      window.alert('Transport cost per liter cannot be negative.')
      return
    }
    if (!String(approveDraft.truckNumber || '').trim()) {
      window.alert('Enter the truck number.')
      return
    }
    if (!String(approveDraft.truckDriver || '').trim()) {
      window.alert('Enter the truck driver name.')
      return
    }
    resolveProductRequestByTerminalOperator({
      requestId: approveTarget.id,
      decision: 'approve',
      approvedLiters: liters,
      costPricePerLiter,
      transportCostPerLiter,
      truckNumber: approveDraft.truckNumber,
      truckDriver: approveDraft.truckDriver,
      remark: approveDraft.remark,
    })
    closeApproveForm()
    closeDetail()
  }

  const handleDecline = (request) => {
    resolveProductRequestByTerminalOperator({
      requestId: request.id,
      decision: 'decline',
      remark: declineRemark || 'Declined by terminal operator',
    })
    closeDetail()
  }

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

  const renderRequestList = (rows) => (
    <div className="mx-auto max-w-lg space-y-2">
      {rows.map((request) => (
        <button
          key={request.id}
          type="button"
          onClick={() => openDetail(request)}
          className={clsx(
            'w-full rounded-xl border px-4 py-4 text-left transition hover:shadow-md',
            detailRequest?.id === request.id
              ? 'border-blue-500 bg-blue-50 shadow-sm dark:border-blue-400 dark:bg-blue-500/10'
              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600',
          )}
        >
          <p className="text-base font-semibold text-slate-900 dark:text-white">{request.stationName}</p>
        </button>
      ))}
    </div>
  )

  const renderStockSnapshot = (request) => {
    const stock = stationStockById.get(request.stationId)
    if (!stock) {
      return null
    }
    const productRemaining =
      request.requestedProductType === 'AGO' ? stock.agoRemaining : stock.pmsRemaining
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
        <p className="text-xs font-medium uppercase tracking-wide text-amber-800 dark:text-amber-300">
          Expected remaining stock
          {stock.latestReportDate ? ` · latest report ${stock.latestReportDate}` : ''}
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <DetailField
            label={`${request.requestedProductType} remaining`}
            value={`${Math.round(productRemaining).toLocaleString()} L`}
          />
          <DetailField
            label="Total remaining (PMS + AGO)"
            value={`${Math.round(stock.stockRemaining).toLocaleString()} L`}
          />
          <DetailField
            label="Est. days remaining"
            value={stock.daysRemaining ? `${stock.daysRemaining.toFixed(1)} days` : '—'}
            className="sm:col-span-2"
          />
        </div>
      </div>
    )
  }

  const renderPendingBody = (request) => (
    <>
      {renderStockSnapshot(request)}

      <div className="grid gap-5 sm:grid-cols-2">
        <DetailField label="Manager" value={request.managerName} />
        <DetailField label="Product" value={request.requestedProductType} />
        <DetailField
          label="Requested liters"
          value={`${Math.round(request.requestedLiters).toLocaleString()} L`}
        />
        <DetailField label="Status" value="Awaiting your decision" />
      </div>

      {request.managerRemark ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Manager remark
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-800 dark:text-slate-200">{request.managerRemark}</p>
        </div>
      ) : null}

      {request.lowStockPhotoUrls?.length ? (
        <EvidencePhotoList title="Tank dip / low stock proof" photos={request.lowStockPhotoUrls} />
      ) : null}

      <div className="space-y-3 border-t border-slate-200 pt-5 dark:border-slate-700">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">Your decision</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openApproveForm(request)}
            className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Approve & dispatch
          </button>
          <button
            type="button"
            onClick={() => handleDecline(request)}
            className="rounded-lg border border-rose-300 bg-rose-50 px-5 py-2.5 text-sm font-medium text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200"
          >
            Decline
          </button>
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Decline remark (optional)</span>
          <input
            value={declineRemark}
            onChange={(event) => setDeclineRemark(event.target.value)}
            placeholder="Reason if declining"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
      </div>
    </>
  )

  const renderHistoryBody = (request) => (
    <>
      {renderStockSnapshot(request)}

      <div className="grid gap-5 sm:grid-cols-2">
        <DetailField label="Manager" value={request.managerName} />
        <DetailField label="Product" value={request.requestedProductType} />
        <DetailField
          label="Requested liters"
          value={`${Math.round(request.requestedLiters).toLocaleString()} L`}
        />
        <DetailField label="Decided by" value={request.terminalName} />
      </div>

      {request.status === 'approved' ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            Dispatch details
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <DetailField
              label="Sent liters"
              value={request.approvedLiters ? `${Math.round(request.approvedLiters).toLocaleString()} L` : '—'}
            />
            <DetailField label="Cost/liter" value={formatNaira(request.costPricePerLiter)} />
            <DetailField label="Transport/liter" value={formatNaira(request.transportCostPerLiter)} />
            <DetailField label="Landing/liter" value={formatNaira(request.landingCostPerLiter)} />
            <DetailField label="Total landed cost" value={formatNaira(request.totalLandingCost)} />
            <DetailField label="Truck number" value={request.truckNumber} />
            <DetailField label="Truck driver" value={request.truckDriver} />
            <DetailField label="Remark" value={request.reasonOrRemark} className="sm:col-span-2" />
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 dark:border-rose-500/30 dark:bg-rose-500/10">
          <p className="text-xs font-medium uppercase tracking-wide text-rose-700 dark:text-rose-300">Decline reason</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-800 dark:text-slate-200">{request.reasonOrRemark}</p>
        </div>
      )}
    </>
  )

  return (
    <div className="space-y-4">
      <Card className="bg-gradient-to-r from-slate-900 to-blue-900 text-white">
        <h2 className="text-xl font-bold">Terminal Operator — Product Requests</h2>
        <p className="text-sm text-slate-200">
          Tap a station to open the request · Signed in as {currentUser?.name || 'Terminal Operator'}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setView('queue')}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              activeView === 'queue' ? 'bg-white text-slate-900' : 'bg-white/15 text-white hover:bg-white/25'
            }`}
          >
            Pending ({pendingRows.length})
          </button>
          <button
            type="button"
            onClick={() => setView('history')}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              activeView === 'history' ? 'bg-white text-slate-900' : 'bg-white/15 text-white hover:bg-white/25'
            }`}
          >
            History ({historyRows.length})
          </button>
        </div>
      </Card>

      {activeView === 'queue' && (
        <Card className="py-6">
          {pendingRows.length ? (
            renderRequestList(pendingRows)
          ) : (
            <EmptyState
              title="No pending requests"
              message="New manager product requests will appear here for your decision."
            />
          )}
        </Card>
      )}

      {activeView === 'history' && (
        <Card className="py-6">
          {historyRows.length ? (
            renderRequestList(historyRows)
          ) : (
            <EmptyState
              title="No decision history yet"
              message="Approved and declined requests will appear here."
            />
          )}
        </Card>
      )}

      {detailRequest && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
          onClick={closeDetail}
          role="presentation"
        >
          <div
            className="flex max-h-[min(90dvh,calc(100dvh-2rem))] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-slate-900 sm:max-h-[85dvh] sm:rounded-2xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="request-detail-title"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-6 pb-4 pt-6 dark:border-slate-700">
              <div className="min-w-0 flex-1">
                {activeView === 'history' ? (
                  <>
                    <p
                      className={clsx(
                        'text-xs font-medium uppercase tracking-wide',
                        detailRequest.status === 'approved'
                          ? 'text-emerald-600 dark:text-emerald-300'
                          : 'text-rose-600 dark:text-rose-300',
                      )}
                    >
                      {detailRequest.finalStatus}
                    </p>
                    <h3
                      id="request-detail-title"
                      className="mt-1 text-xl font-bold text-slate-900 dark:text-white sm:text-2xl"
                    >
                      {detailRequest.stationName}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Decided {detailRequest.decidedDate}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-medium uppercase tracking-wide text-blue-600 dark:text-blue-300">
                      Pending request
                    </p>
                    <h3
                      id="request-detail-title"
                      className="mt-1 text-xl font-bold text-slate-900 dark:text-white sm:text-2xl"
                    >
                      {detailRequest.stationName}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Submitted {detailRequest.createdDate}
                    </p>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={closeDetail}
                className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                aria-label="Close"
              >
                Close
              </button>
            </div>
            <div className="space-y-6 overflow-y-auto px-6 py-5">
              {activeView === 'history'
                ? renderHistoryBody(detailRequest)
                : renderPendingBody(detailRequest)}
            </div>
          </div>
        </div>
      )}

      {approveTarget && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Approve dispatch</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{approveTarget.stationName}</p>
            <div className="mt-4 space-y-3">
              <label className="block space-y-1">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Liters sending to station
                </span>
                <input
                  type="number"
                  min="1"
                  value={approveDraft.approvedLiters}
                  onChange={(event) =>
                    setApproveDraft((prev) => ({ ...prev, approvedLiters: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    Cost price/liter
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={approveDraft.costPricePerLiter}
                    onChange={(event) =>
                      setApproveDraft((prev) => ({ ...prev, costPricePerLiter: event.target.value }))
                    }
                    placeholder="e.g. 850"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    Transport/liter
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={approveDraft.transportCostPerLiter}
                    onChange={(event) =>
                      setApproveDraft((prev) => ({ ...prev, transportCostPerLiter: event.target.value }))
                    }
                    placeholder="e.g. 25"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                  />
                </label>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
                Landing/liter: <span className="font-semibold">{formatNaira(approveLandingPerLiter)}</span>
                {' | '}
                Total landed cost: <span className="font-semibold">{formatNaira(approveTotalLandingCost)}</span>
              </div>
              <label className="block space-y-1">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Truck number</span>
                <input
                  value={approveDraft.truckNumber}
                  onChange={(event) =>
                    setApproveDraft((prev) => ({ ...prev, truckNumber: event.target.value }))
                  }
                  placeholder="e.g. ABC-123"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Truck driver</span>
                <input
                  value={approveDraft.truckDriver}
                  onChange={(event) =>
                    setApproveDraft((prev) => ({ ...prev, truckDriver: event.target.value }))
                  }
                  placeholder="Driver full name"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Remark</span>
                <input
                  value={approveDraft.remark}
                  onChange={(event) => setApproveDraft((prev) => ({ ...prev, remark: event.target.value }))}
                  placeholder="Optional dispatch note for manager"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </label>
            </div>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={submitApprove}
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
              >
                Confirm approve
              </button>
              <button
                type="button"
                onClick={closeApproveForm}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TerminalOperatorDashboardPage

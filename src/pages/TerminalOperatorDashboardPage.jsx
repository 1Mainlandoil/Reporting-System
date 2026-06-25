import clsx from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Card from '../components/ui/Card'
import DateRangePicker from '../components/ui/DateRangePicker'
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

const emptyDirectDraft = {
  stationId: '',
  productType: 'PMS',
  liters: '',
  costPricePerLiter: '',
  transportCostPerLiter: '',
  truckNumber: '',
  truckDriver: '',
  remark: '',
}

const formatNaira = (value) => `NGN ${Number(value || 0).toLocaleString()}`
const formatLiters = (value) => `${Math.round(Number(value || 0)).toLocaleString()} L`
const formatDispatchDateTime = (value) => {
  if (!value) return { date: '-', time: '-' }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { date: '-', time: '-' }
  return {
    date: date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
    time: date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
  }
}
const historyStatusStyle = (status) => {
  const normalized = String(status || '').toLowerCase()
  if (normalized.includes('received')) return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
  if (normalized.includes('called') || normalized.includes('recall')) return 'border-amber-400/30 bg-amber-400/10 text-amber-300'
  if (normalized.includes('declined') || normalized.includes('issue')) return 'border-rose-400/30 bg-rose-400/10 text-rose-300'
  return 'border-lime-400/30 bg-lime-400/10 text-lime-300'
}
const getEffectiveDispatchStatus = (request) => (
  request?.receivedAt || request?.receivedTankDip != null
    ? 'received'
    : request?.dispatchStatus
)

const DetailField = ({ label, value, className = '', valueClassName = 'text-slate-900 dark:text-white' }) => (
  <div className={className}>
    <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
    <p className={`mt-1 text-sm font-medium ${valueClassName}`}>{value || '—'}</p>
  </div>
)

const TerminalSelect = ({ label, value, placeholder, options, onChange }) => {
  const [open, setOpen] = useState(false)
  const selected = options.find((option) => option.value === value)

  return (
    <div className="relative space-y-1">
      <span className="text-sm font-semibold text-slate-300">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-left text-sm font-semibold text-white shadow-inner shadow-black/20 outline-none transition hover:border-lime-400/30 focus:border-lime-400/60 focus:ring-2 focus:ring-lime-400/15"
      >
        <span className={selected ? 'text-white' : 'text-slate-500'}>
          {selected?.label || placeholder}
        </span>
        <span className="text-lime-400">v</span>
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-full z-40 mt-2 max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-slate-950 p-1 shadow-2xl shadow-black/40">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value)
                setOpen(false)
              }}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition ${
                option.value === value
                  ? 'bg-lime-400 text-slate-950'
                  : 'text-slate-200 hover:bg-white/10 hover:text-white'
              }`}
            >
              {option.label}
              {option.value === value ? <span>Selected</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

const TerminalOperatorDashboardPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const stations = useAppStore((state) => state.stations)
  const reports = useAppStore((state) => state.reports)
  const stockThresholds = useAppStore((state) => state.appSettings.stockThresholds)
  const productRequests = useAppStore((state) => state.productRequests)
  const currentUser = useAppStore((state) => state.currentUser)
  const createDirectTerminalDispatch = useAppStore((state) => state.createDirectTerminalDispatch)
  const callBackTerminalDispatch = useAppStore((state) => state.callBackTerminalDispatch)
  const deleteTerminalDispatch = useAppStore((state) => state.deleteTerminalDispatch)
  const rerouteTerminalDispatch = useAppStore((state) => state.rerouteTerminalDispatch)
  const resolveProductRequestByTerminalOperator = useAppStore(
    (state) => state.resolveProductRequestByTerminalOperator,
  )
  const [detailRequest, setDetailRequest] = useState(null)
  const [declineRemark, setDeclineRemark] = useState('')
  const [approveTarget, setApproveTarget] = useState(null)
  const [approveDraft, setApproveDraft] = useState(emptyApproveDraft)
  const [directDraft, setDirectDraft] = useState(emptyDirectDraft)
  const [directReviewOpen, setDirectReviewOpen] = useState(false)
  const [directSubmitting, setDirectSubmitting] = useState(false)
  const [callbackTarget, setCallbackTarget] = useState(null)
  const [callbackReason, setCallbackReason] = useState('')
  const [actionMenuId, setActionMenuId] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)
  const [historyRange, setHistoryRange] = useState({ from: '', to: '' })
  const [rerouteTarget, setRerouteTarget] = useState(null)
  const [rerouteStationId, setRerouteStationId] = useState('')
  const [rerouteReason, setRerouteReason] = useState('')
  const [rerouteSubmitting, setRerouteSubmitting] = useState(false)
  const detailRequestId = detailRequest?.id || ''

  const activeView = ['requests', 'direct', 'history', 'reviews', 'costing', 'stock', 'reports'].includes(searchParams.get('view'))
    ? searchParams.get('view')
    : 'dashboard'

  useEffect(() => {
    if (!detailRequestId) return
    const freshRequest = productRequests.find((request) => request.id === detailRequestId)
    if (freshRequest) {
      const stationName = stations.find((station) => station.id === freshRequest.stationId)?.name || freshRequest.stationId
      setDetailRequest((current) => ({
        ...current,
        ...freshRequest,
        stationName,
        createdDate: freshRequest.createdAt?.split('T')[0] || current?.createdDate || '-',
        decidedDate: freshRequest.terminalReviewedAt?.split('T')[0] || current?.decidedDate || '-',
        finalStatus: getDispatchStatusLabel(freshRequest),
        reasonOrRemark: freshRequest.terminalRemark || freshRequest.managerRemark || current?.reasonOrRemark || '-',
      }))
    }
  }, [detailRequestId, productRequests, stations])

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
          finalStatus:
            getEffectiveDispatchStatus(request) === 'called_back'
              ? 'Called back'
              : getEffectiveDispatchStatus(request) === 'received'
                ? 'Received'
                : getEffectiveDispatchStatus(request) === 'issue_reported'
                  ? 'Issue reported'
                  : getEffectiveDispatchStatus(request) === 'dispatched'
                    ? 'Dispatched'
                    : request.status === 'declined'
                      ? 'Declined'
                      : request.managerStatusLabel || request.status || 'Requested',
          reasonOrRemark: request.terminalRemark || request.managerRemark || '-',
        }))
        .sort((a, b) => new Date(b.terminalReviewedAt) - new Date(a.terminalReviewedAt)),
    [productRequests, stations],
  )

  const filteredHistoryRows = useMemo(() => {
    if (!historyRange.from && !historyRange.to) {
      return historyRows
    }
    return historyRows.filter((request) => {
      const decidedDate = request.terminalReviewedAt?.split('T')[0] || ''
      if (!decidedDate) return false
      if (historyRange.from && decidedDate < historyRange.from) return false
      if (historyRange.to && decidedDate > historyRange.to) return false
      return true
    })
  }, [historyRange.from, historyRange.to, historyRows])

  const approvedDispatches = useMemo(
    () => historyRows.filter((request) => request.status === 'approved' && getEffectiveDispatchStatus(request) !== 'called_back'),
    [historyRows],
  )

  const confirmedDeliveries = useMemo(
    () =>
      productRequests
        .filter((request) => getEffectiveDispatchStatus(request) === 'received')
        .map((request) => ({
          ...request,
          stationName: stations.find((station) => station.id === request.stationId)?.name || request.stationId,
        }))
        .sort((a, b) => new Date(b.receivedAt || b.updatedAt) - new Date(a.receivedAt || a.updatedAt)),
    [productRequests, stations],
  )

  const todayIso = new Date().toISOString().split('T')[0]
  const todaysDispatches = useMemo(
    () => approvedDispatches.filter((request) => request.terminalReviewedAt?.startsWith(todayIso)),
    [approvedDispatches, todayIso],
  )

  const activeRows = activeView === 'history' ? filteredHistoryRows : pendingRows
  const approveLiters = Number(approveDraft.approvedLiters || 0)
  const approveCostPerLiter = Number(approveDraft.costPricePerLiter || 0)
  const approveTransportPerLiter = Number(approveDraft.transportCostPerLiter || 0)
  const approveLandingPerLiter = approveCostPerLiter + approveTransportPerLiter
  const approveTotalLandingCost = approveLiters * approveLandingPerLiter
  const directLiters = Number(directDraft.liters || 0)
  const directCostPerLiter = Number(directDraft.costPricePerLiter || 0)
  const directTransportPerLiter = Number(directDraft.transportCostPerLiter || 0)
  const directLandingPerLiter = directCostPerLiter + directTransportPerLiter
  const directTotalLandingCost = directLiters * directLandingPerLiter

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

  const terminalMetrics = useMemo(() => {
    const pmsToday = todaysDispatches
      .filter((request) => (request.approvedProductType || request.requestedProductType) === 'PMS')
      .reduce((sum, request) => sum + Number(request.approvedLiters || 0), 0)
    const agoToday = todaysDispatches
      .filter((request) => (request.approvedProductType || request.requestedProductType) === 'AGO')
      .reduce((sum, request) => sum + Number(request.approvedLiters || 0), 0)
    const landedCost = todaysDispatches.reduce((sum, request) => sum + Number(request.totalLandingCost || 0), 0)
    const totalLiters = todaysDispatches.reduce((sum, request) => sum + Number(request.approvedLiters || 0), 0)
    const totalPmsStock = Array.from(stationStockById.values()).reduce(
      (sum, stock) => sum + Number(stock.pmsRemaining || 0),
      0,
    )
    const totalAgoStock = Array.from(stationStockById.values()).reduce(
      (sum, stock) => sum + Number(stock.agoRemaining || 0),
      0,
    )

    return {
      pending: pendingRows.length,
      approvedToday: todaysDispatches.length,
      pmsToday,
      agoToday,
      landedCost,
      averageLandingCost: totalLiters ? landedCost / totalLiters : 0,
      totalPmsStock,
      totalAgoStock,
    }
  }, [pendingRows.length, stationStockById, todaysDispatches])

  useEffect(() => {
    setDetailRequest(null)
    setDeclineRemark('')
  }, [activeView])

  useEffect(() => {
    if (detailRequestId && !activeRows.some((request) => request.id === detailRequestId)) {
      setDetailRequest(null)
    }
  }, [activeRows, detailRequestId])

  useEffect(() => {
    setDeclineRemark('')
  }, [detailRequestId])

  const openDetail = (request) => {
    setDetailRequest(request)
  }

  const closeDetail = () => {
    setDetailRequest(null)
    setDeclineRemark('')
  }

  const getDispatchStatusLabel = (request) => {
    const dispatchStatus = getEffectiveDispatchStatus(request)
    if (dispatchStatus === 'called_back') return 'Called back'
    if (dispatchStatus === 'received') return 'Received'
    if (dispatchStatus === 'issue_reported') return 'Issue reported'
    if (dispatchStatus === 'dispatched') return 'Dispatched'
    if (request.status === 'declined') return 'Declined'
    return request.managerStatusLabel || request.status || 'Requested'
  }

  const isDispatchUsedInReport = (request) => {
    const productKey = String(request.approvedProductType || request.requestedProductType || 'PMS').toLowerCase()
    const dispatchDate = request.terminalReviewedAt?.split('T')[0] || request.updatedAt?.split('T')[0] || ''
    if (!dispatchDate) return false
    return reports.some((report) => {
      if (report.stationId !== request.stationId || String(report.date || '') < dispatchDate) return false
      return getReceivedForProduct(report, productKey) > 0
    })
  }

  const getCallbackBlockReason = (request) => {
    if (getEffectiveDispatchStatus(request) !== 'dispatched') return 'Only active dispatched products can be called back.'
    if (request.receivedAt || request.receivedTankDip != null) return 'Manager has already marked this product as received.'
    if (isDispatchUsedInReport(request)) return 'Station report already used received product for this dispatch period.'
    return ''
  }

  const openCallbackForm = (request) => {
    const blockReason = getCallbackBlockReason(request)
    if (blockReason) {
      window.alert(blockReason)
      return
    }
    setCallbackTarget(request)
    setCallbackReason('')
  }

  const closeCallbackForm = () => {
    setCallbackTarget(null)
    setCallbackReason('')
  }

  const submitCallback = () => {
    if (!callbackTarget) return
    const blockReason = getCallbackBlockReason(callbackTarget)
    if (blockReason) {
      window.alert(blockReason)
      closeCallbackForm()
      return
    }
    if (!String(callbackReason || '').trim()) {
      window.alert('Enter callback reason.')
      return
    }
    callBackTerminalDispatch({ requestId: callbackTarget.id, reason: callbackReason })
    closeCallbackForm()
    closeDetail()
  }

  const submitDeleteDispatch = async () => {
    if (!deleteTarget) return
    setDeleteSubmitting(true)
    const result = await deleteTerminalDispatch(deleteTarget.id).finally(() => setDeleteSubmitting(false))
    if (result?.ok === false) {
      window.alert(result.message || 'Could not delete dispatch.')
      return
    }
    if (detailRequest?.id === deleteTarget.id) {
      closeDetail()
    }
    setDeleteTarget(null)
    setActionMenuId('')
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

  const validateDirectDispatch = () => {
    if (!directDraft.stationId) {
      window.alert('Select the station receiving product.')
      return false
    }
    if (directLiters <= 0) {
      window.alert('Enter the liters being sent.')
      return false
    }
    if (directCostPerLiter <= 0) {
      window.alert('Enter the product cost price per liter.')
      return false
    }
    if (directTransportPerLiter < 0) {
      window.alert('Transport cost per liter cannot be negative.')
      return false
    }
    if (!String(directDraft.truckNumber || '').trim()) {
      window.alert('Enter the truck number.')
      return false
    }
    if (!String(directDraft.truckDriver || '').trim()) {
      window.alert('Enter the truck driver name.')
      return false
    }
    return true
  }

  const reviewDirectDispatch = () => {
    if (!validateDirectDispatch()) return
    setDirectReviewOpen(true)
  }

  const submitDirectDispatch = async () => {
    if (!validateDirectDispatch()) return

    setDirectSubmitting(true)
    const result = await createDirectTerminalDispatch({
        stationId: directDraft.stationId,
        productType: directDraft.productType,
        liters: directLiters,
        costPricePerLiter: directCostPerLiter,
        transportCostPerLiter: directTransportPerLiter,
        truckNumber: directDraft.truckNumber,
        truckDriver: directDraft.truckDriver,
        remark: directDraft.remark,
      })
      .finally(() => setDirectSubmitting(false))

    if (result?.ok === false) {
      window.alert(result.message || 'Could not save dispatch. Please try again.')
      return
    }

    setDirectDraft(emptyDirectDraft)
    setDirectReviewOpen(false)
    setView('history')
  }

  const setView = (view) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (view && view !== 'dashboard') {
        next.set('view', view)
      } else {
        next.delete('view')
      }
      return next
    })
  }

  const renderRequestList = (rows) => (
    <div className="mx-auto max-w-2xl space-y-2">
      {rows.map((request) => {
        const product = request.approvedProductType || request.requestedProductType || 'Product'
        const liters = request.approvedLiters || request.requestedLiters || 0
        const decidedAt = request.terminalReviewedAt || request.updatedAt || request.createdAt
        const decidedTime = formatDispatchDateTime(decidedAt)
        return (
          <div
            key={request.id}
            className={clsx(
              'relative flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition hover:shadow-md',
              detailRequest?.id === request.id
                ? 'border-blue-500 bg-blue-50 shadow-sm dark:border-blue-400 dark:bg-blue-500/10'
                : 'border-white/10 bg-slate-900 hover:border-lime-400/30 hover:bg-slate-800 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600',
            )}
          >
            <button
              type="button"
              onClick={() => openDetail(request)}
              className="min-w-0 flex-1 py-1 text-left"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-base font-black text-white">{request.stationName}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-300">
                    {product} - {formatLiters(liters)}
                  </p>
                </div>
                {activeView === 'history' ? (
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${historyStatusStyle(request.finalStatus)}`}>
                    {request.finalStatus}
                  </span>
                ) : null}
              </div>
              {activeView === 'history' ? (
                <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
                  <span>
                    <span className="font-bold text-slate-500">Date:</span>{' '}
                    <span className="text-slate-200">{decidedTime.date}</span>
                  </span>
                  <span>
                    <span className="font-bold text-slate-500">Time:</span>{' '}
                    <span className="text-slate-200">{decidedTime.time}</span>
                  </span>
                  <span className="truncate">
                    <span className="font-bold text-slate-500">Truck:</span>{' '}
                    <span className="text-slate-200">{request.truckNumber || '-'}</span>
                  </span>
                  <span className="truncate">
                    <span className="font-bold text-slate-500">Driver:</span>{' '}
                    <span className="text-slate-200">{request.truckDriver || '-'}</span>
                  </span>
                </div>
              ) : null}
            </button>
            {activeView === 'history' ? (
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    setActionMenuId((current) => (current === request.id ? '' : request.id))
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-lg font-black text-slate-200 transition hover:border-lime-400/30 hover:text-white"
                  aria-label="Dispatch actions"
                >
                  ...
                </button>
                {actionMenuId === request.id ? (
                  <div className="absolute right-0 top-11 z-30 w-44 rounded-xl border border-white/10 bg-slate-950 p-1 shadow-2xl">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        setDeleteTarget(request)
                        setActionMenuId('')
                      }}
                      className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold text-rose-200 transition hover:bg-rose-500/15 hover:text-rose-100"
                    >
                      Delete dispatch
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )
      })}
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
        <DetailField label="Dispatch status" value={getDispatchStatusLabel(request)} />
      </div>

      {request.status === 'approved' || request.dispatchStatus === 'called_back' ? (
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
          {getEffectiveDispatchStatus(request) === 'called_back' ? (
            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
              <DetailField label="Callback reason" value={request.callbackReason || '-'} />
              <DetailField label="Called back by" value={request.calledBackBy || '-'} className="mt-3" />
            </div>
          ) : null}
          {getEffectiveDispatchStatus(request) === 'dispatched' ? (
            <div className="mt-4 space-y-3 border-t border-emerald-500/20 pt-4">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRerouteTarget(request)
                    setRerouteStationId('')
                    setRerouteReason('')
                  }}
                  className="rounded-xl border border-amber-400/50 bg-amber-400/10 px-4 py-2 text-sm font-black text-amber-300 shadow-sm transition hover:bg-amber-400/20"
                >
                  Reroute Truck
                </button>
                <button
                  type="button"
                  onClick={() => openCallbackForm(request)}
                  className="rounded-xl border border-rose-500 bg-rose-100 px-4 py-2 text-sm font-black text-rose-800 shadow-sm transition hover:bg-rose-200 dark:border-rose-400/70 dark:bg-rose-500/20 dark:text-rose-100 dark:hover:bg-rose-500/30"
                >
                  Recall dispatch
                </button>
              </div>
              <p className="text-xs text-slate-500">Reroute sends this truck to a different station. Recall removes the dispatch entirely.</p>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 dark:border-rose-500/30 dark:bg-rose-500/10">
          <p className="text-xs font-medium uppercase tracking-wide text-rose-700 dark:text-rose-300">Decline reason</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-800 dark:text-slate-200">{request.reasonOrRemark}</p>
        </div>
      )}
    </>
  )

  const MetricCard = ({ label, value, note, tone = 'default' }) => (
    <div
      className={clsx(
        'rounded-2xl border p-5',
        tone === 'green'
          ? 'border-emerald-500/30 bg-emerald-500/10'
          : tone === 'amber'
            ? 'border-amber-500/30 bg-amber-500/10'
            : 'border-white/10 bg-slate-900 dark:border-slate-800 dark:bg-slate-900/70',
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
      {note ? <p className="mt-1 text-sm text-slate-300">{note}</p> : null}
    </div>
  )

  const renderDashboard = () => (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Pending requests" value={terminalMetrics.pending} tone="amber" />
        <MetricCard label="Approved today" value={terminalMetrics.approvedToday} tone="green" />
        <MetricCard label="PMS dispatched" value={formatLiters(terminalMetrics.pmsToday)} />
        <MetricCard label="AGO dispatched" value={formatLiters(terminalMetrics.agoToday)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-lime-400">Pending actions</p>
              <h3 className="text-lg font-bold text-white">Station requests awaiting dispatch</h3>
            </div>
            <button
              type="button"
              onClick={() => setView('requests')}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
            >
              Open
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {pendingRows.slice(0, 4).map((request) => (
              <button
                key={request.id}
                type="button"
                onClick={() => openDetail(request)}
                className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-left hover:border-lime-400/30 hover:bg-slate-800 dark:border-slate-800 dark:bg-slate-900"
              >
                <span>
                  <span className="block font-bold text-white">{request.stationName}</span>
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    {request.requestedProductType} - {formatLiters(request.requestedLiters)}
                  </span>
                </span>
                <span className="text-xs font-bold uppercase text-amber-600 dark:text-amber-300">Pending</span>
              </button>
            ))}
            {!pendingRows.length ? <EmptyState title="No pending requests" message="All station requests are clear." /> : null}
          </div>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-lime-400">Costing snapshot</p>
          <div className="mt-4 space-y-4">
            <DetailField
              label="Average landing/liter today"
              value={formatNaira(terminalMetrics.averageLandingCost)}
              valueClassName="text-white"
            />
            <DetailField
              label="Total landed cost today"
              value={formatNaira(terminalMetrics.landedCost)}
              valueClassName="text-white"
            />
            <DetailField label="Recent dispatches" value={approvedDispatches.length} valueClassName="text-white" />
          </div>
        </Card>
      </div>
    </div>
  )

  const renderDirectDispatch = () => {
    if (directReviewOpen) {
      return (
        <Card>
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-lime-400">Review dispatch</p>
            <h3 className="mt-1 text-2xl font-black text-white">Confirm product dispatch</h3>
            <p className="mt-2 text-sm text-slate-300">Check the dispatch details before sending it to the station.</p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <DetailField
                label="Station"
                value={stations.find((station) => station.id === directDraft.stationId)?.name || '-'}
                valueClassName="text-white"
                className="rounded-2xl border border-white/8 bg-slate-900 p-4"
              />
              <DetailField label="Product" value={directDraft.productType} valueClassName="text-white" className="rounded-2xl border border-white/8 bg-slate-900 p-4" />
              <DetailField label="Liters" value={formatLiters(directLiters)} valueClassName="text-white" className="rounded-2xl border border-white/8 bg-slate-900 p-4" />
              <DetailField label="Cost/liter" value={formatNaira(directCostPerLiter)} valueClassName="text-white" className="rounded-2xl border border-white/8 bg-slate-900 p-4" />
              <DetailField label="Transport/liter" value={formatNaira(directTransportPerLiter)} valueClassName="text-white" className="rounded-2xl border border-white/8 bg-slate-900 p-4" />
              <DetailField label="Landing/liter" value={formatNaira(directLandingPerLiter)} valueClassName="text-lime-300" className="rounded-2xl border border-lime-400/20 bg-lime-400/10 p-4" />
              <DetailField label="Total landed cost" value={formatNaira(directTotalLandingCost)} valueClassName="text-lime-300" className="rounded-2xl border border-lime-400/20 bg-lime-400/10 p-4 sm:col-span-2" />
              <DetailField label="Truck number" value={directDraft.truckNumber} valueClassName="text-white" className="rounded-2xl border border-white/8 bg-slate-900 p-4" />
              <DetailField label="Truck driver" value={directDraft.truckDriver} valueClassName="text-white" className="rounded-2xl border border-white/8 bg-slate-900 p-4" />
              <DetailField label="Remark" value={directDraft.remark || '-'} valueClassName="text-white" className="rounded-2xl border border-white/8 bg-slate-900 p-4 sm:col-span-2" />
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={submitDirectDispatch}
                disabled={directSubmitting}
                className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-700"
              >
                {directSubmitting ? 'Saving dispatch...' : 'Confirm dispatch'}
              </button>
              <button
                type="button"
                onClick={() => setDirectReviewOpen(false)}
                className="rounded-xl border border-white/10 bg-slate-900 px-6 py-3 text-sm font-bold text-slate-200 hover:border-lime-400/30 hover:text-white"
              >
                Edit details
              </button>
            </div>
          </div>
        </Card>
      )
    }

    return (
      <Card>
        <div className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-lime-400">Direct dispatch</p>
        <h3 className="mt-1 text-2xl font-black text-white">Send product without a station request</h3>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <TerminalSelect
            label="Station"
            value={directDraft.stationId}
            placeholder="Select station"
            options={stations.map((station) => ({ value: station.id, label: station.name }))}
            onChange={(value) => {
              setDirectReviewOpen(false)
              setDirectDraft((prev) => ({ ...prev, stationId: value }))
            }}
          />
          <TerminalSelect
            label="Product"
            value={directDraft.productType}
            placeholder="Select product"
            options={[
              { value: 'PMS', label: 'PMS' },
              { value: 'AGO', label: 'AGO' },
            ]}
            onChange={(value) => {
              setDirectReviewOpen(false)
              setDirectDraft((prev) => ({ ...prev, productType: value }))
            }}
          />
          {[
            ['liters', 'Liters sending'],
            ['costPricePerLiter', 'Cost price/liter'],
            ['transportCostPerLiter', 'Transport/liter'],
            ['truckNumber', 'Truck number'],
            ['truckDriver', 'Truck driver'],
            ['remark', 'Remark'],
          ].map(([key, label]) => (
            <label key={key} className="space-y-1">
              <span className="text-sm font-semibold text-slate-300">{label}</span>
              <input
                type={key.includes('Liter') || key === 'liters' ? 'number' : 'text'}
                min={key.includes('Liter') || key === 'liters' ? '0' : undefined}
                step={key.includes('Liter') ? '0.01' : undefined}
                value={directDraft[key]}
                onChange={(event) => {
                  setDirectReviewOpen(false)
                  setDirectDraft((prev) => ({ ...prev, [key]: event.target.value }))
                }}
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-semibold text-white placeholder:text-slate-500 shadow-inner shadow-black/20 outline-none transition hover:border-lime-400/30 focus:border-lime-400/60 focus:ring-2 focus:ring-lime-400/15"
              />
            </label>
          ))}
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200">Landing cost per liter</p>
            <p className="mt-1 text-xl font-black text-white">{formatNaira(directLandingPerLiter)}</p>
            <p className="mt-1 text-xs text-slate-400">Cost/liter + transport/liter</p>
          </div>
          <div className="rounded-2xl border border-lime-400/30 bg-lime-400/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-lime-300">Total landed cost</p>
            <p className="mt-1 text-xl font-black text-white">{formatNaira(directTotalLandingCost)}</p>
            <p className="mt-1 text-xs text-slate-400">Liters x landing cost per liter</p>
          </div>
        </div>
        <button
          type="button"
          onClick={reviewDirectDispatch}
          className="mt-5 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-700"
        >
          Review dispatch
        </button>
        </div>
      </Card>
    )
  }

  const renderDeliveryReviews = () => (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-wide text-lime-400">Delivery Reviews</p>
      <h3 className="mt-1 text-xl font-black text-white">Station-confirmed receipts</h3>
      <p className="mt-1 text-sm text-slate-400">All dispatches confirmed received by station managers.</p>
      {confirmedDeliveries.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="No confirmed deliveries yet" message="When a manager confirms receipt of a dispatch, it will appear here." />
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {confirmedDeliveries.map((delivery) => (
            <div key={delivery.id} className="rounded-2xl border border-white/10 bg-slate-900 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-white">{delivery.stationName}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {delivery.approvedProductType || delivery.requestedProductType} · Received {delivery.receivedAt ? new Date(delivery.receivedAt).toLocaleDateString('en-GB') : '—'}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-400">Received</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                <DetailField label="Sent liters" value={delivery.approvedLiters ? `${Math.round(delivery.approvedLiters).toLocaleString()} L` : '—'} valueClassName="text-white" />
                <DetailField label="Tank dip confirmed" value={delivery.receivedTankDip != null ? `${Number(delivery.receivedTankDip).toLocaleString()} L` : '—'} valueClassName="text-lime-300" />
                <DetailField label="Received by" value={delivery.receivedBy || '—'} valueClassName="text-white" />
                <DetailField label="Truck number" value={delivery.truckNumber || '—'} valueClassName="text-white" />
                <DetailField label="Truck driver" value={delivery.truckDriver || '—'} valueClassName="text-white" />
                <DetailField label="Dispatched by" value={delivery.terminalName || '—'} valueClassName="text-white" />
              </div>
              {delivery.receivedRemark ? (
                <div className="rounded-xl border border-white/8 bg-white/5 px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Manager remark</p>
                  <p className="mt-1 text-sm text-slate-200">{delivery.receivedRemark}</p>
                </div>
              ) : null}
              {delivery.reroutedFrom ? (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">Rerouted</p>
                  <p className="mt-0.5 text-xs text-slate-300">
                    Originally destined for {stations.find((s) => s.id === delivery.reroutedFrom)?.name || delivery.reroutedFrom}.
                    {delivery.rerouteReason ? ` Reason: ${delivery.rerouteReason}` : ''}
                  </p>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Card>
  )

  const renderCosting = () => (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-wide text-lime-400">Costing</p>
      <h3 className="mt-1 text-xl font-black text-white">Approved dispatch costing</h3>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <MetricCard label="Average landing/liter" value={formatNaira(terminalMetrics.averageLandingCost)} />
        <MetricCard label="Total product cost" value={formatNaira(approvedDispatches.reduce((sum, request) => sum + Number(request.totalProductCost || 0), 0))} />
        <MetricCard label="Total transport cost" value={formatNaira(approvedDispatches.reduce((sum, request) => sum + Number(request.totalTransportCost || 0), 0))} />
      </div>
    </Card>
  )

  const renderStock = () => (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-wide text-lime-400">Terminal stock view</p>
      <h3 className="mt-1 text-xl font-black text-white">Station stock visibility</h3>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <MetricCard label="PMS across stations" value={formatLiters(terminalMetrics.totalPmsStock)} />
        <MetricCard label="AGO across stations" value={formatLiters(terminalMetrics.totalAgoStock)} />
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {stations.map((station) => {
          const stock = stationStockById.get(station.id)
          return (
            <div key={station.id} className="rounded-xl border border-white/10 bg-slate-900 p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="font-bold text-white">{station.name}</p>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">PMS: {formatLiters(stock?.pmsRemaining)}</p>
              <p className="text-sm text-slate-600 dark:text-slate-300">AGO: {formatLiters(stock?.agoRemaining)}</p>
            </div>
          )
        })}
      </div>
    </Card>
  )

  const renderReports = () => (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-wide text-lime-400">Reports</p>
      <h3 className="mt-1 text-xl font-black text-white">Dispatch report summary</h3>
      <div className="mt-5 grid gap-4 md:grid-cols-4">
        <MetricCard label="All dispatches" value={approvedDispatches.length} />
        <MetricCard label="PMS total" value={formatLiters(approvedDispatches.filter((request) => (request.approvedProductType || request.requestedProductType) === 'PMS').reduce((sum, request) => sum + Number(request.approvedLiters || 0), 0))} />
        <MetricCard label="AGO total" value={formatLiters(approvedDispatches.filter((request) => (request.approvedProductType || request.requestedProductType) === 'AGO').reduce((sum, request) => sum + Number(request.approvedLiters || 0), 0))} />
        <MetricCard label="Landed cost" value={formatNaira(approvedDispatches.reduce((sum, request) => sum + Number(request.totalLandingCost || 0), 0))} />
      </div>
    </Card>
  )

  const pageTitleByView = {
    dashboard: 'Terminal Dashboard',
    requests: 'Station Requests',
    direct: 'Direct Dispatch',
    history: 'Dispatch History',
    reviews: 'Delivery Reviews',
    costing: 'Costing',
    stock: 'Terminal Stock',
    reports: 'Reports',
  }

  const pageSubtitleByView = {
    dashboard: 'Today\'s dispatch position, pending station requests and costing snapshot.',
    requests: 'Review product requests submitted by stations and approve or decline dispatch.',
    direct: 'Send product to a station without waiting for a station request.',
    history: 'Approved and declined terminal dispatch records.',
    reviews: 'Deliveries confirmed received by station managers, with tank dip readings and remarks.',
    costing: 'Cost per liter, transport cost and landed cost summary.',
    stock: 'Latest stock visibility from station reports.',
    reports: 'Dispatch totals prepared for review and export.',
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-5 py-4">
        <div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-lime-400">Terminal operations</p>
            <h2 className="mt-1 text-xl font-black text-white">{pageTitleByView[activeView]}</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">{pageSubtitleByView[activeView]}</p>
          </div>
        </div>
      </div>

      {activeView === 'dashboard' ? renderDashboard() : null}

      {activeView === 'requests' && (
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

      {activeView === 'direct' ? renderDirectDispatch() : null}

      {activeView === 'history' && (
        <Card className="py-6">
          <div className="mx-auto mb-5 flex max-w-lg justify-end px-1">
            <DateRangePicker
              from={historyRange.from}
              to={historyRange.to}
              onChange={setHistoryRange}
              label="History date"
              emptyLabel="All dates"
              align="right"
            />
          </div>
          {filteredHistoryRows.length ? (
            renderRequestList(filteredHistoryRows)
          ) : (
            <EmptyState
              title="No history in this date range"
              message="Clear the calendar or choose another date range."
            />
          )}
        </Card>
      )}

      {activeView === 'reviews' ? renderDeliveryReviews() : null}
      {activeView === 'costing' ? renderCosting() : null}
      {activeView === 'stock' ? renderStock() : null}
      {activeView === 'reports' ? renderReports() : null}

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

      {callbackTarget && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-950 p-6 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Recall dispatch</p>
            <h3 className="mt-1 text-lg font-bold text-white">{callbackTarget.stationName}</h3>
            <p className="mt-2 text-sm text-slate-300">
              This reverses this dispatch and removes it from active dispatch and costing totals. It only works before the manager confirms receipt.
            </p>
            <div className="mt-4 rounded-xl border border-white/10 bg-slate-900 p-3">
              <DetailField
                label="Product"
                value={`${callbackTarget.approvedProductType || callbackTarget.requestedProductType} - ${formatLiters(callbackTarget.approvedLiters || callbackTarget.requestedLiters)}`}
                valueClassName="text-white"
              />
              <DetailField label="Truck" value={callbackTarget.truckNumber || '-'} valueClassName="text-white" className="mt-3" />
            </div>
            <label className="mt-4 block space-y-1">
              <span className="text-sm font-semibold text-slate-300">Reason for recall</span>
              <textarea
                value={callbackReason}
                onChange={(event) => setCallbackReason(event.target.value)}
                rows={3}
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-amber-400/60 focus:ring-2 focus:ring-amber-400/15"
                placeholder="e.g. Wrong station, wrong quantity, duplicate dispatch..."
              />
            </label>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={submitCallback}
                className="flex-1 rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-amber-400"
              >
                Confirm recall
              </button>
              <button
                type="button"
                onClick={closeCallbackForm}
                className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-bold text-slate-200 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-slate-950 p-6 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-300">Delete dispatch</p>
            <h3 className="mt-1 text-lg font-black text-white">{deleteTarget.stationName}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              This will permanently remove this dispatch record. Use it only for wrong or duplicate dispatch entries.
            </p>
            <div className="mt-4 rounded-xl border border-white/10 bg-slate-900 p-3">
              <DetailField
                label="Product"
                value={`${deleteTarget.approvedProductType || deleteTarget.requestedProductType} - ${formatLiters(deleteTarget.approvedLiters || deleteTarget.requestedLiters)}`}
                valueClassName="text-white"
              />
              <DetailField label="Truck" value={deleteTarget.truckNumber || '-'} valueClassName="text-white" className="mt-3" />
            </div>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={submitDeleteDispatch}
                disabled={deleteSubmitting}
                className="flex-1 rounded-xl bg-rose-600 px-4 py-3 text-sm font-black text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleteSubmitting ? 'Deleting...' : 'Delete dispatch'}
              </button>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteSubmitting}
                className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-bold text-slate-200 hover:text-white disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {rerouteTarget && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-amber-500/30 bg-slate-950 p-6 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Reroute Truck</p>
            <h3 className="mt-1 text-lg font-bold text-white">{rerouteTarget.stationName}</h3>
            <p className="mt-2 text-sm text-slate-300">
              The truck is currently dispatched to this station. Select a new destination — this must be done before the manager confirms receipt.
            </p>
            <div className="mt-4 rounded-xl border border-white/10 bg-slate-900 p-3">
              <DetailField
                label="Product"
                value={`${rerouteTarget.approvedProductType || rerouteTarget.requestedProductType} - ${formatLiters(rerouteTarget.approvedLiters || rerouteTarget.requestedLiters)}`}
                valueClassName="text-white"
              />
              <DetailField label="Truck" value={rerouteTarget.truckNumber || '-'} valueClassName="text-white" className="mt-3" />
            </div>
            <div className="mt-4 space-y-3">
              <TerminalSelect
                label="New destination station"
                value={rerouteStationId}
                placeholder="Select station"
                options={stations
                  .filter((s) => s.id !== rerouteTarget.stationId)
                  .map((s) => ({ value: s.id, label: s.name }))}
                onChange={setRerouteStationId}
              />
              <label className="block space-y-1">
                <span className="text-sm font-semibold text-slate-300">Reason for reroute <span className="text-amber-400">*</span></span>
                <textarea
                  value={rerouteReason}
                  onChange={(e) => setRerouteReason(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-amber-400/60 focus:ring-2 focus:ring-amber-400/15"
                  placeholder="e.g. Station closed, stock already full, wrong routing..."
                />
              </label>
            </div>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                disabled={!rerouteStationId || !rerouteReason.trim() || rerouteSubmitting}
                onClick={() => {
                  if (!rerouteStationId || !rerouteReason.trim()) return
                  setRerouteSubmitting(true)
                  rerouteTerminalDispatch({ requestId: rerouteTarget.id, newStationId: rerouteStationId, reason: rerouteReason.trim() })
                  setRerouteSubmitting(false)
                  setRerouteTarget(null)
                  closeDetail()
                }}
                className="flex-1 rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {rerouteSubmitting ? 'Rerouting...' : 'Confirm Reroute'}
              </button>
              <button
                type="button"
                onClick={() => setRerouteTarget(null)}
                className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-bold text-slate-200 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {approveTarget && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Approve dispatch</h3>
            <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-300">{approveTarget.stationName}</p>
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
                  className="w-full rounded-lg border border-slate-400 bg-white px-3 py-2 text-sm font-medium text-slate-950 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-400"
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
                    className="w-full rounded-lg border border-slate-400 bg-white px-3 py-2 text-sm font-medium text-slate-950 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-400"
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
                    className="w-full rounded-lg border border-slate-400 bg-white px-3 py-2 text-sm font-medium text-slate-950 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-400"
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
                  className="w-full rounded-lg border border-slate-400 bg-white px-3 py-2 text-sm font-medium text-slate-950 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-400"
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
                  className="w-full rounded-lg border border-slate-400 bg-white px-3 py-2 text-sm font-medium text-slate-950 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-400"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Remark</span>
                <input
                  value={approveDraft.remark}
                  onChange={(event) => setApproveDraft((prev) => ({ ...prev, remark: event.target.value }))}
                  placeholder="Optional dispatch note for manager"
                  className="w-full rounded-lg border border-slate-400 bg-white px-3 py-2 text-sm font-medium text-slate-950 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-400"
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
                className="rounded-lg border border-slate-400 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
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


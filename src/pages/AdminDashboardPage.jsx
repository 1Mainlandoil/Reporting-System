import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import Card from '../components/ui/Card'
import DataTable from '../components/ui/DataTable'
import StatusBadge from '../components/ui/StatusBadge'
import FilterBar from '../components/ui/FilterBar'
import EmptyState from '../components/ui/EmptyState'
import ColumnPicker from '../components/ui/ColumnPicker'
import { exportAdminDailyReviewToExcel, exportStationsToExcel } from '../utils/exportExcel'
import { useAppStore } from '../store/useAppStore'
import { buildStationMetrics } from '../utils/stock'
import { columnsToExportSpecs, filterColumnsForTable } from '../utils/columnVisibility'
import { matchesStationMultiFilter } from '../utils/filterUtils'
import { formatPendingSubmissionSummary, getDailyReportPendingInfo } from '../utils/reportPending'

const AdminDashboardPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [inventorySearchParams, setInventorySearchParams] = useSearchParams()
  const stations = useAppStore((state) => state.stations)
  const users = useAppStore((state) => state.users)
  const filters = useAppStore((state) => state.filters)
  const setFilter = useAppStore((state) => state.setFilter)
  const clearFilters = useAppStore((state) => state.clearFilters)
  const reports = useAppStore((state) => state.reports)
  const stockThresholds = useAppStore((state) => state.appSettings.stockThresholds)
  const productRequests = useAppStore((state) => state.productRequests)
  const resolveProductRequestByAdmin = useAppStore((state) => state.resolveProductRequestByAdmin)
  const dailyFinalizations = useAppStore((state) => state.dailyFinalizations)
  const monthEndFinalizations = useAppStore((state) => state.monthEndFinalizations)
  const adminDailyReviews = useAppStore((state) => state.adminDailyReviews)
  const saveAdminDailyReview = useAppStore((state) => state.saveAdminDailyReview)
  const acknowledgeDailyFinalization = useAppStore((state) => state.acknowledgeDailyFinalization)
  const acknowledgeMonthEndFinalization = useAppStore((state) => state.acknowledgeMonthEndFinalization)
  const adminReplenishmentWorkflows = useAppStore((state) => state.adminReplenishmentWorkflows)
  const adminReportResolutions = useAppStore((state) => state.adminReportResolutions)
  const setAdminReplenishmentWorkflow = useAppStore((state) => state.setAdminReplenishmentWorkflow)
  const setAdminReportResolution = useAppStore((state) => state.setAdminReportResolution)
  const currentUser = useAppStore((state) => state.currentUser)
  const refreshFromSupabase = useAppStore((state) => state.refreshFromSupabase)
  const [reviewAdminDrafts, setReviewAdminDrafts] = useState({})
  const [adminRequestDrafts, setAdminRequestDrafts] = useState({})
  const [selectedFinalizationDate, setSelectedFinalizationDate] = useState('')
  const [adminGeneralReviewDrafts, setAdminGeneralReviewDrafts] = useState({})
  const [adminStationReviewDrafts, setAdminStationReviewDrafts] = useState({})
  const [inventoryVisibleKeys, setInventoryVisibleKeys] = useState(
    () => new Set(['stationName', 'stockRemaining', 'daysRemaining', 'status']),
  )

  const metrics = useMemo(
    () =>
      stations.map((station) => {
        const stationReports = reports.filter((report) => report.stationId === station.id)
        return buildStationMetrics(station, stationReports, stockThresholds)
      }),
    [reports, stations, stockThresholds],
  )

  const rows = useMemo(
    () =>
      metrics
        .filter((item) => matchesStationMultiFilter(item.stationId, filters))
        .filter((item) => (filters.status === 'all' ? true : item.status === filters.status)),
    [filters, metrics],
  )

  const alerts = useMemo(
    () => ({
      critical: metrics.filter((item) => item.status === 'critical'),
      warning: metrics.filter((item) => item.status === 'warning'),
    }),
    [metrics],
  )
  const today = new Date().toISOString().split('T')[0]

  const stationManagerById = useMemo(
    () =>
      new Map(
        users
          .filter((user) => user.role === 'staff' && user.stationId)
          .map((user) => [user.stationId, user.name]),
      ),
    [users],
  )

  const todayReports = useMemo(() => reports.filter((report) => report.date === today), [reports, today])
  const reportDatesByStation = useMemo(() => {
    const byStation = new Map()
    for (const report of reports) {
      if (!report?.stationId || !report?.date) {
        continue
      }
      if (!byStation.has(report.stationId)) {
        byStation.set(report.stationId, new Set())
      }
      byStation.get(report.stationId).add(report.date)
    }
    return byStation
  }, [reports])
  const submittedTodayCount = new Set(todayReports.map((report) => report.stationId)).size
  const pendingTodayCount = stations.length - submittedTodayCount

  const totalSalesToday = useMemo(
    () =>
      todayReports.reduce(
        (sum, report) =>
          sum +
          Number(report.totalSalesLitersPMS ?? report.salesPMS ?? 0) +
          Number(report.totalSalesLitersAGO ?? report.salesAGO ?? 0),
        0,
      ),
    [todayReports],
  )

  const totalExpenseToday = useMemo(
    () => todayReports.reduce((sum, report) => sum + Number(report.expenseAmount || 0), 0),
    [todayReports],
  )
  const totalCashToday = useMemo(
    () => todayReports.reduce((sum, report) => sum + Number(report.cashBf || 0) + Number(report.cashSales || 0), 0),
    [todayReports],
  )

  const needsAttentionRows = useMemo(
    () =>
      metrics
        .filter((item) => item.status !== 'safe')
        .map((item) => {
          const submissionStatus = todayReports.some((report) => report.stationId === item.stationId)
            ? 'Submitted'
            : 'Pending'
          const dates = reportDatesByStation.get(item.stationId) ?? new Set()
          const pendingInfo = getDailyReportPendingInfo(today, dates)
          const pendingFmt = formatPendingSubmissionSummary(pendingInfo, today)
          return {
            stationId: item.stationId,
            stationName: item.stationName,
            managerName: stationManagerById.get(item.stationId) || 'Unassigned',
            status: item.status,
            stockRemaining: item.stockRemaining,
            expectedDaysRemaining: item.daysRemaining,
            submissionStatus,
            pendingSubmissionTableTitle: pendingFmt.tableTitle,
            pendingSubmissionTableSubtitle: pendingFmt.tableSubtitle || '',
            pendingSubmissionNoHistory: pendingInfo.noPriorSubmissions,
            pendingSubmissionSummaryExport: pendingFmt.exportText,
          }
        })
        .sort((a, b) => {
          const priority = { critical: 0, warning: 1, safe: 2 }
          return priority[a.status] - priority[b.status]
        }),
    [metrics, stationManagerById, todayReports, reportDatesByStation, today],
  )

  const supervisorReviewRows = useMemo(
    () =>
      reports
        .filter((report) => report.supervisorReview)
        .map((report) => ({
          reportId: report.id,
          stationId: report.stationId,
          stationName: stations.find((station) => station.id === report.stationId)?.name || report.stationId,
          reportDate: report.date,
          supervisorName: report.supervisorReview?.reviewedBy || 'Supervisor',
          reviewStatus: report.supervisorReview?.status || 'Reviewed',
          supervisorRemark: report.supervisorReview?.remark || '-',
          reviewedAt: report.supervisorReview?.reviewedAt || '-',
        }))
        .sort((a, b) => {
          const priority = { Escalated: 0, 'Needs Attention': 1, Reviewed: 2 }
          return (priority[a.reviewStatus] ?? 3) - (priority[b.reviewStatus] ?? 3)
        }),
    [reports, stations],
  )

  const replenishmentByStationId = useMemo(
    () => new Map(adminReplenishmentWorkflows.map((item) => [item.stationId, item])),
    [adminReplenishmentWorkflows],
  )
  const reportResolutionByReportId = useMemo(
    () => new Map(adminReportResolutions.map((item) => [item.reportId, item])),
    [adminReportResolutions],
  )

  const replenishmentRows = useMemo(
    () =>
      metrics
        .filter((item) => item.status === 'critical' || item.status === 'warning')
        .map((item) => {
          const state = replenishmentByStationId.get(item.stationId) || {}
          const suggestedQuantity = item.status === 'critical' ? 8000 : 4000
          return {
            stationId: item.stationId,
            stationName: item.stationName,
            managerName: stationManagerById.get(item.stationId) || 'Unassigned',
            urgency: item.status,
            stockRemaining: item.stockRemaining,
            suggestedQuantity,
            approvedQuantity: state.approvedQuantity ?? suggestedQuantity,
            status: state.status || 'Pending Approval',
            note: state.note || '',
          }
        })
        .sort((a, b) => {
          const priority = { critical: 0, warning: 1 }
          return priority[a.urgency] - priority[b.urgency]
        }),
    [metrics, replenishmentByStationId, stationManagerById],
  )

  const updateReplenishment = (row, nextState) => {
    setAdminReplenishmentWorkflow({
      stationId: row.stationId,
      managerName: row.managerName,
      urgency: row.urgency,
      stockRemaining: row.stockRemaining,
      suggestedQuantity: row.suggestedQuantity,
      approvedQuantity: nextState.approvedQuantity ?? row.approvedQuantity,
      status: nextState.status ?? row.status,
      note: nextState.note ?? row.note,
    })
  }

  const adminPendingRequestRows = useMemo(
    () =>
      productRequests
        .filter((request) => request.status === 'pending_admin')
        .map((request) => ({
          ...request,
          stationName: stations.find((station) => station.id === request.stationId)?.name || request.stationId,
          createdDate: request.createdAt?.split('T')[0] || '-',
        }))
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)),
    [productRequests, stations],
  )

  const requestHistoryRows = useMemo(
    () =>
      productRequests
        .filter((request) => request.status === 'approved' || request.status === 'declined')
        .map((request) => ({
          ...request,
          stationName: stations.find((station) => station.id === request.stationId)?.name || request.stationId,
          createdDate: request.createdAt?.split('T')[0] || '-',
          finalStatus: request.status === 'approved' ? 'Approved' : 'Declined',
          reasonOrRemark: request.status === 'approved' ? request.adminRemark || '-' : request.adminRemark || request.supervisorRemark || '-',
        }))
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)),
    [productRequests, stations],
  )

  const columns = useMemo(
    () => [
      {
        key: 'stationName',
        header: 'Retail Station Name',
        pickable: true,
        exportPick: (row) => row.stationName,
      },
      {
        key: 'stockRemaining',
        header: 'Stock Remaining',
        pickable: true,
        exportPick: (row) => Math.round(row.stockRemaining),
        render: (row) => `${Math.round(row.stockRemaining).toLocaleString()} L`,
      },
      {
        key: 'daysRemaining',
        header: 'Expected Days Remaining',
        pickable: true,
        exportPick: (row) => Number(row.daysRemaining.toFixed(2)),
        render: (row) => row.daysRemaining.toFixed(2),
      },
      {
        key: 'status',
        header: 'Status',
        pickable: true,
        exportPick: (row) => row.status,
        render: (row) => <StatusBadge status={row.status} />,
      },
    ],
    [],
  )

  const visibleInventoryColumns = useMemo(
    () => filterColumnsForTable(columns, inventoryVisibleKeys),
    [columns, inventoryVisibleKeys],
  )

  const toggleInventoryColumn = (key) => {
    setInventoryVisibleKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        if (next.size <= 1) {
          return prev
        }
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const adminInventoryFiltersSummary = useMemo(() => {
    const ids = Array.isArray(filters.stationIds) ? filters.stationIds : []
    const stationPart = ids.length === 0 ? 'All stations' : `${ids.length} stations`
    const statusPart = filters.status === 'all' ? 'All statuses' : filters.status
    const pickable = columns.filter((c) => c.pickable !== false)
    const vis = pickable.filter((c) => inventoryVisibleKeys.has(c.key)).length
    const colPart =
      pickable.length > 0 && vis >= pickable.length ? 'All columns' : `${vis}/${pickable.length} columns`
    return `${stationPart} · ${statusPart} · ${colPart}`
  }, [filters.stationIds, filters.status, columns, inventoryVisibleKeys])

  const needsAttentionColumns = [
    { key: 'stationName', header: 'Station', minWidth: 200 },
    { key: 'managerName', header: 'Manager', minWidth: 160 },
    {
      key: 'status',
      header: 'Risk',
      minWidth: 120,
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'stockRemaining',
      header: 'Stock Remaining',
      minWidth: 150,
      render: (row) => `${Math.round(row.stockRemaining).toLocaleString()} L`,
    },
    {
      key: 'expectedDaysRemaining',
      header: 'Expected Days Remaining',
      minWidth: 170,
      render: (row) => row.expectedDaysRemaining.toFixed(2),
    },
    { key: 'submissionStatus', header: 'Today Report', minWidth: 140 },
    {
      key: 'submissionBacklog',
      header: 'Submission backlog',
      minWidth: 240,
      render: (row) => {
        if (row.submissionStatus === 'Submitted') {
          return (
            <span className="text-sm text-emerald-700 dark:text-emerald-400">
              {row.pendingSubmissionTableTitle}
            </span>
          )
        }
        if (row.pendingSubmissionNoHistory) {
          return (
            <span className="text-sm font-medium text-amber-900 dark:text-amber-200">
              {row.pendingSubmissionTableTitle}
            </span>
          )
        }
        return (
          <div className="text-xs leading-snug">
            <div className="font-semibold text-amber-900 dark:text-amber-200">
              {row.pendingSubmissionTableTitle}
            </div>
            {row.pendingSubmissionTableSubtitle ? (
              <div className="text-slate-600 dark:text-slate-400">{row.pendingSubmissionTableSubtitle}</div>
            ) : null}
          </div>
        )
      },
    },
  ]

  const supervisorReviewColumns = [
    { key: 'stationName', header: 'Station', minWidth: 170 },
    { key: 'reportDate', header: 'Report Date', minWidth: 120 },
    { key: 'supervisorName', header: 'Supervisor', minWidth: 160 },
    { key: 'reviewStatus', header: 'Review Status', minWidth: 140 },
    { key: 'supervisorRemark', header: 'Supervisor Remark', minWidth: 220 },
    {
      key: 'adminAction',
      header: 'Admin Action',
      minWidth: 300,
      render: (row) => {
        const persisted = reportResolutionByReportId.get(row.reportId) || {}
        const current = reviewAdminDrafts[row.reportId] || {
          resolution: persisted.resolution || '',
          note: persisted.note || '',
        }
        return (
          <div
            className="flex flex-col gap-2"
            onClick={(event) => {
              event.stopPropagation()
            }}
          >
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setAdminReportResolution({
                    reportId: row.reportId,
                    stationId: row.stationId,
                    stationName: row.stationName,
                    reportDate: row.reportDate,
                    supervisorName: row.supervisorName,
                    reviewStatus: row.reviewStatus,
                    supervisorRemark: row.supervisorRemark,
                    resolution: 'In Progress',
                    note: current.note,
                  })
                }
                className="rounded-md border border-blue-300 px-2 py-1 text-xs text-blue-700"
              >
                In Progress
              </button>
              <button
                type="button"
                onClick={() =>
                  setAdminReportResolution({
                    reportId: row.reportId,
                    stationId: row.stationId,
                    stationName: row.stationName,
                    reportDate: row.reportDate,
                    supervisorName: row.supervisorName,
                    reviewStatus: row.reviewStatus,
                    supervisorRemark: row.supervisorRemark,
                    resolution: 'Resolved',
                    note: current.note,
                  })
                }
                className="rounded-md border border-emerald-300 px-2 py-1 text-xs text-emerald-700"
              >
                Resolve
              </button>
              <button
                type="button"
                onClick={() =>
                  setAdminReportResolution({
                    reportId: row.reportId,
                    stationId: row.stationId,
                    stationName: row.stationName,
                    reportDate: row.reportDate,
                    supervisorName: row.supervisorName,
                    reviewStatus: row.reviewStatus,
                    supervisorRemark: row.supervisorRemark,
                    resolution: 'Closed',
                    note: current.note,
                  })
                }
                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700"
              >
                Close
              </button>
            </div>
            <input
              value={current.note || ''}
              onChange={(event) =>
                setReviewAdminDrafts((prev) => ({
                  ...prev,
                  [row.reportId]: { ...current, note: event.target.value },
                }))
              }
              onBlur={() =>
                setAdminReportResolution({
                  reportId: row.reportId,
                  stationId: row.stationId,
                  stationName: row.stationName,
                  reportDate: row.reportDate,
                  supervisorName: row.supervisorName,
                  reviewStatus: row.reviewStatus,
                  supervisorRemark: row.supervisorRemark,
                  resolution: current.resolution || persisted.resolution || '',
                  note: current.note,
                })
              }
              placeholder="Admin response note"
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
            />
            {(persisted.resolution || current.resolution) && (
              <p className="text-xs text-slate-500">
                {persisted.resolution || current.resolution}
                {(persisted.note || current.note) ? ` - ${persisted.note || current.note}` : ''}
              </p>
            )}
          </div>
        )
      },
    },
  ]

  const replenishmentColumns = [
    { key: 'stationName', header: 'Station', minWidth: 170 },
    { key: 'managerName', header: 'Manager', minWidth: 170 },
    {
      key: 'urgency',
      header: 'Urgency',
      minWidth: 120,
      render: (row) => <StatusBadge status={row.urgency} />,
    },
    {
      key: 'stockRemaining',
      header: 'Current Stock',
      minWidth: 130,
      render: (row) => `${Math.round(row.stockRemaining).toLocaleString()} L`,
    },
    {
      key: 'suggestedQuantity',
      header: 'Suggested Qty',
      minWidth: 130,
      render: (row) => `${Math.round(row.suggestedQuantity).toLocaleString()} L`,
    },
    {
      key: 'approvedQuantity',
      header: 'Approved Qty',
      minWidth: 130,
      render: (row) => `${Math.round(row.approvedQuantity).toLocaleString()} L`,
    },
    { key: 'status', header: 'Workflow Status', minWidth: 150 },
    {
      key: 'actions',
      header: 'Action',
      minWidth: 280,
      render: (row) => (
        <div
          className="flex flex-wrap gap-2"
          onClick={(event) => {
            event.stopPropagation()
          }}
        >
          {row.status === 'Pending Approval' && (
            <>
              <button
                type="button"
                onClick={() =>
                  updateReplenishment(row, {
                    status: 'Approved',
                    approvedQuantity: row.suggestedQuantity,
                    note: 'Approved full request',
                  })
                }
                className="rounded-md border border-emerald-300 px-2 py-1 text-xs text-emerald-700"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() =>
                  updateReplenishment(row, {
                    status: 'Approved',
                    approvedQuantity: Math.round(row.suggestedQuantity * 0.5),
                    note: 'Approved partial quantity',
                  })
                }
                className="rounded-md border border-blue-300 px-2 py-1 text-xs text-blue-700"
              >
                Approve Partial
              </button>
              <button
                type="button"
                onClick={() => updateReplenishment(row, { status: 'Rejected', note: 'Rejected by admin' })}
                className="rounded-md border border-rose-300 px-2 py-1 text-xs text-rose-700"
              >
                Reject
              </button>
            </>
          )}
          {row.status === 'Approved' && (
            <button
              type="button"
              onClick={() => updateReplenishment(row, { status: 'Dispatched', note: 'Dispatch in transit' })}
              className="rounded-md border border-indigo-300 px-2 py-1 text-xs text-indigo-700"
            >
              Mark Dispatched
            </button>
          )}
          {row.status === 'Dispatched' && (
            <button
              type="button"
              onClick={() => updateReplenishment(row, { status: 'Delivered', note: 'Delivered at station' })}
              className="rounded-md border border-cyan-300 px-2 py-1 text-xs text-cyan-700"
            >
              Mark Delivered
            </button>
          )}
          {row.status === 'Delivered' && (
            <button
              type="button"
              onClick={() => updateReplenishment(row, { status: 'Received', note: 'Manager confirmed receipt' })}
              className="rounded-md border border-emerald-300 px-2 py-1 text-xs text-emerald-700"
            >
              Mark Received
            </button>
          )}
        </div>
      ),
    },
  ]

  const adminPendingColumns = [
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
    { key: 'supervisorRemark', header: 'Supervisor Remark', minWidth: 220 },
    {
      key: 'adminInput',
      header: 'Admin Approval',
      minWidth: 420,
      render: (row) => {
        const draft = adminRequestDrafts[row.id] || {
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
                  setAdminRequestDrafts((prev) => ({
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
                  setAdminRequestDrafts((prev) => ({
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
                setAdminRequestDrafts((prev) => ({
                  ...prev,
                  [row.id]: { ...draft, remark: event.target.value },
                }))
              }
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
              placeholder="Admin remark"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  resolveProductRequestByAdmin({
                    requestId: row.id,
                    decision: 'approve',
                    approvedProductType: draft.approvedProductType,
                    approvedLiters: Number(draft.approvedLiters || 0),
                    remark: draft.remark,
                    approvedBy: currentUser?.name || 'Admin',
                  })
                }
                className="rounded-md border border-emerald-300 px-2 py-1 text-xs text-emerald-700"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() =>
                  resolveProductRequestByAdmin({
                    requestId: row.id,
                    decision: 'decline',
                    remark: draft.remark || 'Declined by admin',
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

  const requestHistoryColumns = [
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
  ]

  const pendingDailyFinalizationRows = useMemo(
    () =>
      dailyFinalizations
        .filter((item) => item.status === 'finalized')
        .map((item) => ({
          ...item,
          stationCount: item.stationReviews?.length || 0,
        }))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [dailyFinalizations],
  )

  const activePendingFinalization =
    pendingDailyFinalizationRows.find((item) => item.date === selectedFinalizationDate) ||
    pendingDailyFinalizationRows[0] ||
    null

  const pendingMonthEndFinalizationRows = useMemo(
    () =>
      monthEndFinalizations
        .filter((item) => item.status !== 'admin_acknowledged')
        .map((item) => ({
          ...item,
          stationCount: Array.isArray(item.stationSummaries) ? item.stationSummaries.length : 0,
          finalizedDate: item.finalizedAt ? item.finalizedAt.split('T')[0] : '-',
        }))
        .sort((a, b) => b.monthKey.localeCompare(a.monthKey)),
    [monthEndFinalizations],
  )

  const activeAdminGeneralRemark = activePendingFinalization
    ? adminGeneralReviewDrafts[activePendingFinalization.date] || ''
    : ''

  const activeStationReviewRows = useMemo(() => {
    if (!activePendingFinalization) {
      return []
    }
    return (activePendingFinalization.stationReviews || []).map((item) => ({
      ...item,
      adminRemark:
        adminStationReviewDrafts[`${activePendingFinalization.date}:${item.stationId}`] || '',
    }))
  }, [activePendingFinalization, adminStationReviewDrafts])

  const dailyFinalizationHistoryRows = useMemo(
    () =>
      [...adminDailyReviews]
        .map((item) => ({
          ...item,
          stationCount: item.stationReviews?.length || 0,
          statusLabel: 'Saved to DB',
          savedInfo: item.savedAt
            ? `${item.savedBy || 'Admin'} (${item.savedAt.split('T')[0]})`
            : item.savedBy || 'Admin',
        }))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [adminDailyReviews],
  )

  const pendingDailyFinalizationColumns = [
    { key: 'date', header: 'Date', minWidth: 120 },
    { key: 'finalizedBy', header: 'Supervisor', minWidth: 170 },
    { key: 'stationCount', header: 'Station Reviews', minWidth: 140 },
    { key: 'generalRemark', header: 'General Daily Remark', minWidth: 320 },
  ]
  const pendingMonthEndFinalizationColumns = [
    { key: 'monthLabel', header: 'Month', minWidth: 140 },
    { key: 'finalizedBy', header: 'Supervisor', minWidth: 170 },
    { key: 'stationCount', header: 'Stations', minWidth: 120 },
    { key: 'finalizedDate', header: 'Finalized On', minWidth: 130 },
    {
      key: 'action',
      header: 'Action',
      minWidth: 180,
      render: (row) => (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            acknowledgeMonthEndFinalization({ monthKey: row.monthKey })
          }}
          className="rounded-md border border-emerald-300 px-2 py-1 text-xs font-medium text-emerald-700"
        >
          Mark Received
        </button>
      ),
    },
  ]

  const adminStationReviewColumns = [
    {
      key: 'stationName',
      header: 'Station',
      minWidth: 180,
      pickable: true,
      exportPick: (row) => row.stationName,
    },
    {
      key: 'reportStatus',
      header: 'Report Status',
      minWidth: 140,
      pickable: true,
      exportPick: (row) => row.reportStatus || '',
    },
    {
      key: 'stationRemark',
      header: 'Supervisor Remark',
      minWidth: 240,
      pickable: true,
      exportPick: (row) => row.stationRemark || '',
      render: (row) => row.stationRemark || '-',
    },
    {
      key: 'adminRemark',
      header: 'Admin Remark',
      minWidth: 260,
      pickable: true,
      exportPick: (row) => row.adminRemark || '',
      render: (row) => (
        <input
          value={row.adminRemark}
          onChange={(event) => {
            if (!activePendingFinalization) {
              return
            }
            setAdminStationReviewDrafts((prev) => ({
              ...prev,
              [`${activePendingFinalization.date}:${row.stationId}`]: event.target.value,
            }))
          }}
          onClick={(event) => event.stopPropagation()}
          placeholder="Add station remark"
          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
        />
      ),
    },
  ]

  const dailyFinalizationHistoryColumns = [
    { key: 'date', header: 'Date', minWidth: 120 },
    { key: 'supervisorFinalizedBy', header: 'Supervisor', minWidth: 170 },
    { key: 'statusLabel', header: 'Status', minWidth: 160 },
    { key: 'stationCount', header: 'Station Reviews', minWidth: 140 },
    { key: 'savedInfo', header: 'Saved By', minWidth: 220 },
    { key: 'generalRemark', header: 'General Daily Remark', minWidth: 320 },
  ]

  const handleExportAdminDailyReview = async () => {
    if (!activePendingFinalization) {
      return
    }
    if (!activeStationReviewRows.length) {
      window.alert('No station reviews available to export.')
      return
    }
    exportAdminDailyReviewToExcel({
      date: activePendingFinalization.date,
      supervisorFinalizedBy: activePendingFinalization.finalizedBy,
      generalRemark: activeAdminGeneralRemark,
      stationReviews: activeStationReviewRows.map((item) => ({
        stationId: item.stationId,
        stationName: item.stationName,
        reportStatus: item.reportStatus,
        stationRemark: item.stationRemark || '',
        adminRemark: item.adminRemark || '',
      })),
      savedBy: currentUser?.name || 'Admin',
      stationSpecs: columnsToExportSpecs(adminStationReviewColumns),
    })
    await refreshFromSupabase()
  }

  const handleSaveAdminDailyReview = async () => {
    if (!activePendingFinalization) {
      return
    }
    const saved = await saveAdminDailyReview({
      date: activePendingFinalization.date,
      supervisorFinalizedBy: activePendingFinalization.finalizedBy,
      generalRemark: activeAdminGeneralRemark,
      stationReviews: activeStationReviewRows.map((item) => ({
        stationId: item.stationId,
        stationName: item.stationName,
        reportStatus: item.reportStatus,
        stationRemark: item.stationRemark || '',
        adminRemark: item.adminRemark || '',
      })),
    })
    if (saved) {
      acknowledgeDailyFinalization({ date: activePendingFinalization.date })
      window.alert('Admin daily review saved to DB.')
      navigate('/admin/history')
      return
    }
    window.alert('Could not save to DB. Check Supabase connection and schema.')
  }

  const adminView = location.pathname.startsWith('/admin/')
    ? location.pathname.replace('/admin/', '')
    : 'dashboard'
  const isDashboardView = adminView === 'dashboard'
  const isReportsView = adminView === 'reports'
  const isProductRequestsView = adminView === 'product-requests'
  const isHistoryView = adminView === 'history'

  const openInventoryFiltersScreen = () => {
    setInventorySearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('filters', '1')
      return next
    })
  }
  const closeInventoryFiltersScreen = () => {
    setInventorySearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('filters')
      return next
    })
  }

  const inventoryFiltersScreen = isReportsView && inventorySearchParams.get('filters') === '1'

  const inventoryReportsFiltersPanel = (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <ColumnPicker
        columns={columns}
        visibleKeys={inventoryVisibleKeys}
        onToggleKey={toggleInventoryColumn}
        onSelectAll={() =>
          setInventoryVisibleKeys(new Set(columns.filter((c) => c.pickable !== false).map((c) => c.key)))
        }
        onResetDefaults={() =>
          setInventoryVisibleKeys(new Set(['stationName', 'stockRemaining', 'daysRemaining', 'status']))
        }
        summaryLabel="Inventory columns"
        className="max-w-none w-full"
      />
      <FilterBar
        variant="stacked"
        stations={stations}
        filters={filters}
        onFilterChange={setFilter}
        onReset={clearFilters}
      />
    </div>
  )

  return (
    <div className="space-y-4">
      {isHistoryView && (
        <Card className="bg-gradient-to-r from-slate-900 to-rose-900 text-white">
          <h2 className="text-xl font-bold">
            {isHistoryView && 'History Archive'}
          </h2>
          <p className="text-sm text-slate-200">
            {isHistoryView && 'Completed request and daily finalization records.'}
          </p>
        </Card>
      )}

      {isDashboardView && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card>
              <p className="text-sm text-slate-500">Critical Stations</p>
              <p className="text-2xl font-bold text-red-600">{alerts.critical.length}</p>
            </Card>
            <Card>
              <p className="text-sm text-slate-500">Warning Stations</p>
              <p className="text-2xl font-bold text-yellow-600">{alerts.warning.length}</p>
            </Card>
            <Card>
              <p className="text-sm text-slate-500">Total Retail Stations</p>
              <p className="text-2xl font-bold">{stations.length}</p>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
            <Card>
              <p className="text-sm text-slate-500">Submitted Today</p>
              <p className="text-2xl font-bold text-emerald-600">{submittedTodayCount}</p>
            </Card>
            <Card>
              <p className="text-sm text-slate-500">Pending Today</p>
              <p className="text-2xl font-bold text-amber-600">{pendingTodayCount}</p>
            </Card>
            <Card>
              <p className="text-sm text-slate-500">Total Sales Today (L)</p>
              <p className="text-2xl font-bold">{Math.round(totalSalesToday).toLocaleString()}</p>
            </Card>
            <Card>
              <p className="text-sm text-slate-500">Total Expense Today (NGN)</p>
              <p className="text-2xl font-bold">{Math.round(totalExpenseToday).toLocaleString()}</p>
            </Card>
            <Card>
              <p className="text-sm text-slate-500">Total Cash Today (NGN)</p>
              <p className="text-2xl font-bold">{Math.round(totalCashToday).toLocaleString()}</p>
            </Card>
          </div>
        </>
      )}

      {isDashboardView && (
      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Needs Attention Now</h2>
          <p className="text-sm text-slate-500">{needsAttentionRows.length} stations</p>
        </div>
        {needsAttentionRows.length ? (
          <DataTable
            columns={needsAttentionColumns}
            rows={needsAttentionRows}
            onRowClick={(row) => navigate(`/stations/${row.stationId}`)}
            tableClassName="min-w-[1390px]"
          />
        ) : (
          <EmptyState
            title="No stations currently need attention"
            message="All stations are within safe stock range and reporting on time."
          />
        )}
      </Card>
      )}

      {isProductRequestsView && (
      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Admin Product Request Queue</h2>
          <p className="text-sm text-slate-500">{adminPendingRequestRows.length} pending admin decision</p>
        </div>
        {adminPendingRequestRows.length ? (
          <DataTable columns={adminPendingColumns} rows={adminPendingRequestRows} tableClassName="min-w-[1850px]" />
        ) : (
          <EmptyState
            title="No escalated requests"
            message="Supervisor-approved manager requests will appear here for final admin decision."
          />
        )}
      </Card>
      )}

      {isHistoryView && (
      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Product Request History</h2>
          <p className="text-sm text-slate-500">Approved and declined requests with reasons</p>
        </div>
        {requestHistoryRows.length ? (
          <DataTable columns={requestHistoryColumns} rows={requestHistoryRows} tableClassName="min-w-[1650px]" />
        ) : (
          <EmptyState
            title="No product request history yet"
            message="Completed request decisions will be listed here."
          />
        )}
      </Card>
      )}

      {isReportsView && (
      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Supervisors Daily Finalization</h2>
          <p className="text-sm text-slate-500">{pendingDailyFinalizationRows.length} ready for admin review</p>
        </div>
        {pendingDailyFinalizationRows.length ? (
          <DataTable
            columns={pendingDailyFinalizationColumns}
            rows={pendingDailyFinalizationRows}
            onRowClick={(row) => setSelectedFinalizationDate(row.date)}
            tableClassName="min-w-[1250px]"
            wrapCells
          />
        ) : (
          <EmptyState
            title="No finalized supervisor packets"
            message="Supervisor finalized day packets will appear here for admin review."
          />
        )}
      </Card>
      )}

      {isReportsView && (
      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Month-End Summaries</h2>
          <p className="text-sm text-slate-500">{pendingMonthEndFinalizationRows.length} ready for admin review</p>
        </div>
        {pendingMonthEndFinalizationRows.length ? (
          <DataTable
            columns={pendingMonthEndFinalizationColumns}
            rows={pendingMonthEndFinalizationRows}
            tableClassName="min-w-[900px]"
          />
        ) : (
          <EmptyState
            title="No month-end summaries pending"
            message="Supervisor finalized month-end summaries will appear here."
          />
        )}
      </Card>
      )}

      {isReportsView && activePendingFinalization && (
        <Card className="space-y-4">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <h2 className="text-xl font-bold">Admin Daily Review Editor ({activePendingFinalization.date})</h2>
            <p className="text-sm text-slate-500">
              Export uses filters below; Save to DB keeps the full {activeStationReviewRows.length}-station packet.
            </p>
          </div>
          <label className="space-y-1">
            <span className="text-sm font-medium">Admin General Remark</span>
            <textarea
              value={activeAdminGeneralRemark}
              onChange={(event) =>
                setAdminGeneralReviewDrafts((prev) => ({
                  ...prev,
                  [activePendingFinalization.date]: event.target.value,
                }))
              }
              className="h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              placeholder="Overall admin daily review..."
            />
          </label>
          {activeStationReviewRows.length ? (
            <DataTable
              columns={adminStationReviewColumns}
              rows={activeStationReviewRows}
              tableClassName="min-w-[1200px]"
              wrapCells
            />
          ) : (
            <EmptyState
              title="No station reviews in this packet"
              message="Supervisor finalization did not include station-level rows."
            />
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleExportAdminDailyReview}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
            >
              Export to Excel (filtered)
            </button>
            <button
              type="button"
              onClick={handleSaveAdminDailyReview}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
            >
              Save to DB
            </button>
          </div>
        </Card>
      )}

      {isHistoryView && (
      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Daily Finalization History</h2>
          <p className="text-sm text-slate-500">Admin-saved reviews by date</p>
        </div>
        {dailyFinalizationHistoryRows.length ? (
          <DataTable
            columns={dailyFinalizationHistoryColumns}
            rows={dailyFinalizationHistoryRows}
            tableClassName="min-w-[1350px]"
            wrapCells
          />
        ) : (
          <EmptyState
            title="No finalization history yet"
            message="Supervisor finalized reviews will appear here with date-attached history."
          />
        )}
      </Card>
      )}

      {isDashboardView && (
      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Replenishment Approval Workflow</h2>
          <p className="text-sm text-slate-500">
            Pending Approval - Approved - Dispatched - Delivered - Received
          </p>
        </div>
        {replenishmentRows.length ? (
          <DataTable columns={replenishmentColumns} rows={replenishmentRows} tableClassName="min-w-[1650px]" />
        ) : (
          <EmptyState
            title="No warning or critical stations"
            message="Replenishment requests will appear automatically when stock drops below safe threshold."
          />
        )}
      </Card>
      )}
    </div>
  )
}

export default AdminDashboardPage

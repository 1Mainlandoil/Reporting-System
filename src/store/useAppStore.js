import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  dailyReports,
  mockUsers,
  stations as canonicalStations,
  STATION_CATALOG_PERSIST_VERSION,
} from '../data/mockData'
import { mergeStationCatalog } from '../utils/stationCatalog'
import { extractErrorMessage } from '../utils/userErrorMessages'
import {
  computeQuantityRemaining,
  getQuantityRemainingForProduct,
} from '../utils/reportFields'
import { ROLE_ROUTE_MAP, ROLES } from '../constants/roles'
import { buildStationMetrics } from '../utils/stock'
import {
  deleteIntervention,
  deleteProductRequest,
  deleteReportById,
  insertChatMessage,
  insertReport,
  insertInspectorVisit,
  insertManualCostEntry,
  loadInitialData,
  markChatMessagesSeenInSupabase,
  upsertAdminReportResolution,
  upsertAdminReplenishmentWorkflow,
  upsertDailyFinalization,
  upsertMonthEndFinalization,
  upsertIntervention,
  upsertAdminDailyReview,
  upsertProductRequest,
  upsertStation,
  upsertUser,
} from '../services/supabaseData'
import { hasSupabaseEnv, supabase } from '../lib/supabaseClient'
import { mergeChatMessages } from '../utils/chatMessages'
import { getReportingDateIso } from '../utils/dateFormat'

const initialFilters = {
  stationIds: [],
  status: 'all',
}

const defaultAppSettings = {
  stockThresholds: {
    criticalMax: 500,
    warningMax: 999,
  },
  notificationPreferences: {
    lowStockAlertsEnabled: true,
    pendingDailyReportAlertsEnabled: true,
    escalationAlertsEnabled: true,
  },
  reportingConfiguration: {
    dailyOpeningStockFormatEnabled: true,
    expenseLineItemsEnabled: true,
    supervisorReviewWorkflowEnabled: true,
  },
}

const asArray = (value, fallback = []) => (Array.isArray(value) ? value : fallback)

const ensurePersistedCollections = (state, fallback = {}) => ({
  ...state,
  reports: asArray(state.reports, fallback.reports),
  users: asArray(state.users, fallback.users),
  stations: asArray(state.stations, fallback.stations),
  productRequests: asArray(state.productRequests, fallback.productRequests),
  dailyFinalizations: asArray(state.dailyFinalizations, fallback.dailyFinalizations),
  monthEndFinalizations: asArray(state.monthEndFinalizations, fallback.monthEndFinalizations),
  interventions: asArray(state.interventions, fallback.interventions),
  chatMessages: asArray(state.chatMessages, fallback.chatMessages),
  adminDailyReviews: asArray(state.adminDailyReviews, fallback.adminDailyReviews),
  adminReplenishmentWorkflows: asArray(
    state.adminReplenishmentWorkflows,
    fallback.adminReplenishmentWorkflows,
  ),
  adminReportResolutions: asArray(state.adminReportResolutions, fallback.adminReportResolutions),
  inspectorVisits: asArray(state.inspectorVisits, fallback.inspectorVisits),
  manualCostEntries: asArray(state.manualCostEntries, fallback.manualCostEntries),
  posTerminals: asArray(state.posTerminals, fallback.posTerminals),
  appSettings: state.appSettings ?? fallback.appSettings ?? defaultAppSettings,
})

const mergeUsersById = (localUsers = [], remoteUsers = []) => {
  const merged = new Map()
  ;[...localUsers, ...remoteUsers].forEach((user) => {
    if (!user?.id) {
      return
    }
    const previous = merged.get(user.id) || {}
    merged.set(user.id, {
      ...previous,
      ...user,
    })
  })
  return Array.from(merged.values())
}

/** Remote wins on same station+date so refreshes stay authoritative; keep local-only rows until they appear remotely. */
const mergeReportsByStationDate = (localReports = [], remoteReports = []) => {
  const keyOf = (r) => `${String(r.stationId)}|${String(r.date)}`
  const merged = new Map()
  for (const r of remoteReports) {
    if (r?.stationId && r?.date) {
      merged.set(keyOf(r), r)
    }
  }
  for (const r of localReports) {
    if (!r?.stationId || !r?.date) {
      continue
    }
    const k = keyOf(r)
    if (!merged.has(k)) {
      merged.set(k, r)
    }
  }
  return [...merged.values()].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date)
    if (byDate !== 0) {
      return byDate
    }
    return String(a.stationId).localeCompare(String(b.stationId))
  })
}

export const useAppStore = create(
  persist(
    (set, get) => ({
      role: null,
      currentUser: null,
      viewAsRole: null,
      theme: 'light',
      stations: canonicalStations,
      users: mockUsers,
      reports: dailyReports,
      filters: initialFilters,
      interventions: [],
      productRequests: [],
      rejectedReports: [],
      inspectorVisits: [],
      manualCostEntries: [],
      posTerminals: [],
      dailyFinalizations: [],
      monthEndFinalizations: [],
      adminDailyReviews: [],
      adminReplenishmentWorkflows: [],
      adminReportResolutions: [],
      chatMessages: [],
      appSettings: defaultAppSettings,
      pinnedChatUserIds: [],
      chatTypingMap: {},
      isChatOpen: false,
      activeChatUserId: '',
      isHydrating: false,
      hydratedFromSupabase: false,
      notificationCount: 3,
      login: (role, userId) => {
        const roleUsers = get().users.filter((user) => user.role === role)
        const selectedUser = roleUsers.find((user) => user.id === userId) || roleUsers[0] || null
        set({ role, currentUser: selectedUser })
      },
      loginVerifiedEmailUser: ({ role, email }) => {
        const normalizedEmail = String(email || '').trim().toLowerCase()
        const normalizedRole = String(role || '').trim()
        const matchedUser = get().users.find(
          (user) =>
            user.role === normalizedRole &&
            (normalizedRole === ROLES.SUPERVISOR || normalizedRole === ROLES.ADMIN) &&
            String(user.email || '').toLowerCase() === normalizedEmail,
        )
        if (!matchedUser) {
          return null
        }
        set({ role: normalizedRole, currentUser: matchedUser })
        return matchedUser.id
      },
      isEmailAuthorizedForRole: ({ role, email }) => {
        const normalizedEmail = String(email || '').trim().toLowerCase()
        const normalizedRole = String(role || '').trim()
        return Boolean(
          get().users.find(
            (user) =>
              user.role === normalizedRole &&
              (normalizedRole === ROLES.SUPERVISOR || normalizedRole === ROLES.ADMIN) &&
              String(user.email || '').toLowerCase() === normalizedEmail,
          ),
        )
      },
      registerManagerProfile: ({ name, phoneNumber, stationId, stationLocation }) => {
        const normalizedName = String(name || '').trim()
        const normalizedPhone = String(phoneNumber || '').trim()
        const normalizedStationId = String(stationId || '').trim()
        const normalizedStationLocation = String(stationLocation || '').trim()

        if (!normalizedName || !normalizedStationId || !normalizedStationLocation) {
          return null
        }

        const state = get()
        const selectedStation = state.stations.find((station) => station.id === normalizedStationId)
        const stationPayload = {
          id: normalizedStationId,
          name: selectedStation?.name || normalizedStationId,
          location: normalizedStationLocation,
        }
        const existingUser = state.users.find(
          (user) =>
            user.role === ROLES.STAFF &&
            user.name.toLowerCase() === normalizedName.toLowerCase() &&
            user.stationId === normalizedStationId,
        )

        if (existingUser) {
          const updatedUser = {
            ...existingUser,
            phoneNumber: normalizedPhone,
            approvalStatus: 'pending',
            approvalReviewedBy: null,
            approvalReviewedAt: null,
            approvalNote: '',
          }
          set({
            users: state.users.map((user) => (user.id === existingUser.id ? updatedUser : user)),
            stations: state.stations.map((station) =>
              station.id === normalizedStationId
                ? { ...station, location: normalizedStationLocation }
                : station,
            ),
          })
          upsertStation(stationPayload)
            .then(() => upsertUser(updatedUser))
            .catch(() => {
            // Local state remains usable if remote sync fails.
            })
          return existingUser.id
        }

        const newUserId = `mgr-${Date.now()}`
        const newUser = {
          id: newUserId,
          name: normalizedName,
          role: ROLES.STAFF,
          stationId: normalizedStationId,
          phoneNumber: normalizedPhone,
          approvalStatus: 'pending',
          approvalReviewedBy: null,
          approvalReviewedAt: null,
          approvalNote: '',
        }

        set({
          users: [...state.users, newUser],
          stations: state.stations.map((station) =>
            station.id === normalizedStationId
              ? { ...station, location: normalizedStationLocation }
              : station,
          ),
        })
        upsertStation(stationPayload)
          .then(() => upsertUser(newUser))
          .catch(() => {
          // Local state remains usable if remote sync fails.
          })
        return newUserId
      },
      reviewManagerRegistration: ({ userId, decision, note }) => {
        const normalizedDecision = String(decision || '').trim().toLowerCase()
        const statusByDecision = {
          approve: 'approved',
          reject: 'rejected',
          request_correction: 'correction_requested',
        }
        const nextStatus = statusByDecision[normalizedDecision]
        if (!nextStatus) {
          return
        }
        const reviewNote = String(note || '').trim()
        set((state) => ({
          users: state.users.map((user) =>
            user.id === userId && user.role === ROLES.STAFF
              ? {
                  ...user,
                  approvalStatus: nextStatus,
                  approvalReviewedBy: state.currentUser?.name || 'Supervisor',
                  approvalReviewedAt: new Date().toISOString(),
                  approvalNote: reviewNote,
                }
              : user,
          ),
        }))
        const updatedUser = get().users.find((user) => user.id === userId)
        if (updatedUser) {
          upsertUser(updatedUser).catch(() => {
            // Local state remains usable if remote sync fails.
          })
        }
      },
      registerSupervisorProfile: ({ name, email }) => {
        const normalizedName = String(name || '').trim()
        const normalizedEmail = String(email || '').trim().toLowerCase()

        if (!normalizedName || !normalizedEmail.endsWith('@mainlandoil.com')) {
          return null
        }

        const state = get()
        const existingUser = state.users.find(
          (user) => user.role === ROLES.SUPERVISOR && String(user.email || '').toLowerCase() === normalizedEmail,
        )

        if (existingUser) {
          const updatedUser = { ...existingUser, name: normalizedName, email: normalizedEmail }
          set({
            users: state.users.map((user) => (user.id === existingUser.id ? updatedUser : user)),
          })
          upsertUser(updatedUser).catch(() => {
            // Local state remains usable if remote sync fails.
          })
          return existingUser.id
        }

        const newUserId = `sup-${Date.now()}`
        const newUser = {
          id: newUserId,
          name: normalizedName,
          role: ROLES.SUPERVISOR,
          stationId: null,
          email: normalizedEmail,
        }

        set({
          users: [...state.users, newUser],
        })
        upsertUser(newUser).catch(() => {
          // Local state remains usable if remote sync fails.
        })
        return newUserId
      },
      registerAdminProfile: ({ name, email }) => {
        const normalizedName = String(name || '').trim()
        const normalizedEmail = String(email || '').trim().toLowerCase()

        if (!normalizedName || !normalizedEmail.endsWith('@mainlandoil.com')) {
          return null
        }

        const state = get()
        const existingUser = state.users.find(
          (user) => user.role === ROLES.ADMIN && String(user.email || '').toLowerCase() === normalizedEmail,
        )

        if (existingUser) {
          const updatedUser = { ...existingUser, name: normalizedName, email: normalizedEmail }
          set({
            users: state.users.map((user) => (user.id === existingUser.id ? updatedUser : user)),
          })
          upsertUser(updatedUser).catch(() => {
            // Local state remains usable if remote sync fails.
          })
          return existingUser.id
        }

        const newUserId = `admin-${Date.now()}`
        const newUser = {
          id: newUserId,
          name: normalizedName,
          role: ROLES.ADMIN,
          stationId: null,
          email: normalizedEmail,
        }

        set({
          users: [...state.users, newUser],
        })
        upsertUser(newUser).catch(() => {
          // Local state remains usable if remote sync fails.
        })
        return newUserId
      },
      setViewAsRole: (viewAsRole) => set({ viewAsRole }),
      logout: () => {
        if (hasSupabaseEnv && supabase) {
          supabase.auth.signOut().catch(() => {
            // Local logout still proceeds even if remote signout fails.
          })
        }
        set({ role: null, currentUser: null, viewAsRole: null })
      },
      toggleTheme: () =>
        set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
      setFilter: (key, value) =>
        set((state) => ({ filters: { ...state.filters, [key]: value } })),
      clearFilters: () => set({ filters: initialFilters }),
      updateAppSettings: (category, key, value) =>
        set((state) => ({
          appSettings: {
            ...state.appSettings,
            [category]: {
              ...state.appSettings[category],
              [key]: value,
            },
          },
        })),
      submitReport: async (payload) => {
        const state = get()
        const stationId = payload.stationId || state.currentUser?.stationId
        if (!stationId) {
          return { ok: false, error: 'no_station' }
        }

        const reportingDateIso = getReportingDateIso()
        const { reportDate: explicitReportDate, ...restPayload } = payload

        const staffOwnStation =
          state.role === ROLES.STAFF &&
          state.currentUser?.stationId &&
          stationId === state.currentUser.stationId

        let resolvedDate = reportingDateIso
        if (
          explicitReportDate &&
          typeof explicitReportDate === 'string' &&
          staffOwnStation
        ) {
          const d = explicitReportDate.slice(0, 10)
          if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d <= reportingDateIso) {
            resolvedDate = d
          }
        }

        const reportType = restPayload.reportType === 'lpg' ? 'lpg' : 'fuel'
        const dup = state.reports.some((r) => r.stationId === stationId && r.date === resolvedDate && (r.reportType || 'fuel') === reportType)
        if (dup) {
          return { ok: false, error: 'duplicate_date' }
        }

        if (reportType === 'lpg') {
          const lpg = restPayload.lpgReport || {}
          const carriedCashBf = Number(restPayload.cashBf ?? lpg.cashBf ?? 0)
          const normalizedCashSales = Number(restPayload.cashSales ?? lpg.cashSales ?? 0)
          const normalizedPosValue = Number(restPayload.posValue ?? lpg.posTotal ?? 0)
          const normalizedBankLodgements = Number(restPayload.totalPaymentDeposits ?? lpg.bankTotal ?? 0)
          const derivedTotalAmount = carriedCashBf + normalizedCashSales
          const closingBalance = Number(restPayload.closingBalance ?? lpg.closingBalance ?? 0)
          const newReport = {
            id: `stn-${stationId}-lpg-${Date.now()}`,
            ...restPayload,
            reportType,
            lpgReport: lpg,
            stationId,
            date: resolvedDate,
            cashBf: carriedCashBf,
            cashSales: normalizedCashSales,
            posValue: normalizedPosValue,
            totalPaymentDeposits: normalizedBankLodgements,
            totalAmount: derivedTotalAmount,
            closingBalance,
            expenseAmount: 0,
          }
          try {
            await insertReport(newReport)
          } catch (err) {
            // 23505 = row already exists in DB (successful prior attempt the client didn't see)
            if (err?.code === '23505') {
              await get().refreshFromSupabase()
              return { ok: true, reportId: newReport.id, reportDate: resolvedDate }
            }
            return {
              ok: false,
              error: 'sync_failed',
              message: extractErrorMessage(err),
              rawError: err,
            }
          }
          set({ reports: [...state.reports, newReport] })
          return { ok: true, reportId: newReport.id, reportDate: resolvedDate }
        }

        const openingStockPMS = Number(restPayload.openingStockPMS ?? 0)
        const openingStockAGO = Number(restPayload.openingStockAGO ?? 0)
        const carriedCashBf = Number(restPayload.cashBf ?? 0)
        const normalizedCashSales = Number(restPayload.cashSales || 0)
        const normalizedPosValue = Number(restPayload.posValue || 0)
        const normalizedBankLodgements = Number(restPayload.totalPaymentDeposits || 0)
        const derivedTotalAmount = carriedCashBf + normalizedCashSales
        const derivedClosingBalance = derivedTotalAmount - normalizedBankLodgements - normalizedPosValue

        const receivedPMS = Number(restPayload.receivedPMS || 0)
        const receivedAGO = Number(restPayload.receivedAGO || 0)
        const rttPMS = Number(restPayload.rttPMS || 0)
        const rttAGO = Number(restPayload.rttAGO || 0)
        const salesLitersPMS = Number(restPayload.totalSalesLitersPMS || 0)
        const salesLitersAGO = Number(restPayload.totalSalesLitersAGO || 0)
        const previousRemainingPMS = openingStockPMS
        const previousRemainingAGO = openingStockAGO
        const quantityRemainingPMS = computeQuantityRemaining({
          previousRemaining: previousRemainingPMS,
          received: receivedPMS,
          salesLiters: salesLitersPMS,
          rtt: rttPMS,
        })
        const quantityRemainingAGO = computeQuantityRemaining({
          previousRemaining: previousRemainingAGO,
          received: receivedAGO,
          salesLiters: salesLitersAGO,
          rtt: rttAGO,
        })
        const openingStockPMSStored = openingStockPMS
        const openingStockAGOStored = openingStockAGO

        const newReport = {
          id: `stn-${stationId}-${Date.now()}`,
          ...restPayload,
          reportType,
          openingStockPMS: openingStockPMSStored,
          openingStockAGO: openingStockAGOStored,
          openingPMS: openingStockPMSStored,
          openingAGO: openingStockAGOStored,
          quantityRemainingPMS,
          quantityRemainingAGO,
          cashBf: carriedCashBf,
          cashSales: normalizedCashSales,
          posValue: normalizedPosValue,
          totalPaymentDeposits: normalizedBankLodgements,
          totalAmount: derivedTotalAmount,
          closingBalance: derivedClosingBalance,
          stationId,
          date: resolvedDate,
        }
        try {
          await insertReport(newReport)
        } catch (err) {
          // 23505 = row already exists in DB (successful prior attempt the client didn't see)
          if (err?.code === '23505') {
            await get().refreshFromSupabase()
            return { ok: true, reportId: newReport.id, reportDate: resolvedDate }
          }
          return {
            ok: false,
            error: 'sync_failed',
            message: extractErrorMessage(err),
            rawError: err,
          }
        }
        set({
          reports: [...state.reports, newReport],
        })
        return { ok: true, reportId: newReport.id, reportDate: resolvedDate }
      },
      rejectReport: async ({ reportId, reason }) => {
        const state = get()
        const report = state.reports.find((r) => r.id === reportId)
        if (!report) return { ok: false, error: 'not_found' }
        try {
          await deleteReportById(reportId)
        } catch {
          // swallow — still remove locally so manager can resubmit
        }
        set({
          reports: state.reports.filter((r) => r.id !== reportId),
          rejectedReports: [
            ...state.rejectedReports,
            {
              stationId: report.stationId,
              date: report.date,
              reportType: report.reportType || 'fuel',
              reason: String(reason || '').trim(),
              rejectedBy: state.currentUser?.name || 'Supervisor',
              rejectedAt: new Date().toISOString(),
            },
          ],
        })
        return { ok: true }
      },
      requestSectionCorrection: ({ reportId, sections, reason }) =>
        set((state) => {
          const report = state.reports.find((r) => r.id === reportId)
          if (!report) return { reports: state.reports }
          const now = new Date().toISOString()
          const updated = {
            ...report,
            correctionRequest: {
              sections,
              reason: String(reason || '').trim(),
              requestedBy: state.currentUser?.name || 'Supervisor',
              requestedByUserId: state.currentUser?.id || null,
              requestedAt: now,
              status: 'pending',
            },
            supervisorReview: {
              status: 'Needs Correction',
              remark: String(reason || '').trim(),
              reviewedBy: state.currentUser?.name || 'Supervisor',
              reviewedAt: now,
            },
          }
          insertReport(updated).catch(() => {})
          return { reports: state.reports.map((r) => r.id === reportId ? updated : r) }
        }),
      submitSectionCorrection: ({ reportId, patch }) =>
        set((state) => {
          const report = state.reports.find((r) => r.id === reportId)
          if (!report) return { reports: state.reports }
          const now = new Date().toISOString()
          // Opening stock / RTT feed into the book-remaining figure — recompute it
          // whenever a correction touches either, so it doesn't go stale relative
          // to the corrected inputs (received/sales are untouched by this section).
          const mergedPatch = { ...patch }
          if (patch.openingStockPMS != null) {
            mergedPatch.openingPMS = Number(patch.openingStockPMS)
          }
          if (patch.openingStockAGO != null) {
            mergedPatch.openingAGO = Number(patch.openingStockAGO)
          }
          if (patch.openingStockPMS != null || patch.rttPMS != null) {
            mergedPatch.quantityRemainingPMS = computeQuantityRemaining({
              previousRemaining: Number(patch.openingStockPMS ?? report.openingStockPMS ?? 0),
              received: Number(report.receivedPMS ?? 0),
              salesLiters: Number(report.totalSalesLitersPMS ?? 0),
              rtt: Number(patch.rttPMS ?? report.rttPMS ?? 0),
            })
          }
          if (patch.openingStockAGO != null || patch.rttAGO != null) {
            mergedPatch.quantityRemainingAGO = computeQuantityRemaining({
              previousRemaining: Number(patch.openingStockAGO ?? report.openingStockAGO ?? 0),
              received: Number(report.receivedAGO ?? 0),
              salesLiters: Number(report.totalSalesLitersAGO ?? 0),
              rtt: Number(patch.rttAGO ?? report.rttAGO ?? 0),
            })
          }
          const updated = {
            ...report,
            ...mergedPatch,
            correctionRequest: { ...report.correctionRequest, status: 'corrected', correctedAt: now },
            supervisorCorrectionHistory: [
              ...(Array.isArray(report.supervisorCorrectionHistory) ? report.supervisorCorrectionHistory : []),
              {
                correctedBy: state.currentUser?.name || 'Manager',
                correctedByUserId: state.currentUser?.id || null,
                correctedAt: now,
                reason: `Manager correction — sections: ${(report.correctionRequest?.sections || []).join(', ')}`,
                type: 'manager_correction',
                sections: report.correctionRequest?.sections || [],
              },
            ],
            supervisorReview: {
              ...report.supervisorReview,
              status: 'Pending Review',
              remark: 'Manager submitted corrections — awaiting supervisor review',
            },
          }
          insertReport(updated).catch(() => {})
          return { reports: state.reports.map((r) => r.id === reportId ? updated : r) }
        }),
      updateReportSupervisorReview: ({ reportId, status, remark }) =>
        set((state) => ({
          reports: state.reports.map((report) =>
            report.id === reportId
              ? {
                  ...report,
                  supervisorReview: {
                    status,
                    remark,
                    reviewedBy: state.currentUser?.name || 'Supervisor',
                    reviewedAt: new Date().toISOString(),
                  },
                }
              : report,
          ),
        })),
      correctReportBySupervisor: ({ reportId, patch, reason }) =>
        set((state) => {
          const target = state.reports.find((report) => report.id === reportId)
          if (!target) return { reports: state.reports }

          const reviewer = state.currentUser?.name || 'Supervisor'
          const reviewedAt = new Date().toISOString()
          const nextPumpReadings = Array.isArray(patch.pumpReadings)
            ? patch.pumpReadings
            : Array.isArray(target.pumpReadings)
              ? target.pumpReadings
              : []
          const receivedPMS = Number(patch.receivedPMS ?? target.receivedPMS ?? 0)
          const receivedAGO = Number(patch.receivedAGO ?? target.receivedAGO ?? 0)
          const rttPMS = Number(patch.rttPMS ?? target.rttPMS ?? 0)
          const rttAGO = Number(patch.rttAGO ?? target.rttAGO ?? 0)
          const calcPumpSales = (productType) => {
            const rows = nextPumpReadings.filter((item) => (item.productType === 'AGO' ? 'AGO' : 'PMS') === productType)
            if (!rows.length) return null
            return rows.reduce((sum, item) => {
              const opening = Number(item.opening ?? item.start ?? 0)
              const closing = Number(item.closing ?? item.end ?? 0)
              return sum + Math.max(0, closing - opening)
            }, 0)
          }
          const pumpSalesPMS = calcPumpSales('PMS')
          const pumpSalesAGO = calcPumpSales('AGO')
          const openingStockPMS = Number(patch.openingStockPMS ?? target.openingStockPMS ?? target.openingPMS ?? 0)
          const openingStockAGO = Number(patch.openingStockAGO ?? target.openingStockAGO ?? target.openingAGO ?? 0)
          const closingStockPMS = Number(patch.closingStockPMS ?? target.closingStockPMS ?? 0)
          const closingStockAGO = Number(patch.closingStockAGO ?? target.closingStockAGO ?? 0)
          const totalSalesLitersPMS = pumpSalesPMS != null
            ? Math.max(0, pumpSalesPMS - rttPMS)
            : Number(patch.totalSalesLitersPMS ?? target.totalSalesLitersPMS ?? target.salesPMS ?? 0)
          const totalSalesLitersAGO = pumpSalesAGO != null
            ? Math.max(0, pumpSalesAGO - rttAGO)
            : Number(patch.totalSalesLitersAGO ?? target.totalSalesLitersAGO ?? target.salesAGO ?? 0)
          const cashBf = Number(patch.cashBf ?? target.cashBf ?? 0)
          const cashSales = Number(patch.cashSales ?? target.cashSales ?? 0)
          const posValue = Number(patch.posValue ?? target.posValue ?? 0)
          const posTerminalBreakdown = Array.isArray(patch.posTerminalBreakdown)
            ? patch.posTerminalBreakdown
            : Array.isArray(target.posTerminalBreakdown)
              ? target.posTerminalBreakdown
              : []
          const paymentBreakdown = Array.isArray(patch.paymentBreakdown)
            ? patch.paymentBreakdown
            : Array.isArray(target.paymentBreakdown)
              ? target.paymentBreakdown
              : []
          const totalPaymentDeposits = paymentBreakdown.reduce((sum, item) => sum + Number(item.amount || 0), 0)
          const totalAmount = cashBf + cashSales
          const closingBalance = patch.closingBalance !== '' && patch.closingBalance != null
            ? Number(patch.closingBalance)
            : totalAmount - totalPaymentDeposits - posValue
          const expenseItems = Array.isArray(patch.expenseItems)
            ? patch.expenseItems
            : Array.isArray(target.expenseItems)
              ? target.expenseItems
              : []
          const expenseAmount = expenseItems.reduce((sum, item) => sum + Number(item.amount || 0), 0)
          const expenseDescription = expenseItems.map((item) => item.label).filter(Boolean).join(', ')
          const correctionPatch = {
            ...patch,
            openingStockPMS,
            openingStockAGO,
            openingPMS: openingStockPMS,
            openingAGO: openingStockAGO,
            closingStockPMS,
            closingStockAGO,
            receivedPMS,
            receivedAGO,
            quantityReceived: receivedPMS + receivedAGO,
            rttPMS,
            rttAGO,
            pumpReadings: nextPumpReadings,
            pumpSalesLitersPMS: pumpSalesPMS,
            pumpSalesLitersAGO: pumpSalesAGO,
            totalSalesLitersPMS,
            totalSalesLitersAGO,
            salesPMS: totalSalesLitersPMS,
            salesAGO: totalSalesLitersAGO,
            calculatedSalesLitersPMS: totalSalesLitersPMS,
            calculatedSalesLitersAGO: totalSalesLitersAGO,
            managerEnteredSalesLitersPMS: patch.managerEnteredSalesLitersPMS != null ? Number(patch.managerEnteredSalesLitersPMS) : (target.managerEnteredSalesLitersPMS ?? null),
            managerEnteredSalesLitersAGO: patch.managerEnteredSalesLitersAGO != null ? Number(patch.managerEnteredSalesLitersAGO) : (target.managerEnteredSalesLitersAGO ?? null),
            quantityRemainingPMS: computeQuantityRemaining({ previousRemaining: openingStockPMS, received: receivedPMS, salesLiters: totalSalesLitersPMS, rtt: rttPMS }),
            quantityRemainingAGO: computeQuantityRemaining({ previousRemaining: openingStockAGO, received: receivedAGO, salesLiters: totalSalesLitersAGO, rtt: rttAGO }),
            cashBf,
            cashSales,
            posValue,
            posTerminalBreakdown,
            paymentBreakdown,
            totalPaymentDeposits,
            totalAmount,
            closingBalance,
            expenseItems,
            expenseAmount,
            expenseDescription,
            remark: patch.remark ?? target.remark ?? target.remarks ?? '',
            remarks: patch.remark ?? target.remark ?? target.remarks ?? '',
          }
          const changes = Object.entries(correctionPatch)
            .filter(([key, value]) => JSON.stringify(target[key]) !== JSON.stringify(value))
            .map(([key, value]) => ({ field: key, from: target[key], to: value }))
          const correctedReport = {
            ...target,
            ...correctionPatch,
            supervisorCorrectionHistory: [
              ...(Array.isArray(target.supervisorCorrectionHistory) ? target.supervisorCorrectionHistory : []),
              {
                correctedBy: reviewer,
                correctedByUserId: state.currentUser?.id || null,
                correctedAt: reviewedAt,
                reason: String(reason || '').trim(),
                changes,
              },
            ],
            supervisorReview: {
              status: 'Corrected',
              remark: String(reason || '').trim() || 'Corrected by supervisor',
              reviewedBy: reviewer,
              reviewedAt,
            },
            hasDiscrepancy: true,
          }
          insertReport(correctedReport).catch(() => {})
          return {
            reports: state.reports.map((report) => report.id === reportId ? correctedReport : report),
          }
        }),
      finalizeReportBySupervisor: ({ reportId, remark }) =>
        set((state) => {
          const finalizedAt = new Date().toISOString()
          const finalizedReport = state.reports.find((report) => report.id === reportId)
          if (!finalizedReport) return { reports: state.reports }
          const nextReport = {
            ...finalizedReport,
            finalizationStatus: 'finalized',
            finalizedBy: state.currentUser?.name || 'Supervisor',
            finalizedByUserId: state.currentUser?.id || null,
            finalizedAt,
            finalizationRemark: String(remark || '').trim(),
            supervisorReview: {
              status: 'Reviewed',
              remark: String(remark || '').trim() || 'Finalised by supervisor',
              reviewedBy: state.currentUser?.name || 'Supervisor',
              reviewedAt: finalizedAt,
            },
          }
          insertReport(nextReport).catch(() => {})
          return {
            reports: state.reports.map((report) => report.id === reportId ? nextReport : report),
          }
        }),
      getRoleRoute: () => {
        const state = get()
        if (state.role === ROLES.STAFF) {
          return '/staff/report'
        }
        return ROLE_ROUTE_MAP[state.role] || '/login'
      },
      getCurrentStation: () => {
        const stationId = get().currentUser?.stationId
        return get().stations.find((station) => station.id === stationId) || null
      },
      getStationReports: (stationId) =>
        get()
          .reports.filter((report) => report.stationId === stationId)
          .sort((a, b) => a.date.localeCompare(b.date)),
      getStationMetrics: () => {
        const state = get()
        return state.stations.map((station) => {
          const stationReports = state.reports.filter(
            (report) => report.stationId === station.id,
          )
          return buildStationMetrics(station, stationReports, state.appSettings?.stockThresholds)
        })
      },
      getSupervisorPortfolio: () => {
        const state = get()
        return state.stations.map((station) => {
          const stationReports = state.reports.filter((report) => report.stationId === station.id)
          return buildStationMetrics(station, stationReports, state.appSettings?.stockThresholds)
        })
      },
      createIntervention: (payload) =>
        set((state) => ({
          interventions: [
            {
              id: `itv-${Date.now()}`,
              createdAt: new Date().toISOString(),
              createdBy: state.currentUser?.name || 'Supervisor',
              ...payload,
            },
            ...state.interventions,
          ],
        })),
      flagStationIntervention: ({ stationId, stationName, status }) =>
        set((state) => {
          const existing = state.interventions.find((item) => item.stationId === stationId)
          if (existing) {
            return { interventions: state.interventions }
          }

          const newIntervention = {
            id: `itv-${Date.now()}`,
            stationId,
            stationName,
            status,
            stage: 'flagged',
            message: 'Supervisor flagged station for immediate restock follow-up.',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: state.currentUser?.name || 'Supervisor',
          }
          upsertIntervention(newIntervention).catch(() => {
            // Keep local-first UX; remote sync errors can be surfaced later.
          })
          return {
            interventions: [newIntervention, ...state.interventions],
          }
        }),
      escalateStationIntervention: ({ stationId }) =>
        set((state) => {
          const nextInterventions = state.interventions.map((item) =>
            item.stationId === stationId
              ? item.stage === 'escalated'
                ? item
                : {
                    ...item,
                    stage: 'escalated',
                    status: 'warning',
                    message: 'Escalated to admin for immediate action.',
                    updatedAt: new Date().toISOString(),
                  }
              : item,
          )
          const syncedIntervention = nextInterventions.find((item) => item.stationId === stationId) || null
          if (syncedIntervention) {
            upsertIntervention(syncedIntervention).catch(() => {
              // Keep local-first UX; remote sync errors can be surfaced later.
            })
          }
          return { interventions: nextInterventions }
        }),
      revertEscalationIntervention: ({ stationId }) =>
        set((state) => {
          const nextInterventions = state.interventions.map((item) =>
            item.stationId === stationId && item.stage === 'escalated'
              ? {
                  ...item,
                  stage: 'flagged',
                  message: 'Supervisor flagged station for immediate restock follow-up.',
                  updatedAt: new Date().toISOString(),
                }
              : item,
          )
          const syncedIntervention = nextInterventions.find((item) => item.stationId === stationId) || null
          if (syncedIntervention) {
            upsertIntervention(syncedIntervention).catch(() => {
              // Keep local-first UX; remote sync errors can be surfaced later.
            })
          }
          return { interventions: nextInterventions }
        }),
      unflagStationIntervention: ({ stationId }) =>
        set((state) => {
          const target = state.interventions.find((item) => item.stationId === stationId)
          if (target) {
            deleteIntervention(target.id).catch(() => {
              // Keep local-first UX; remote sync errors can be surfaced later.
            })
          }
          return {
            interventions: state.interventions.filter((item) => item.stationId !== stationId),
          }
        }),
      createProductRequest: ({ id, requestedProductType, requestedLiters, remark, lowStockPhotoUrls = [] }) => {
        const state = get()
        const stationId = state.currentUser?.stationId
        const manager = state.currentUser
        const normalizedLiters = Number(requestedLiters || 0)
        const normalizedProductType = requestedProductType === 'AGO' ? 'AGO' : 'PMS'
        const trimmedRemark = String(remark || '').trim()

        if (!stationId || !manager || normalizedLiters <= 0) {
          return
        }

        const createdAt = new Date().toISOString()
        const newRequest = {
          id: id || `req-${Date.now()}`,
          stationId,
          managerId: manager.id,
          managerName: manager.name || 'Manager',
          requestedProductType: normalizedProductType,
          requestedLiters: normalizedLiters,
          managerRemark: trimmedRemark,
          status: 'submitted',
          managerStatusLabel: 'Requested',
          supervisorDecision: null,
          supervisorRemark: '',
          supervisorName: '',
          supervisorReviewedAt: null,
          adminDecision: null,
          adminRemark: '',
          adminName: '',
          adminReviewedAt: null,
          approvedProductType: null,
          approvedLiters: null,
          dispatchNote: '',
          dispatchStatus: 'requested',
          receivedTankDip: null,
          receivedAt: null,
          receivedBy: '',
          receivedRemark: '',
          issueReportedAt: null,
          issueReportedBy: '',
          issueRemark: '',
          calledBackAt: null,
          calledBackBy: '',
          callbackReason: '',
          terminalDecision: null,
          terminalRemark: '',
          terminalName: '',
          terminalReviewedAt: null,
          truckNumber: '',
          truckDriver: '',
          lowStockPhotoUrls: Array.isArray(lowStockPhotoUrls) ? lowStockPhotoUrls : [],
          createdAt,
          updatedAt: createdAt,
        }

        set({
          productRequests: [newRequest, ...state.productRequests],
        })
        upsertProductRequest(newRequest).catch(() => {
          // Keep local-first UX; remote sync errors can be surfaced later.
        })
      },
      reviewProductRequestBySupervisor: ({ requestId, decision, remark }) => {
        const state = get()
        const supervisorName = state.currentUser?.name || 'Supervisor'
        const reviewedAt = new Date().toISOString()
        const normalizedDecision = decision === 'decline' ? 'decline' : 'approve'
        const trimmedRemark = String(remark || '').trim()

        let syncedRequest = null
        set((currentState) => ({
          productRequests: currentState.productRequests.map((request) => {
            if (request.id !== requestId || request.status !== 'submitted') {
              return request
            }

            if (normalizedDecision === 'decline') {
              const nextRequest = {
                ...request,
                status: 'declined',
                managerStatusLabel: 'Declined',
                supervisorDecision: 'declined',
                supervisorRemark: trimmedRemark || 'Declined by supervisor',
                supervisorName,
                supervisorReviewedAt: reviewedAt,
                updatedAt: reviewedAt,
              }
              syncedRequest = nextRequest
              return nextRequest
            }

            const nextRequest = {
              ...request,
              status: 'pending_admin',
              managerStatusLabel: 'Pending',
              supervisorDecision: 'approved',
              supervisorRemark: trimmedRemark || 'Escalated to admin',
              supervisorName,
              supervisorReviewedAt: reviewedAt,
              updatedAt: reviewedAt,
            }
            syncedRequest = nextRequest
            return nextRequest
          }),
        }))
        if (syncedRequest) {
          upsertProductRequest(syncedRequest).catch(() => {
            // Keep local-first UX; remote sync errors can be surfaced later.
          })
        }
      },
      resolveProductRequestByAdmin: ({
        requestId,
        decision,
        approvedProductType,
        approvedLiters,
        remark,
      }) => {
        const state = get()
        const adminName = state.currentUser?.name || 'Admin'
        const reviewedAt = new Date().toISOString()
        const normalizedDecision = decision === 'decline' ? 'decline' : 'approve'
        const normalizedProductType = approvedProductType === 'AGO' ? 'AGO' : 'PMS'
        const normalizedLiters = Number(approvedLiters || 0)
        const trimmedRemark = String(remark || '').trim()

        let syncedRequest = null
        set((currentState) => ({
          productRequests: currentState.productRequests.map((request) => {
            if (
              request.id !== requestId ||
              !['submitted', 'pending_admin'].includes(request.status)
            ) {
              return request
            }

            if (normalizedDecision === 'decline') {
              const nextRequest = {
                ...request,
                status: 'declined',
                managerStatusLabel: 'Declined',
                adminDecision: 'declined',
                adminRemark: trimmedRemark || 'Declined by admin',
                adminName,
                adminReviewedAt: reviewedAt,
                dispatchNote: '',
                updatedAt: reviewedAt,
              }
              syncedRequest = nextRequest
              return nextRequest
            }

            const nextRequest = {
              ...request,
              status: 'approved',
              managerStatusLabel: 'Approved',
              adminDecision: 'approved',
              adminRemark: trimmedRemark || 'Expect product in 24hrs',
              adminName,
              adminReviewedAt: reviewedAt,
              approvedProductType: normalizedProductType,
              approvedLiters: normalizedLiters > 0 ? normalizedLiters : request.requestedLiters,
              dispatchNote: 'Expect product in 24hrs',
              updatedAt: reviewedAt,
            }
            syncedRequest = nextRequest
            return nextRequest
          }),
        }))
        if (syncedRequest) {
          upsertProductRequest(syncedRequest).catch(() => {
            // Keep local-first UX; remote sync errors can be surfaced later.
          })
        }
      },
      resolveProductRequestByTerminalOperator: ({
        requestId,
        decision,
        approvedLiters,
        costPricePerLiter,
        transportCostPerLiter,
        truckNumber,
        truckDriver,
        remark,
      }) => {
        const state = get()
        const operatorName = state.currentUser?.name || 'Terminal Operator'
        const reviewedAt = new Date().toISOString()
        const normalizedDecision = decision === 'decline' ? 'decline' : 'approve'
        const normalizedLiters = Number(approvedLiters || 0)
        const normalizedCostPricePerLiter = Number(costPricePerLiter || 0)
        const normalizedTransportCostPerLiter = Number(transportCostPerLiter || 0)
        const landingCostPerLiter = normalizedCostPricePerLiter + normalizedTransportCostPerLiter
        const totalProductCost = normalizedLiters * normalizedCostPricePerLiter
        const totalTransportCost = normalizedLiters * normalizedTransportCostPerLiter
        const totalLandingCost = normalizedLiters * landingCostPerLiter
        const trimmedRemark = String(remark || '').trim()
        const trimmedTruckNumber = String(truckNumber || '').trim()
        const trimmedTruckDriver = String(truckDriver || '').trim()

        let syncedRequest = null
        set((currentState) => ({
          productRequests: currentState.productRequests.map((request) => {
            if (
              request.id !== requestId ||
              !['submitted', 'pending_admin'].includes(request.status)
            ) {
              return request
            }

            if (normalizedDecision === 'decline') {
              const nextRequest = {
                ...request,
                status: 'declined',
                managerStatusLabel: 'Declined',
                terminalDecision: 'declined',
                terminalRemark: trimmedRemark || 'Declined by terminal operator',
                terminalName: operatorName,
                terminalReviewedAt: reviewedAt,
                truckNumber: '',
                truckDriver: '',
                dispatchNote: '',
                dispatchStatus: 'declined',
                updatedAt: reviewedAt,
              }
              syncedRequest = nextRequest
              return nextRequest
            }

            const nextRequest = {
              ...request,
              status: 'approved',
              managerStatusLabel: 'Approved',
              terminalDecision: 'approved',
              terminalRemark: trimmedRemark,
              terminalName: operatorName,
              terminalReviewedAt: reviewedAt,
              approvedProductType: request.requestedProductType,
              approvedLiters: normalizedLiters > 0 ? normalizedLiters : request.requestedLiters,
              costPricePerLiter: normalizedCostPricePerLiter,
              transportCostPerLiter: normalizedTransportCostPerLiter,
              landingCostPerLiter,
              totalProductCost,
              totalTransportCost,
              totalLandingCost,
              truckNumber: trimmedTruckNumber,
              truckDriver: trimmedTruckDriver,
              dispatchNote: trimmedRemark,
              dispatchStatus: 'dispatched',
              updatedAt: reviewedAt,
            }
            syncedRequest = nextRequest
            return nextRequest
          }),
        }))
        if (syncedRequest) {
          upsertProductRequest(syncedRequest).catch(() => {
            // Keep local-first UX; remote sync errors can be surfaced later.
          })
        }
      },
      createDirectTerminalDispatch: async ({
        stationId,
        productType,
        liters,
        costPricePerLiter,
        transportCostPerLiter,
        truckNumber,
        truckDriver,
        remark,
      }) => {
        const state = get()
        const operator = state.currentUser
        const targetStation = state.stations.find((station) => station.id === stationId)
        const targetManager = state.users.find(
          (user) => user.role === ROLES.STAFF && user.stationId === targetStation?.id,
        )
        const requestOwner = targetManager || operator
        const normalizedProductType = productType === 'AGO' ? 'AGO' : 'PMS'
        const normalizedLiters = Number(liters || 0)
        const normalizedCostPricePerLiter = Number(costPricePerLiter || 0)
        const normalizedTransportCostPerLiter = Number(transportCostPerLiter || 0)
        const landingCostPerLiter = normalizedCostPricePerLiter + normalizedTransportCostPerLiter
        const totalProductCost = normalizedLiters * normalizedCostPricePerLiter
        const totalTransportCost = normalizedLiters * normalizedTransportCostPerLiter
        const totalLandingCost = normalizedLiters * landingCostPerLiter
        const reviewedAt = new Date().toISOString()
        const trimmedTruckNumber = String(truckNumber || '').trim()
        const trimmedTruckDriver = String(truckDriver || '').trim()
        const trimmedRemark = String(remark || '').trim()

        if (!operator || !targetStation || !requestOwner || normalizedLiters <= 0) {
          return { ok: false, message: 'Select a valid station and dispatch quantity.' }
        }

        const newRequest = {
          id: `direct-${Date.now()}`,
          stationId: targetStation.id,
          managerId: requestOwner.id,
          managerName: targetManager?.name || 'Direct terminal dispatch',
          requestedProductType: normalizedProductType,
          requestedLiters: normalizedLiters,
          managerRemark: 'Created by terminal operator without station request',
          status: 'approved',
          managerStatusLabel: 'Approved',
          supervisorDecision: null,
          supervisorRemark: '',
          supervisorName: '',
          supervisorReviewedAt: null,
          adminDecision: null,
          adminRemark: '',
          adminName: '',
          adminReviewedAt: null,
          approvedProductType: normalizedProductType,
          approvedLiters: normalizedLiters,
          costPricePerLiter: normalizedCostPricePerLiter,
          transportCostPerLiter: normalizedTransportCostPerLiter,
          landingCostPerLiter,
          totalProductCost,
          totalTransportCost,
          totalLandingCost,
          dispatchNote: trimmedRemark,
          dispatchStatus: 'dispatched',
          receivedTankDip: null,
          receivedAt: null,
          receivedBy: '',
          receivedRemark: '',
          issueReportedAt: null,
          issueReportedBy: '',
          issueRemark: '',
          calledBackAt: null,
          calledBackBy: '',
          callbackReason: '',
          terminalDecision: 'approved',
          terminalRemark: trimmedRemark,
          terminalName: operator.name || 'Terminal Operator',
          terminalReviewedAt: reviewedAt,
          truckNumber: trimmedTruckNumber,
          truckDriver: trimmedTruckDriver,
          lowStockPhotoUrls: [],
          createdAt: reviewedAt,
          updatedAt: reviewedAt,
        }

        try {
          await upsertStation(targetStation)
          await upsertUser(requestOwner)
          await upsertProductRequest(newRequest)
        } catch (err) {
          return {
            ok: false,
            message: extractErrorMessage(err) || 'Could not save dispatch to Supabase.',
          }
        }

        set((currentState) => ({
          productRequests: [newRequest, ...currentState.productRequests],
        }))
        return { ok: true, requestId: newRequest.id }
      },
      rerouteTerminalDispatch: ({ requestId, newStationId, reason }) => {
        const state = get()
        const operatorName = state.currentUser?.name || 'Terminal Operator'
        const reroutedAt = new Date().toISOString()
        let syncedRequest = null
        set((currentState) => ({
          productRequests: currentState.productRequests.map((request) => {
            if (
              request.id !== requestId ||
              request.dispatchStatus !== 'dispatched' ||
              request.receivedAt ||
              request.receivedTankDip != null
            ) return request
            const nextRequest = {
              ...request,
              stationId: newStationId,
              reroutedFrom: request.stationId,
              reroutedAt,
              reroutedBy: operatorName,
              rerouteReason: String(reason || '').trim(),
              updatedAt: reroutedAt,
            }
            syncedRequest = nextRequest
            return nextRequest
          }),
        }))
        if (syncedRequest) {
          upsertProductRequest(syncedRequest).catch(() => {})
        }
      },
      callBackTerminalDispatch: ({ requestId, reason }) => {
        const state = get()
        const operatorName = state.currentUser?.name || 'Terminal Operator'
        const calledBackAt = new Date().toISOString()
        const trimmedReason = String(reason || '').trim()

        let syncedRequest = null
        set((currentState) => ({
          productRequests: currentState.productRequests.map((request) => {
            if (
              request.id !== requestId ||
              request.dispatchStatus !== 'dispatched' ||
              request.receivedAt ||
              request.receivedTankDip != null
            ) {
              return request
            }
            const nextRequest = {
              ...request,
              status: 'called_back',
              managerStatusLabel: 'Called back',
              dispatchStatus: 'called_back',
              calledBackAt,
              calledBackBy: operatorName,
              callbackReason: trimmedReason || 'Called back by terminal operator',
              updatedAt: calledBackAt,
            }
            syncedRequest = nextRequest
            return nextRequest
          }),
        }))
        if (syncedRequest) {
          upsertProductRequest(syncedRequest).catch(() => {
            // Keep local-first UX; remote sync errors can be surfaced later.
          })
        }
      },
      reportDispatchIssue: ({ requestId, reason }) => {
        const state = get()
        const managerName = state.currentUser?.name || 'Manager'
        const issueReportedAt = new Date().toISOString()
        const trimmedReason = String(reason || '').trim()

        let syncedRequest = null
        set((currentState) => ({
          productRequests: currentState.productRequests.map((request) => {
            if (
              request.id !== requestId ||
              request.dispatchStatus !== 'dispatched' ||
              request.receivedAt ||
              request.receivedTankDip != null
            ) {
              return request
            }
            const nextRequest = {
              ...request,
              dispatchStatus: 'issue_reported',
              managerStatusLabel: 'Issue reported',
              issueReportedAt,
              issueReportedBy: managerName,
              issueRemark: trimmedReason || 'Issue reported by manager',
              updatedAt: issueReportedAt,
            }
            syncedRequest = nextRequest
            return nextRequest
          }),
        }))
        if (syncedRequest) {
          upsertProductRequest(syncedRequest).catch(() => {
            // Keep local-first UX; remote sync errors can be surfaced later.
          })
        }
      },
      confirmDispatchReceived: async ({ requestId, tankDip, remark }) => {
        const state = get()
        const managerName = state.currentUser?.name || 'Manager'
        const receivedAt = new Date().toISOString()
        const normalizedTankDip = Number(tankDip || 0)
        const trimmedRemark = String(remark || '').trim()

        const target = state.productRequests.find(
          (request) => request.id === requestId && request.dispatchStatus === 'dispatched',
        )
        if (!target) {
          return { ok: false, message: 'This dispatch is no longer available for receipt confirmation.' }
        }

        const receivedRequest = {
          ...target,
          dispatchStatus: 'received',
          managerStatusLabel: 'Received',
          receivedTankDip: normalizedTankDip,
          receivedAt,
          receivedBy: managerName,
          receivedRemark: trimmedRemark,
          updatedAt: receivedAt,
        }

        try {
          await upsertProductRequest(receivedRequest)
        } catch (err) {
          return {
            ok: false,
            message: extractErrorMessage(err) || 'Could not save received product confirmation.',
          }
        }

        set((currentState) => ({
          productRequests: currentState.productRequests.map((request) =>
            request.id === requestId ? receivedRequest : request,
          ),
        }))
        return { ok: true, requestId }
      },
      markReceivedDispatchesReported: ({ requestIds = [], reportId, reportDate }) => {
        const ids = new Set(requestIds)
        if (!ids.size || !reportId || !reportDate) return

        const updatedAt = new Date().toISOString()
        let syncedRequests = []
        set((currentState) => ({
          productRequests: currentState.productRequests.map((request) => {
            if (!ids.has(request.id) || request.dispatchStatus !== 'received') {
              return request
            }
            const nextRequest = {
              ...request,
              receivedReportId: reportId,
              receivedReportDate: reportDate,
              updatedAt,
            }
            syncedRequests.push(nextRequest)
            return nextRequest
          }),
        }))
        syncedRequests.forEach((request) => {
          upsertProductRequest(request).catch(() => {
            // Keep local-first UX; remote sync errors can be surfaced later.
          })
        })
      },
      deleteTerminalDispatch: async (requestId) => {
        if (!requestId) {
          return { ok: false, message: 'No dispatch selected.' }
        }
        try {
          await deleteProductRequest(requestId)
        } catch (err) {
          return {
            ok: false,
            message: extractErrorMessage(err) || 'Could not delete dispatch.',
          }
        }
        set((state) => ({
          productRequests: state.productRequests.filter((request) => request.id !== requestId),
        }))
        return { ok: true }
      },
      getManagerProductRequests: () => {
        const state = get()
        const managerId = state.currentUser?.id
        if (!managerId) {
          return []
        }
        return state.productRequests
          .filter((request) => request.managerId === managerId)
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      },
      getStationRequestHistory: (stationId) =>
        get()
          .productRequests.filter((request) => request.stationId === stationId)
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
      submitInspectorVisit: async (payload) => {
        const state = get()
        const inspector = state.currentUser
        if (!inspector?.id || state.role !== ROLES.INSPECTOR) {
          return { ok: false, message: 'Only inspectors can submit visit reports.' }
        }
        if (!payload?.stationId) {
          return { ok: false, message: 'Select a station for this visit.' }
        }

        const now = new Date().toISOString()
        const newVisit = {
          id: payload.id || `insp-visit-${Date.now()}`,
          stationId: payload.stationId,
          inspectorId: inspector.id,
          inspectorName: inspector.name || '',
          visitDate: payload.visitDate,
          arrivalTime: payload.arrivalTime || '',
          departureTime: payload.departureTime || '',
          managerInCharge: payload.managerInCharge || '',
          cashBf: Number(payload.cashBf || 0),
          cash: Number(payload.cash || 0),
          posBf: Number(payload.posBf || 0),
          pos: Number(payload.pos || 0),
          tankReadings: Array.isArray(payload.tankReadings) ? payload.tankReadings : [],
          pumpReadings: Array.isArray(payload.pumpReadings) ? payload.pumpReadings : [],
          photoEvidence: Array.isArray(payload.photoEvidence) ? payload.photoEvidence : [],
          remark: payload.remark || '',
          createdAt: now,
          updatedAt: now,
        }

        try {
          if (hasSupabaseEnv && supabase) {
            await insertInspectorVisit(newVisit)
          }
        } catch (error) {
          return {
            ok: false,
            message: extractErrorMessage(error, 'Could not save visit. Check your connection and try again.'),
          }
        }

        set((current) => ({
          inspectorVisits: [newVisit, ...asArray(current.inspectorVisits)],
        }))
        return { ok: true }
      },
      addManualCostEntry: async (payload) => {
        const state = get()
        if (state.role !== ROLES.ADMIN) {
          return { ok: false, message: 'Only admins can add manual cost entries.' }
        }
        const stationId = String(payload?.stationId || '').trim()
        const productType = payload?.productType === 'AGO' ? 'AGO' : 'PMS'
        const quantity = Number(payload?.quantity || 0)
        const costPricePerLiter = Number(payload?.costPricePerLiter || 0)
        const transportCostPerLiter = Number(payload?.transportCostPerLiter || 0)
        if (!stationId) return { ok: false, message: 'Select a station.' }
        if (!(quantity > 0)) return { ok: false, message: 'Enter a quantity greater than zero.' }
        if (!(costPricePerLiter > 0)) return { ok: false, message: 'Enter a cost price per liter.' }

        const newEntry = {
          id: `manual-cost-${Date.now()}`,
          stationId,
          productType,
          quantity,
          costPricePerLiter,
          transportCostPerLiter,
          landingCostPerLiter: costPricePerLiter + transportCostPerLiter,
          remark: String(payload?.remark || '').trim(),
          enteredBy: state.currentUser?.name || 'Admin',
          enteredByUserId: state.currentUser?.id || null,
          createdAt: new Date().toISOString(),
        }

        try {
          if (hasSupabaseEnv && supabase) {
            await insertManualCostEntry(newEntry)
          }
        } catch (error) {
          return {
            ok: false,
            message: extractErrorMessage(error, 'Could not save manual cost entry. Check your connection and try again.'),
          }
        }

        set((current) => ({
          manualCostEntries: [...asArray(current.manualCostEntries), newEntry],
        }))
        return { ok: true }
      },
      finalizeSupervisorDailyReview: ({ date, generalRemark, stationReviews }) =>
        set((state) => {
          if (!date) {
            return { dailyFinalizations: state.dailyFinalizations }
          }

          const finalizedAt = new Date().toISOString()
          const payload = {
            date,
            generalRemark: String(generalRemark || '').trim(),
            stationReviews: Array.isArray(stationReviews) ? stationReviews : [],
            finalizedBy: state.currentUser?.name || 'Supervisor',
            finalizedByUserId: state.currentUser?.id || null,
            finalizedAt,
            status: 'finalized',
            adminAcknowledgedBy: null,
            adminAcknowledgedAt: null,
          }

          const existing = state.dailyFinalizations.find((item) => item.date === date)
          const nextDailyFinalizations = !existing
            ? [payload, ...state.dailyFinalizations].sort((a, b) => b.date.localeCompare(a.date))
            : state.dailyFinalizations
              .map((item) => (item.date === date ? { ...item, ...payload } : item))
              .sort((a, b) => b.date.localeCompare(a.date))
          upsertDailyFinalization(payload).catch(() => {
            // Keep local-first UX; remote sync errors can be surfaced later.
          })
          return { dailyFinalizations: nextDailyFinalizations }
        }),
      acknowledgeDailyFinalization: ({ date }) =>
        set((state) => {
          const nextDailyFinalizations = state.dailyFinalizations.map((item) =>
            item.date === date
              ? {
                  ...item,
                  status: 'admin_acknowledged',
                  adminAcknowledgedBy: state.currentUser?.name || 'Admin',
                  adminAcknowledgedAt: new Date().toISOString(),
                }
              : item,
          )
          const syncedFinalization = nextDailyFinalizations.find((item) => item.date === date) || null
          if (syncedFinalization) {
            upsertDailyFinalization(syncedFinalization).catch(() => {
              // Keep local-first UX; remote sync errors can be surfaced later.
            })
          }
          return { dailyFinalizations: nextDailyFinalizations }
        }),
      finalizeSupervisorMonthEndSummary: ({ monthKey, monthLabel, stationSummaries }) =>
        set((state) => {
          if (!monthKey) {
            return { monthEndFinalizations: state.monthEndFinalizations }
          }
          const finalizedAt = new Date().toISOString()
          const payload = {
            monthKey,
            monthLabel: monthLabel || monthKey,
            stationSummaries: Array.isArray(stationSummaries) ? stationSummaries : [],
            finalizedBy: state.currentUser?.name || 'Supervisor',
            finalizedByUserId: state.currentUser?.id || null,
            finalizedAt,
            status: 'finalized',
            adminAcknowledgedBy: null,
            adminAcknowledgedAt: null,
          }
          const existing = state.monthEndFinalizations.find((item) => item.monthKey === monthKey)
          const nextMonthEndFinalizations = !existing
            ? [payload, ...state.monthEndFinalizations].sort((a, b) => b.monthKey.localeCompare(a.monthKey))
            : state.monthEndFinalizations
              .map((item) => (item.monthKey === monthKey ? { ...item, ...payload } : item))
              .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
          upsertMonthEndFinalization(payload).catch(() => {
            // Keep local-first UX; remote sync errors can be surfaced later.
          })
          return { monthEndFinalizations: nextMonthEndFinalizations }
        }),
      acknowledgeMonthEndFinalization: ({ monthKey }) =>
        set((state) => {
          const nextMonthEndFinalizations = state.monthEndFinalizations.map((item) =>
            item.monthKey === monthKey
              ? {
                  ...item,
                  status: 'admin_acknowledged',
                  adminAcknowledgedBy: state.currentUser?.name || 'Admin',
                  adminAcknowledgedAt: new Date().toISOString(),
                }
              : item,
          )
          const syncedFinalization = nextMonthEndFinalizations.find((item) => item.monthKey === monthKey) || null
          if (syncedFinalization) {
            upsertMonthEndFinalization(syncedFinalization).catch(() => {
              // Keep local-first UX; remote sync errors can be surfaced later.
            })
          }
          return { monthEndFinalizations: nextMonthEndFinalizations }
        }),
      saveAdminDailyReview: async ({ date, supervisorFinalizedBy, generalRemark, stationReviews }) => {
        const state = get()
        if (!date) {
          return false
        }

        const reviewPayload = {
          id: `admin-review-${date}`,
          date,
          supervisorFinalizedBy: supervisorFinalizedBy || '',
          generalRemark: String(generalRemark || '').trim(),
          stationReviews: Array.isArray(stationReviews) ? stationReviews : [],
          savedBy: state.currentUser?.name || 'Admin',
          savedByUserId: state.currentUser?.id || null,
          savedAt: new Date().toISOString(),
        }

        set((currentState) => {
          const existing = currentState.adminDailyReviews.find((item) => item.date === date)
          if (!existing) {
            return {
              adminDailyReviews: [reviewPayload, ...currentState.adminDailyReviews].sort((a, b) =>
                b.date.localeCompare(a.date),
              ),
            }
          }
          return {
            adminDailyReviews: currentState.adminDailyReviews
              .map((item) => (item.date === date ? { ...item, ...reviewPayload } : item))
              .sort((a, b) => b.date.localeCompare(a.date)),
          }
        })

        try {
          await upsertAdminDailyReview(reviewPayload)
          return true
        } catch {
          return false
        }
      },
      setAdminReplenishmentWorkflow: (workflow) => {
        const payload = {
          stationId: workflow.stationId,
          managerName: workflow.managerName || 'Unassigned',
          urgency: workflow.urgency || 'warning',
          stockRemaining: Number(workflow.stockRemaining || 0),
          suggestedQuantity: Number(workflow.suggestedQuantity || 0),
          approvedQuantity: Number(workflow.approvedQuantity || 0),
          status: workflow.status || 'Pending Approval',
          note: String(workflow.note || '').trim(),
          updatedBy: get().currentUser?.name || 'Admin',
          updatedAt: new Date().toISOString(),
        }
        set((state) => {
          const exists = state.adminReplenishmentWorkflows.find((item) => item.stationId === payload.stationId)
          return {
            adminReplenishmentWorkflows: exists
              ? state.adminReplenishmentWorkflows.map((item) =>
                  item.stationId === payload.stationId ? { ...item, ...payload } : item,
                )
              : [payload, ...state.adminReplenishmentWorkflows],
          }
        })
        upsertAdminReplenishmentWorkflow(payload).catch(() => {
          // Local state remains usable if remote sync fails.
        })
      },
      setAdminReportResolution: (resolution) => {
        const payload = {
          reportId: resolution.reportId,
          stationId: resolution.stationId,
          stationName: resolution.stationName || resolution.stationId,
          reportDate: resolution.reportDate,
          supervisorName: resolution.supervisorName || 'Supervisor',
          reviewStatus: resolution.reviewStatus || 'Reviewed',
          supervisorRemark: resolution.supervisorRemark || '',
          resolution: resolution.resolution || '',
          note: String(resolution.note || '').trim(),
          updatedBy: get().currentUser?.name || 'Admin',
          updatedAt: new Date().toISOString(),
        }
        set((state) => {
          const exists = state.adminReportResolutions.find((item) => item.reportId === payload.reportId)
          return {
            adminReportResolutions: exists
              ? state.adminReportResolutions.map((item) => (item.reportId === payload.reportId ? { ...item, ...payload } : item))
              : [payload, ...state.adminReportResolutions],
          }
        })
        upsertAdminReportResolution(payload).catch(() => {
          // Local state remains usable if remote sync fails.
        })
      },
      openChatWithUser: (userId) =>
        set({
          isChatOpen: true,
          activeChatUserId: userId || '',
        }),
      setChatOpen: (isOpen) => set({ isChatOpen: Boolean(isOpen) }),
      setActiveChatUserId: (userId) => set({ activeChatUserId: userId || '' }),
      togglePinnedChatUser: (userId) =>
        set((state) => ({
          pinnedChatUserIds: state.pinnedChatUserIds.includes(userId)
            ? state.pinnedChatUserIds.filter((id) => id !== userId)
            : [...state.pinnedChatUserIds, userId],
        })),
      setTypingStatus: ({ toUserId, isTyping }) => {
        const currentUserId = get().currentUser?.id
        if (!currentUserId || !toUserId) {
          return
        }
        const key = `${currentUserId}:${toUserId}`
        set((state) => ({
          chatTypingMap: {
            ...state.chatTypingMap,
            [key]: Boolean(isTyping),
          },
        }))
      },
      markConversationSeen: (withUserId) => {
        const currentUserId = get().currentUser?.id
        if (!currentUserId || !withUserId) {
          return
        }
        const now = new Date().toISOString()
        set((state) => ({
          chatMessages: state.chatMessages.map((message) =>
            message.fromUserId === withUserId &&
            message.toUserId === currentUserId &&
            message.status !== 'seen'
              ? {
                  ...message,
                  status: 'seen',
                  seenAt: now,
                }
              : message,
          ),
          chatTypingMap: {
            ...state.chatTypingMap,
            [`${withUserId}:${currentUserId}`]: false,
          },
        }))
        markChatMessagesSeenInSupabase({
          readerUserId: currentUserId,
          senderUserId: withUserId,
        }).catch(() => {})
      },
      sendChatMessage: ({ toUserId, text }) => {
        const state = get()
        const fromUserId = state.currentUser?.id
        const messageText = String(text || '').trim()
        if (!fromUserId || !toUserId || !messageText) {
          return
        }
        const newMessage = {
          id: `msg-${Date.now()}`,
          fromUserId,
          toUserId,
          text: messageText,
          createdAt: new Date().toISOString(),
          status: 'sent',
          deliveredAt: null,
          seenAt: null,
        }
        set({
          chatMessages: [...state.chatMessages, newMessage],
          chatTypingMap: {
            ...state.chatTypingMap,
            [`${fromUserId}:${toUserId}`]: false,
          },
        })
        get().markConversationSeen(toUserId)
        setTimeout(() => {
          set((currentState) => ({
            chatMessages: currentState.chatMessages.map((message) =>
              message.id === newMessage.id && message.status === 'sent'
                ? {
                    ...message,
                    status: 'delivered',
                    deliveredAt: new Date().toISOString(),
                  }
                : message,
            ),
          }))
        }, 800)
        const senderUser =
          state.users.find((user) => user.id === fromUserId) ||
          (state.currentUser?.id === fromUserId ? state.currentUser : null)
        const recipientUser = state.users.find((user) => user.id === toUserId) || null
        const usersToSync = [senderUser, recipientUser].filter(Boolean)
        const stationSyncTasks = usersToSync
          .map((user) => {
            const stationId = String(user.stationId || '').trim()
            if (!stationId) {
              return null
            }
            const matchedStation = state.stations.find((station) => station.id === stationId)
            return upsertStation({
              id: stationId,
              name: matchedStation?.name || stationId,
              location: matchedStation?.location || '',
            })
          })
          .filter(Boolean)
        const userSyncTasks = usersToSync.map((user) => upsertUser(user))

        Promise.all([...stationSyncTasks, ...userSyncTasks])
          .catch(() => {
            // Continue and try to save chat message even if user sync failed.
          })
          .finally(() => {
            insertChatMessage(newMessage).catch(() => {
              set((currentState) => ({
                chatMessages: currentState.chatMessages.map((message) =>
                  message.id === newMessage.id
                    ? {
                        ...message,
                        status: 'failed',
                      }
                    : message,
                ),
              }))
            })
          })
      },
      applyRemoteChatMessage: (remoteMessage) => {
        if (!remoteMessage?.id) {
          return
        }
        set((state) => {
          if (state.chatMessages.some((message) => message.id === remoteMessage.id)) {
            return state
          }
          const currentUserId = state.currentUser?.id
          const isIncoming =
            remoteMessage.toUserId === currentUserId && remoteMessage.fromUserId !== currentUserId
          const viewingConversation =
            state.isChatOpen && state.activeChatUserId === remoteMessage.fromUserId && isIncoming
          const enriched = {
            ...remoteMessage,
            status: viewingConversation || remoteMessage.status === 'seen' ? 'seen' : isIncoming ? 'delivered' : 'sent',
            deliveredAt: isIncoming ? new Date().toISOString() : remoteMessage.deliveredAt || null,
            seenAt: viewingConversation || remoteMessage.status === 'seen' ? remoteMessage.seenAt || new Date().toISOString() : null,
          }
          return {
            chatMessages: [...state.chatMessages, enriched].sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            ),
          }
        })
        const latest = get()
        if (
          latest.isChatOpen &&
          latest.activeChatUserId === remoteMessage.fromUserId &&
          remoteMessage.toUserId === latest.currentUser?.id
        ) {
          get().markConversationSeen(remoteMessage.fromUserId)
        }
      },
      applyRemoteChatUpdate: (remoteMessage) => {
        if (!remoteMessage?.id) {
          return
        }
        set((state) => ({
          chatMessages: state.chatMessages.map((message) =>
            message.id === remoteMessage.id
              ? {
                  ...message,
                  ...remoteMessage,
                  status: remoteMessage.status === 'seen' || message.status === 'seen' ? 'seen' : remoteMessage.status || message.status,
                  seenAt: remoteMessage.seenAt || message.seenAt || null,
                }
              : message,
          ),
        }))
      },
      applyRemoteReport: (remoteReport) => {
        if (!remoteReport?.stationId || !remoteReport?.date) {
          return
        }
        set((state) => {
          const index = state.reports.findIndex(
            (report) => report.stationId === remoteReport.stationId && report.date === remoteReport.date,
          )
          if (index >= 0) {
            const reports = [...state.reports]
            reports[index] = { ...reports[index], ...remoteReport }
            return { reports }
          }
          return {
            reports: [...state.reports, remoteReport].sort((a, b) => {
              const byDate = a.date.localeCompare(b.date)
              if (byDate !== 0) {
                return byDate
              }
              return String(a.stationId).localeCompare(String(b.stationId))
            }),
          }
        })
      },
      applyRemoteUser: (remoteUser) => {
        if (!remoteUser?.id) {
          return
        }
        set((state) => ({
          users: mergeUsersById(state.users, [remoteUser]),
        }))
      },
      applyRemoteProductRequest: (remoteRequest) => {
        if (!remoteRequest?.id) {
          return
        }
        set((state) => {
          const index = state.productRequests.findIndex((request) => request.id === remoteRequest.id)
          if (index >= 0) {
            const productRequests = [...state.productRequests]
            productRequests[index] = { ...productRequests[index], ...remoteRequest }
            return { productRequests }
          }
          return {
            productRequests: [remoteRequest, ...state.productRequests],
          }
        })
      },
      refreshFromSupabase: async () => {
        const state = get()
        if (state.isHydrating) {
          return
        }
        set({ isHydrating: true })
        try {
          const remoteData = await loadInitialData()
          const latestState = get()
          if (remoteData) {
            const mergedChatMessages = mergeChatMessages(latestState.chatMessages, remoteData.chatMessages)

            set({
              stations: mergeStationCatalog(canonicalStations, remoteData.stations),
              users: asArray(remoteData.users),
              reports: asArray(remoteData.reports),
              productRequests: asArray(remoteData.productRequests),
              dailyFinalizations: asArray(remoteData.dailyFinalizations),
              monthEndFinalizations: asArray(remoteData.monthEndFinalizations),
              interventions: asArray(remoteData.interventions),
              chatMessages: mergedChatMessages,
              adminDailyReviews: asArray(remoteData.adminDailyReviews),
              adminReplenishmentWorkflows: asArray(remoteData.adminReplenishmentWorkflows),
              adminReportResolutions: asArray(remoteData.adminReportResolutions),
              inspectorVisits: asArray(remoteData.inspectorVisits),
              manualCostEntries: asArray(remoteData.manualCostEntries),
              posTerminals: asArray(remoteData.posTerminals),
              hydratedFromSupabase: true,
              isHydrating: false,
            })
            return
          }
          set({ hydratedFromSupabase: true, isHydrating: false })
        } catch {
          set({ hydratedFromSupabase: true, isHydrating: false })
        }
      },
      hydrateFromSupabase: async () => {
        const state = get()
        if (state.hydratedFromSupabase) {
          return
        }
        await get().refreshFromSupabase()
      },
      getFilteredStationMetrics: () => {
        const { stationId, status } = get().filters
        return get()
          .getStationMetrics()
          .filter((item) => (stationId === 'all' ? true : item.stationId === stationId))
          .filter((item) => (status === 'all' ? true : item.status === status))
      },
      getAlertCounts: () => {
        const metrics = get().getStationMetrics()
        return {
          critical: metrics.filter((item) => item.status === 'critical'),
          warning: metrics.filter((item) => item.status === 'warning'),
        }
      },
    }),
    {
      name: 'fuel-stock-app',
      version: STATION_CATALOG_PERSIST_VERSION,
      merge: (persistedState, currentState) =>
        ensurePersistedCollections({ ...currentState, ...persistedState }, currentState),
      migrate: (persisted, fromVersion) => {
        if (!persisted || typeof persisted !== 'object') {
          return persisted
        }
        if (fromVersion < STATION_CATALOG_PERSIST_VERSION) {
          return {
            ...persisted,
            stations: canonicalStations,
            users: [],
            reports: [],
            productRequests: [],
            dailyFinalizations: [],
            monthEndFinalizations: [],
            interventions: [],
            chatMessages: [],
            adminDailyReviews: [],
            adminReplenishmentWorkflows: [],
            adminReportResolutions: [],
            inspectorVisits: [],
            manualCostEntries: [],
            posTerminals: [],
          }
        }
        return persisted
      },
      partialize: (state) => ({
        role: state.role,
        currentUser: state.currentUser,
        reports: state.reports,
        theme: state.theme,
        interventions: state.interventions,
        productRequests: state.productRequests,
        rejectedReports: state.rejectedReports,
        dailyFinalizations: state.dailyFinalizations,
        monthEndFinalizations: state.monthEndFinalizations,
        adminDailyReviews: state.adminDailyReviews,
        adminReplenishmentWorkflows: state.adminReplenishmentWorkflows,
        adminReportResolutions: state.adminReportResolutions,
        inspectorVisits: state.inspectorVisits,
        manualCostEntries: state.manualCostEntries,
        posTerminals: state.posTerminals,
        chatMessages: state.chatMessages,
        appSettings: state.appSettings,
        pinnedChatUserIds: state.pinnedChatUserIds,
        isChatOpen: state.isChatOpen,
        activeChatUserId: state.activeChatUserId,
        stations: state.stations,
        users: state.users,
      }),
    },
  ),
)

export const useIsAdmin = () => useAppStore((state) => state.role === ROLES.ADMIN)




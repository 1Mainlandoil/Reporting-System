import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  dailyReports,
  mockUsers,
  stations as canonicalStations,
  STATION_CATALOG_PERSIST_VERSION,
} from '../data/mockData'
import { mergeStationCatalog } from '../utils/stationCatalog'
import { getOldestMissingReportDateUpTo } from '../utils/reportPending'
import { ROLE_ROUTE_MAP, ROLES } from '../constants/roles'
import { buildStationMetrics } from '../utils/stock'
import {
  deleteIntervention,
  insertChatMessage,
  insertReport,
  loadInitialData,
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
      theme: 'light',
      stations: canonicalStations,
      users: mockUsers,
      reports: dailyReports,
      filters: initialFilters,
      interventions: [],
      productRequests: [],
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
      logout: () => {
        if (hasSupabaseEnv && supabase) {
          supabase.auth.signOut().catch(() => {
            // Local logout still proceeds even if remote signout fails.
          })
        }
        set({ role: null, currentUser: null })
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

        const todayIso = new Date().toISOString().split('T')[0]
        const { reportDate: explicitReportDate, ...restPayload } = payload

        const staffOwnStation =
          state.role === ROLES.STAFF &&
          state.currentUser?.stationId &&
          stationId === state.currentUser.stationId

        let resolvedDate = todayIso
        if (
          explicitReportDate &&
          typeof explicitReportDate === 'string' &&
          staffOwnStation
        ) {
          const d = explicitReportDate.slice(0, 10)
          if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d <= todayIso) {
            resolvedDate = d
          }
        }

        const dup = state.reports.some((r) => r.stationId === stationId && r.date === resolvedDate)
        if (dup) {
          return { ok: false, error: 'duplicate_date' }
        }

        if (staffOwnStation && resolvedDate < todayIso) {
          const datesSet = new Set(
            state.reports.filter((r) => r.stationId === stationId && r.date).map((r) => r.date),
          )
          const allowedPast = getOldestMissingReportDateUpTo(todayIso, datesSet)
          if (!allowedPast || resolvedDate !== allowedPast) {
            return { ok: false, error: 'catch_up_order', allowedPast }
          }
        }

        const previousCashReport = [...state.reports]
          .filter((r) => r.stationId === stationId && r.date && r.date < resolvedDate)
          .sort((a, b) => b.date.localeCompare(a.date))[0]
        const carriedCashBf = Number(previousCashReport?.closingBalance || 0)
        const normalizedCashSales = Number(restPayload.cashSales || 0)
        const normalizedPosValue = Number(restPayload.posValue || 0)
        const normalizedBankLodgements = Number(restPayload.totalPaymentDeposits || 0)
        const derivedTotalAmount = carriedCashBf + normalizedCashSales
        const derivedClosingBalance = derivedTotalAmount - normalizedBankLodgements - normalizedPosValue

        const newReport = {
          id: `stn-${stationId}-${Date.now()}`,
          ...restPayload,
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
          return {
            ok: false,
            error: 'sync_failed',
            message: err instanceof Error ? err.message : String(err),
          }
        }
        set({
          reports: [...state.reports, newReport],
        })
        return { ok: true }
      },
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
          return buildStationMetrics(station, stationReports, state.appSettings.stockThresholds)
        })
      },
      getSupervisorPortfolio: () => {
        const state = get()
        return state.stations.map((station) => {
          const stationReports = state.reports.filter((report) => report.stationId === station.id)
          return buildStationMetrics(station, stationReports, state.appSettings.stockThresholds)
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
      createProductRequest: ({ requestedProductType, requestedLiters, remark }) => {
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
          id: `req-${Date.now()}`,
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
            if (request.id !== requestId || request.status !== 'pending_admin') {
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
      getStationRequestHistory: (stationId) =>
        get()
          .productRequests.filter((request) => request.stationId === stationId)
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
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
            const mergedChatMessages = (() => {
              const remoteMessages = Array.isArray(remoteData.chatMessages) ? remoteData.chatMessages : []
              const localMessages = Array.isArray(latestState.chatMessages) ? latestState.chatMessages : []
              const remoteById = new Map(remoteMessages.map((message) => [message.id, message]))
              const preservedLocal = localMessages.filter(
                (message) =>
                  !remoteById.has(message.id) &&
                  ['sent', 'delivered', 'failed'].includes(String(message.status || '')),
              )
              return [...remoteMessages, ...preservedLocal].sort(
                (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
              )
            })()

            set({
              stations: mergeStationCatalog(canonicalStations, remoteData.stations),
              users: mergeUsersById(latestState.users, remoteData.users),
              reports: mergeReportsByStationDate(latestState.reports, remoteData.reports),
              productRequests: remoteData.productRequests.length ? remoteData.productRequests : latestState.productRequests,
              dailyFinalizations: remoteData.dailyFinalizations.length
                ? remoteData.dailyFinalizations
                : latestState.dailyFinalizations,
              monthEndFinalizations: remoteData.monthEndFinalizations.length
                ? remoteData.monthEndFinalizations
                : latestState.monthEndFinalizations,
              interventions: remoteData.interventions.length ? remoteData.interventions : latestState.interventions,
              chatMessages: mergedChatMessages,
              adminDailyReviews: remoteData.adminDailyReviews.length
                ? remoteData.adminDailyReviews
                : latestState.adminDailyReviews,
              adminReplenishmentWorkflows: remoteData.adminReplenishmentWorkflows.length
                ? remoteData.adminReplenishmentWorkflows
                : latestState.adminReplenishmentWorkflows,
              adminReportResolutions: remoteData.adminReportResolutions.length
                ? remoteData.adminReportResolutions
                : latestState.adminReportResolutions,
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
      migrate: (persisted, fromVersion) => {
        if (!persisted || typeof persisted !== 'object') {
          return persisted
        }
        if (fromVersion < STATION_CATALOG_PERSIST_VERSION) {
          return { ...persisted, stations: canonicalStations }
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
        dailyFinalizations: state.dailyFinalizations,
        monthEndFinalizations: state.monthEndFinalizations,
        adminDailyReviews: state.adminDailyReviews,
        adminReplenishmentWorkflows: state.adminReplenishmentWorkflows,
        adminReportResolutions: state.adminReportResolutions,
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

import { hasSupabaseEnv, supabase } from '../lib/supabaseClient'
import { extractErrorMessage } from '../utils/userErrorMessages'

const mapStation = (row) => ({
  id: row.id,
  name: row.name,
  location: row.location,
})

export const mapUserRow = (row) => ({
  id: row.id,
  name: row.name,
  role: row.role,
  stationId: row.station_id,
  phoneNumber: row.phone_number || '',
  email: row.email || '',
  managerUsername: row.manager_username || '',
  managerPasswordHash: row.manager_password_hash || '',
})

const mapUser = mapUserRow

const isPosPaymentLine = (item) => {
  const channel = String(item?.channel || '').trim().toUpperCase()
  return channel === 'POS' || channel.startsWith('POS -') || String(item?.category || '').toUpperCase() === 'POS' || Boolean(item?.terminalId)
}

export const mapReportRow = (row) => {
  const receivedQuantity = Number(row.quantity_received ?? 0) || 0
  const receivedProductType = row.received_product_type || null
  const explicitReceivedPMS = Number(row.received_pms ?? 0) || 0
  const explicitReceivedAGO = Number(row.received_ago ?? 0) || 0
  const legacyReceivedPMS =
    !explicitReceivedPMS && !explicitReceivedAGO && (receivedProductType === 'PMS' || (row.received_product && !receivedProductType))
      ? receivedQuantity
      : 0
  const legacyReceivedAGO =
    !explicitReceivedPMS && !explicitReceivedAGO && receivedProductType === 'AGO'
      ? receivedQuantity
      : 0
  const receivedPMS = explicitReceivedPMS || legacyReceivedPMS
  const receivedAGO = explicitReceivedAGO || legacyReceivedAGO
  const resolvedReceivedType =
    receivedPMS > 0 && receivedAGO > 0
      ? 'BOTH'
      : receivedProductType || (receivedAGO > 0 ? 'AGO' : row.received_product ? 'PMS' : null)
  const rawPaymentBreakdown = Array.isArray(row.payment_breakdown) ? row.payment_breakdown : []
  const posRows = rawPaymentBreakdown.filter(isPosPaymentLine)
  const posValue = posRows.reduce((sum, item) => sum + (Number(item?.amount) || 0), 0)
  const posEodPhotoUrl = posRows.find((item) => item?.eodPhotoUrl)?.eodPhotoUrl || ''
  const posTerminalBreakdown = posRows.map((item) => ({
    terminalId: item.terminalId || '',
    bank: item.bank || '',
    label: item.label || item.channel || 'POS',
    channel: item.channel || 'POS',
    category: 'POS',
    unmapped: Boolean(item.unmapped),
    amount: Number(item.amount || 0),
    eodPhotoUrl: item.eodPhotoUrl || '',
    eodPhotoUrls: Array.isArray(item.eodPhotoUrls) ? item.eodPhotoUrls : item.eodPhotoUrl ? [item.eodPhotoUrl] : [],
  }))
  const paymentBreakdown = rawPaymentBreakdown
    .filter((item) => !isPosPaymentLine(item))
    .map((item) => {
      const eodPhotoUrls = [
        ...(Array.isArray(item.eodPhotoUrls) ? item.eodPhotoUrls : []),
        ...(item.eodPhotoUrl ? [item.eodPhotoUrl] : []),
      ].filter(Boolean)
      const uniqueUrls = [...new Set(eodPhotoUrls)]
      return {
        channel: item.channel,
        amount: Number(item.amount || 0),
        eodPhotoUrl: uniqueUrls[0] || '',
        eodPhotoUrls: uniqueUrls,
      }
    })
  const totalPaymentDeposits = paymentBreakdown.length
    ? paymentBreakdown.reduce((sum, item) => sum + (Number(item?.amount) || 0), 0)
    : Number(row.total_payment_deposits ?? 0) || 0

  return {
  id: row.id,
  stationId: row.station_id,
  date: row.date,
  reportType: row.report_type || 'fuel',
  lpgReport: row.lpg_report && typeof row.lpg_report === 'object' ? row.lpg_report : null,
  openingStockPMS: row.opening_stock_pms,
  openingStockAGO: row.opening_stock_ago,
  pmsPrice: row.pms_price,
  agoPrice: row.ago_price,
  multiPricing: Boolean(row.multi_pricing),
  priceBandsPMS: Array.isArray(row.price_bands_pms) ? row.price_bands_pms : [],
  priceBandsAGO: Array.isArray(row.price_bands_ago) ? row.price_bands_ago : [],
  salesAmountPMS: Number(row.sales_amount_pms ?? 0) || 0,
  salesAmountAGO: Number(row.sales_amount_ago ?? 0) || 0,
  totalSalesAmount: Number(row.total_sales_amount ?? 0) || 0,
  receivedProduct: row.received_product,
  receivedProductType: resolvedReceivedType,
  quantityReceived: receivedQuantity,
  noSalesDay: Boolean(row.no_sales_day),
  noSalesReason: row.no_sales_reason || '',
  noSalesNote: row.no_sales_note || '',
  totalSalesLitersPMS: row.total_sales_liters_pms,
  totalSalesLitersAGO: row.total_sales_liters_ago,
  managerEnteredSalesLitersPMS:
    row.manager_entered_sales_liters_pms != null ? Number(row.manager_entered_sales_liters_pms) : null,
  managerEnteredSalesLitersAGO:
    row.manager_entered_sales_liters_ago != null ? Number(row.manager_entered_sales_liters_ago) : null,
  calculatedSalesLitersPMS:
    row.calculated_sales_liters_pms != null ? Number(row.calculated_sales_liters_pms) : null,
  calculatedSalesLitersAGO:
    row.calculated_sales_liters_ago != null ? Number(row.calculated_sales_liters_ago) : null,
  closingStockPMS: row.closing_stock_pms,
  closingStockAGO: row.closing_stock_ago,
  quantityRemainingPMS: row.quantity_remaining_pms,
  quantityRemainingAGO: row.quantity_remaining_ago,
  rttPMS: row.rtt_pms,
  rttAGO: row.rtt_ago,
  remark: row.remark,
  expenseAmount: row.expense_amount,
  expenseDescription: row.expense_description,
  expenseItems: row.expense_items || [],
  paymentBreakdown,
  totalPaymentDeposits,
  posValue,
  posTerminalBreakdown,
  posEodPhotoUrl,
  pumpReadings: Array.isArray(row.pump_readings) ? row.pump_readings : [],
  productDispatchReceipts: Array.isArray(row.product_dispatch_receipts) ? row.product_dispatch_receipts : [],
  cashBf: Number(row.cash_bf ?? 0) || 0,
  cashSales: Number(row.cash_sales ?? 0) || 0,
  totalAmount: Number(row.total_amount ?? 0) || 0,
  closingBalance: Number(row.closing_balance ?? 0) || 0,
  openingPMS: row.opening_stock_pms,
  openingAGO: row.opening_stock_ago,
  receivedPMS,
  receivedAGO,
  salesPMS: row.total_sales_liters_pms,
  salesAGO: row.total_sales_liters_ago,
  remarks: row.remark,
  supervisorReview: row.supervisor_review_status
    ? {
        status: row.supervisor_review_status,
        remark: row.supervisor_review_remark || '',
        reviewedBy: row.supervisor_reviewed_by || 'Supervisor',
        reviewedAt: row.supervisor_reviewed_at || null,
      }
    : undefined,
  eodAttachments: Array.isArray(row.eod_attachments) ? row.eod_attachments : [],
  hasDiscrepancy: Boolean(row.has_discrepancy),
  discrepancies: Array.isArray(row.discrepancies) ? row.discrepancies : [],
  supervisorCorrectionHistory: Array.isArray(row.supervisor_correction_history) ? row.supervisor_correction_history : [],
  finalizationStatus: row.report_finalization_status || '',
  finalizedBy: row.report_finalized_by || '',
  finalizedByUserId: row.report_finalized_by_user_id || null,
  finalizedAt: row.report_finalized_at || null,
  finalizationRemark: row.report_finalization_remark || '',
  }
}

const mapReport = mapReportRow

export const mapChatMessageRow = (row) => ({
  id: row.id,
  fromUserId: row.from_user_id,
  toUserId: row.to_user_id,
  text: row.text,
  createdAt: row.created_at,
  status: row.status || 'delivered',
  seenAt: row.seen_at || null,
  deliveredAt: row.seen_at || row.created_at || null,
})

const mapChat = mapChatMessageRow

const mapAdminDailyReview = (row) => ({
  id: row.id,
  date: row.date,
  supervisorFinalizedBy: row.supervisor_finalized_by || '',
  generalRemark: row.general_remark || '',
  stationReviews: Array.isArray(row.station_reviews) ? row.station_reviews : [],
  savedBy: row.saved_by || 'Admin',
  savedByUserId: row.saved_by_user_id || null,
  savedAt: row.saved_at || row.created_at,
  createdAt: row.created_at,
})

export const mapProductRequest = (row) => {
  const receivedTankDip = row.received_tank_dip == null ? null : Number(row.received_tank_dip)
  const hasReceivedConfirmation = Boolean(row.received_at) || receivedTankDip != null
  const dispatchStatus = hasReceivedConfirmation
    ? 'received'
    : row.dispatch_status || (row.terminal_decision === 'approved' ? 'dispatched' : row.status === 'declined' ? 'declined' : 'requested')

  return {
    id: row.id,
    stationId: row.station_id,
    managerId: row.manager_id,
    managerName: row.manager_name,
    requestedProductType: row.requested_product_type,
    requestedLiters: Number(row.requested_liters || 0),
    managerRemark: row.manager_remark || '',
    status: row.status,
    managerStatusLabel: hasReceivedConfirmation ? 'Received' : row.manager_status_label || 'Requested',
    supervisorDecision: row.supervisor_decision,
    supervisorRemark: row.supervisor_remark || '',
    supervisorName: row.supervisor_name || '',
    supervisorReviewedAt: row.supervisor_reviewed_at || null,
    adminDecision: row.admin_decision,
    adminRemark: row.admin_remark || '',
    adminName: row.admin_name || '',
    adminReviewedAt: row.admin_reviewed_at || null,
    approvedProductType: row.approved_product_type || null,
    approvedLiters: row.approved_liters == null ? null : Number(row.approved_liters),
    costPricePerLiter: Number(row.cost_price_per_liter || 0),
    transportCostPerLiter: Number(row.transport_cost_per_liter || 0),
    landingCostPerLiter: Number(row.landing_cost_per_liter || 0),
    totalProductCost: Number(row.total_product_cost || 0),
    totalTransportCost: Number(row.total_transport_cost || 0),
    totalLandingCost: Number(row.total_landing_cost || 0),
    dispatchNote: row.dispatch_note || '',
    dispatchStatus,
    receivedTankDip,
    receivedAt: row.received_at || null,
    receivedBy: row.received_by || '',
    receivedRemark: row.received_remark || '',
    receivedReportId: row.received_report_id || '',
    receivedReportDate: row.received_report_date || null,
    issueReportedAt: row.issue_reported_at || null,
    issueReportedBy: row.issue_reported_by || '',
    issueRemark: row.issue_remark || '',
    calledBackAt: row.called_back_at || null,
    calledBackBy: row.called_back_by || '',
    callbackReason: row.callback_reason || '',
    terminalDecision: row.terminal_decision || null,
    terminalRemark: row.terminal_remark || '',
    terminalName: row.terminal_name || '',
    terminalReviewedAt: row.terminal_reviewed_at || null,
    truckNumber: row.truck_number || '',
    truckDriver: row.truck_driver || '',
    lowStockPhotoUrls: Array.isArray(row.low_stock_photo_urls) ? row.low_stock_photo_urls : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
  }
}

const mapDailyFinalization = (row) => ({
  date: row.date,
  generalRemark: row.general_remark || '',
  stationReviews: Array.isArray(row.station_reviews) ? row.station_reviews : [],
  finalizedBy: row.finalized_by || 'Supervisor',
  finalizedByUserId: row.finalized_by_user_id || null,
  finalizedAt: row.finalized_at,
  status: row.status || 'finalized',
  adminAcknowledgedBy: row.admin_acknowledged_by || null,
  adminAcknowledgedAt: row.admin_acknowledged_at || null,
})

const mapMonthEndFinalization = (row) => ({
  monthKey: row.month_key,
  monthLabel: row.month_label || row.month_key,
  stationSummaries: Array.isArray(row.station_summaries) ? row.station_summaries : [],
  finalizedBy: row.finalized_by || 'Supervisor',
  finalizedByUserId: row.finalized_by_user_id || null,
  finalizedAt: row.finalized_at,
  status: row.status || 'finalized',
  adminAcknowledgedBy: row.admin_acknowledged_by || null,
  adminAcknowledgedAt: row.admin_acknowledged_at || null,
})

const mapIntervention = (row) => ({
  id: row.id,
  stationId: row.station_id,
  stationName: row.station_name,
  status: row.status,
  stage: row.stage,
  message: row.message,
  createdBy: row.created_by || 'Supervisor',
  createdAt: row.created_at,
  updatedAt: row.updated_at || row.created_at,
})

const mapAdminReplenishmentWorkflow = (row) => ({
  stationId: row.station_id,
  managerName: row.manager_name || 'Unassigned',
  urgency: row.urgency || 'warning',
  stockRemaining: Number(row.stock_remaining || 0),
  suggestedQuantity: Number(row.suggested_quantity || 0),
  approvedQuantity: Number(row.approved_quantity || 0),
  status: row.status || 'Pending Approval',
  note: row.note || '',
  updatedBy: row.updated_by || 'Admin',
  updatedAt: row.updated_at || null,
})

const mapAdminReportResolution = (row) => ({
  reportId: row.report_id,
  stationId: row.station_id,
  stationName: row.station_name || row.station_id,
  reportDate: row.report_date,
  supervisorName: row.supervisor_name || 'Supervisor',
  reviewStatus: row.review_status || 'Reviewed',
  supervisorRemark: row.supervisor_remark || '',
  resolution: row.resolution || '',
  note: row.note || '',
  updatedBy: row.updated_by || 'Admin',
  updatedAt: row.updated_at || null,
})

const mapInspectorVisit = (row) => ({
  id: row.id,
  stationId: row.station_id,
  inspectorId: row.inspector_id,
  inspectorName: row.inspector_name || '',
  visitDate: row.visit_date,
  arrivalTime: row.arrival_time || '',
  departureTime: row.departure_time || '',
  managerInCharge: row.manager_in_charge || '',
  cashBf: Number(row.cash_bf ?? 0) || 0,
  cash: Number(row.cash ?? 0) || 0,
  posBf: Number(row.pos_bf ?? 0) || 0,
  pos: Number(row.pos ?? 0) || 0,
  tankReadings: Array.isArray(row.tank_readings) ? row.tank_readings : [],
  pumpReadings: Array.isArray(row.pump_readings) ? row.pump_readings : [],
  photoEvidence: Array.isArray(row.photo_evidence) ? row.photo_evidence : [],
  remark: row.remark || '',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const safeSelect = async (builder, mapper, fallback = []) => {
  try {
    const { data, error } = await builder
    if (error || !Array.isArray(data)) {
      return fallback
    }
    return data.map(mapper)
  } catch {
    return fallback
  }
}

const fetchAllReports = async () => {
  const PAGE = 1000
  let allRows = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('daily_reports')
      .select('*')
      .order('date', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (data && data.length > 0) allRows = allRows.concat(data)
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  return allRows
}

export const loadInitialData = async () => {
  if (!hasSupabaseEnv || !supabase) {
    return null
  }

  const [stationsRes, usersRes, reportsRes, chatRes, adminDailyReviewsRes, productRequests, dailyFinalizations, monthEndFinalizations, interventions, adminReplenishmentWorkflows, adminReportResolutions, inspectorVisits] = await Promise.all([
    supabase.from('stations').select('*').order('name', { ascending: true }),
    supabase.from('users').select('*').order('name', { ascending: true }),
    fetchAllReports(),
    supabase.from('chat_messages').select('*').order('created_at', { ascending: true }),
    supabase.from('admin_daily_reviews').select('*').order('date', { ascending: false }),
    safeSelect(supabase.from('product_requests').select('*').order('created_at', { ascending: false }), mapProductRequest, []),
    safeSelect(supabase.from('daily_finalizations').select('*').order('date', { ascending: false }), mapDailyFinalization, []),
    safeSelect(
      supabase.from('month_end_finalizations').select('*').order('month_key', { ascending: false }),
      mapMonthEndFinalization,
      [],
    ),
    safeSelect(supabase.from('interventions').select('*').order('updated_at', { ascending: false }), mapIntervention, []),
    safeSelect(
      supabase.from('admin_replenishment_workflows').select('*').order('updated_at', { ascending: false }),
      mapAdminReplenishmentWorkflow,
      [],
    ),
    safeSelect(
      supabase.from('admin_report_resolutions').select('*').order('updated_at', { ascending: false }),
      mapAdminReportResolution,
      [],
    ),
    safeSelect(
      supabase.from('inspector_visits').select('*').order('visit_date', { ascending: false }),
      mapInspectorVisit,
      [],
    ),
  ])

  if (stationsRes.error || usersRes.error || chatRes.error || adminDailyReviewsRes.error) {
    throw new Error(
      stationsRes.error?.message ||
        usersRes.error?.message ||
        chatRes.error?.message ||
        adminDailyReviewsRes.error?.message ||
        'Failed to load Supabase data',
    )
  }

  return {
    stations: stationsRes.data.map(mapStation),
    users: usersRes.data.map(mapUser),
    reports: reportsRes.map(mapReport),
    chatMessages: chatRes.data.map(mapChat),
    adminDailyReviews: adminDailyReviewsRes.data.map(mapAdminDailyReview),
    productRequests,
    dailyFinalizations,
    monthEndFinalizations,
    interventions,
    adminReplenishmentWorkflows,
    adminReportResolutions,
    inspectorVisits,
  }
}

export const insertReport = async (report) => {
  if (!hasSupabaseEnv || !supabase) {
    throw new Error('Supabase is not configured for report sync.')
  }

  const basePayload = {
    id: report.id,
    station_id: report.stationId,
    date: report.date,
    report_type: report.reportType || 'fuel',
    lpg_report: report.lpgReport || null,
    opening_stock_pms: report.openingStockPMS,
    opening_stock_ago: report.openingStockAGO,
    pms_price: report.pmsPrice,
    ago_price: report.agoPrice,
    received_product: Boolean(report.receivedProduct),
    received_product_type: report.receivedProduct
      ? report.receivedProductType === 'AGO' || report.receivedProductType === 'PMS'
        ? report.receivedProductType
        : Number(report.receivedAGO || 0) > 0 && Number(report.receivedPMS || 0) <= 0
          ? 'AGO'
          : Number(report.receivedPMS || 0) > 0 && Number(report.receivedAGO || 0) <= 0
            ? 'PMS'
            : null
      : null,
    quantity_received: Number(report.quantityReceived ?? 0),
    total_sales_liters_pms: report.totalSalesLitersPMS,
    total_sales_liters_ago: report.totalSalesLitersAGO,
    calculated_sales_liters_pms: Number(report.calculatedSalesLitersPMS ?? 0),
    calculated_sales_liters_ago: Number(report.calculatedSalesLitersAGO ?? 0),
    closing_stock_pms: report.closingStockPMS,
    closing_stock_ago: report.closingStockAGO,
    quantity_remaining_pms: report.quantityRemainingPMS,
    quantity_remaining_ago: report.quantityRemainingAGO,
    rtt_pms: report.rttPMS,
    rtt_ago: report.rttAGO,
    remark: report.remark || report.remarks || '',
    expense_amount: report.expenseAmount || 0,
    expense_description: report.expenseDescription || '',
    expense_items: report.expenseItems || [],
  }

  const payload = {
    // Persist POS in payment_breakdown for backward-compatible schema.
    // Supervisor/manager views split POS out as its own value.
    ...basePayload,
    multi_pricing: Boolean(report.multiPricing),
    price_bands_pms: Array.isArray(report.priceBandsPMS) ? report.priceBandsPMS : [],
    price_bands_ago: Array.isArray(report.priceBandsAGO) ? report.priceBandsAGO : [],
    sales_amount_pms: Number(report.salesAmountPMS || 0),
    sales_amount_ago: Number(report.salesAmountAGO || 0),
    total_sales_amount: Number(report.totalSalesAmount || 0),
    received_pms: Number(report.receivedPMS || 0),
    received_ago: Number(report.receivedAGO || 0),
    no_sales_day: Boolean(report.noSalesDay),
    no_sales_reason: report.noSalesReason || '',
    no_sales_note: report.noSalesNote || '',
    payment_breakdown: [
      ...(report.paymentBreakdown || []),
      ...(Array.isArray(report.posTerminalBreakdown) && report.posTerminalBreakdown.length
        ? report.posTerminalBreakdown.map((item) => ({
            channel: item.channel || `POS - ${item.bank || 'Terminal'} - ${item.terminalId || ''}`.trim(),
            amount: Number(item.amount || 0),
            category: 'POS',
            terminalId: item.terminalId || '',
            bank: item.bank || '',
            label: item.label || '',
            unmapped: Boolean(item.unmapped),
          }))
        : Number(report.posValue || 0) > 0
          ? [
              {
                channel: 'POS',
                amount: Number(report.posValue || 0),
                category: 'POS',
                ...(report.posEodPhotoUrl ? { eodPhotoUrl: report.posEodPhotoUrl } : {}),
              },
            ]
          : []),
    ],
    total_payment_deposits: Number(report.totalPaymentDeposits || 0),
    pump_readings: report.pumpReadings || [],
    product_dispatch_receipts: Array.isArray(report.productDispatchReceipts) ? report.productDispatchReceipts : [],
    cash_bf: Number(report.cashBf || 0),
    cash_sales: Number(report.cashSales || 0),
    total_amount: Number(report.totalAmount || 0),
    closing_balance: Number(report.closingBalance || 0),
    eod_attachments: Array.isArray(report.eodAttachments) ? report.eodAttachments : [],
    has_discrepancy: Boolean(report.hasDiscrepancy),
    discrepancies: Array.isArray(report.discrepancies) ? report.discrepancies : [],
    manager_entered_sales_liters_pms:
      report.managerEnteredSalesLitersPMS == null ? null : Number(report.managerEnteredSalesLitersPMS),
    manager_entered_sales_liters_ago:
      report.managerEnteredSalesLitersAGO == null ? null : Number(report.managerEnteredSalesLitersAGO),
    supervisor_correction_history: Array.isArray(report.supervisorCorrectionHistory) ? report.supervisorCorrectionHistory : [],
    report_finalization_status: report.finalizationStatus || '',
    report_finalized_by: report.finalizedBy || '',
    report_finalized_by_user_id: report.finalizedByUserId || null,
    report_finalized_at: report.finalizedAt || null,
    report_finalization_remark: report.finalizationRemark || '',
  }

  const upsertReport = async (rowPayload) => {
    const { error } = await supabase.from('daily_reports').upsert(rowPayload)
    if (error) {
      throw error
    }
  }

  const isMissingColumnError = (error) => {
    const msg = String(error?.message || '').toLowerCase()
    return (
      msg.includes('column') &&
      (
        msg.includes('does not exist') ||
        msg.includes('not found') ||
        msg.includes('could not find') ||
        msg.includes('schema cache')
      )
    )
  }

  try {
    await upsertReport(payload)
  } catch (error) {
    if (isMissingColumnError(error)) {
      throw new Error(
        `Report was not saved because the database schema is missing a required report field: ${error.message}. Apply the latest Supabase schema before submitting reports.`,
      )
    }
    throw error
  }

  return true
}

export const insertChatMessage = async (message) => {
  if (!hasSupabaseEnv || !supabase) {
    return null
  }

  const payload = {
    id: message.id,
    from_user_id: message.fromUserId,
    to_user_id: message.toUserId,
    text: message.text,
    created_at: message.createdAt,
    status: 'delivered',
  }

  const { error } = await supabase.from('chat_messages').insert(payload)
  if (error) {
    throw new Error(error.message)
  }

  return true
}

export const markChatMessagesSeenInSupabase = async ({ readerUserId, senderUserId }) => {
  if (!hasSupabaseEnv || !supabase || !readerUserId || !senderUserId) {
    return null
  }

  const seenAt = new Date().toISOString()
  const { error } = await supabase
    .from('chat_messages')
    .update({ status: 'seen', seen_at: seenAt })
    .eq('from_user_id', senderUserId)
    .eq('to_user_id', readerUserId)
    .neq('status', 'seen')

  if (error) {
    throw new Error(error.message)
  }

  return true
}

export const upsertAdminDailyReview = async (review) => {
  if (!hasSupabaseEnv || !supabase) {
    return null
  }

  const payload = {
    date: review.date,
    supervisor_finalized_by: review.supervisorFinalizedBy || '',
    general_remark: review.generalRemark || '',
    station_reviews: review.stationReviews || [],
    saved_by: review.savedBy || 'Admin',
    saved_by_user_id: review.savedByUserId || null,
    saved_at: review.savedAt || new Date().toISOString(),
  }

  const { error } = await supabase.from('admin_daily_reviews').upsert(payload, { onConflict: 'date' })
  if (error) {
    throw new Error(error.message)
  }

  return true
}

export const upsertUser = async (user) => {
  if (!hasSupabaseEnv || !supabase) {
    return null
  }
  const payload = {
    id: user.id,
    name: user.name,
    role: user.role,
    station_id: user.stationId || null,
    phone_number: user.phoneNumber || null,
    email: user.email || null,
    manager_username: user.managerUsername || null,
    manager_password_hash: user.managerPasswordHash || null,
  }
  const { error } = await supabase.from('users').upsert(payload)
  if (error) {
    throw new Error(error.message)
  }
  return true
}

export const upsertStation = async (station) => {
  if (!hasSupabaseEnv || !supabase) {
    return null
  }
  const payload = {
    id: station.id,
    name: station.name,
    location: station.location || '',
  }
  const { error } = await supabase.from('stations').upsert(payload)
  if (error) {
    throw new Error(error.message)
  }
  return true
}

export const upsertProductRequest = async (request) => {
  if (!hasSupabaseEnv || !supabase) {
    return null
  }
  const payload = {
    id: request.id,
    station_id: request.stationId,
    manager_id: request.managerId,
    manager_name: request.managerName,
    requested_product_type: request.requestedProductType,
    requested_liters: request.requestedLiters,
    manager_remark: request.managerRemark || '',
    status: request.status,
    manager_status_label: request.managerStatusLabel || 'Requested',
    supervisor_decision: request.supervisorDecision || null,
    supervisor_remark: request.supervisorRemark || '',
    supervisor_name: request.supervisorName || '',
    supervisor_reviewed_at: request.supervisorReviewedAt || null,
    admin_decision: request.adminDecision || null,
    admin_remark: request.adminRemark || '',
    admin_name: request.adminName || '',
    admin_reviewed_at: request.adminReviewedAt || null,
    approved_product_type: request.approvedProductType || null,
    approved_liters: request.approvedLiters,
    cost_price_per_liter: request.costPricePerLiter || 0,
    transport_cost_per_liter: request.transportCostPerLiter || 0,
    landing_cost_per_liter: request.landingCostPerLiter || 0,
    total_product_cost: request.totalProductCost || 0,
    total_transport_cost: request.totalTransportCost || 0,
    total_landing_cost: request.totalLandingCost || 0,
    dispatch_note: request.dispatchNote || '',
    dispatch_status: request.dispatchStatus || (request.terminalDecision === 'approved' ? 'dispatched' : request.status === 'declined' ? 'declined' : 'requested'),
    received_tank_dip: request.receivedTankDip ?? null,
    received_at: request.receivedAt || null,
    received_by: request.receivedBy || '',
    received_remark: request.receivedRemark || '',
    received_report_id: request.receivedReportId || '',
    received_report_date: request.receivedReportDate || null,
    issue_reported_at: request.issueReportedAt || null,
    issue_reported_by: request.issueReportedBy || '',
    issue_remark: request.issueRemark || '',
    called_back_at: request.calledBackAt || null,
    called_back_by: request.calledBackBy || '',
    callback_reason: request.callbackReason || '',
    terminal_decision: request.terminalDecision || null,
    terminal_remark: request.terminalRemark || '',
    terminal_name: request.terminalName || '',
    terminal_reviewed_at: request.terminalReviewedAt || null,
    truck_number: request.truckNumber || '',
    truck_driver: request.truckDriver || '',
    low_stock_photo_urls: Array.isArray(request.lowStockPhotoUrls) ? request.lowStockPhotoUrls : [],
    created_at: request.createdAt,
    updated_at: request.updatedAt || request.createdAt || new Date().toISOString(),
  }
  const { error } = await supabase.from('product_requests').upsert(payload)
  if (error) {
    throw new Error(error.message)
  }
  return true
}

export const deleteProductRequest = async (requestId) => {
  if (!hasSupabaseEnv || !supabase) {
    return null
  }
  const { error } = await supabase.from('product_requests').delete().eq('id', requestId)
  if (error) {
    throw new Error(error.message)
  }
  return true
}

export const upsertDailyFinalization = async (finalization) => {
  if (!hasSupabaseEnv || !supabase) {
    return null
  }
  const payload = {
    date: finalization.date,
    general_remark: finalization.generalRemark || '',
    station_reviews: finalization.stationReviews || [],
    finalized_by: finalization.finalizedBy || 'Supervisor',
    finalized_by_user_id: finalization.finalizedByUserId || null,
    finalized_at: finalization.finalizedAt || new Date().toISOString(),
    status: finalization.status || 'finalized',
    admin_acknowledged_by: finalization.adminAcknowledgedBy || null,
    admin_acknowledged_at: finalization.adminAcknowledgedAt || null,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('daily_finalizations').upsert(payload, { onConflict: 'date' })
  if (error) {
    throw new Error(error.message)
  }
  return true
}

export const upsertMonthEndFinalization = async (finalization) => {
  if (!hasSupabaseEnv || !supabase) {
    return null
  }
  const payload = {
    month_key: finalization.monthKey,
    month_label: finalization.monthLabel || finalization.monthKey,
    station_summaries: finalization.stationSummaries || [],
    finalized_by: finalization.finalizedBy || 'Supervisor',
    finalized_by_user_id: finalization.finalizedByUserId || null,
    finalized_at: finalization.finalizedAt || new Date().toISOString(),
    status: finalization.status || 'finalized',
    admin_acknowledged_by: finalization.adminAcknowledgedBy || null,
    admin_acknowledged_at: finalization.adminAcknowledgedAt || null,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('month_end_finalizations').upsert(payload, { onConflict: 'month_key' })
  if (error) {
    throw new Error(error.message)
  }
  return true
}

export const upsertIntervention = async (intervention) => {
  if (!hasSupabaseEnv || !supabase) {
    return null
  }
  const payload = {
    id: intervention.id,
    station_id: intervention.stationId,
    station_name: intervention.stationName,
    status: intervention.status,
    stage: intervention.stage,
    message: intervention.message,
    created_by: intervention.createdBy || 'Supervisor',
    created_at: intervention.createdAt || new Date().toISOString(),
    updated_at: intervention.updatedAt || new Date().toISOString(),
  }
  const { error } = await supabase.from('interventions').upsert(payload)
  if (error) {
    throw new Error(error.message)
  }
  return true
}

export const deleteIntervention = async (id) => {
  if (!hasSupabaseEnv || !supabase) {
    return null
  }
  const { error } = await supabase.from('interventions').delete().eq('id', id)
  if (error) {
    throw new Error(error.message)
  }
  return true
}

export const upsertAdminReplenishmentWorkflow = async (workflow) => {
  if (!hasSupabaseEnv || !supabase) {
    return null
  }
  const payload = {
    station_id: workflow.stationId,
    manager_name: workflow.managerName || 'Unassigned',
    urgency: workflow.urgency || 'warning',
    stock_remaining: workflow.stockRemaining || 0,
    suggested_quantity: workflow.suggestedQuantity || 0,
    approved_quantity: workflow.approvedQuantity || 0,
    status: workflow.status || 'Pending Approval',
    note: workflow.note || '',
    updated_by: workflow.updatedBy || 'Admin',
    updated_at: workflow.updatedAt || new Date().toISOString(),
  }
  const { error } = await supabase.from('admin_replenishment_workflows').upsert(payload, { onConflict: 'station_id' })
  if (error) {
    throw new Error(error.message)
  }
  return true
}

export const upsertAdminReportResolution = async (resolution) => {
  if (!hasSupabaseEnv || !supabase) {
    return null
  }
  const payload = {
    report_id: resolution.reportId,
    station_id: resolution.stationId,
    station_name: resolution.stationName || resolution.stationId,
    report_date: resolution.reportDate,
    supervisor_name: resolution.supervisorName || 'Supervisor',
    review_status: resolution.reviewStatus || 'Reviewed',
    supervisor_remark: resolution.supervisorRemark || '',
    resolution: resolution.resolution || '',
    note: resolution.note || '',
    updated_by: resolution.updatedBy || 'Admin',
    updated_at: resolution.updatedAt || new Date().toISOString(),
  }
  const { error } = await supabase.from('admin_report_resolutions').upsert(payload, { onConflict: 'report_id' })
  if (error) {
    throw new Error(error.message)
  }
  return true
}

export const countDailyReports = async ({ stationId } = {}) => {
  if (!hasSupabaseEnv || !supabase) {
    return 0
  }
  let query = supabase.from('daily_reports').select('*', { count: 'exact', head: true })
  if (stationId) {
    query = query.eq('station_id', stationId)
  }
  const { count, error } = await query
  if (error) {
    throw new Error(error.message)
  }
  return count ?? 0
}

export const deleteAllDailyReports = async () => {
  if (!hasSupabaseEnv || !supabase) {
    return null
  }
  const { error } = await supabase.from('daily_reports').delete().gte('date', '1900-01-01')
  if (error) {
    throw new Error(error.message)
  }
  return true
}

export const deleteDailyReportsByStation = async (stationId) => {
  if (!hasSupabaseEnv || !supabase) {
    return null
  }
  if (!stationId) {
    throw new Error('station_id_required')
  }
  const { error } = await supabase.from('daily_reports').delete().eq('station_id', stationId)
  if (error) {
    throw new Error(error.message)
  }
  return true
}

export const listDailyReportDatesByStation = async (stationId) => {
  if (!hasSupabaseEnv || !supabase) {
    return []
  }
  if (!stationId) {
    throw new Error('station_id_required')
  }
  const { data, error } = await supabase
    .from('daily_reports')
    .select('id, date')
    .eq('station_id', stationId)
    .order('date', { ascending: false })
  if (error) {
    throw new Error(error.message)
  }
  return (data || []).map((row) => ({
    id: row.id,
    date: row.date,
  }))
}

export const insertInspectorVisit = async (visit) => {
  if (!hasSupabaseEnv || !supabase) {
    throw new Error('Supabase is not configured for inspector visit sync.')
  }

  const payload = {
    id: visit.id,
    station_id: visit.stationId,
    inspector_id: visit.inspectorId,
    inspector_name: visit.inspectorName || '',
    visit_date: visit.visitDate,
    arrival_time: visit.arrivalTime || '',
    departure_time: visit.departureTime || '',
    manager_in_charge: visit.managerInCharge || '',
    cash_bf: Number(visit.cashBf ?? 0),
    cash: Number(visit.cash ?? 0),
    pos_bf: Number(visit.posBf ?? 0),
    pos: Number(visit.pos ?? 0),
    tank_readings: Array.isArray(visit.tankReadings) ? visit.tankReadings : [],
    pump_readings: Array.isArray(visit.pumpReadings) ? visit.pumpReadings : [],
    photo_evidence: Array.isArray(visit.photoEvidence) ? visit.photoEvidence : [],
    remark: visit.remark || '',
    updated_at: visit.updatedAt || new Date().toISOString(),
  }

  const { error } = await supabase.from('inspector_visits').upsert(payload, { onConflict: 'id' })
  if (error) {
    throw new Error(error.message)
  }
  return true
}

export const deleteReportById = async (reportId) => {
  if (!hasSupabaseEnv || !supabase) {
    return null
  }
  if (!reportId) {
    throw new Error('report_id_required')
  }
  const { error } = await supabase.from('daily_reports').delete().eq('id', reportId)
  if (error) {
    throw new Error(error.message)
  }
  return true
}

export const deleteDailyReportByStationAndDate = async (stationId, date) => {
  if (!hasSupabaseEnv || !supabase) {
    return null
  }
  if (!stationId || !date) {
    throw new Error('station_and_date_required')
  }
  const { error } = await supabase
    .from('daily_reports')
    .delete()
    .eq('station_id', stationId)
    .eq('date', date)
  if (error) {
    throw new Error(error.message)
  }
  return true
}

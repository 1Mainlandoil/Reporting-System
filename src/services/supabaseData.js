import { hasSupabaseEnv, supabase } from '../lib/supabaseClient'

const mapStation = (row) => ({
  id: row.id,
  name: row.name,
  location: row.location,
})

const mapUser = (row) => ({
  id: row.id,
  name: row.name,
  role: row.role,
  stationId: row.station_id,
  phoneNumber: row.phone_number || '',
  email: row.email || '',
  managerUsername: row.manager_username || '',
  managerPasswordHash: row.manager_password_hash || '',
})

const mapReport = (row) => {
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
  const posValue = rawPaymentBreakdown
    .filter((item) => String(item?.channel || '').trim().toUpperCase() === 'POS')
    .reduce((sum, item) => sum + (Number(item?.amount) || 0), 0)
  const paymentBreakdown = rawPaymentBreakdown.filter(
    (item) => String(item?.channel || '').trim().toUpperCase() !== 'POS',
  )
  const totalPaymentDeposits = paymentBreakdown.length
    ? paymentBreakdown.reduce((sum, item) => sum + (Number(item?.amount) || 0), 0)
    : Number(row.total_payment_deposits ?? 0) || 0

  return {
  id: row.id,
  stationId: row.station_id,
  date: row.date,
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
  quantityReceived: receivedQuantity || receivedPMS + receivedAGO,
  noSalesDay: Boolean(row.no_sales_day),
  noSalesReason: row.no_sales_reason || '',
  noSalesNote: row.no_sales_note || '',
  totalSalesLitersPMS: row.total_sales_liters_pms,
  totalSalesLitersAGO: row.total_sales_liters_ago,
  closingStockPMS: row.closing_stock_pms,
  closingStockAGO: row.closing_stock_ago,
  rttPMS: row.rtt_pms,
  rttAGO: row.rtt_ago,
  remark: row.remark,
  expenseAmount: row.expense_amount,
  expenseDescription: row.expense_description,
  expenseItems: row.expense_items || [],
  paymentBreakdown,
  totalPaymentDeposits,
  posValue,
  pumpReadings: Array.isArray(row.pump_readings) ? row.pump_readings : [],
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
  }
}

const mapChat = (row) => ({
  id: row.id,
  fromUserId: row.from_user_id,
  toUserId: row.to_user_id,
  text: row.text,
  createdAt: row.created_at,
})

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

const mapProductRequest = (row) => ({
  id: row.id,
  stationId: row.station_id,
  managerId: row.manager_id,
  managerName: row.manager_name,
  requestedProductType: row.requested_product_type,
  requestedLiters: Number(row.requested_liters || 0),
  managerRemark: row.manager_remark || '',
  status: row.status,
  managerStatusLabel: row.manager_status_label || 'Requested',
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
  dispatchNote: row.dispatch_note || '',
  createdAt: row.created_at,
  updatedAt: row.updated_at || row.created_at,
})

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

export const loadInitialData = async () => {
  if (!hasSupabaseEnv || !supabase) {
    return null
  }

  const [stationsRes, usersRes, reportsRes, chatRes, adminDailyReviewsRes, productRequests, dailyFinalizations, monthEndFinalizations, interventions, adminReplenishmentWorkflows, adminReportResolutions] = await Promise.all([
    supabase.from('stations').select('*').order('name', { ascending: true }),
    supabase.from('users').select('*').order('name', { ascending: true }),
    supabase.from('daily_reports').select('*').order('date', { ascending: true }),
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
  ])

  if (stationsRes.error || usersRes.error || reportsRes.error || chatRes.error || adminDailyReviewsRes.error) {
    throw new Error(
      stationsRes.error?.message ||
        usersRes.error?.message ||
        reportsRes.error?.message ||
        chatRes.error?.message ||
        adminDailyReviewsRes.error?.message ||
        'Failed to load Supabase data',
    )
  }

  return {
    stations: stationsRes.data.map(mapStation),
    users: usersRes.data.map(mapUser),
    reports: reportsRes.data.map(mapReport),
    chatMessages: chatRes.data.map(mapChat),
    adminDailyReviews: adminDailyReviewsRes.data.map(mapAdminDailyReview),
    productRequests,
    dailyFinalizations,
    monthEndFinalizations,
    interventions,
    adminReplenishmentWorkflows,
    adminReportResolutions,
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
    quantity_received: Number(report.quantityReceived ?? Number(report.receivedPMS || 0) + Number(report.receivedAGO || 0)),
    total_sales_liters_pms: report.totalSalesLitersPMS,
    total_sales_liters_ago: report.totalSalesLitersAGO,
    closing_stock_pms: report.closingStockPMS,
    closing_stock_ago: report.closingStockAGO,
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
      ...(Number(report.posValue || 0) > 0 ? [{ channel: 'POS', amount: Number(report.posValue || 0) }] : []),
    ],
    total_payment_deposits: Number(report.totalPaymentDeposits || 0),
    pump_readings: report.pumpReadings || [],
    cash_bf: Number(report.cashBf || 0),
    cash_sales: Number(report.cashSales || 0),
    total_amount: Number(report.totalAmount || 0),
    closing_balance: Number(report.closingBalance || 0),
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
      // Backward compatibility: allow submission even if DB schema is behind new optional fields.
      await upsertReport(basePayload)
    } else {
      const message = String(error?.message || 'Failed to save report')
      const details = String(error?.details || '')
      const hint = details.toLowerCase().includes('station_id') || message.toLowerCase().includes('station_id')
        ? ' Ensure this station exists in Supabase stations table and report insert policy allows this user.'
        : ''
      throw new Error(`${message}${hint}`.trim())
    }
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
  }

  const { error } = await supabase.from('chat_messages').insert(payload)
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
    dispatch_note: request.dispatchNote || '',
    created_at: request.createdAt,
    updated_at: request.updatedAt || request.createdAt || new Date().toISOString(),
  }
  const { error } = await supabase.from('product_requests').upsert(payload)
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

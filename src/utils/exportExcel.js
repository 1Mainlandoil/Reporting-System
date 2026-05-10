import * as XLSX from 'xlsx'
import { getClosingForProduct } from './reportFields'

/** Rows that identify a retail station — prepended when exports omit these headers (hidden columns). */
const STATION_IDENTIFIERS_ROW = [
  { header: 'station', pick: (r) => r.stationName },
  { header: 'station_id', pick: (r) => r.stationId },
]

/**
 * @param {Array<{ header: string, pick: Function }>} specs
 * @param {'stationRow' | 'adminStationReview'} mode
 */
export const prependIdentifiersForExport = (specs, mode = 'stationRow') => {
  if (!Array.isArray(specs) || specs.length === 0) return specs
  const headers = new Set(specs.map((s) => s.header))
  const prefix = []
  if (mode === 'stationRow') {
    if (!headers.has('station')) prefix.push(STATION_IDENTIFIERS_ROW[0])
    if (!headers.has('station_id')) prefix.push(STATION_IDENTIFIERS_ROW[1])
  } else if (mode === 'adminStationReview') {
    if (!headers.has('station_id')) {
      prefix.push({ header: 'station_id', pick: (item) => item.stationId })
    }
    const hasStationName =
      headers.has('station_name') || headers.has('station') || headers.has('Station')
    if (!hasStationName) {
      prefix.push({ header: 'station_name', pick: (item) => item.stationName })
    }
  }
  return [...prefix, ...specs]
}

const rowsFromSpecs = (rows, specs) =>
  rows.map((row) => {
    const obj = {}
    specs.forEach(({ header, pick }) => {
      const v = pick(row)
      obj[header] = v === undefined || v === null ? '' : v
    })
    return obj
  })

const writeSheet = (workbook, sheetName, rows, specs) => {
  const safeName = sheetName.slice(0, 31)
  const data = rowsFromSpecs(rows, specs)
  const worksheet = XLSX.utils.json_to_sheet(data.length ? data : [{}])
  XLSX.utils.book_append_sheet(workbook, worksheet, safeName)
}

export const exportStationsToExcel = (rows, specs) => {
  const defaultSpecs = [
    { header: 'station', pick: (r) => r.stationName },
    { header: 'station_id', pick: (r) => r.stationId },
    { header: 'stock_remaining', pick: (r) => Math.round(r.stockRemaining) },
    { header: 'days_remaining', pick: (r) => Number(r.daysRemaining.toFixed(2)) },
    { header: 'status', pick: (r) => r.status },
  ]
  const useSpecs = specs == null ? defaultSpecs : prependIdentifiersForExport(specs, 'stationRow')
  const workbook = XLSX.utils.book_new()
  writeSheet(workbook, 'Stock Monitoring', rows, useSpecs)
  XLSX.writeFile(workbook, 'station-stock-monitoring.xlsx')
}

export const exportSupervisorDailyOpeningsToExcel = (rows, specs) => {
  const defaultSpecs = [
    { header: 'station', pick: (r) => r.stationName },
    { header: 'station_id', pick: (r) => r.stationId },
    { header: 'manager', pick: (r) => r.managerName },
    { header: 'report_status', pick: (r) => r.reportStatus },
    { header: 'opening_stock_pms', pick: (r) => r.openingStockPMS },
    { header: 'opening_stock_ago', pick: (r) => r.openingStockAGO },
    {
      header: 'closing_stock_pms',
      pick: (r) =>
        r.closingStockPMSRaw != null && r.closingStockPMSRaw !== '' ? r.closingStockPMSRaw : '',
    },
    {
      header: 'closing_stock_ago',
      pick: (r) =>
        r.closingStockAGORaw != null && r.closingStockAGORaw !== '' ? r.closingStockAGORaw : '',
    },
    { header: 'pms_price', pick: (r) => r.pmsPrice },
    { header: 'ago_price', pick: (r) => r.agoPrice },
    { header: 'multi_pricing', pick: (r) => (r.multiPricing ? 'yes' : 'no') },
    { header: 'price_bands_pms', pick: (r) => JSON.stringify(r.priceBandsPMS || []) },
    { header: 'price_bands_ago', pick: (r) => JSON.stringify(r.priceBandsAGO || []) },
    { header: 'sales_amount_pms_ngn', pick: (r) => Number(r.salesAmountPMS || 0) },
    { header: 'sales_amount_ago_ngn', pick: (r) => Number(r.salesAmountAGO || 0) },
    { header: 'total_sales_amount_ngn', pick: (r) => Number(r.totalSalesAmount || 0) },
    { header: 'received_product_type', pick: (r) => r.receivedProduct },
    { header: 'input_quantity_received_litres', pick: (r) => r.quantityReceived },
    { header: 'total_sales_in_liters_pms', pick: (r) => r.totalSalesLitersPMS },
    { header: 'total_sales_in_liters_ago', pick: (r) => r.totalSalesLitersAGO },
    { header: 'rtt_pms', pick: (r) => r.rttPMS },
    { header: 'rtt_ago', pick: (r) => r.rttAGO },
    { header: 'remark', pick: (r) => r.managerRemark },
    { header: 'submitted_date', pick: (r) => r.reportDate },
  ]
  const useSpecs = specs == null ? defaultSpecs : prependIdentifiersForExport(specs, 'stationRow')
  const workbook = XLSX.utils.book_new()
  writeSheet(workbook, 'Daily Openings', rows, useSpecs)
  XLSX.writeFile(workbook, 'supervisor-daily-openings.xlsx')
}

export const exportReconciliationToExcel = (rows, productType, specs) => {
  const defaultSpecs = [
    { header: 'station', pick: (r) => r.stationName },
    { header: 'station_id', pick: (r) => r.stationId },
    { header: 'product', pick: () => productType.toUpperCase() },
    { header: 'running_constant_litres', pick: (r) => Math.round(r.currentConstant) },
    { header: 'opening_stock_litres', pick: (r) => Math.round(r.latestOpening) },
    { header: 'received_litres', pick: (r) => Math.round(r.latestReceived) },
    { header: 'sales_litres', pick: (r) => Math.round(r.latestSales) },
    { header: 'variance_litres', pick: (r) => Math.round(r.variance) },
    { header: 'status', pick: (r) => r.status },
    { header: 'report_date', pick: (r) => r.reportDate },
  ]
  const useSpecs = specs == null ? defaultSpecs : prependIdentifiersForExport(specs, 'stationRow')
  const workbook = XLSX.utils.book_new()
  writeSheet(workbook, `${productType.toUpperCase()} Recon`, rows, useSpecs)
  XLSX.writeFile(workbook, `${productType}-reconciliation-dashboard.xlsx`)
}

export const exportSupervisorExpenseQueueToExcel = (rows, specs) => {
  const defaultSpecs = [
    { header: 'station', pick: (r) => r.stationName },
    { header: 'station_id', pick: (r) => r.stationId },
    { header: 'manager', pick: (r) => r.managerName },
    { header: 'expense_status', pick: (r) => r.expenseStatus },
    { header: 'total_expense_ngn', pick: (r) => Math.round(r.totalExpense) },
    { header: 'expense_lines', pick: (r) => r.expenseLines },
    { header: 'top_expense_category', pick: (r) => r.topCategory },
    { header: 'submitted_date', pick: (r) => r.reportDate },
  ]
  const useSpecs = specs == null ? defaultSpecs : prependIdentifiersForExport(specs, 'stationRow')
  const workbook = XLSX.utils.book_new()
  writeSheet(workbook, 'Expense Queue', rows, useSpecs)
  XLSX.writeFile(workbook, 'supervisor-expense-queue.xlsx')
}

export const exportSupervisorCashFlowToExcel = (rows, specs) => {
  const defaultSpecs = [
    { header: 'station', pick: (r) => r.stationName },
    { header: 'station_id', pick: (r) => r.stationId },
    { header: 'manager', pick: (r) => r.managerName },
    { header: 'submission', pick: (r) => r.reportStatus },
    { header: 'cash_bf_ngn', pick: (r) => Math.round(Number(r.cashBf || 0)) },
    { header: 'cash_sales_ngn', pick: (r) => Math.round(Number(r.cashSales || 0)) },
    { header: 'total_amount_ngn', pick: (r) => Math.round(Number(r.totalAmount || 0)) },
    { header: 'bank_lodgements_ngn', pick: (r) => Math.round(Number(r.totalPaymentDeposits || 0)) },
    { header: 'pos_ngn', pick: (r) => Math.round(Number(r.posValue || 0)) },
    { header: 'closing_balance_ngn', pick: (r) => Math.round(Number(r.closingBalance || 0)) },
    { header: 'variance_ngn', pick: (r) => Math.round(Number(r.cashMovementVariance || 0)) },
    { header: 'report_date', pick: (r) => r.reportDate },
  ]
  const useSpecs = specs == null ? defaultSpecs : prependIdentifiersForExport(specs, 'stationRow')
  const workbook = XLSX.utils.book_new()
  writeSheet(workbook, 'Cash Flow', rows, useSpecs)
  XLSX.writeFile(workbook, 'supervisor-cash-flow.xlsx')
}

export const exportSupervisorMonthEndSummaryToExcel = (rows, specs) => {
  const defaultSpecs = [
    { header: 'station', pick: (r) => r.stationName },
    { header: 'station_id', pick: (r) => r.stationId },
    { header: 'manager', pick: (r) => r.managerName },
    { header: 'month', pick: (r) => r.month },
    { header: 'submitted_days', pick: (r) => r.submittedDays },
    { header: 'expected_days', pick: (r) => r.expectedDays },
    { header: 'compliance_percent', pick: (r) => r.compliancePct },
    { header: 'sales_pms_liters', pick: (r) => Math.round(Number(r.salesPms || 0)) },
    { header: 'sales_ago_liters', pick: (r) => Math.round(Number(r.salesAgo || 0)) },
    { header: 'expense_ngn', pick: (r) => Math.round(Number(r.expenseTotal || 0)) },
    { header: 'bank_lodgements_ngn', pick: (r) => Math.round(Number(r.bankLodgements || 0)) },
    { header: 'pos_ngn', pick: (r) => Math.round(Number(r.posTotal || 0)) },
    { header: 'variance_ngn', pick: (r) => Math.round(Number(r.varianceTotal || 0)) },
    { header: 'month_end_closing_ngn', pick: (r) => Math.round(Number(r.monthEndClosingBalance || 0)) },
  ]
  const useSpecs = specs == null ? defaultSpecs : prependIdentifiersForExport(specs, 'stationRow')
  const workbook = XLSX.utils.book_new()
  writeSheet(workbook, 'Month End Summary', rows, useSpecs)
  XLSX.writeFile(workbook, 'supervisor-month-end-summary.xlsx')
}

export const exportStationHistoryToExcel = (stationName, rows, specs) => {
  const useSpecs =
    specs ??
    [
      { header: 'date', pick: (r) => r.date },
      { header: 'opening_pms_litres', pick: (r) => Number(r.openingStockPMS ?? r.openingPMS ?? 0) },
      { header: 'opening_ago_litres', pick: (r) => Number(r.openingStockAGO ?? r.openingAGO ?? 0) },
      { header: 'closing_pms_litres', pick: (r) => Math.round(getClosingForProduct(r, 'pms')) },
      { header: 'closing_ago_litres', pick: (r) => Math.round(getClosingForProduct(r, 'ago')) },
      {
        header: 'received_product_type',
        pick: (r) =>
          r.noSalesDay
            ? 'No Sales Day'
            : r.receivedProduct
            ? Number(r.receivedPMS ?? 0) > 0 && Number(r.receivedAGO ?? 0) > 0
              ? 'PMS + AGO'
              : r.receivedProductType || (Number(r.receivedAGO ?? 0) > 0 ? 'AGO' : 'PMS')
            : 'No',
      },
      { header: 'received_quantity_litres', pick: (r) => Number(r.receivedPMS ?? 0) + Number(r.receivedAGO ?? 0) },
      { header: 'multi_pricing', pick: (r) => (r.multiPricing ? 'yes' : 'no') },
      { header: 'price_bands_pms', pick: (r) => JSON.stringify(r.priceBandsPMS || []) },
      { header: 'price_bands_ago', pick: (r) => JSON.stringify(r.priceBandsAGO || []) },
      { header: 'sales_amount_pms_ngn', pick: (r) => Number(r.salesAmountPMS || 0) },
      { header: 'sales_amount_ago_ngn', pick: (r) => Number(r.salesAmountAGO || 0) },
      { header: 'total_sales_amount_ngn', pick: (r) => Number(r.totalSalesAmount || 0) },
      { header: 'sales_pms_litres', pick: (r) => Number(r.totalSalesLitersPMS ?? r.salesPMS ?? 0) },
      { header: 'sales_ago_litres', pick: (r) => Number(r.totalSalesLitersAGO ?? r.salesAGO ?? 0) },
      { header: 'total_expense_ngn', pick: (r) => Number(r.expenseAmount ?? 0) },
      { header: 'expense_description', pick: (r) => r.expenseDescription || '' },
      { header: 'station_remark', pick: (r) => r.remark || r.remarks || '' },
      { header: 'supervisor_review_status', pick: (r) => r.supervisorReview?.status || '' },
      { header: 'supervisor_note', pick: (r) => r.supervisorReview?.remark || '' },
      { header: 'reviewed_by', pick: (r) => r.supervisorReview?.reviewedBy || '' },
    ]
  const workbook = XLSX.utils.book_new()
  writeSheet(workbook, 'Station History', rows, useSpecs)
  const fileSafeStationName = stationName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  XLSX.writeFile(workbook, `${fileSafeStationName}-report-history.xlsx`)
}

const DEFAULT_ADMIN_STATION_SPECS = [
  { header: 'station_id', pick: (item) => item.stationId },
  { header: 'station_name', pick: (item) => item.stationName },
  { header: 'report_status', pick: (item) => item.reportStatus || '' },
  { header: 'supervisor_station_remark', pick: (item) => item.stationRemark || '' },
  { header: 'admin_station_remark', pick: (item) => item.adminRemark || '' },
]

export const exportAdminDailyReviewToExcel = ({
  date,
  supervisorFinalizedBy,
  generalRemark,
  stationReviews,
  savedBy,
  stationSpecs,
}) => {
  const summaryRows = [
    {
      date,
      supervisor_finalized_by: supervisorFinalizedBy || '',
      admin_saved_by: savedBy || 'Admin',
      general_remark: generalRemark || '',
      station_reviews_count: Array.isArray(stationReviews) ? stationReviews.length : 0,
    },
  ]

  const specs =
    stationSpecs == null
      ? DEFAULT_ADMIN_STATION_SPECS
      : prependIdentifiersForExport(stationSpecs, 'adminStationReview')
  const stationRows = rowsFromSpecs(stationReviews || [], specs)

  const workbook = XLSX.utils.book_new()
  const summarySheet = XLSX.utils.json_to_sheet(summaryRows)
  const stationSheet = XLSX.utils.json_to_sheet(stationRows.length ? stationRows : [{}])
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary')
  XLSX.utils.book_append_sheet(workbook, stationSheet, 'Station Remarks')
  XLSX.writeFile(workbook, `admin-daily-review-${date}.xlsx`)
}

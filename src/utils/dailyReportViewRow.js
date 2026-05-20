import { getClosingForProduct } from './reportFields'

const resolveReceivedProductType = (report) => {
  if (report?.noSalesDay) {
    return 'No Sales Day'
  }
  if (!report?.receivedProduct) {
    return null
  }
  const receivedPMS = Number(report.receivedPMS ?? 0)
  const receivedAGO = Number(report.receivedAGO ?? 0)
  if (receivedPMS > 0 && receivedAGO > 0) {
    return 'PMS + AGO'
  }

  if (report.receivedProductType === 'AGO' || report.receivedProductType === 'PMS') {
    return report.receivedProductType
  }

  if (Number(report.receivedAGO ?? 0) > 0) {
    return 'AGO'
  }

  return 'PMS'
}

const getPumpReadingValue = (item) => {
  if (!item || typeof item !== 'object') return null
  if (item.closing != null && item.closing !== '') return Number(item.closing)
  if (item.end != null && item.end !== '') return Number(item.end)
  if (item.start != null && item.start !== '') return Number(item.start)
  return null
}

const buildPumpRowsWithCarry = (previousReadings = [], todayReadings = []) => {
  const prevMap = new Map()
  for (const item of previousReadings) {
    const label = String(item?.label || '').trim()
    const reading = getPumpReadingValue(item)
    if (!label || reading == null || Number.isNaN(reading)) continue
    prevMap.set(label, reading)
  }
  const todayMap = new Map()
  for (const item of todayReadings) {
    const label = String(item?.label || '').trim()
    const reading = getPumpReadingValue(item)
    if (!label || reading == null || Number.isNaN(reading)) continue
    todayMap.set(label, reading)
  }

  const labels = new Set([...prevMap.keys(), ...todayMap.keys()])
  return [...labels]
    .sort((a, b) => a.localeCompare(b))
    .map((label) => {
      const opening = prevMap.has(label) ? prevMap.get(label) : null
      const closing = todayMap.has(label) ? todayMap.get(label) : opening
      const used = todayMap.has(label)
      return {
        label,
        opening,
        closing,
        used,
        delta: used && opening != null && closing != null ? closing - opening : 0,
        noBaseline: opening == null && !used,
      }
    })
}

/** Build the row shape used by the full daily report modal. */
export const buildDailyReportViewRow = ({
  stationId,
  stationName,
  managerName,
  latestToday,
  previousReport,
}) => {
  if (!latestToday) {
    return null
  }

  const receivedProductType = resolveReceivedProductType(latestToday)
  const paymentBreakdown = Array.isArray(latestToday.paymentBreakdown) ? latestToday.paymentBreakdown : []
  const totalPaymentDeposits = paymentBreakdown.length
    ? paymentBreakdown.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
    : Number(latestToday.totalPaymentDeposits || 0)
  const posValue = Number(latestToday.posValue || 0)
  const cashBf = Number(previousReport?.closingBalance || 0)
  const cashSales = Number(latestToday.cashSales || 0)
  const totalAmount = cashBf + cashSales
  const closingBalance = totalAmount - totalPaymentDeposits - posValue
  const cashMovementVariance = totalAmount - totalPaymentDeposits - posValue - closingBalance
  const pumpReadings = Array.isArray(latestToday.pumpReadings) ? latestToday.pumpReadings : []
  const priorPumpReadings = Array.isArray(previousReport?.pumpReadings) ? previousReport.pumpReadings : []
  const pumpMeterRows = buildPumpRowsWithCarry(priorPumpReadings, pumpReadings)

  return {
    stationId,
    stationName,
    managerName,
    reportStatus: latestToday.noSalesDay ? 'No Sales Declared' : 'Submitted',
    openingStockPMS: latestToday.openingStockPMS ?? latestToday.openingPMS ?? 0,
    openingStockAGO: latestToday.openingStockAGO ?? latestToday.openingAGO ?? 0,
    pmsPrice: latestToday.pmsPrice ?? '-',
    agoPrice: latestToday.agoPrice ?? '-',
    multiPricing: Boolean(latestToday.multiPricing),
    priceBandsPMS: Array.isArray(latestToday.priceBandsPMS) ? latestToday.priceBandsPMS : [],
    priceBandsAGO: Array.isArray(latestToday.priceBandsAGO) ? latestToday.priceBandsAGO : [],
    receivedProduct: latestToday.receivedProduct
      ? `Yes (${receivedProductType || 'Not specified'})`
      : 'No',
    receivedPMS: Math.round(Number(latestToday.receivedPMS ?? 0)).toLocaleString(),
    receivedAGO: Math.round(Number(latestToday.receivedAGO ?? 0)).toLocaleString(),
    closingStockPMS: Math.round(getClosingForProduct(latestToday, 'pms')).toLocaleString(),
    closingStockAGO: Math.round(getClosingForProduct(latestToday, 'ago')).toLocaleString(),
    totalSalesLitersPMS: Math.round(
      latestToday.totalSalesLitersPMS ?? latestToday.salesPMS ?? 0,
    ).toLocaleString(),
    totalSalesLitersAGO: Math.round(
      latestToday.totalSalesLitersAGO ?? latestToday.salesAGO ?? 0,
    ).toLocaleString(),
    rttPMS: latestToday.rttPMS ?? '-',
    rttAGO: latestToday.rttAGO ?? '-',
    managerRemark: latestToday.remark ?? latestToday.remarks ?? '-',
    reportDate: latestToday.date,
    expenseAmount: Number(latestToday.expenseAmount || 0),
    expenseDescription: latestToday.expenseDescription || '-',
    expenseItems: Array.isArray(latestToday.expenseItems) ? latestToday.expenseItems : [],
    paymentBreakdown,
    totalPaymentDeposits,
    posValue,
    cashBf,
    cashSales,
    totalAmount,
    closingBalance,
    cashMovementVariance,
    pumpReadings,
    pumpMeterRows,
    pumpReadingsCount: pumpMeterRows.length,
  }
}

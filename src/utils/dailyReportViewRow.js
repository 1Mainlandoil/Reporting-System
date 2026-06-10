import { getClosingForProduct, getPumpReadingClosing, getPumpReadingOpening, getQuantityRemainingForProduct, buildLastPumpClosingMap } from './reportFields'
import { computePumpProductSales } from './pumpSales'

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

/** Build pump meter rows; opening uses stored reading or last closing across all prior reports. */
export const buildPumpRowsWithCarry = (allPriorReports = [], todayReadings = []) => {
  const prevMap = buildLastPumpClosingMap(allPriorReports)
  const todayMap = new Map()
  const todayOpeningMap = new Map()
  for (const item of todayReadings) {
    const label = String(item?.label || '').trim()
    const reading = getPumpReadingClosing(item)
    const opening = getPumpReadingOpening(item)
    if (!label || reading == null || Number.isNaN(reading)) continue
    todayMap.set(label, reading)
    if (opening != null && !Number.isNaN(opening)) {
      todayOpeningMap.set(label, opening)
    }
  }

  const labels = new Set([...prevMap.keys(), ...todayMap.keys()])
  return [...labels]
    .sort((a, b) => a.localeCompare(b))
    .map((label) => {
      const opening = todayOpeningMap.has(label)
        ? todayOpeningMap.get(label)
        : prevMap.has(label)
          ? prevMap.get(label)
          : null
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
  allPriorReports,
}) => {
  if (!latestToday) {
    return null
  }

  const priorReports = allPriorReports ?? (previousReport ? [previousReport] : [])
  const receivedProductType = resolveReceivedProductType(latestToday)
  const paymentBreakdown = Array.isArray(latestToday.paymentBreakdown) ? latestToday.paymentBreakdown : []
  const totalPaymentDeposits = paymentBreakdown.length
    ? paymentBreakdown.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
    : Number(latestToday.totalPaymentDeposits || 0)
  const posValue = Number(latestToday.posValue || 0)
  const cashBf = Number(latestToday.cashBf ?? previousReport?.closingBalance ?? 0)
  const cashSales = Number(latestToday.cashSales || 0)
  const totalAmount = Number(latestToday.totalAmount ?? cashBf + cashSales)
  const closingBalance = Number(latestToday.closingBalance ?? totalAmount - totalPaymentDeposits - posValue)
  const cashMovementVariance = totalAmount - totalPaymentDeposits - posValue - closingBalance
  const pumpReadings = Array.isArray(latestToday.pumpReadings) ? latestToday.pumpReadings : []
  const pumpMeterRows = buildPumpRowsWithCarry(priorReports, pumpReadings)
  const calculatedPumpSales = computePumpProductSales(
    pumpReadings,
    latestToday.rttPMS,
    latestToday.rttAGO,
  )
  const managerSalesPMS = Number(
    latestToday.managerEnteredSalesLitersPMS ??
    latestToday.totalSalesLitersPMS ??
    latestToday.salesPMS ??
    0,
  )
  const managerSalesAGO = Number(
    latestToday.managerEnteredSalesLitersAGO ??
    latestToday.totalSalesLitersAGO ??
    latestToday.salesAGO ??
    0,
  )
  const calculatedSalesPMS =
    latestToday.calculatedSalesLitersPMS != null
      ? Number(latestToday.calculatedSalesLitersPMS)
      : calculatedPumpSales.pms
  const calculatedSalesAGO =
    latestToday.calculatedSalesLitersAGO != null
      ? Number(latestToday.calculatedSalesLitersAGO)
      : calculatedPumpSales.ago
  const quantityRemainingPMS = getQuantityRemainingForProduct(latestToday, 'pms')
  const quantityRemainingAGO = getQuantityRemainingForProduct(latestToday, 'ago')
  const tankDipPMS = getClosingForProduct(latestToday, 'pms')
  const tankDipAGO = getClosingForProduct(latestToday, 'ago')

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
    closingStockPMS: Math.round(tankDipPMS).toLocaleString(),
    closingStockAGO: Math.round(tankDipAGO).toLocaleString(),
    quantityRemainingPMS: Math.round(quantityRemainingPMS).toLocaleString(),
    quantityRemainingAGO: Math.round(quantityRemainingAGO).toLocaleString(),
    tankDipPMSRaw: tankDipPMS,
    tankDipAGORaw: tankDipAGO,
    quantityRemainingPMSRaw: quantityRemainingPMS,
    quantityRemainingAGORaw: quantityRemainingAGO,
    totalSalesLitersPMS: Math.round(managerSalesPMS).toLocaleString(),
    totalSalesLitersAGO: Math.round(managerSalesAGO).toLocaleString(),
    managerEnteredSalesLitersPMS: managerSalesPMS,
    managerEnteredSalesLitersAGO: managerSalesAGO,
    calculatedSalesLitersPMS: calculatedSalesPMS,
    calculatedSalesLitersAGO: calculatedSalesAGO,
    calculatedSalesLitersTotal: calculatedSalesPMS + calculatedSalesAGO,
    managerEnteredSalesLitersTotal: managerSalesPMS + managerSalesAGO,
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
  posEodPhotoUrl: latestToday.posEodPhotoUrl || '',
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

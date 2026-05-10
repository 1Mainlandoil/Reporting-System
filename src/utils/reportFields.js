export const getOpeningForProduct = (report, productType) => {
  if (productType === 'ago') {
    return Number(report.openingStockAGO ?? report.openingAGO ?? 0) || 0
  }
  return Number(report.openingStockPMS ?? report.openingPMS ?? 0) || 0
}

/** End-of-day dip reading when stored; for legacy rows derived from opening + receipts − sales − RTT. */
export const getClosingForProduct = (report, productType) => {
  const stored =
    productType === 'ago'
      ? report.closingStockAGO ?? report.closingAGO
      : report.closingStockPMS ?? report.closingPMS
  if (stored !== undefined && stored !== null && stored !== '') {
    const n = Number(stored)
    if (!Number.isNaN(n)) {
      return n
    }
  }
  const opening = getOpeningForProduct(report, productType)
  const received = getReceivedForProduct(report, productType)
  const sales = getSalesForProduct(report, productType)
  const rtt =
    productType === 'ago' ? Number(report.rttAGO ?? 0) || 0 : Number(report.rttPMS ?? 0) || 0
  return opening + received - sales - rtt
}

/** Total sales (L) = opening + received − closing − RTT (per product). */
export const computeSalesFromMovement = ({ opening, received, closing, rtt }) =>
  Number(opening || 0) + Number(received || 0) - Number(closing || 0) - Number(rtt || 0)

export const getReceivedForProduct = (report, productType) => {
  const receivedPMS = Number(report.receivedPMS ?? 0) || 0
  const receivedAGO = Number(report.receivedAGO ?? 0) || 0
  const resolvedType = report.receivedProductType || (receivedAGO > 0 ? 'AGO' : 'PMS')

  if (productType === 'ago') {
    if (receivedAGO > 0 || receivedPMS > 0) {
      return receivedAGO
    }
    if (resolvedType === 'AGO') {
      return Number(report.quantityReceived ?? receivedAGO ?? 0) || 0
    }
    return receivedAGO
  }
  if (receivedAGO > 0 || receivedPMS > 0) {
    return receivedPMS
  }
  if (resolvedType === 'PMS') {
    return Number(report.quantityReceived ?? receivedPMS ?? 0) || 0
  }
  return receivedPMS
}

export const getSalesForProduct = (report, productType) => {
  if (productType === 'ago') {
    return Number(report.totalSalesLitersAGO ?? report.salesAGO ?? 0) || 0
  }
  return Number(report.totalSalesLitersPMS ?? report.salesPMS ?? 0) || 0
}

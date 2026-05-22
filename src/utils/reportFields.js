export const getOpeningForProduct = (report, productType) => {
  if (productType === 'ago') {
    return Number(report.openingStockAGO ?? report.openingAGO ?? 0) || 0
  }
  return Number(report.openingStockPMS ?? report.openingPMS ?? 0) || 0
}

/** End-of-day dip reading when stored; for legacy rows derived from opening + receipts − sales. */
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
  return opening + received - sales
}

/** Total sales (L) = opening + received − closing (per product). RTT is stored separately and not used here. */
export const computeSalesFromMovement = ({ opening, received, closing }) =>
  Number(opening || 0) + Number(received || 0) - Number(closing || 0)

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

/** Book stock remaining after the report day (stored, or derived for legacy rows). */
export const getQuantityRemainingForProduct = (report, productType) => {
  const stored =
    productType === 'ago' ? report.quantityRemainingAGO : report.quantityRemainingPMS
  if (stored !== undefined && stored !== null && stored !== '') {
    const n = Number(stored)
    if (!Number.isNaN(n)) {
      return n
    }
  }
  const opening = getOpeningForProduct(report, productType)
  const received = getReceivedForProduct(report, productType)
  const sales = getSalesForProduct(report, productType)
  return opening + received - sales
}

export const computeQuantityRemaining = ({ previousRemaining, received, salesLiters }) =>
  Number(previousRemaining || 0) + Number(received || 0) - Number(salesLiters || 0)

export const getPumpReadingClosing = (item) => {
  if (!item || typeof item !== 'object') {
    return null
  }
  if (item.closing != null && item.closing !== '') {
    return Number(item.closing)
  }
  if (item.end != null && item.end !== '') {
    return Number(item.end)
  }
  return null
}

export const getPumpReadingOpening = (item) => {
  if (!item || typeof item !== 'object') {
    return null
  }
  if (item.opening != null && item.opening !== '') {
    return Number(item.opening)
  }
  if (item.start != null && item.start !== '') {
    return Number(item.start)
  }
  return null
}

/** Last recorded closing per pump label across prior reports (any gap in use). */
export const buildLastPumpClosingMap = (reports = []) => {
  const map = new Map()
  const sorted = [...reports].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
  for (const report of sorted) {
    const readings = Array.isArray(report.pumpReadings) ? report.pumpReadings : []
    for (const item of readings) {
      const label = String(item?.label || '').trim()
      const closing = getPumpReadingClosing(item)
      if (!label || closing == null || Number.isNaN(closing)) {
        continue
      }
      map.set(label, closing)
    }
  }
  return map
}

export const priorPumpReadingsFromMap = (closingMap) =>
  [...closingMap.entries()].map(([label, closing]) => ({ label, closing }))

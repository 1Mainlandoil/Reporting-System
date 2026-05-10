import { STATION_STATUS } from '../constants/status'
import { getOpeningForProduct, getReceivedForProduct, getSalesForProduct } from './reportFields'

export const getLitreStatus = (litres) => {
  if (litres <= 500) {
    return STATION_STATUS.CRITICAL
  }
  if (litres <= 999) {
    return STATION_STATUS.WARNING
  }
  return STATION_STATUS.SAFE
}

export const buildReconciliationRow = (station, reports, productType) => {
  const sortedReports = [...reports].sort((a, b) => a.date.localeCompare(b.date))
  const firstReport = sortedReports.at(0)

  if (!firstReport) {
    return {
      stationId: station.id,
      stationName: station.name,
      currentConstant: 0,
      latestOpening: 0,
      latestReceived: 0,
      latestSales: 0,
      variance: 0,
      reportDate: 'No report',
      status: STATION_STATUS.CRITICAL,
    }
  }

  let runningConstant = getOpeningForProduct(firstReport, productType)
  let previousClosing = runningConstant

  for (const report of sortedReports) {
    const opening = getOpeningForProduct(report, productType)
    const received = getReceivedForProduct(report, productType)
    const sales = getSalesForProduct(report, productType)
    previousClosing = runningConstant
    const openingToUse = opening || runningConstant
    runningConstant = openingToUse + received - sales
  }

  const latest = sortedReports.at(-1)
  const latestOpening = getOpeningForProduct(latest, productType)
  const latestReceived = getReceivedForProduct(latest, productType)
  const latestSales = getSalesForProduct(latest, productType)
  const variance = latestOpening - previousClosing

  return {
    stationId: station.id,
    stationName: station.name,
    currentConstant: runningConstant,
    latestOpening,
    latestReceived,
    latestSales,
    variance,
    reportDate: latest.date,
    status: getLitreStatus(runningConstant),
  }
}

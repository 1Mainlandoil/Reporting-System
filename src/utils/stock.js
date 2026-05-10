import { STATION_STATUS } from '../constants/status'
import { getOpeningForProduct, getReceivedForProduct, getSalesForProduct } from './reportFields'

export const getStockRemaining = (opening, received, sales) => opening + received - sales

export const getDailyAverageSales = (entries, days = 5) => {
  const latest = [...entries].slice(-days)
  if (!latest.length) {
    return 0
  }
  const totalSales = latest.reduce(
    (sum, entry) => sum + getSalesForProduct(entry, 'pms') + getSalesForProduct(entry, 'ago'),
    0,
  )
  return totalSales / latest.length
}

export const getDaysRemaining = (stockRemaining, dailyAverageSales) => {
  if (!dailyAverageSales) {
    return 0
  }
  return stockRemaining / dailyAverageSales
}

export const getStatus = (stockRemaining, thresholds = {}) => {
  const criticalMax = Number(thresholds.criticalMax ?? 500)
  const warningMax = Number(thresholds.warningMax ?? 999)

  if (stockRemaining <= criticalMax) {
    return STATION_STATUS.CRITICAL
  }
  if (stockRemaining <= warningMax) {
    return STATION_STATUS.WARNING
  }
  return STATION_STATUS.SAFE
}

export const buildStationMetrics = (station, reports, thresholds = {}) => {
  const sortedReports = [...reports].sort((a, b) => a.date.localeCompare(b.date))
  const latest = sortedReports.at(-1)
  if (!latest) {
    return {
      stationId: station.id,
      stationName: station.name,
      stockRemaining: 0,
      dailyAverageSales: 0,
      daysRemaining: 0,
      status: STATION_STATUS.CRITICAL,
    }
  }

  const latestPMS = getStockRemaining(
    getOpeningForProduct(latest, 'pms'),
    getReceivedForProduct(latest, 'pms'),
    getSalesForProduct(latest, 'pms'),
  )
  const latestAGO = getStockRemaining(
    getOpeningForProduct(latest, 'ago'),
    getReceivedForProduct(latest, 'ago'),
    getSalesForProduct(latest, 'ago'),
  )
  const stockRemaining = latestPMS + latestAGO
  const dailyAverageSales = getDailyAverageSales(sortedReports, 5)
  const daysRemaining = getDaysRemaining(stockRemaining, dailyAverageSales)
  const status = getStatus(stockRemaining, thresholds)

  return {
    stationId: station.id,
    stationName: station.name,
    stockRemaining,
    dailyAverageSales,
    daysRemaining,
    status,
  }
}

/** @typedef {{ price: number, liters: number }} PriceBand */

export const normalizePriceBands = (bands) =>
  (Array.isArray(bands) ? bands : [])
    .map((band) => ({
      price: Number(band?.price ?? 0),
      liters: Number(band?.liters ?? 0),
    }))
    .filter((band) => band.price > 0 && band.liters > 0)

export const sumBandLiters = (bands) =>
  normalizePriceBands(bands).reduce((sum, band) => sum + band.liters, 0)

export const computeSalesAmountFromBands = (bands) =>
  normalizePriceBands(bands).reduce((sum, band) => sum + band.price * band.liters, 0)

export const weightedAveragePrice = (bands, totalLiters) => {
  const liters = Number(totalLiters || 0)
  if (liters <= 0) {
    return 0
  }
  return computeSalesAmountFromBands(bands) / liters
}

const LITERS_TOLERANCE = 0.05

export const validatePriceBandsForProduct = ({
  bands,
  totalSalesLiters,
  productLabel,
  multiPriceEnabled,
}) => {
  const totalLiters = Number(totalSalesLiters || 0)
  const normalized = normalizePriceBands(bands)

  if (totalLiters <= 0) {
    return { ok: true, normalized: [] }
  }

  if (multiPriceEnabled) {
    if (normalized.length < 2) {
      return {
        ok: false,
        message: `Add at least two ${productLabel} price lines when selling at more than one price.`,
      }
    }
    const bandLiters = sumBandLiters(normalized)
    if (Math.abs(bandLiters - totalLiters) > LITERS_TOLERANCE) {
      return {
        ok: false,
        message: `${productLabel} price lines total ${bandLiters.toLocaleString()} L but computed sales are ${totalLiters.toLocaleString()} L. Adjust liters to match.`,
      }
    }
    return { ok: true, normalized }
  }

  return { ok: true, normalized: [] }
}

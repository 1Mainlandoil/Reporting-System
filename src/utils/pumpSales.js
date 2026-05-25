export const SALES_QUANTITY_TOLERANCE_LITERS = 2

export const inferPumpProductType = (reading) => {
  const explicit = String(reading?.productType || reading?.product_type || '')
    .trim()
    .toUpperCase()
  if (explicit === 'AGO' || explicit === 'PMS') {
    return explicit
  }
  const label = String(reading?.label || '')
    .trim()
    .toUpperCase()
  if (label.includes('AGO') || label.includes('DIESEL')) {
    return 'AGO'
  }
  return 'PMS'
}

/** Sum (closing − opening) per product across pump lines, then subtract RTT. */
export const computePumpProductSales = (readings = [], rttPMS = 0, rttAGO = 0) => {
  let pmsDelta = 0
  let agoDelta = 0

  for (const item of readings) {
    const openingRaw = item?.opening ?? item?.start
    const closingRaw = item?.closing ?? item?.end
    if (openingRaw == null || openingRaw === '' || closingRaw == null || closingRaw === '') {
      continue
    }
    const opening = Number(openingRaw)
    const closing = Number(closingRaw)
    if (Number.isNaN(opening) || Number.isNaN(closing)) {
      continue
    }
    const delta = closing - opening
    if (inferPumpProductType(item) === 'AGO') {
      agoDelta += delta
    } else {
      pmsDelta += delta
    }
  }

  const pms = pmsDelta - Number(rttPMS || 0)
  const ago = agoDelta - Number(rttAGO || 0)

  return {
    pms,
    ago,
    total: pms + ago,
    pmsDelta,
    agoDelta,
  }
}

export const getSalesQuantityValidation = (
  managerValue,
  calculatedValue,
  tolerance = SALES_QUANTITY_TOLERANCE_LITERS,
) => {
  if (managerValue === '' || managerValue == null) {
    return { status: 'empty', withinTolerance: false, difference: null }
  }
  const manager = Number(managerValue)
  const calculated = Number(calculatedValue)
  if (Number.isNaN(manager)) {
    return { status: 'empty', withinTolerance: false, difference: null }
  }
  const difference = manager - calculated
  return {
    status: Math.abs(difference) <= tolerance ? 'match' : 'mismatch',
    withinTolerance: Math.abs(difference) <= tolerance,
    difference,
  }
}

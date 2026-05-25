import { describe, expect, it } from 'vitest'
import {
  computePumpProductSales,
  getSalesQuantityValidation,
  inferPumpProductType,
  SALES_QUANTITY_TOLERANCE_LITERS,
} from './pumpSales'

describe('pumpSales', () => {
  it('sums closing minus opening per product and subtracts RTT', () => {
    const result = computePumpProductSales(
      [
        { label: 'P1', productType: 'PMS', opening: 1000, closing: 1500 },
        { label: 'A1', productType: 'AGO', opening: 200, closing: 350 },
      ],
      10,
      5,
    )
    expect(result.pms).toBe(490)
    expect(result.ago).toBe(145)
    expect(result.total).toBe(635)
  })

  it('infers AGO from pump label when product type missing', () => {
    expect(inferPumpProductType({ label: 'AGO1' })).toBe('AGO')
    expect(inferPumpProductType({ label: 'P1' })).toBe('PMS')
  })

  it('allows manager input within tolerance', () => {
    const validation = getSalesQuantityValidation(502, 500, SALES_QUANTITY_TOLERANCE_LITERS)
    expect(validation.status).toBe('match')
    expect(validation.withinTolerance).toBe(true)
  })

  it('flags manager input outside tolerance', () => {
    const validation = getSalesQuantityValidation(510, 500, SALES_QUANTITY_TOLERANCE_LITERS)
    expect(validation.status).toBe('mismatch')
    expect(validation.withinTolerance).toBe(false)
  })
})

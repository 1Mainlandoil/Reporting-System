const getReportLitres = (report, product) => {
  const key = product === 'AGO' ? 'AGO' : 'PMS'
  return Number(
    report[`pumpSalesLiters${key}`] ??
    report[`totalSalesLiters${key}`] ??
    report[`sales${key}`] ??
    0,
  )
}

export function buildBatches(productRequests) {
  return productRequests
    .filter((r) => {
      const litres = Number(r.approvedLiters || 0)
      const cost = Number(r.costPricePerLiter || 0)
      const dispatched = r.terminalReviewedAt || r.dispatchStatus === 'dispatched' || r.dispatchStatus === 'received'
      return litres > 0 && cost > 0 && dispatched
    })
    .map((r) => {
      const costPerLitre = Number(r.costPricePerLiter || 0)
      const transportPerLitre = Number(r.transportCostPerLiter || 0)
      const landingPerLitre = costPerLitre + transportPerLitre
      const rawType = (r.approvedProductType || r.requestedProductType || 'PMS').toUpperCase()
      return {
        id: r.id,
        stationId: r.stationId,
        productType: rawType === 'AGO' ? 'AGO' : 'PMS',
        totalLitres: Number(r.approvedLiters || 0),
        costPerLitre,
        transportPerLitre,
        landingPerLitre,
        date: String(r.terminalReviewedAt || r.updatedAt || r.createdAt || '').slice(0, 10),
      }
    })
}

const deriveCostingStatus = (uncostedLitres, totalLitres) =>
  uncostedLitres <= 0.001
    ? 'costed'
    : totalLitres > 0 && uncostedLitres < totalLitres
      ? 'partial'
      : 'uncosted'

export function computeFifoCogs(batches, reports) {
  // Group & sort batches FIFO per station+product
  const batchMap = {}
  for (const b of batches) {
    const key = `${b.stationId}::${b.productType}`
    if (!batchMap[key]) batchMap[key] = []
    batchMap[key].push({ ...b })
  }
  for (const key of Object.keys(batchMap)) {
    batchMap[key].sort((a, b) => a.date.localeCompare(b.date))
  }

  // Track remaining litres per batch slot (mutable during simulation)
  const batchRemaining = {}
  const batchPointers = {}
  for (const key of Object.keys(batchMap)) {
    batchRemaining[key] = batchMap[key].map((b) => b.totalLitres)
    batchPointers[key] = 0
  }

  // Group & sort reports per station by date (process chronologically)
  const byStation = {}
  for (const r of reports) {
    if (!r.stationId || !r.date || (r.reportType || 'fuel') === 'lpg') continue
    if (!byStation[r.stationId]) byStation[r.stationId] = []
    byStation[r.stationId].push(r)
  }
  for (const sid of Object.keys(byStation)) {
    byStation[sid].sort((a, b) => a.date.localeCompare(b.date))
  }

  const result = {}

  for (const stationReports of Object.values(byStation)) {
    for (const report of stationReports) {
      let pmsCogs = 0, agoCogs = 0
      let pmsUncosted = 0, agoUncosted = 0
      const events = []

      for (const product of ['PMS', 'AGO']) {
        const key = `${report.stationId}::${product}`
        const litresSold = getReportLitres(report, product)

        if (litresSold <= 0) continue

        const bList = batchMap[key]
        if (!bList || bList.length === 0) {
          if (product === 'PMS') pmsUncosted = litresSold
          else agoUncosted = litresSold
          continue
        }

        let remaining = litresSold
        let cogs = 0
        let ptr = batchPointers[key]

        while (remaining > 0.001 && ptr < bList.length) {
          const avail = batchRemaining[key][ptr]
          if (avail <= 0.001) { ptr++; continue }
          const use = Math.min(remaining, avail)
          cogs += use * bList[ptr].landingPerLitre
          events.push({
            source: 'batch',
            sourceId: bList[ptr].id,
            product,
            litres: use,
            landingPerLitre: bList[ptr].landingPerLitre,
            batchDate: bList[ptr].date,
          })
          remaining -= use
          batchRemaining[key][ptr] -= use
          if (batchRemaining[key][ptr] <= 0.001) ptr++
        }
        batchPointers[key] = ptr

        if (product === 'PMS') { pmsCogs = cogs; pmsUncosted = Math.max(0, remaining) }
        else { agoCogs = cogs; agoUncosted = Math.max(0, remaining) }
      }

      const uncostedLitres = pmsUncosted + agoUncosted
      const totalLitres = getReportLitres(report, 'PMS') + getReportLitres(report, 'AGO')

      result[report.id] = {
        stationId: report.stationId,
        date: report.date,
        pmsCogs,
        agoCogs,
        cogs: pmsCogs + agoCogs,
        pmsUncosted,
        agoUncosted,
        uncostedLitres,
        totalLitres,
        costingStatus: deriveCostingStatus(uncostedLitres, totalLitres),
        events,
      }
    }
  }

  return result
}

/**
 * Backfills COGS for litres FIFO couldn't match (no batch, or batch pool
 * exhausted) using manual cost entries — a standalone correction ledger,
 * never a new batch, so it can only apply against litres already recorded
 * as uncosted and can't be drawn on by future sales.
 *
 * Consumes oldest-uncosted-report-first per station+product, and applies
 * entries for the same station+product in the order they were created so
 * two entries can't double-claim the same litres.
 */
export function applyManualCosting(fifoResult, reports, manualCostEntries) {
  const next = {}
  for (const [id, row] of Object.entries(fifoResult)) {
    next[id] = { ...row, events: [...row.events] }
  }

  const byStationProduct = {}
  for (const r of reports) {
    if (!r.stationId || !r.date || (r.reportType || 'fuel') === 'lpg') continue
    if (!next[r.id]) continue
    for (const product of ['PMS', 'AGO']) {
      const key = `${r.stationId}::${product}`
      if (!byStationProduct[key]) byStationProduct[key] = []
      byStationProduct[key].push({ reportId: r.id, date: r.date })
    }
  }
  for (const key of Object.keys(byStationProduct)) {
    byStationProduct[key].sort((a, b) => a.date.localeCompare(b.date))
  }

  const sortedEntries = [...manualCostEntries].sort((a, b) =>
    String(a.createdAt || '').localeCompare(String(b.createdAt || '')))

  for (const entry of sortedEntries) {
    const product = entry.productType === 'AGO' ? 'AGO' : 'PMS'
    const key = `${entry.stationId}::${product}`
    const candidates = byStationProduct[key] || []
    let remaining = Number(entry.quantity || 0)
    const landingPerLitre = Number(entry.landingCostPerLiter || 0)

    for (const { reportId } of candidates) {
      if (remaining <= 0.001) break
      const row = next[reportId]
      const uncostedField = product === 'PMS' ? 'pmsUncosted' : 'agoUncosted'
      const cogsField = product === 'PMS' ? 'pmsCogs' : 'agoCogs'
      const available = row[uncostedField]
      if (available <= 0.001) continue

      const use = Math.min(remaining, available)
      row[uncostedField] -= use
      row[cogsField] += use * landingPerLitre
      row.cogs += use * landingPerLitre
      row.uncostedLitres -= use
      row.costingStatus = deriveCostingStatus(row.uncostedLitres, row.totalLitres)
      row.events.push({
        source: 'manual',
        sourceId: entry.id,
        product,
        litres: use,
        landingPerLitre,
        batchDate: String(entry.createdAt || '').slice(0, 10),
      })
      remaining -= use
    }
  }

  return next
}

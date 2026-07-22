const money = (value) => `NGN ${Math.round(Number(value || 0)).toLocaleString()}`
const liters = (value) => `${Math.round(Number(value || 0)).toLocaleString()} L`

const daysAgo = (isoDate, todayIso) => {
  if (!isoDate) return null
  const then = new Date(`${isoDate}T00:00:00`)
  const now = new Date(`${todayIso}T00:00:00`)
  return Math.round((now - then) / 86400000)
}

const Section = ({ title, children }) => (
  <section className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
    <p className="mb-3 text-xs font-black uppercase tracking-widest text-[#a9cd39]">{title}</p>
    <div className="space-y-2">{children}</div>
  </section>
)

const StationCoverageModal = ({ card: s, dateFrom, dateTo, today, productRequests = [], batchConsumedTotals = {}, onClose, onCostNow }) => {
  if (!s) return null

  const isFullyCovered = s.uncostedLitres <= 0.5

  const headline = isFullyCovered
    ? `Every litre ${s.stationName} sold this period has a real cost on file — the profit number below can be trusted as-is.`
    : `Based only on fuel we know the real cost of, ${s.stationName} ${s.confirmedNetProfit >= 0 ? 'made' : 'lost'} ${money(Math.abs(s.confirmedNetProfit))} this period. We don't yet know what ${liters(s.uncostedLitres)} of the fuel it sold (worth ${money(s.pendingRevenue)} in sales) actually cost, so the real picture could be better or worse than this.`

  const lastPriced = { PMS: null, AGO: null }
  for (const r of productRequests) {
    if (r.stationId !== s.stationId) continue
    const costPerLiter = Number(r.costPricePerLiter || 0)
    if (costPerLiter <= 0) continue
    const dispatched = r.terminalReviewedAt || r.dispatchStatus === 'dispatched' || r.dispatchStatus === 'received'
    if (!dispatched) continue
    const date = String(r.terminalReviewedAt || r.updatedAt || r.createdAt || '').slice(0, 10)
    const product = (r.approvedProductType || r.requestedProductType || 'PMS').toUpperCase() === 'AGO' ? 'AGO' : 'PMS'
    if (!lastPriced[product] || date > lastPriced[product]) lastPriced[product] = date
  }

  const dayRows = [...s.rows]
    .filter((r) => r.uncostedLitres > 0.5)
    .sort((a, b) => a.date.localeCompare(b.date))

  const costGroups = Object.values(
    (s.events || []).reduce((acc, ev) => {
      const key = `${ev.source}::${ev.sourceId}`
      if (!acc[key]) acc[key] = { ...ev, litres: 0 }
      acc[key].litres += ev.litres
      return acc
    }, {}),
  ).sort((a, b) => b.litres - a.litres)

  const receivingHistory = productRequests
    .filter((r) => r.stationId === s.stationId && (r.terminalReviewedAt || r.dispatchStatus === 'dispatched' || r.dispatchStatus === 'received') && Number(r.approvedLiters || 0) > 0)
    .map((r) => {
      const costPerLiter = Number(r.costPricePerLiter || 0)
      const transportPerLiter = Number(r.transportCostPerLiter || 0)
      const totalLitres = Number(r.approvedLiters || 0)
      const consumed = batchConsumedTotals[r.id] || 0
      return {
        id: r.id,
        date: String(r.terminalReviewedAt || r.updatedAt || r.createdAt || '').slice(0, 10),
        product: (r.approvedProductType || r.requestedProductType || 'PMS').toUpperCase() === 'AGO' ? 'AGO' : 'PMS',
        totalLitres,
        priced: costPerLiter > 0,
        landingPerLiter: costPerLiter + transportPerLiter,
        remaining: Math.max(0, totalLitres - consumed),
      }
    })
    .sort((a, b) => b.date.localeCompare(a.date))

  const uncostedProducts = [...new Set(dayRows.flatMap((r) => (r.pmsLiters > 0 && r.costingStatus !== 'costed' ? ['PMS'] : []).concat(r.agoLiters > 0 && r.costingStatus !== 'costed' ? ['AGO'] : [])))]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0b111d] p-6 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-2xl font-black">{s.stationName}</h3>
            <p className="mt-0.5 text-sm text-slate-400">{s.managerName}{dateFrom ? ` · ${dateFrom}${dateTo && dateTo !== dateFrom ? ` to ${dateTo}` : ''}` : ''}</p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-xl border border-white/10 px-3 py-1.5 text-sm font-semibold text-slate-300 hover:bg-white/5">
            Close
          </button>
        </div>

        <div className={`mb-4 rounded-2xl border p-4 ${isFullyCovered ? 'border-[#a9cd39]/25 bg-[#a9cd39]/5' : 'border-amber-400/25 bg-amber-400/5'}`}>
          <p className="text-sm leading-relaxed text-slate-100">{headline}</p>
        </div>

        {!isFullyCovered && uncostedProducts.length > 0 && (
          <div className="mb-4 space-y-1.5">
            {uncostedProducts.map((product) => {
              const last = lastPriced[product]
              const age = last ? daysAgo(last, today) : null
              return (
                <p key={product} className="text-xs text-amber-300">
                  {last
                    ? `Last time ${s.stationName} received priced ${product}: ${age} day${age === 1 ? '' : 's'} ago (${last}).`
                    : `${s.stationName} has never had a priced ${product} delivery on record.`}
                </p>
              )
            })}
          </div>
        )}

        <div className="space-y-3">
          <Section title="The bottom line">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-300">Confirmed profit (trusted)</span>
              <span className={`text-lg font-black ${s.confirmedNetProfit < 0 ? 'text-rose-400' : 'text-[#a9cd39]'}`}>{money(s.confirmedNetProfit)}</span>
            </div>
            <p className="text-xs text-slate-500">{s.confirmedMargin.toFixed(1)}% margin, based on {money(s.confirmedRevenue)} of sales we actually know the cost for.</p>
            {s.pendingRevenue > 0.5 && (
              <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2">
                <span className="text-sm text-amber-300">Sales we can't judge yet</span>
                <span className="text-lg font-black text-amber-300">{money(s.pendingRevenue)}</span>
              </div>
            )}
            {s.pendingRevenue > 0.5 && (
              <p className="text-xs text-amber-300/80">This much was sold, but we don't know what it cost to bring in — so it's left out of the trusted number above rather than guessed at.</p>
            )}
          </Section>

          {costGroups.length > 0 && (
            <Section title="Where the cost numbers came from">
              {costGroups.map((g) => (
                <div key={`${g.source}-${g.sourceId}`} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2 text-xs">
                  <span className="text-slate-300">{liters(g.litres)} of {g.product} costed at {money(g.landingPerLitre)}/L{g.source === 'manual' ? ' (entered manually)' : ' (from a real delivery)'}</span>
                </div>
              ))}
              {s.uncostedLitres > 0.5 && (
                <div className="flex items-center justify-between rounded-lg bg-amber-400/10 px-3 py-2 text-xs">
                  <span className="text-amber-300">{liters(s.uncostedLitres)} sold with no cost on file yet</span>
                  {onCostNow && (
                    <button
                      type="button"
                      onClick={() => onCostNow({ stationId: s.stationId, productType: uncostedProducts[0] || 'PMS' })}
                      className="rounded-lg bg-amber-400 px-2.5 py-1 text-[11px] font-black text-black hover:bg-amber-300"
                    >
                      Cost this now
                    </button>
                  )}
                </div>
              )}
            </Section>
          )}

          {dayRows.length > 0 && (
            <Section title="Which days this is coming from">
              {dayRows.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2 text-xs">
                  <span className="text-slate-300">{r.date}</span>
                  <span className="text-amber-300">{liters(r.uncostedLitres)} unpriced</span>
                </div>
              ))}
            </Section>
          )}

          {receivingHistory.length > 0 && (
            <Section title="Fuel deliveries received">
              {receivingHistory.map((r) => (
                <div key={r.id} className="rounded-lg bg-white/[0.03] px-3 py-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">{r.date}: {liters(r.totalLitres)} of {r.product} arrived</span>
                    <span className={r.priced ? 'text-white' : 'text-amber-300'}>{r.priced ? `at ${money(r.landingPerLiter)}/L` : 'price never entered'}</span>
                  </div>
                  <p className="mt-0.5 text-slate-500">{r.remaining > 0.5 ? `${liters(r.remaining)} of this delivery hasn't been sold yet` : 'all of this delivery has been sold'}</p>
                </div>
              ))}
            </Section>
          )}

          <Section title="Sales this period">
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                ['Total sold', liters(s.litersSold)],
                ['Total revenue', money(s.revenue)],
                ['Manager expenses', money(s.expense)],
                ['Reports counted', String(s.reports)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-2">
                  <span className="text-slate-400">{label}</span>
                  <span className="font-semibold text-white">{value}</span>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}

export default StationCoverageModal

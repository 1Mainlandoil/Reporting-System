import EvidencePhotoList from '../ui/EvidencePhotoList'

const StockDipVsBookPanel = ({ report }) => {
  const dipPms = Number(report.tankDipPMSRaw ?? report.closingStockPMSRaw ?? 0)
  const dipAgo = Number(report.tankDipAGORaw ?? report.closingStockAGORaw ?? 0)
  const bookPms = Number(report.quantityRemainingPMSRaw ?? 0)
  const bookAgo = Number(report.quantityRemainingAGORaw ?? 0)
  const diffPms = dipPms - bookPms
  const diffAgo = dipAgo - bookAgo
  const hasDiff = diffPms !== 0 || diffAgo !== 0

  return (
    <div
      className={`mt-4 rounded-lg border p-4 ${hasDiff ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30' : 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/25'}`}
    >
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
        Stock check — tank dip vs book remaining
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
        <div className="rounded-lg border border-white/60 bg-white/70 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/50">
          <p className="text-xs uppercase text-slate-500">PMS (L)</p>
          <p>
            Tank dip: <span className="font-semibold">{dipPms.toLocaleString()}</span>
          </p>
          <p>
            Book remaining: <span className="font-semibold">{bookPms.toLocaleString()}</span>
          </p>
          <p className={diffPms !== 0 ? 'font-medium text-amber-800 dark:text-amber-200' : 'text-slate-600 dark:text-slate-300'}>
            Difference: {diffPms > 0 ? '+' : ''}
            {diffPms.toLocaleString()} L
          </p>
        </div>
        <div className="rounded-lg border border-white/60 bg-white/70 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/50">
          <p className="text-xs uppercase text-slate-500">AGO (L)</p>
          <p>
            Tank dip: <span className="font-semibold">{dipAgo.toLocaleString()}</span>
          </p>
          <p>
            Book remaining: <span className="font-semibold">{bookAgo.toLocaleString()}</span>
          </p>
          <p className={diffAgo !== 0 ? 'font-medium text-amber-800 dark:text-amber-200' : 'text-slate-600 dark:text-slate-300'}>
            Difference: {diffAgo > 0 ? '+' : ''}
            {diffAgo.toLocaleString()} L
          </p>
        </div>
      </div>
      {hasDiff ? (
        <p className="mt-3 text-xs text-amber-900 dark:text-amber-200">
          Figures differ — chat or call the manager if you need clarification.
        </p>
      ) : (
        <p className="mt-3 text-xs text-emerald-800 dark:text-emerald-200">Tank dip matches book remaining.</p>
      )}
    </div>
  )
}

const SalesQuantityComparisonPanel = ({ report }) => {
  const calculatedPms = Number(report.calculatedSalesLitersPMS ?? 0)
  const calculatedAgo = Number(report.calculatedSalesLitersAGO ?? 0)
  const managerPms = Number(report.managerEnteredSalesLitersPMS ?? report.totalSalesLitersPMS ?? 0)
  const managerAgo = Number(report.managerEnteredSalesLitersAGO ?? report.totalSalesLitersAGO ?? 0)
  const calculatedTotal = Number(report.calculatedSalesLitersTotal ?? calculatedPms + calculatedAgo)
  const managerTotal = Number(report.managerEnteredSalesLitersTotal ?? managerPms + managerAgo)
  const diffPms = managerPms - calculatedPms
  const diffAgo = managerAgo - calculatedAgo
  const diffTotal = managerTotal - calculatedTotal
  const hasDiff = diffPms !== 0 || diffAgo !== 0

  return (
    <div
      className={`mt-4 rounded-lg border p-4 ${hasDiff ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30' : 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/25'}`}
    >
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
        Quantity sold — system calculated vs manager entered
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
        <div className="rounded-lg border border-white/60 bg-white/70 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/50">
          <p className="text-xs uppercase text-slate-500">PMS (L)</p>
          <p>
            System: <span className="font-semibold">{calculatedPms.toLocaleString()}</span>
          </p>
          <p>
            Manager: <span className="font-semibold">{managerPms.toLocaleString()}</span>
          </p>
          <p className={diffPms !== 0 ? 'font-medium text-amber-800 dark:text-amber-200' : 'text-slate-600 dark:text-slate-300'}>
            Difference: {diffPms > 0 ? '+' : ''}
            {diffPms.toLocaleString()} L
          </p>
        </div>
        <div className="rounded-lg border border-white/60 bg-white/70 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/50">
          <p className="text-xs uppercase text-slate-500">AGO (L)</p>
          <p>
            System: <span className="font-semibold">{calculatedAgo.toLocaleString()}</span>
          </p>
          <p>
            Manager: <span className="font-semibold">{managerAgo.toLocaleString()}</span>
          </p>
          <p className={diffAgo !== 0 ? 'font-medium text-amber-800 dark:text-amber-200' : 'text-slate-600 dark:text-slate-300'}>
            Difference: {diffAgo > 0 ? '+' : ''}
            {diffAgo.toLocaleString()} L
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">
        Station total — System: <span className="font-semibold">{calculatedTotal.toLocaleString()} L</span>
        {' · '}
        Manager: <span className="font-semibold">{managerTotal.toLocaleString()} L</span>
        {diffTotal !== 0 ? (
          <span className="ml-1 font-medium text-amber-800 dark:text-amber-200">
            ({diffTotal > 0 ? '+' : ''}
            {diffTotal.toLocaleString()} L)
          </span>
        ) : null}
      </p>
    </div>
  )
}

const DailyOpeningReportModal = ({ report, onClose }) => {
  if (!report) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h4 className="text-lg font-semibold text-slate-900 dark:text-white">
              Full Daily Report - {report.stationName}
            </h4>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {report.managerName} | {report.reportDate}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
          >
            Close
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-xs uppercase text-slate-500">Submission Status</p>
            <p className="font-medium">{report.reportStatus}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-xs uppercase text-slate-500">Received Product (PMS/AGO)</p>
            <p className="font-medium">{report.receivedProduct}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-xs uppercase text-slate-500">Opening Stock PMS</p>
            <p className="font-medium">{report.openingStockPMS}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-xs uppercase text-slate-500">Opening Stock AGO</p>
            <p className="font-medium">{report.openingStockAGO}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-xs uppercase text-slate-500">Tank Dip PMS (L)</p>
            <p className="font-medium">{report.closingStockPMS}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-xs uppercase text-slate-500">Tank Dip AGO (L)</p>
            <p className="font-medium">{report.closingStockAGO}</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
            <p className="text-xs uppercase text-emerald-700 dark:text-emerald-300">Book Qty Remaining PMS (L)</p>
            <p className="font-medium">{report.quantityRemainingPMS ?? '-'}</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
            <p className="text-xs uppercase text-emerald-700 dark:text-emerald-300">Book Qty Remaining AGO (L)</p>
            <p className="font-medium">{report.quantityRemainingAGO ?? '-'}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-xs uppercase text-slate-500">PMS Price</p>
            <p className="font-medium">
              {report.multiPricing && (report.priceBandsPMS || []).length > 1
                ? `Avg ₦${Number(report.pmsPrice || 0).toLocaleString()}/L`
                : report.pmsPrice}
            </p>
            {(report.priceBandsPMS || []).length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                {report.priceBandsPMS.map((band, index) => (
                  <li key={`pms-band-${index}`}>
                    ₦{Number(band.price || 0).toLocaleString()}/L × {Number(band.liters || 0).toLocaleString()} L
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-xs uppercase text-slate-500">AGO Price</p>
            <p className="font-medium">
              {report.multiPricing && (report.priceBandsAGO || []).length > 1
                ? `Avg ₦${Number(report.agoPrice || 0).toLocaleString()}/L`
                : report.agoPrice}
            </p>
            {(report.priceBandsAGO || []).length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                {report.priceBandsAGO.map((band, index) => (
                  <li key={`ago-band-${index}`}>
                    ₦{Number(band.price || 0).toLocaleString()}/L × {Number(band.liters || 0).toLocaleString()} L
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-xs uppercase text-slate-500">Received PMS (L)</p>
            <p className="font-medium">{report.receivedPMS ?? '0'}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-xs uppercase text-slate-500">Received AGO (L)</p>
            <p className="font-medium">{report.receivedAGO ?? '0'}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-xs uppercase text-slate-500">Total Sales in Liters PMS</p>
            <p className="font-medium">{report.totalSalesLitersPMS}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-xs uppercase text-slate-500">Total Sales in Liters AGO</p>
            <p className="font-medium">{report.totalSalesLitersAGO}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-xs uppercase text-slate-500">RTT PMS</p>
            <p className="font-medium">{report.rttPMS}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-xs uppercase text-slate-500">RTT AGO</p>
            <p className="font-medium">{report.rttAGO}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800 md:col-span-2">
            <p className="text-xs uppercase text-slate-500">Remark</p>
            <p className="font-medium">{report.managerRemark}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-xs uppercase text-slate-500">Expense Total (NGN)</p>
            <p className="font-medium">{Math.round(report.expenseAmount).toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800 md:col-span-2">
            <p className="text-xs uppercase text-slate-500">Expense Description</p>
            <p className="font-medium">{report.expenseDescription}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-xs uppercase text-slate-500">Bank/Channel Deposits Total (NGN)</p>
            <p className="font-medium">
              {Math.round(Number(report.totalPaymentDeposits || 0)).toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-xs uppercase text-slate-500">Cash B/F (NGN)</p>
            <p className="font-medium">{Math.round(Number(report.cashBf || 0)).toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-xs uppercase text-slate-500">Cash Sales (NGN)</p>
            <p className="font-medium">{Math.round(Number(report.cashSales || 0)).toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-xs uppercase text-slate-500">Total Amount (NGN)</p>
            <p className="font-medium">{Math.round(Number(report.totalAmount || 0)).toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-xs uppercase text-slate-500">POS (NGN)</p>
            <p className="font-medium">{Math.round(Number(report.posValue || 0)).toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-xs uppercase text-slate-500">Closing Balance (NGN)</p>
            <p className="font-medium">{Math.round(Number(report.closingBalance || 0)).toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-xs uppercase text-slate-500">Variance (NGN)</p>
            <p className="font-medium">
              {Math.round(Number(report.cashMovementVariance || 0)).toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-xs uppercase text-slate-500">Pump Reading Lines</p>
            <p className="font-medium">{Number(report.pumpReadingsCount || 0)}</p>
          </div>
        </div>

        <SalesQuantityComparisonPanel report={report} />
        <StockDipVsBookPanel report={report} />

        {(report.expenseItems || []).length > 0 && (
          <div className="mt-4 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="mb-2 text-xs uppercase text-slate-500">Expense Lines</p>
            <div className="space-y-2">
              {report.expenseItems.map((item, index) => (
                <p key={`${item.label}-${index}`} className="text-sm text-slate-700 dark:text-slate-200">
                  {item.label}: NGN {Math.round(Number(item.amount) || 0).toLocaleString()}
                </p>
              ))}
            </div>
          </div>
        )}
        {report.paymentBreakdown?.length > 0 && (
          <div className="mt-4 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="mb-2 text-xs uppercase text-slate-500">Bank/Channel Breakdown</p>
            <div className="space-y-3">
              {report.paymentBreakdown.map((item, index) => (
                <div key={`${item.channel}-${index}`} className="space-y-2">
                  <p className="text-sm text-slate-700 dark:text-slate-200">
                    {item.channel}: NGN {Math.round(Number(item.amount) || 0).toLocaleString()}
                  </p>
                  {(item.eodPhotoUrls?.length || item.eodPhotoUrl) ? (
                    <EvidencePhotoList
                      title={`${item.channel} EOD proof`}
                      photos={
                        item.eodPhotoUrls?.length
                          ? item.eodPhotoUrls
                          : item.eodPhotoUrl
                            ? [item.eodPhotoUrl]
                            : []
                      }
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}
        {report.posEodPhotoUrl ? (
          <div className="mt-4">
            <EvidencePhotoList title="POS EOD proof" photos={[report.posEodPhotoUrl]} />
          </div>
        ) : null}
        {report.productDispatchReceipts?.length > 0 && (
          <div className="mt-4 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="mb-2 text-xs uppercase text-slate-500">Received Dispatches</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {report.productDispatchReceipts.map((item, index) => {
                const liters = Number(item.liters || 0)
                const tankDip = Number(item.tankDipAfterDelivery || 0)
                return (
                  <div key={`${item.id || item.productType}-${index}`} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {item.productType || 'Product'}: {liters.toLocaleString()} L
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Tank dip after delivery: {tankDip.toLocaleString()} L
                    </p>
                    {item.truckNumber ? (
                      <p className="mt-1 text-xs text-slate-500">Truck: {item.truckNumber}</p>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        )}
        {report.pumpMeterRows?.length > 0 && (
          <div className="mt-4 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="mb-2 text-xs uppercase text-slate-500">Pump Readings</p>
            <div className="space-y-2">
              {report.pumpMeterRows.map((item, index) => (
                <p key={`${item.label}-${index}`} className="text-sm text-slate-700 dark:text-slate-200">
                  {item.label}:{' '}
                  {item.noBaseline
                    ? 'No baseline'
                    : `${item.opening ?? '-'} - ${item.closing ?? '-'} ${item.used ? '(used)' : '(unused)'}`}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default DailyOpeningReportModal

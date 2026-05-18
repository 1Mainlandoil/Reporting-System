import FormInput from '../ui/FormInput'
import { computeSalesAmountFromBands, sumBandLiters } from '../../utils/priceBands'

const ProductPriceSection = ({
  productLabel,
  multiPrice,
  onMultiPriceChange,
  singlePrice,
  onSinglePriceChange,
  bands,
  bandDraft,
  onBandDraftChange,
  onAddBand,
  onRemoveBand,
  totalSalesLiters,
}) => {
  const litersSold = Number(totalSalesLiters || 0)
  const bandLiters = sumBandLiters(bands)
  const salesAmount = computeSalesAmountFromBands(bands)

  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{productLabel} pricing</p>
      <label className="mb-3 block space-y-1">
        <span className="text-sm font-medium">Sold at more than one price today?</span>
        <select
          value={multiPrice}
          onChange={(event) => onMultiPriceChange(event.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="no">No — one price for the day</option>
          <option value="yes">Yes — multiple prices</option>
        </select>
      </label>

      {multiPrice === 'no' ? (
        <FormInput
          type="number"
          min="0"
          required
          label={`${productLabel} PRICE (₦/L)`}
          value={singlePrice}
          onChange={(event) => onSinglePriceChange(event.target.value)}
        />
      ) : (
        <div>
          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
            Computed sales: <span className="font-semibold text-slate-700 dark:text-slate-200">{litersSold.toLocaleString()} L</span>
            {litersSold > 0 && (
              <>
                {' '}
                · Band total:{' '}
                <span
                  className={
                    Math.abs(bandLiters - litersSold) <= 0.05
                      ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                      : 'font-semibold text-amber-700 dark:text-amber-400'
                  }
                >
                  {bandLiters.toLocaleString()} L
                </span>
              </>
            )}
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <FormInput
              type="number"
              min="0"
              label="Price (₦/L)"
              value={bandDraft.price}
              onChange={(event) => onBandDraftChange({ ...bandDraft, price: event.target.value })}
            />
            <FormInput
              type="number"
              min="0"
              label="Liters at this price"
              value={bandDraft.liters}
              onChange={(event) => onBandDraftChange({ ...bandDraft, liters: event.target.value })}
            />
            <div className="flex items-end">
              <button
                type="button"
                onClick={onAddBand}
                className="w-full rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white dark:bg-slate-700"
              >
                Add price line
              </button>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {!bands.length && <p className="text-sm text-slate-500">No price lines added yet.</p>}
            {bands.map((band) => (
              <div
                key={band.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
              >
                <p>
                  ₦{Number(band.price).toLocaleString()}/L × {Number(band.liters).toLocaleString()} L = ₦
                  {(Number(band.price) * Number(band.liters)).toLocaleString()}
                </p>
                <button type="button" onClick={() => onRemoveBand(band.id)} className="text-red-600">
                  Remove
                </button>
              </div>
            ))}
          </div>
          {bands.length > 0 && (
            <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
              {productLabel} sales value: ₦{salesAmount.toLocaleString()}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default ProductPriceSection

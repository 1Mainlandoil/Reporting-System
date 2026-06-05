import FormInput from '../ui/FormInput'
import CustomSelect from '../ui/CustomSelect'
import { computeSalesAmountFromBands, sumBandLiters } from '../../utils/priceBands'

const ProductPriceSection = ({
  productLabel, multiPrice, onMultiPriceChange, singlePrice, onSinglePriceChange,
  bands, bandDraft, onBandDraftChange, onAddBand, onRemoveBand, totalSalesLiters,
}) => {
  const litersSold = Number(totalSalesLiters || 0)
  const bandLiters = sumBandLiters(bands)
  const salesAmount = computeSalesAmountFromBands(bands)

  return (
    <div className="rounded-xl border border-white/5 bg-white/5 p-4">
      <p className="mb-3 text-sm font-semibold text-white">{productLabel} Pricing</p>
      <div className="mb-3 space-y-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Multiple prices today?</span>
        <div className="mt-1">
          <CustomSelect
            value={multiPrice}
            onChange={onMultiPriceChange}
            options={[{ value: 'no', label: 'No — one price' }, { value: 'yes', label: 'Yes — multiple prices' }]}
          />
        </div>
      </div>

      {multiPrice === 'no' ? (
        <FormInput type="number" min="0" required label={`${productLabel} PRICE (₦/L)`} value={singlePrice} onChange={(e) => onSinglePriceChange(e.target.value)} />
      ) : (
        <div>
          <p className="mb-2 text-xs text-slate-400">
            Computed sales: <span className="font-semibold text-white">{litersSold.toLocaleString()} L</span>
            {litersSold > 0 && (
              <> · Band total: <span className={Math.abs(bandLiters - litersSold) <= 0.05 ? 'font-semibold text-[#a9cd39]' : 'font-semibold text-amber-400'}>{bandLiters.toLocaleString()} L</span></>
            )}
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <FormInput type="number" min="0" label="Price (₦/L)" value={bandDraft.price} onChange={(e) => onBandDraftChange({ ...bandDraft, price: e.target.value })} />
            <FormInput type="number" min="0" label="Liters at this price" value={bandDraft.liters} onChange={(e) => onBandDraftChange({ ...bandDraft, liters: e.target.value })} />
            <div className="flex items-end">
              <button type="button" onClick={onAddBand} className="w-full rounded-xl bg-white/10 px-4 py-3 text-sm font-medium text-white hover:bg-white/15 transition">
                Add price line
              </button>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {!bands.length && <p className="text-sm text-slate-500">No price lines added yet.</p>}
            {bands.map((band) => (
              <div key={band.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-3 py-2 text-sm text-slate-200">
                <p>₦{Number(band.price).toLocaleString()}/L × {Number(band.liters).toLocaleString()} L = ₦{(Number(band.price) * Number(band.liters)).toLocaleString()}</p>
                <button type="button" onClick={() => onRemoveBand(band.id)} className="text-rose-400 font-semibold">Remove</button>
              </div>
            ))}
          </div>
          {bands.length > 0 && (
            <p className="mt-2 text-sm font-semibold text-[#a9cd39]">{productLabel} sales value: ₦{salesAmount.toLocaleString()}</p>
          )}
        </div>
      )}
    </div>
  )
}

export default ProductPriceSection

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '../components/ui/Card'
import FormInput from '../components/ui/FormInput'
import CustomSelect from '../components/ui/CustomSelect'
import { useAppStore } from '../store/useAppStore'

const StaffStockOrderingPage = () => {
  const navigate = useNavigate()
  const createProductRequest = useAppStore((state) => state.createProductRequest)
  const [requestDraft, setRequestDraft] = useState({
    requestedProductType: 'PMS',
    requestedLiters: '',
    remark: '',
  })
  const [submitted, setSubmitted] = useState(false)

  const handleRequestSubmit = (event) => {
    event.preventDefault()
    if (!requestDraft.requestedLiters) return
    createProductRequest({
      requestedProductType: requestDraft.requestedProductType,
      requestedLiters: Number(requestDraft.requestedLiters || 0),
      remark: requestDraft.remark,
    })
    setRequestDraft({ requestedProductType: 'PMS', requestedLiters: '', remark: '' })
    setSubmitted(true)
    setTimeout(() => setSubmitted(false), 3000)
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Card>
        <div className="mb-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white transition"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#a9cd39]">Stock Request</p>
            <h3 className="text-2xl font-bold text-white">Order Product</h3>
          </div>
        </div>

        {submitted && (
          <div className="mb-4 rounded-xl border border-[#a9cd39]/30 bg-[#a9cd39]/10 px-4 py-3 text-sm font-semibold text-[#a9cd39]">
            ✓ Product request submitted successfully.
          </div>
        )}

        <form onSubmit={handleRequestSubmit} className="space-y-4">
          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Product Type</span>
            <CustomSelect
              value={requestDraft.requestedProductType}
              onChange={(val) => setRequestDraft((prev) => ({ ...prev, requestedProductType: val }))}
              options={[{ value: 'PMS', label: 'PMS (Petrol)' }, { value: 'AGO', label: 'AGO (Diesel)' }]}
            />
          </div>

          <FormInput
            type="number"
            min="1"
            required
            label="Requested Quantity (Litres)"
            value={requestDraft.requestedLiters}
            onChange={(event) => setRequestDraft((prev) => ({ ...prev, requestedLiters: event.target.value }))}
            placeholder="e.g. 5000"
          />

          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Reason / Remark</span>
            <textarea
              value={requestDraft.remark}
              onChange={(event) => setRequestDraft((prev) => ({ ...prev, remark: event.target.value }))}
              placeholder="Why are you requesting this product?"
              rows={3}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-600 focus:border-[#a9cd39]/40 focus:outline-none resize-none"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-[#a9cd39] py-3 text-sm font-bold text-black hover:bg-[#bcd94a] transition"
          >
            Submit Request
          </button>
        </form>
      </Card>
    </div>
  )
}

export default StaffStockOrderingPage

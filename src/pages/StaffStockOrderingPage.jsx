import { useState } from 'react'
import Card from '../components/ui/Card'
import FormInput from '../components/ui/FormInput'
import { useAppStore } from '../store/useAppStore'

const StaffStockOrderingPage = () => {
  const createProductRequest = useAppStore((state) => state.createProductRequest)
  const [requestDraft, setRequestDraft] = useState({
    requestedProductType: 'PMS',
    requestedLiters: '',
    remark: '',
  })

  const handleRequestSubmit = (event) => {
    event.preventDefault()
    createProductRequest({
      requestedProductType: requestDraft.requestedProductType,
      requestedLiters: Number(requestDraft.requestedLiters || 0),
      remark: requestDraft.remark,
    })
    setRequestDraft({
      requestedProductType: 'PMS',
      requestedLiters: '',
      remark: '',
    })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card className="space-y-4">
        <h3 className="text-lg font-semibold">Stock Ordering</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Submit product requests for supervisor and admin review.
        </p>
        <form onSubmit={handleRequestSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <label className="space-y-1">
            <span className="text-sm font-medium">Requested Product</span>
            <select
              value={requestDraft.requestedProductType}
              onChange={(event) =>
                setRequestDraft((prev) => ({ ...prev, requestedProductType: event.target.value }))
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="PMS">PMS</option>
              <option value="AGO">AGO</option>
            </select>
          </label>
          <FormInput
            type="number"
            min="1"
            required
            label="Requested Liters"
            value={requestDraft.requestedLiters}
            onChange={(event) => setRequestDraft((prev) => ({ ...prev, requestedLiters: event.target.value }))}
          />
          <label className="space-y-1 md:col-span-2">
            <span className="text-sm font-medium">Remark</span>
            <input
              value={requestDraft.remark}
              onChange={(event) => setRequestDraft((prev) => ({ ...prev, remark: event.target.value }))}
              placeholder="Reason for request"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </label>
          <div className="md:col-span-4">
            <button className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white">
              Submit Product Request
            </button>
          </div>
        </form>
      </Card>
    </div>
  )
}

export default StaffStockOrderingPage

import { useMemo, useState } from 'react'
import { supabase, hasSupabaseEnv } from '../../lib/supabaseClient'

const emptyMeter = { label: 'P1', opening: '', closing: '' }
const emptyBank = { channel: '', amount: '' }
const emptyPos = { terminal: '', amount: '' }

const numberValue = (value) => Number(value || 0)
const money = (value) => `NGN ${Math.round(numberValue(value)).toLocaleString()}`
const kg = (value) => `${numberValue(value).toLocaleString(undefined, { maximumFractionDigits: 2 })} kg`

const Field = ({ label, value, onChange, type = 'text', placeholder = '' }) => (
  <label className="space-y-2">
    <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</span>
    <input
      type={type}
      min={type === 'number' ? '0' : undefined}
      step={type === 'number' ? '0.01' : undefined}
      value={value}
      placeholder={placeholder}
      onChange={onChange}
      className="w-full rounded-2xl border border-white/10 bg-[#0b111d] px-4 py-3 text-base font-semibold text-white outline-none transition focus:border-[#a9cd39]/50"
    />
  </label>
)

const LpgReportForm = ({ stationId, reportDate, submitReport, onSubmitted }) => {
  const [form, setForm] = useState({
    openingStockKg: '',
    closingStockKg: '',
    unitPrice: '',
    cashBf: '',
    cashSales: '',
    closingBalance: '',
  })
  const [bankDraft, setBankDraft] = useState(emptyBank)
  const [bankLines, setBankLines] = useState([])
  const [posDraft, setPosDraft] = useState(emptyPos)
  const [posLines, setPosLines] = useState([])
  const [meterDraft, setMeterDraft] = useState(emptyMeter)
  const [meterLines, setMeterLines] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [eodUploads, setEodUploads] = useState([])
  const [eodInputKeys, setEodInputKeys] = useState({})
  const [extraSlotIds, setExtraSlotIds] = useState([])

  const totals = useMemo(() => {
    const stockSoldKg = numberValue(form.openingStockKg) - numberValue(form.closingStockKg)
    const meterSoldKg = meterLines.reduce((sum, line) => sum + Math.max(0, numberValue(line.closing) - numberValue(line.opening)), 0)
    const quantitySoldKg = meterSoldKg || stockSoldKg
    const salesAmount = quantitySoldKg * numberValue(form.unitPrice)
    const bankTotal = bankLines.reduce((sum, line) => sum + numberValue(line.amount), 0)
    const posTotal = posLines.reduce((sum, line) => sum + numberValue(line.amount), 0)
    const totalAmount = numberValue(form.cashBf) + numberValue(form.cashSales)
    const variance = totalAmount - bankTotal - posTotal - numberValue(form.closingBalance)
    return { stockSoldKg, meterSoldKg, quantitySoldKg, salesAmount, bankTotal, posTotal, totalAmount, variance }
  }, [bankLines, form.cashBf, form.cashSales, form.closingBalance, form.closingStockKg, form.openingStockKg, form.unitPrice, meterLines, posLines])

  const addBankLine = () => {
    if (!bankDraft.channel.trim() || numberValue(bankDraft.amount) <= 0) return
    setBankLines((prev) => [...prev, { id: `lpg-bank-${Date.now()}`, ...bankDraft, amount: numberValue(bankDraft.amount) }])
    setBankDraft(emptyBank)
  }

  const addPosLine = () => {
    if (!posDraft.terminal.trim() || numberValue(posDraft.amount) <= 0) return
    setPosLines((prev) => [...prev, { id: `lpg-pos-${Date.now()}`, ...posDraft, amount: numberValue(posDraft.amount) }])
    setPosDraft(emptyPos)
  }

  const addMeterLine = () => {
    if (!meterDraft.label.trim() || meterDraft.opening === '' || meterDraft.closing === '') return
    setMeterLines((prev) => [...prev, { id: `lpg-meter-${Date.now()}`, ...meterDraft, opening: numberValue(meterDraft.opening), closing: numberValue(meterDraft.closing) }])
    setMeterDraft({ ...emptyMeter, label: `P${meterLines.length + 2}` })
  }

  const uploadEodFile = async (fileId, file) => {
    if (!hasSupabaseEnv || !supabase) {
      setEodUploads((prev) => prev.map((u) => u.fileId === fileId ? { ...u, status: 'error', error: 'Supabase not configured.' } : u))
      return
    }
    setEodUploads((prev) => prev.map((u) => u.fileId === fileId ? { ...u, status: 'uploading' } : u))
    const ext = file.name.split('.').pop()
    const path = `eod/lpg/${stationId || 'unknown'}/${reportDate || 'unknown'}/${fileId}.${ext}`
    const { error: uploadError } = await supabase.storage.from('eod-uploads').upload(path, file, { upsert: true })
    if (uploadError) {
      setEodUploads((prev) => prev.map((u) => u.fileId === fileId ? { ...u, status: 'error', error: uploadError.message } : u))
      return
    }
    const { data } = supabase.storage.from('eod-uploads').getPublicUrl(path)
    const url = data?.publicUrl || ''
    setEodUploads((prev) => prev.map((u) => u.fileId === fileId ? { ...u, status: 'done', url } : u))
  }

  const addEodFile = async (slotId, slotLabel, category, file) => {
    if (!file) return
    const fileId = `${slotId}-${Date.now()}`
    setEodUploads((prev) => [...prev, { fileId, slotId, slotLabel, category, file, url: '', status: 'idle', error: '' }])
    setEodInputKeys((prev) => ({ ...prev, [slotId]: Date.now() }))
    await uploadEodFile(fileId, file)
  }

  const removeEodFile = (fileId) => setEodUploads((prev) => prev.filter((u) => u.fileId !== fileId))

  const handleSubmit = async () => {
    setError('')
    if (!reportDate) {
      setError('No report date is available.')
      return
    }
    if (form.openingStockKg === '' || form.closingStockKg === '' || form.unitPrice === '') {
      setError('Enter opening stock, closing stock and LPG unit price.')
      return
    }
    if (eodUploads.some((u) => u.status === 'uploading')) {
      setError('Please wait — files are still uploading.')
      return
    }
    setSubmitting(true)
    try {
      const outcome = await submitReport({
        reportType: 'lpg',
        stationId,
        reportDate,
        cashBf: numberValue(form.cashBf),
        cashSales: numberValue(form.cashSales),
        posValue: totals.posTotal,
        totalPaymentDeposits: totals.bankTotal,
        closingBalance: numberValue(form.closingBalance),
        totalAmount: totals.totalAmount,
        lpgReport: {
          openingStockKg: numberValue(form.openingStockKg),
          closingStockKg: numberValue(form.closingStockKg),
          stockSoldKg: totals.stockSoldKg,
          meterSoldKg: totals.meterSoldKg,
          quantitySoldKg: totals.quantitySoldKg,
          unitPrice: numberValue(form.unitPrice),
          salesAmount: totals.salesAmount,
          bankLines,
          posLines,
          meterLines,
          cashBf: numberValue(form.cashBf),
          cashSales: numberValue(form.cashSales),
          totalAmount: totals.totalAmount,
          bankTotal: totals.bankTotal,
          posTotal: totals.posTotal,
          closingBalance: numberValue(form.closingBalance),
          variance: totals.variance,
        },
        eodAttachments: eodUploads.filter((u) => u.status === 'done').map((u) => ({ label: u.slotLabel, category: u.category, url: u.url, fileName: u.file?.name || '' })),
      })
      if (!outcome?.ok) {
        setError(outcome?.message || (outcome?.error === 'duplicate_date' ? 'LPG report already submitted for this date.' : 'Could not submit LPG report.'))
        return
      }
      await Promise.resolve(onSubmitted?.(outcome))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.24em] text-[#a9cd39]">LPG Reporting</p>
        <h2 className="mt-2 text-2xl font-black text-white">Daily LPG Report</h2>
        <p className="mt-1 text-sm text-slate-400">KG stock, meter readings, bank, POS and cash movement.</p>
      </div>

      {error && <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm font-semibold text-rose-300">{error}</div>}

      <section className="rounded-3xl border border-white/8 bg-white/[0.04] p-4">
        <p className="mb-4 text-xs font-black uppercase tracking-widest text-[#a9cd39]">Stock and price</p>
        <div className="grid gap-3 md:grid-cols-3">
          <Field type="number" label="Opening stock (KG)" value={form.openingStockKg} onChange={(e) => setForm((prev) => ({ ...prev, openingStockKg: e.target.value }))} />
          <Field type="number" label="Closing stock (KG)" value={form.closingStockKg} onChange={(e) => setForm((prev) => ({ ...prev, closingStockKg: e.target.value }))} />
          <Field type="number" label="Unit price / KG" value={form.unitPrice} onChange={(e) => setForm((prev) => ({ ...prev, unitPrice: e.target.value }))} />
        </div>
      </section>

      <section className="rounded-3xl border border-white/8 bg-white/[0.04] p-4">
        <p className="mb-4 text-xs font-black uppercase tracking-widest text-[#a9cd39]">LPG meter reading</p>
        <div className="grid gap-3 md:grid-cols-[0.7fr_1fr_1fr_auto] md:items-end">
          <Field label="Meter" value={meterDraft.label} onChange={(e) => setMeterDraft((prev) => ({ ...prev, label: e.target.value }))} />
          <Field type="number" label="Opening" value={meterDraft.opening} onChange={(e) => setMeterDraft((prev) => ({ ...prev, opening: e.target.value }))} />
          <Field type="number" label="Closing" value={meterDraft.closing} onChange={(e) => setMeterDraft((prev) => ({ ...prev, closing: e.target.value }))} />
          <button type="button" onClick={addMeterLine} className="rounded-2xl bg-[#a9cd39] px-5 py-3 text-sm font-black text-black">Add</button>
        </div>
        <div className="mt-3 space-y-2">
          {meterLines.map((line) => (
            <div key={line.id} className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2 text-sm text-slate-200">
              <span>{line.label}: {kg(line.opening)} to {kg(line.closing)}</span>
              <button type="button" onClick={() => setMeterLines((prev) => prev.filter((item) => item.id !== line.id))} className="font-bold text-rose-400">x</button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-white/8 bg-white/[0.04] p-4">
        <p className="mb-4 text-xs font-black uppercase tracking-widest text-[#a9cd39]">Bank and POS</p>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <Field label="Bank / Channel" value={bankDraft.channel} onChange={(e) => setBankDraft((prev) => ({ ...prev, channel: e.target.value }))} />
          <Field type="number" label="Bank amount" value={bankDraft.amount} onChange={(e) => setBankDraft((prev) => ({ ...prev, amount: e.target.value }))} />
          <button type="button" onClick={addBankLine} className="rounded-2xl border border-[#a9cd39]/25 bg-[#a9cd39]/10 px-5 py-3 text-sm font-black text-[#a9cd39]">Add bank</button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <Field label="POS terminal" value={posDraft.terminal} onChange={(e) => setPosDraft((prev) => ({ ...prev, terminal: e.target.value }))} />
          <Field type="number" label="POS amount" value={posDraft.amount} onChange={(e) => setPosDraft((prev) => ({ ...prev, amount: e.target.value }))} />
          <button type="button" onClick={addPosLine} className="rounded-2xl border border-[#a9cd39]/25 bg-[#a9cd39]/10 px-5 py-3 text-sm font-black text-[#a9cd39]">Add POS</button>
        </div>
      </section>

      <section className="rounded-3xl border border-white/8 bg-white/[0.04] p-4">
        <p className="mb-4 text-xs font-black uppercase tracking-widest text-[#a9cd39]">Cash flow</p>
        <div className="grid gap-3 md:grid-cols-3">
          <Field type="number" label="Cash B/F" value={form.cashBf} onChange={(e) => setForm((prev) => ({ ...prev, cashBf: e.target.value }))} />
          <Field type="number" label="Cash sales" value={form.cashSales} onChange={(e) => setForm((prev) => ({ ...prev, cashSales: e.target.value }))} />
          <Field type="number" label="Closing balance" value={form.closingBalance} onChange={(e) => setForm((prev) => ({ ...prev, closingBalance: e.target.value }))} />
        </div>
      </section>

      <section className="rounded-3xl border border-[#a9cd39]/20 bg-[#a9cd39]/5 p-4">
        <p className="text-xs font-black uppercase tracking-widest text-[#a9cd39]">Review</p>
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <div><p className="text-xs text-slate-400">Qty sold</p><p className="font-black text-white">{kg(totals.quantitySoldKg)}</p></div>
          <div><p className="text-xs text-slate-400">Sales value</p><p className="font-black text-white">{money(totals.salesAmount)}</p></div>
          <div><p className="text-xs text-slate-400">Bank + POS</p><p className="font-black text-white">{money(totals.bankTotal + totals.posTotal)}</p></div>
          <div><p className="text-xs text-slate-400">Variance</p><p className={`font-black ${Math.abs(totals.variance) > 0.5 ? 'text-amber-300' : 'text-[#a9cd39]'}`}>{money(totals.variance)}</p></div>
        </div>
      </section>

      <section className="rounded-3xl border border-white/8 bg-white/[0.04] p-4">
        <p className="mb-1 text-xs font-black uppercase tracking-widest text-[#a9cd39]">EOD Documents</p>
        <p className="mb-4 text-xs text-slate-500">Upload bank slips, POS receipts or any supporting documents</p>
        <div className="space-y-3">
          {[
            ...bankLines.map((line) => ({ slotId: `lpg-bank-${line.id}`, slotLabel: line.channel, category: 'Bank' })),
            ...posLines.map((line) => ({ slotId: `lpg-pos-${line.id}`, slotLabel: line.terminal, category: 'POS' })),
            ...extraSlotIds.map((sid) => ({ slotId: sid, slotLabel: 'Extra Document', category: 'Extra' })),
          ].map(({ slotId, slotLabel, category }) => {
            const files = eodUploads.filter((u) => u.slotId === slotId)
            const inputId = `eod-${slotId}`
            const inputKey = eodInputKeys[slotId] || slotId
            const anyUploading = files.some((f) => f.status === 'uploading')
            const badgeCls = category === 'Bank' ? 'bg-blue-500/15 text-blue-400' : category === 'POS' ? 'bg-[#a9cd39]/15 text-[#a9cd39]' : 'bg-white/10 text-slate-400'
            return (
              <div key={slotId} className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className={`text-xs rounded-full px-2 py-0.5 font-semibold ${badgeCls}`}>{category}</span>
                  <p className="text-sm font-semibold text-white">{slotLabel}</p>
                  <span className="ml-auto text-xs text-slate-500">{files.filter((f) => f.status === 'done').length} uploaded</span>
                </div>
                {files.map((f) => (
                  <div key={f.fileId} className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${f.status === 'done' ? 'border-[#a9cd39]/20 bg-[#a9cd39]/5' : f.status === 'error' ? 'border-rose-500/20 bg-rose-500/5' : 'border-white/10 bg-white/5'}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg shrink-0">{f.file?.type?.startsWith('image') ? '🖼️' : '📄'}</span>
                      <div className="min-w-0">
                        <p className="text-xs text-slate-200 truncate max-w-[160px]">{f.file?.name || 'file'}</p>
                        {f.status === 'done' && <a href={f.url} target="_blank" rel="noreferrer" className="text-xs text-[#a9cd39] underline">View</a>}
                        {f.status === 'uploading' && <p className="text-xs text-slate-400 animate-pulse">Uploading…</p>}
                        {f.status === 'error' && <p className="text-xs text-rose-400">{f.error}</p>}
                      </div>
                    </div>
                    <button type="button" onClick={() => removeEodFile(f.fileId)} className="ml-2 shrink-0 text-slate-500 hover:text-rose-400 transition text-sm">✕</button>
                  </div>
                ))}
                <label htmlFor={inputId} className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed py-3 text-sm transition ${anyUploading ? 'border-white/10 text-slate-600 cursor-not-allowed' : 'border-white/20 text-slate-400 hover:border-[#a9cd39]/40 hover:text-[#a9cd39]'}`}>
                  <span>📎</span>
                  <span>{files.length === 0 ? 'Tap to upload' : '+ Add another file'}</span>
                </label>
                <input id={inputId} key={inputKey} type="file" accept="image/*,application/pdf" disabled={anyUploading} onChange={(e) => addEodFile(slotId, slotLabel, category, e.target.files?.[0])} className="hidden" />
              </div>
            )
          })}
          <button
            type="button"
            onClick={() => setExtraSlotIds((prev) => [...prev, `lpg-extra-${Date.now()}`])}
            className="w-full rounded-xl border border-dashed border-white/10 py-3 text-sm font-medium text-slate-400 hover:border-[#a9cd39]/30 hover:text-[#a9cd39] transition"
          >
            + Add Document Slot
          </button>
        </div>
      </section>

      <button type="button" disabled={submitting} onClick={handleSubmit} className="w-full rounded-2xl bg-[#a9cd39] px-5 py-4 text-sm font-black text-black disabled:opacity-50">
        {submitting ? 'Submitting LPG report...' : 'Submit LPG Report'}
      </button>
    </div>
  )
}

export default LpgReportForm

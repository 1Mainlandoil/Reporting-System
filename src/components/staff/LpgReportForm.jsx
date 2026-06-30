import { useMemo, useState } from 'react'
import { supabase, hasSupabaseEnv } from '../../lib/supabaseClient'

const n = (v) => Number(v || 0)
const money = (v) => `NGN ${Math.round(n(v)).toLocaleString()}`
const kg = (v) => `${n(v).toLocaleString(undefined, { maximumFractionDigits: 2 })} kg`

const Field = ({ label, value, onChange, type = 'text', placeholder = '', hint = '' }) => (
  <label className="space-y-1.5">
    <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</span>
    {hint && <p className="text-xs text-slate-500">{hint}</p>}
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

const StepHeader = ({ step, total, label }) => (
  <div className="mb-4">
    <div className="flex items-center justify-between mb-2">
      <p className="text-xs font-bold uppercase tracking-widest text-[#a9cd39]">Step {step} of {total}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
    <div className="h-1 w-full rounded-full bg-white/10">
      <div className="h-1 rounded-full bg-[#a9cd39] transition-all" style={{ width: `${(step / total) * 100}%` }} />
    </div>
  </div>
)

const NavButtons = ({ onBack, onNext, nextLabel = 'Next →', nextDisabled = false, onBackLabel = '← Back' }) => (
  <div className="mt-6 flex gap-3">
    {onBack && (
      <button type="button" onClick={onBack} className="flex-1 rounded-2xl border border-white/10 bg-white/5 py-3 text-sm font-bold text-slate-300 transition hover:bg-white/10">
        {onBackLabel}
      </button>
    )}
    <button type="button" onClick={onNext} disabled={nextDisabled} className="flex-1 rounded-2xl bg-[#a9cd39] py-3 text-sm font-black text-black transition hover:bg-[#bde14d] disabled:opacity-40">
      {nextLabel}
    </button>
  </div>
)

const STEPS = ['No Sales?', 'Stock & Price', 'Meter Readings', 'Bank & POS', 'Cash Flow', 'EOD Docs', 'Review & Submit']
const TOTAL_STEPS = 6

const LpgReportForm = ({
  stationId, reportDate, submitReport, onSubmitted,
  carriedOpeningKg = 0, carriedCashBf = 0, carriedMeterClosings = {},
}) => {
  const [step, setStep] = useState(0)
  const [isNoSales, setIsNoSales] = useState(null)
  const [noSalesReason, setNoSalesReason] = useState('')

  const [openingStockKg, setOpeningStockKg] = useState(String(carriedOpeningKg || ''))
  const [closingStockKg, setClosingStockKg] = useState('')
  const [unitPrice, setUnitPrice] = useState('')

  const [meterLines, setMeterLines] = useState([])
  const [meterDraft, setMeterDraft] = useState({ label: 'P1', opening: '', closing: '' })
  const [meterOpeningStates, setMeterOpeningStates] = useState({})

  const [bankLines, setBankLines] = useState([])
  const [bankDraft, setBankDraft] = useState({ channel: '', amount: '' })
  const [posLines, setPosLines] = useState([])
  const [posDraft, setPosDraft] = useState({ terminal: '', amount: '' })

  const [cashBf, setCashBf] = useState(carriedCashBf > 0 ? String(carriedCashBf) : '')
  const [cashSales, setCashSales] = useState('')
  const [closingBalance, setClosingBalance] = useState('')

  const [eodUploads, setEodUploads] = useState([])
  const [eodInputKeys, setEodInputKeys] = useState({})
  const [extraSlotIds, setExtraSlotIds] = useState([])

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const totals = useMemo(() => {
    const stockSoldKg = n(openingStockKg) - n(closingStockKg)
    const meterSoldKg = meterLines.reduce((sum, l) => sum + Math.max(0, n(l.closing) - n(l.opening)), 0)
    const quantitySoldKg = meterSoldKg || stockSoldKg
    const salesAmount = quantitySoldKg * n(unitPrice)
    const bankTotal = bankLines.reduce((sum, l) => sum + n(l.amount), 0)
    const posTotal = posLines.reduce((sum, l) => sum + n(l.amount), 0)
    const totalAmount = n(cashBf) + n(cashSales)
    const variance = totalAmount - bankTotal - posTotal - n(closingBalance)
    return { stockSoldKg, meterSoldKg, quantitySoldKg, salesAmount, bankTotal, posTotal, totalAmount, variance }
  }, [openingStockKg, closingStockKg, unitPrice, meterLines, bankLines, posLines, cashBf, cashSales, closingBalance])

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
    setEodUploads((prev) => prev.map((u) => u.fileId === fileId ? { ...u, status: 'done', url: data?.publicUrl || '' } : u))
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
    if (!reportDate) { setError('No report date available.'); return }
    if (eodUploads.some((u) => u.status === 'uploading')) { setError('Please wait — files are still uploading.'); return }
    setSubmitting(true)
    try {
      const outcome = await submitReport(
        isNoSales
          ? {
              reportType: 'lpg', stationId, reportDate,
              noSalesDay: true, noSalesReason: noSalesReason.trim(),
              cashBf: 0, cashSales: 0, posValue: 0, totalPaymentDeposits: 0,
              closingBalance: 0, totalAmount: 0,
              lpgReport: { noSalesDay: true, noSalesReason: noSalesReason.trim(), quantitySoldKg: 0, salesAmount: 0 },
              eodAttachments: [],
            }
          : {
              reportType: 'lpg', stationId, reportDate,
              cashBf: n(cashBf), cashSales: n(cashSales),
              posValue: totals.posTotal, totalPaymentDeposits: totals.bankTotal,
              closingBalance: n(closingBalance), totalAmount: totals.totalAmount,
              lpgReport: {
                openingStockKg: n(openingStockKg), closingStockKg: n(closingStockKg),
                stockSoldKg: totals.stockSoldKg, meterSoldKg: totals.meterSoldKg,
                quantitySoldKg: totals.quantitySoldKg, unitPrice: n(unitPrice),
                salesAmount: totals.salesAmount, bankLines, posLines, meterLines,
                cashBf: n(cashBf), cashSales: n(cashSales),
                totalAmount: totals.totalAmount, bankTotal: totals.bankTotal,
                posTotal: totals.posTotal, closingBalance: n(closingBalance),
                variance: totals.variance,
              },
              eodAttachments: eodUploads.filter((u) => u.status === 'done').map((u) => ({ label: u.slotLabel, category: u.category, url: u.url, fileName: u.file?.name || '' })),
            },
      )
      if (!outcome?.ok) {
        setError(outcome?.error === 'duplicate_date' ? 'LPG report already submitted for this date.' : outcome?.message || 'Could not submit LPG report.')
        return
      }
      await Promise.resolve(onSubmitted?.(outcome))
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Step 0: No Sales Check ───────────────────────────────────────────────
  if (step === 0) return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.24em] text-[#a9cd39]">LPG Reporting</p>
        <h2 className="mt-2 text-2xl font-black text-white">Daily LPG Report</h2>
        <p className="mt-1 text-sm text-slate-400">{reportDate}</p>
      </div>
      {error && <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm font-semibold text-rose-300">{error}</div>}
      <div className="rounded-3xl border border-white/8 bg-white/[0.04] p-5 space-y-4">
        <p className="text-sm font-bold text-white">Did you sell LPG today?</p>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => { setIsNoSales(false); setStep(1) }}
            className={`rounded-2xl border py-4 text-sm font-black transition ${isNoSales === false ? 'border-[#a9cd39] bg-[#a9cd39]/15 text-[#a9cd39]' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`}>
            ✓ Yes, I sold LPG
          </button>
          <button type="button" onClick={() => setIsNoSales(true)}
            className={`rounded-2xl border py-4 text-sm font-black transition ${isNoSales === true ? 'border-red-400/40 bg-red-400/10 text-red-300' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`}>
            ✗ No LPG sales today
          </button>
        </div>
        {isNoSales === true && (
          <div className="space-y-3">
            <Field label="Reason (required)" value={noSalesReason} onChange={(e) => setNoSalesReason(e.target.value)} placeholder="e.g. Out of stock, no customers..." />
            <button type="button" disabled={!noSalesReason.trim() || submitting} onClick={handleSubmit}
              className="w-full rounded-2xl bg-[#a9cd39] py-4 text-sm font-black text-black disabled:opacity-40">
              {submitting ? 'Submitting...' : 'Submit No-Sales Report'}
            </button>
          </div>
        )}
      </div>
    </div>
  )

  // ─── Step 1: Stock & Price ────────────────────────────────────────────────
  if (step === 1) return (
    <div className="space-y-5">
      <StepHeader step={1} total={TOTAL_STEPS} label={STEPS[1]} />
      <h2 className="text-2xl font-black text-white">Stock & Price</h2>
      {carriedOpeningKg > 0 && (
        <div className="rounded-xl border border-[#a9cd39]/20 bg-[#a9cd39]/5 px-4 py-3 text-xs text-[#a9cd39]">
          Opening stock carried from last report: <span className="font-black">{kg(carriedOpeningKg)}</span>
        </div>
      )}
      <div className="space-y-4">
        <Field type="number" label="Opening Stock (KG)" value={openingStockKg} onChange={(e) => setOpeningStockKg(e.target.value)} hint={carriedOpeningKg > 0 ? `Yesterday's closing: ${kg(carriedOpeningKg)}` : ''} />
        <Field type="number" label="Closing Stock (KG)" value={closingStockKg} onChange={(e) => setClosingStockKg(e.target.value)} />
        <Field type="number" label="Unit Price / KG (₦)" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
      </div>
      {n(openingStockKg) > 0 && n(closingStockKg) >= 0 && (
        <div className="rounded-xl border border-white/8 bg-white/5 px-4 py-3 text-sm text-slate-300">
          Stock sold: <span className="font-black text-white">{kg(n(openingStockKg) - n(closingStockKg))}</span>
          {n(unitPrice) > 0 && <> · Est. value: <span className="font-black text-[#a9cd39]">{money((n(openingStockKg) - n(closingStockKg)) * n(unitPrice))}</span></>}
        </div>
      )}
      <NavButtons onBack={() => setStep(0)} onNext={() => {
        if (!openingStockKg || !closingStockKg || !unitPrice) { setError('Fill in opening stock, closing stock and unit price.'); return }
        setError(''); setStep(2)
      }} />
      {error && <p className="text-sm text-rose-400">{error}</p>}
    </div>
  )

  // ─── Step 2: Meter Readings ───────────────────────────────────────────────
  if (step === 2) {
    const addMeter = () => {
      if (!meterDraft.label.trim() || meterDraft.closing === '') { setError('Enter meter label and closing reading.'); return }
      const priorClosing = meterOpeningStates[meterDraft.label] ?? carriedMeterClosings[meterDraft.label]
      const opening = priorClosing != null ? priorClosing : n(meterDraft.opening)
      setMeterLines((prev) => [...prev, { id: `lpg-m-${Date.now()}`, label: meterDraft.label.trim(), opening, closing: n(meterDraft.closing) }])
      const nextNum = meterLines.length + 2
      setMeterDraft({ label: `P${nextNum}`, opening: '', closing: '' })
      setError('')
    }
    return (
      <div className="space-y-5">
        <StepHeader step={2} total={TOTAL_STEPS} label={STEPS[2]} />
        <h2 className="text-2xl font-black text-white">Meter Readings</h2>
        <p className="text-sm text-slate-400">Add each LPG meter. Opening is auto-filled from yesterday if available.</p>
        <div className="space-y-3 rounded-2xl border border-white/8 bg-white/[0.04] p-4">
          <Field label="Meter label" value={meterDraft.label} onChange={(e) => setMeterDraft((p) => ({ ...p, label: e.target.value }))} />
          {carriedMeterClosings[meterDraft.label] != null ? (
            <div className="rounded-xl border border-[#a9cd39]/20 bg-[#a9cd39]/5 px-3 py-2 text-xs text-[#a9cd39]">
              Opening (from yesterday): <span className="font-black">{kg(carriedMeterClosings[meterDraft.label])}</span>
            </div>
          ) : (
            <Field type="number" label="Opening reading (KG)" value={meterDraft.opening} onChange={(e) => setMeterDraft((p) => ({ ...p, opening: e.target.value }))} />
          )}
          <Field type="number" label="Closing reading (KG)" value={meterDraft.closing} onChange={(e) => setMeterDraft((p) => ({ ...p, closing: e.target.value }))} />
          <button type="button" onClick={addMeter} className="w-full rounded-2xl bg-white/10 py-3 text-sm font-bold text-white hover:bg-white/15 transition">+ Add Meter</button>
          {error && <p className="text-xs text-rose-400">{error}</p>}
        </div>
        {meterLines.length > 0 && (
          <div className="space-y-2">
            {meterLines.map((l) => (
              <div key={l.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-3 py-2 text-sm">
                <div>
                  <p className="font-semibold text-white">{l.label}</p>
                  <p className="text-xs text-slate-400">{kg(l.opening)} → {kg(l.closing)} · <span className="text-[#a9cd39] font-bold">{kg(l.closing - l.opening)} sold</span></p>
                </div>
                <button type="button" onClick={() => setMeterLines((p) => p.filter((x) => x.id !== l.id))} className="text-rose-400 font-bold text-xs">Remove</button>
              </div>
            ))}
            <div className="rounded-xl border border-white/5 bg-white/5 px-3 py-2 text-sm">
              <span className="text-slate-400">Total meter sold: </span>
              <span className="font-black text-white">{kg(meterLines.reduce((s, l) => s + (l.closing - l.opening), 0))}</span>
            </div>
          </div>
        )}
        <NavButtons onBack={() => setStep(1)} onNext={() => { setError(''); setStep(3) }} nextLabel={meterLines.length === 0 ? 'Skip →' : 'Next →'} />
      </div>
    )
  }

  // ─── Step 3: Bank & POS ───────────────────────────────────────────────────
  if (step === 3) {
    const addBank = () => {
      if (!bankDraft.channel.trim() || n(bankDraft.amount) <= 0) { setError('Enter bank channel and amount.'); return }
      setBankLines((p) => [...p, { id: `lpg-b-${Date.now()}`, channel: bankDraft.channel.trim(), amount: n(bankDraft.amount) }])
      setBankDraft({ channel: '', amount: '' }); setError('')
    }
    const addPos = () => {
      if (!posDraft.terminal.trim() || n(posDraft.amount) <= 0) { setError('Enter POS terminal and amount.'); return }
      setPosLines((p) => [...p, { id: `lpg-p-${Date.now()}`, terminal: posDraft.terminal.trim(), amount: n(posDraft.amount) }])
      setPosDraft({ terminal: '', amount: '' }); setError('')
    }
    return (
      <div className="space-y-5">
        <StepHeader step={3} total={TOTAL_STEPS} label={STEPS[3]} />
        <h2 className="text-2xl font-black text-white">Bank & POS</h2>
        <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Bank lodgements</p>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
            <Field label="Channel" value={bankDraft.channel} onChange={(e) => setBankDraft((p) => ({ ...p, channel: e.target.value }))} placeholder="e.g. GTBank" />
            <Field type="number" label="Amount (₦)" value={bankDraft.amount} onChange={(e) => setBankDraft((p) => ({ ...p, amount: e.target.value }))} />
            <button type="button" onClick={addBank} className="rounded-2xl border border-[#a9cd39]/25 bg-[#a9cd39]/10 px-4 py-3 text-sm font-bold text-[#a9cd39]">Add</button>
          </div>
          {bankLines.map((l) => (
            <div key={l.id} className="flex justify-between rounded-xl border border-white/5 bg-white/5 px-3 py-2 text-sm">
              <span className="text-slate-300">{l.channel}</span>
              <div className="flex gap-3 items-center">
                <span className="font-bold text-white">{money(l.amount)}</span>
                <button type="button" onClick={() => setBankLines((p) => p.filter((x) => x.id !== l.id))} className="text-rose-400 font-bold text-xs">✕</button>
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">POS terminals</p>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
            <Field label="Terminal" value={posDraft.terminal} onChange={(e) => setPosDraft((p) => ({ ...p, terminal: e.target.value }))} placeholder="e.g. POS 1" />
            <Field type="number" label="Amount (₦)" value={posDraft.amount} onChange={(e) => setPosDraft((p) => ({ ...p, amount: e.target.value }))} />
            <button type="button" onClick={addPos} className="rounded-2xl border border-[#a9cd39]/25 bg-[#a9cd39]/10 px-4 py-3 text-sm font-bold text-[#a9cd39]">Add</button>
          </div>
          {posLines.map((l) => (
            <div key={l.id} className="flex justify-between rounded-xl border border-white/5 bg-white/5 px-3 py-2 text-sm">
              <span className="text-slate-300">{l.terminal}</span>
              <div className="flex gap-3 items-center">
                <span className="font-bold text-white">{money(l.amount)}</span>
                <button type="button" onClick={() => setPosLines((p) => p.filter((x) => x.id !== l.id))} className="text-rose-400 font-bold text-xs">✕</button>
              </div>
            </div>
          ))}
        </div>
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <NavButtons onBack={() => setStep(2)} onNext={() => { setError(''); setStep(4) }} nextLabel={bankLines.length === 0 && posLines.length === 0 ? 'Skip →' : 'Next →'} />
      </div>
    )
  }

  // ─── Step 4: Cash Flow ────────────────────────────────────────────────────
  if (step === 4) return (
    <div className="space-y-5">
      <StepHeader step={4} total={TOTAL_STEPS} label={STEPS[4]} />
      <h2 className="text-2xl font-black text-white">Cash Flow</h2>
      {carriedCashBf > 0 && (
        <div className="rounded-xl border border-[#a9cd39]/20 bg-[#a9cd39]/5 px-4 py-3 text-xs text-[#a9cd39]">
          Cash B/F carried from last report: <span className="font-black">{money(carriedCashBf)}</span>
        </div>
      )}
      <div className="space-y-4">
        <Field type="number" label="Cash B/F (₦)" value={cashBf} onChange={(e) => setCashBf(e.target.value)} hint={carriedCashBf > 0 ? `Yesterday's closing balance: ${money(carriedCashBf)}` : ''} />
        <Field type="number" label="Cash sales (₦)" value={cashSales} onChange={(e) => setCashSales(e.target.value)} />
        <Field type="number" label="Closing balance (₦)" value={closingBalance} onChange={(e) => setClosingBalance(e.target.value)} />
      </div>
      {(n(cashBf) > 0 || n(cashSales) > 0) && (
        <div className="rounded-xl border border-white/8 bg-white/5 px-4 py-3 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-slate-400">Total in hand</span><span className="font-bold text-white">{money(totals.totalAmount)}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Bank + POS</span><span className="font-bold text-white">{money(totals.bankTotal + totals.posTotal)}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Variance</span><span className={`font-black ${Math.abs(totals.variance) > 0.5 ? 'text-amber-300' : 'text-[#a9cd39]'}`}>{money(totals.variance)}</span></div>
        </div>
      )}
      <NavButtons onBack={() => setStep(3)} onNext={() => { setError(''); setStep(5) }} />
    </div>
  )

  // ─── Step 5: EOD Documents ────────────────────────────────────────────────
  if (step === 5) {
    const eodSlots = [
      ...bankLines.map((l) => ({ slotId: `lpg-bank-${l.id}`, slotLabel: l.channel, category: 'Bank' })),
      ...posLines.map((l) => ({ slotId: `lpg-pos-${l.id}`, slotLabel: l.terminal, category: 'POS' })),
      ...extraSlotIds.map((sid) => ({ slotId: sid, slotLabel: 'Extra Document', category: 'Extra' })),
    ]
    return (
      <div className="space-y-5">
        <StepHeader step={5} total={TOTAL_STEPS} label={STEPS[5]} />
        <h2 className="text-2xl font-black text-white">EOD Documents</h2>
        <p className="text-sm text-slate-400">Upload bank slips, POS receipts or any supporting documents.</p>
        <div className="space-y-3">
          {eodSlots.map(({ slotId, slotLabel, category }) => {
            const files = eodUploads.filter((u) => u.slotId === slotId)
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
                    <button type="button" onClick={() => removeEodFile(f.fileId)} className="ml-2 text-slate-500 hover:text-rose-400 text-sm">✕</button>
                  </div>
                ))}
                <label htmlFor={`eod-${slotId}`} className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed py-3 text-sm transition ${anyUploading ? 'border-white/10 text-slate-600 cursor-not-allowed' : 'border-white/20 text-slate-400 hover:border-[#a9cd39]/40 hover:text-[#a9cd39]'}`}>
                  <span>📎</span><span>{files.length === 0 ? 'Tap to upload' : '+ Add another'}</span>
                </label>
                <input id={`eod-${slotId}`} key={inputKey} type="file" accept="image/*,application/pdf" disabled={anyUploading} onChange={(e) => addEodFile(slotId, slotLabel, category, e.target.files?.[0])} className="hidden" />
              </div>
            )
          })}
          <button type="button" onClick={() => setExtraSlotIds((p) => [...p, `lpg-extra-${Date.now()}`])}
            className="w-full rounded-xl border border-dashed border-white/10 py-3 text-sm font-medium text-slate-400 hover:border-[#a9cd39]/30 hover:text-[#a9cd39] transition">
            + Add Document Slot
          </button>
        </div>
        <NavButtons onBack={() => setStep(4)} onNext={() => { setError(''); setStep(6) }} nextLabel={eodSlots.length === 0 ? 'Skip →' : 'Next →'} />
      </div>
    )
  }

  // ─── Step 6: Review & Submit ──────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <StepHeader step={6} total={TOTAL_STEPS} label={STEPS[6]} />
      <h2 className="text-2xl font-black text-white">Review & Submit</h2>
      {error && <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm font-semibold text-rose-300">{error}</div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-4 space-y-2">
          <p className="text-xs font-black uppercase tracking-widest text-[#a9cd39]">Stock</p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-slate-400">Opening</span><span className="font-bold text-white">{kg(openingStockKg)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Closing</span><span className="font-bold text-white">{kg(closingStockKg)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Sold (stock)</span><span className="font-bold text-white">{kg(totals.stockSoldKg)}</span></div>
            {totals.meterSoldKg > 0 && <div className="flex justify-between"><span className="text-slate-400">Sold (meter)</span><span className="font-bold text-[#a9cd39]">{kg(totals.meterSoldKg)}</span></div>}
            <div className="flex justify-between"><span className="text-slate-400">Unit price</span><span className="font-bold text-white">{money(unitPrice)}/kg</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Sales value</span><span className="font-bold text-[#a9cd39]">{money(totals.salesAmount)}</span></div>
          </div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-4 space-y-2">
          <p className="text-xs font-black uppercase tracking-widest text-[#a9cd39]">Cash flow</p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-slate-400">Cash B/F</span><span className="font-bold text-white">{money(cashBf)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Cash sales</span><span className="font-bold text-white">{money(cashSales)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Bank</span><span className="font-bold text-white">{money(totals.bankTotal)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">POS</span><span className="font-bold text-white">{money(totals.posTotal)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Closing balance</span><span className="font-bold text-white">{money(closingBalance)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Variance</span><span className={`font-black ${Math.abs(totals.variance) > 0.5 ? 'text-amber-300' : 'text-[#a9cd39]'}`}>{money(totals.variance)}</span></div>
          </div>
        </div>
      </div>
      {meterLines.length > 0 && (
        <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-4 space-y-2">
          <p className="text-xs font-black uppercase tracking-widest text-[#a9cd39]">Meter readings</p>
          {meterLines.map((l) => (
            <div key={l.id} className="flex justify-between text-sm">
              <span className="text-slate-400">{l.label}</span>
              <span className="text-white">{kg(l.opening)} → {kg(l.closing)} · <span className="font-bold text-[#a9cd39]">{kg(l.closing - l.opening)} sold</span></span>
            </div>
          ))}
        </div>
      )}
      <NavButtons
        onBack={() => setStep(5)}
        onNext={handleSubmit}
        nextLabel={submitting ? 'Submitting...' : 'Submit LPG Report'}
        nextDisabled={submitting}
      />
    </div>
  )
}

export default LpgReportForm

import { useEffect, useMemo, useState } from 'react'
import { supabase, hasSupabaseEnv } from '../../lib/supabaseClient'
import FormInput from '../ui/FormInput'
import CustomSelect from '../ui/CustomSelect'
import ProductPriceSection from './ProductPriceSection'
import posTerminalCatalog from '../../data/posTerminals.generated.json'
import { computeSalesFromMovement, getPumpHistoryKey, normalizePumpProductType } from '../../utils/reportFields'
import {
  computeSalesAmountFromBands,
  normalizePriceBands,
  sumBandLiters,
  validatePriceBandsForProduct,
  weightedAveragePrice,
} from '../../utils/priceBands'
import { getReportingDateIso } from '../../utils/dateFormat'

const EXPENSE_OPTIONS = ['Gas', 'Pms', 'Transport', 'Oil', 'Pos paper', 'Other']
const PAYMENT_CHANNEL_OPTIONS = ['Signature Bank', 'Moniepoint', 'First Bank', 'FCMB', 'Zenith', 'Other']
const PUMP_LABEL_OPTIONS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'Other']

const toOpts = (arr) => arr.map((v) => ({ value: v, label: v }))
const DEFAULT_PUMP_READING = { label: 'P1', otherLabel: '', closing: '', productType: 'PMS' }
const DEFAULT_PRICE_BAND_DRAFT = { price: '', liters: '' }
const DEFAULT_OTHER_POS_DRAFT = { terminalId: '', amount: '' }

const defaultForm = {
  closingStockPMS: '',
  closingStockAGO: '',
  pmsPrice: '',
  agoPrice: '',
  receivedProduct: 'no',
  receivedQuantityPMS: '',
  receivedQuantityAGO: '',
  noSalesDay: 'no',
  noSalesReason: '',
  noSalesNote: '',
  rttPMS: '',
  rttAGO: '',
  managerSalesPMS: '',
  managerSalesAGO: '',
  cashSales: '',
  remark: '',
  cashBfOverride: '',
  closingBalanceOverride: '',
}

const STEPS_NORMAL = ['Sales Check', 'Stock', 'Sales Quantity', 'Pricing', 'Received', 'Expenses', 'Cash', 'POS Terminals', 'Payments', 'Bank EOD', 'Pump Readings', 'Review & Submit']
const STEPS_NO_SALES = ['Sales Check', 'Submit']

const StepHeader = ({ label, current, total }) => (
  <div className="mb-8">
    <div className="mb-3 flex items-center justify-between">
      <span className="text-xs font-semibold uppercase tracking-widest text-[#a9cd39]">{label}</span>
      <span className="text-xs text-slate-600">{current} / {total}</span>
    </div>
    <div className="h-1 w-full overflow-hidden rounded-full bg-white/5">
      <div
        className="h-full rounded-full bg-[#a9cd39] transition-all duration-500"
        style={{ width: `${(current / total) * 100}%` }}
      />
    </div>
  </div>
)

const NavButtons = ({ onBack, onNext, nextLabel = 'Next →', nextDisabled = false, submitting = false }) => (
  <div className="flex gap-3 pt-6 border-t border-white/5 mt-auto">
    {onBack && (
      <button
        type="button"
        onClick={onBack}
        className="rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-slate-400 hover:bg-white/5 hover:text-white transition"
      >
        ← Back
      </button>
    )}
    <button
      type="button"
      onClick={onNext}
      disabled={nextDisabled || submitting}
      className="flex-1 rounded-xl bg-[#a9cd39] py-3 text-sm font-bold text-black hover:bg-[#bcd94a] disabled:cursor-not-allowed disabled:opacity-40 transition"
    >
      {submitting ? 'Submitting...' : nextLabel}
    </button>
  </div>
)

const StaffClosingReportForm = ({
  stationId,
  carriedOpening,
  isFirstReport = false,
  reportingConfiguration,
  submitReport,
  reportDate,
  formDisabled,
  openingBannerTitle = 'Opening stock today (from previous closing)',
  openingBannerDetail,
  showStationIdRow = false,
  onSubmitted,
  submitButtonLabel = 'Submit Report',
  submissionReminder = null,
  pastCatchUpNeeded = false,
  historyPath = '',
  carriedCashBf = 0,
  priorPrices = { pms: 0, ago: 0, date: '' },
  pumpLastClosings = {}, // { [label::productType]: { closing, date, productType } }
  receivedDispatches = [],
}) => {
  const receivedDispatchTotals = receivedDispatches.reduce(
    (totals, dispatch) => {
      const productType = dispatch.approvedProductType || dispatch.requestedProductType
      const liters = Number(dispatch.approvedLiters || dispatch.requestedLiters || 0)
      if (productType === 'AGO') return { ...totals, ago: totals.ago + liters }
      return { ...totals, pms: totals.pms + liters }
    },
    { pms: 0, ago: 0 },
  )
  const hasReceivedDispatches = receivedDispatches.length > 0
  const [step, setStep] = useState(0)
  const [formData, setFormData] = useState(defaultForm)
  const [expenseDraft, setExpenseDraft] = useState({ category: 'Gas', otherLabel: '', amount: '' })
  const [expenseItems, setExpenseItems] = useState([])
  const [paymentDraft, setPaymentDraft] = useState({ channel: PAYMENT_CHANNEL_OPTIONS[0], otherChannel: '', amount: '' })
  const [paymentBreakdown, setPaymentBreakdown] = useState([])
  const [posTerminalAmounts, setPosTerminalAmounts] = useState({})
  const [otherPosDraft, setOtherPosDraft] = useState(DEFAULT_OTHER_POS_DRAFT)
  const [otherPosEntries, setOtherPosEntries] = useState([])
  const [pumpDraft, setPumpDraft] = useState(DEFAULT_PUMP_READING)
  const [pumpReadings, setPumpReadings] = useState([])
  const [pmsMultiPrice, setPmsMultiPrice] = useState('no')
  const [agoMultiPrice, setAgoMultiPrice] = useState('no')
  const [priceBandDraftPMS, setPriceBandDraftPMS] = useState(DEFAULT_PRICE_BAND_DRAFT)
  const [priceBandDraftAGO, setPriceBandDraftAGO] = useState(DEFAULT_PRICE_BAND_DRAFT)
  const [priceBandsPMS, setPriceBandsPMS] = useState([])
  const [priceBandsAGO, setPriceBandsAGO] = useState([])
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  // Opening stock confirmation
  const [openingConfirmed, setOpeningConfirmed] = useState(null)
  const [manualOpening, setManualOpening] = useState({ pms: '', ago: '' })
  const [openingOverrideReason, setOpeningOverrideReason] = useState('')
  // Cash B/F confirmation
  const [cashBfConfirmed, setCashBfConfirmed] = useState(null)
  const [cashBfOverrideReason, setCashBfOverrideReason] = useState('')

  useEffect(() => {
    if (receivedDispatchTotals.pms <= 0 && receivedDispatchTotals.ago <= 0) return
    setFormData((prev) => ({
      ...prev,
      receivedProduct: 'yes',
      receivedQuantityPMS: prev.receivedQuantityPMS || (receivedDispatchTotals.pms > 0 ? String(receivedDispatchTotals.pms) : ''),
      receivedQuantityAGO: prev.receivedQuantityAGO || (receivedDispatchTotals.ago > 0 ? String(receivedDispatchTotals.ago) : ''),
    }))
  }, [receivedDispatchTotals.pms, receivedDispatchTotals.ago])
  // Price confirmation
  const [priceConfirmed, setPriceConfirmed] = useState(null)
  // Pump opening confirmation per pump/product: { [label::productType]: { confirmed: null|true|false, overrideValue: '', reason: '' } }
  const [pumpOpeningStates, setPumpOpeningStates] = useState({})
  const [pumpOpeningDrafts, setPumpOpeningDrafts] = useState({})
  // EOD uploads: flat array of individual files
  // { fileId, slotId, slotLabel, category, file, url, status:'idle'|'uploading'|'done'|'error', error }
  const [eodUploads, setEodUploads] = useState([])
  const [eodInputKeys, setEodInputKeys] = useState({}) // force-reset file inputs after selection
  const [extraSlotIds, setExtraSlotIds] = useState([]) // track manually-added extra slots

  const assignedPosTerminals = useMemo(
    () => posTerminalCatalog?.stations?.[stationId]?.terminals || [],
    [stationId],
  )
  const posTerminalBreakdown = useMemo(
    () => {
      const assignedRows = assignedPosTerminals
        .map((terminal) => ({
          terminalId: terminal.tid,
          bank: terminal.bank,
          label: terminal.label,
          amount: Number(posTerminalAmounts[terminal.tid] || 0),
          category: 'POS',
          channel: `POS - ${terminal.bank} - ${terminal.tid}`,
        }))
        .filter((item) => item.amount > 0)
      const otherRows = otherPosEntries
        .map((entry) => ({
          terminalId: entry.terminalId,
          bank: 'Unmapped POS',
          label: `Unmapped POS - ${entry.terminalId}`,
          amount: Number(entry.amount || 0),
          category: 'POS',
          channel: `POS - Unmapped - ${entry.terminalId}`,
          unmapped: true,
        }))
        .filter((item) => item.terminalId && item.amount > 0)
      return [...assignedRows, ...otherRows]
    },
    [assignedPosTerminals, otherPosEntries, posTerminalAmounts],
  )
  const posValue = posTerminalBreakdown.reduce((sum, item) => sum + item.amount, 0)

  const isNoSalesDay = formData.noSalesDay === 'yes'
  const hasCarriedOpening = !isFirstReport && (Number(carriedOpening.pms) > 0 || Number(carriedOpening.ago) > 0)
  const useManualOpening = isFirstReport || openingConfirmed === false
  const effectiveOpening = {
    pms: useManualOpening ? Number(manualOpening.pms || 0) : Number(carriedOpening.pms || 0),
    ago: useManualOpening ? Number(manualOpening.ago || 0) : Number(carriedOpening.ago || 0),
  }
  const effectiveCashBf = (() => {
    if (isFirstReport) return formData.cashBfOverride !== '' ? Number(formData.cashBfOverride || 0) : Number(carriedCashBf || 0)
    if (cashBfConfirmed === false) return formData.cashBfOverride !== '' ? Number(formData.cashBfOverride || 0) : Number(carriedCashBf || 0)
    return Number(carriedCashBf || 0)
  })()
  const steps = isNoSalesDay ? STEPS_NO_SALES : STEPS_NORMAL
  const totalSteps = steps.length

  // Pump-based sales calculation (new primary method)
  const pumpSales = useMemo(() => {
    if (isNoSalesDay) return { pms: 0, ago: 0, pmsPumps: 0, agoPumps: 0 }
    const calcProduct = (productType) => {
      const pumps = pumpReadings.filter((p) => p.productType === productType)
      if (!pumps.length) return null
      return pumps.reduce((sum, p) => {
        const opening = p.opening != null ? Number(p.opening) : 0
        const closing = Number(p.closing || 0)
        return sum + (closing < opening ? closing : closing - opening)
      }, 0)
    }
    const pmsPumpsTotal = calcProduct('PMS')
    const agoPumpsTotal = calcProduct('AGO')
    return {
      pms: pmsPumpsTotal != null ? Math.max(0, pmsPumpsTotal - Number(formData.rttPMS || 0)) : null,
      ago: agoPumpsTotal != null ? Math.max(0, agoPumpsTotal - Number(formData.rttAGO || 0)) : null,
      hasPumpData: pmsPumpsTotal != null || agoPumpsTotal != null,
    }
  }, [pumpReadings, formData, isNoSalesDay])

  // Tank dip sales (reference only — kept for comparison)
  const dipSales = useMemo(() => {
    if (isNoSalesDay) return { pms: 0, ago: 0 }
    const receivedPMS = formData.receivedProduct === 'yes' ? Number(formData.receivedQuantityPMS || 0) : 0
    const receivedAGO = formData.receivedProduct === 'yes' ? Number(formData.receivedQuantityAGO || 0) : 0
    return {
      pms: computeSalesFromMovement({ opening: effectiveOpening.pms, received: receivedPMS, closing: Number(formData.closingStockPMS || 0), rtt: Number(formData.rttPMS || 0) }),
      ago: computeSalesFromMovement({ opening: effectiveOpening.ago, received: receivedAGO, closing: Number(formData.closingStockAGO || 0), rtt: Number(formData.rttAGO || 0) }),
    }
  }, [effectiveOpening, formData, isNoSalesDay])

  // Effective sales = pump-based if available, else dip-based
  const previewSales = {
    pms: pumpSales.pms != null ? pumpSales.pms : dipSales.pms,
    ago: pumpSales.ago != null ? pumpSales.ago : dipSales.ago,
  }

  const handleAddExpense = () => {
    const amount = Number(expenseDraft.amount || 0)
    const isOther = expenseDraft.category === 'Other'
    const label = isOther ? expenseDraft.otherLabel.trim() : expenseDraft.category
    if (!amount || !label) return
    setExpenseItems((prev) => [...prev, { id: `exp-${Date.now()}`, label, amount }])
    setExpenseDraft((prev) => ({ ...prev, amount: '', otherLabel: '' }))
  }

  const handleAddPaymentLine = () => {
    const isOther = paymentDraft.channel === 'Other'
    const channel = String(isOther ? paymentDraft.otherChannel : paymentDraft.channel || '').trim()
    const amount = Number(paymentDraft.amount || 0)
    if (!channel || amount <= 0) return
    setPaymentBreakdown((prev) => [...prev, { id: `pay-${Date.now()}`, channel, amount }])
    setPaymentDraft({ channel: PAYMENT_CHANNEL_OPTIONS[0], otherChannel: '', amount: '' })
  }

  const handleAddPumpReading = () => {
    const isOther = pumpDraft.label === 'Other'
    const label = String(isOther ? pumpDraft.otherLabel : pumpDraft.label || '').trim()
    const productType = normalizePumpProductType(pumpDraft.productType)
    const historyKey = getPumpHistoryKey(label, productType)
    if (!label || pumpDraft.closing === '') return
    const priorPump = historyKey ? pumpLastClosings[historyKey] : null // per-pump/product history lookup
    const pumpState = pumpOpeningStates[historyKey]
    // If prior exists for this specific pump and not yet answered → block
    if (priorPump && (pumpState?.confirmed === null || pumpState?.confirmed === undefined)) {
      window.alert(`Please confirm the opening reading for ${label} first.`); return
    }
    if (priorPump && pumpState?.confirmed === false) {
      if (!pumpState.overrideValue) { window.alert(`Enter the actual opening reading for ${label}.`); return }
      if (!pumpState.reason.trim()) { window.alert(`Please provide a reason for the ${label} opening discrepancy.`); return }
    }
    if (!priorPump && (pumpDraft.opening === '' || pumpDraft.opening == null)) {
      window.alert(`Enter the opening reading for ${label}. This pump has no previous baseline yet.`)
      return
    }
    const resolvedOpening = priorPump
      ? pumpState?.confirmed === false
        ? Number(pumpState.overrideValue)
        : Number(priorPump.closing)
      : Number(pumpDraft.opening)
    const resolvedClosing = Number(pumpDraft.closing)
    if (!Number.isFinite(resolvedOpening) || !Number.isFinite(resolvedClosing)) {
      window.alert(`Enter valid opening and closing readings for ${label}.`)
      return
    }
    if (resolvedClosing < resolvedOpening) {
      window.alert(`Closing reading for ${label} cannot be lower than opening reading.`)
      return
    }
    const entry = {
      id: `pump-${Date.now()}`,
      label,
      closing: resolvedClosing,
      productType,
    }
    if (!priorPump && pumpDraft.opening !== '' && pumpDraft.opening != null) {
      // First time for this pump — manager enters opening
      entry.opening = resolvedOpening
    } else if (priorPump) {
      entry.opening = resolvedOpening
    }
    setPumpReadings((prev) => [...prev, entry])
    setPumpDraft({ ...DEFAULT_PUMP_READING, productType: pumpDraft.productType }) // keep product type
  }

  const handleAddPriceBand = (product) => {
    const isPms = product === 'pms'
    const draft = isPms ? priceBandDraftPMS : priceBandDraftAGO
    const price = Number(draft.price || 0)
    const liters = Number(draft.liters || 0)
    if (price <= 0 || liters <= 0) return
    const entry = { id: `band-${product}-${Date.now()}`, price, liters }
    if (isPms) { setPriceBandsPMS((prev) => [...prev, entry]); setPriceBandDraftPMS(DEFAULT_PRICE_BAND_DRAFT) }
    else { setPriceBandsAGO((prev) => [...prev, entry]); setPriceBandDraftAGO(DEFAULT_PRICE_BAND_DRAFT) }
  }

  const addOtherPosEntry = () => {
    const terminalId = String(otherPosDraft.terminalId || '').trim()
    const amount = Number(otherPosDraft.amount || 0)
    if (!terminalId || amount <= 0) return
    setOtherPosEntries((prev) => [...prev, { id: `other-pos-${Date.now()}`, terminalId, amount }])
    setOtherPosDraft(DEFAULT_OTHER_POS_DRAFT)
  }

  const uploadEodFile = async (fileId, file) => {
    if (!hasSupabaseEnv || !supabase) {
      setEodUploads((prev) => prev.map((u) => u.fileId === fileId ? { ...u, status: 'error', error: 'Supabase not configured.' } : u))
      return null
    }
    setEodUploads((prev) => prev.map((u) => u.fileId === fileId ? { ...u, status: 'uploading' } : u))
    const ext = file.name.split('.').pop()
    const path = `eod/${stationId || 'unknown'}/${reportDate || getReportingDateIso()}/${fileId}.${ext}`
    const { error } = await supabase.storage.from('eod-uploads').upload(path, file, { upsert: true })
    if (error) {
      setEodUploads((prev) => prev.map((u) => u.fileId === fileId ? { ...u, status: 'error', error: error.message } : u))
      return null
    }
    const { data } = supabase.storage.from('eod-uploads').getPublicUrl(path)
    const url = data?.publicUrl || ''
    setEodUploads((prev) => prev.map((u) => u.fileId === fileId ? { ...u, status: 'done', url } : u))
    return url
  }

  const buildDiscrepancies = () => {
    const list = []
    if (!isFirstReport) {
      if (openingConfirmed === false) {
        list.push({ field: 'Opening Stock', systemValue: `PMS ${carriedOpening.pms} L / AGO ${carriedOpening.ago} L`, enteredValue: `PMS ${manualOpening.pms} L / AGO ${manualOpening.ago} L`, reason: openingOverrideReason })
      }
      if (cashBfConfirmed === false) {
        list.push({ field: 'Cash B/F', systemValue: `NGN ${carriedCashBf}`, enteredValue: `NGN ${formData.cashBfOverride}`, reason: cashBfOverrideReason })
      }
      if (priceConfirmed === false) {
        list.push({ field: 'Selling Price', systemValue: `PMS ₦${priorPrices.pms}/L · AGO ₦${priorPrices.ago}/L`, enteredValue: `PMS ₦${formData.pmsPrice}/L · AGO ₦${formData.agoPrice}/L`, reason: 'Price changed from prior day' })
      }
      Object.entries(pumpOpeningStates).forEach(([label, state]) => {
        if (state.confirmed === false) {
          const prior = pumpLastClosings[label]
          const fieldLabel = prior ? `${prior.label} ${prior.productType}` : label
          list.push({ field: `Pump ${fieldLabel} Opening`, systemValue: prior ? `${prior.closing} (${prior.date})` : 'N/A', enteredValue: state.overrideValue, reason: state.reason })
        }
      })
    }
    return list
  }

  const handleSubmit = async (event) => {
    if (event?.preventDefault) event.preventDefault()
    setSubmitError('')
    if (!stationId) { window.alert('Your account is not linked to a station.'); return }
    if (formDisabled || !reportingConfiguration.dailyOpeningStockFormatEnabled) { window.alert('Daily reporting is disabled.'); return }

    if (!isNoSalesDay) {
      if (formData.managerSalesPMS === '' || formData.managerSalesAGO === '') {
        const msg = 'Enter your PMS and AGO total sales litres before submitting.'
        setSubmitError(msg)
        window.alert(msg)
        return
      }
      if (!pumpReadings.length) {
        const msg = 'Add at least one pump reading before submitting a sales report.'
        setSubmitError(msg)
        window.alert(msg)
        return
      }
      const invalidPumpLine = pumpReadings.find((item) => {
        const opening = item.opening != null && item.opening !== '' ? Number(item.opening) : Number.NaN
        const closing = item.closing != null && item.closing !== '' ? Number(item.closing) : Number.NaN
        return !Number.isFinite(opening) || !Number.isFinite(closing)
      })
      if (invalidPumpLine) {
        const msg = `Fix ${invalidPumpLine.label || 'pump'}: every pump line needs a valid opening and closing reading.`
        setSubmitError(msg)
        window.alert(msg)
        return
      }
      const previewPmsLiters = Number(previewSales.pms || 0)
      const previewAgoLiters = Number(previewSales.ago || 0)
      const pmsBandCheck = validatePriceBandsForProduct({ bands: priceBandsPMS, totalSalesLiters: previewPmsLiters, productLabel: 'PMS', multiPriceEnabled: pmsMultiPrice === 'yes' })
      if (!pmsBandCheck.ok) { setSubmitError(pmsBandCheck.message); window.alert(pmsBandCheck.message); return }
      const agoBandCheck = validatePriceBandsForProduct({ bands: priceBandsAGO, totalSalesLiters: previewAgoLiters, productLabel: 'AGO', multiPriceEnabled: agoMultiPrice === 'yes' })
      if (!agoBandCheck.ok) { setSubmitError(agoBandCheck.message); window.alert(agoBandCheck.message); return }
    }

    setSubmitting(true)
    const receivedPMS = !isNoSalesDay && formData.receivedProduct === 'yes' ? Number(formData.receivedQuantityPMS || 0) : 0
    const receivedAGO = !isNoSalesDay && formData.receivedProduct === 'yes' ? Number(formData.receivedQuantityAGO || 0) : 0
    const openingStockPMS = effectiveOpening.pms
    const openingStockAGO = effectiveOpening.ago
    const closingStockPMS = isNoSalesDay ? Number(openingStockPMS || 0) : Number(formData.closingStockPMS)
    const closingStockAGO = isNoSalesDay ? Number(openingStockAGO || 0) : Number(formData.closingStockAGO)
    const rttPMS = isNoSalesDay ? 0 : Number(formData.rttPMS || 0)
    const rttAGO = isNoSalesDay ? 0 : Number(formData.rttAGO || 0)
    const normalizedPumpReadings = (isNoSalesDay ? [] : pumpReadings)
      .map((item) => {
        const label = String(item.label || '').trim()
        const opening = item.opening != null && item.opening !== '' ? Number(item.opening) : null
        const closing = item.closing != null && item.closing !== '' ? Number(item.closing) : null
        const productType = item.productType === 'AGO' ? 'AGO' : 'PMS'
        return { label, opening, closing, productType }
      })
      .filter((item) => item.label && item.closing != null)
    if (!isNoSalesDay && normalizedPumpReadings.length === 0) {
      const msg = 'Pump readings were not captured correctly. Add the pump line again before submitting.'
      setSubmitError(msg)
      window.alert(msg)
      setSubmitting(false)
      return
    }
    // Pump-based sales (primary)
    const calcPumpSales = (productType) => {
      const pumps = normalizedPumpReadings.filter((p) => p.productType === productType)
      if (!pumps.length) return null
      return pumps.reduce((sum, p) => {
        const o = Number(p.opening || 0)
        const c = Number(p.closing || 0)
        return sum + (c < o ? c : c - o)
      }, 0)
    }
    const pumpSalesPMS = calcPumpSales('PMS')
    const pumpSalesAGO = calcPumpSales('AGO')
    // Dip-based sales (reference / fallback)
    const dipSalesPMS = computeSalesFromMovement({ opening: openingStockPMS, received: receivedPMS, closing: closingStockPMS, rtt: rttPMS })
    const dipSalesAGO = computeSalesFromMovement({ opening: openingStockAGO, received: receivedAGO, closing: closingStockAGO, rtt: rttAGO })
    const totalSalesLitersPMS = pumpSalesPMS != null ? Math.max(0, pumpSalesPMS - rttPMS) : dipSalesPMS
    const totalSalesLitersAGO = pumpSalesAGO != null ? Math.max(0, pumpSalesAGO - rttAGO) : dipSalesAGO
    const managerEnteredSalesLitersPMS = isNoSalesDay ? 0 : Number(formData.managerSalesPMS || 0)
    const managerEnteredSalesLitersAGO = isNoSalesDay ? 0 : Number(formData.managerSalesAGO || 0)
    const salesDiscrepancies = []
    if (!isNoSalesDay && Math.abs(managerEnteredSalesLitersPMS - totalSalesLitersPMS) > 1) {
      salesDiscrepancies.push({
        field: 'PMS Sales Quantity',
        systemValue: `${totalSalesLitersPMS.toLocaleString()} L`,
        enteredValue: `${managerEnteredSalesLitersPMS.toLocaleString()} L`,
        reason: 'Manager-entered PMS sales differs from system pump calculation',
      })
    }
    if (!isNoSalesDay && Math.abs(managerEnteredSalesLitersAGO - totalSalesLitersAGO) > 1) {
      salesDiscrepancies.push({
        field: 'AGO Sales Quantity',
        systemValue: `${totalSalesLitersAGO.toLocaleString()} L`,
        enteredValue: `${managerEnteredSalesLitersAGO.toLocaleString()} L`,
        reason: 'Manager-entered AGO sales differs from system pump calculation',
      })
    }
    const effectiveExpenseItems = isNoSalesDay ? [] : reportingConfiguration.expenseLineItemsEnabled ? expenseItems : []
    const totalExpense = effectiveExpenseItems.reduce((sum, item) => sum + item.amount, 0)
    const expenseDescription = effectiveExpenseItems.map((item) => item.label).join(', ')
    const normalizedPaymentBreakdown = (isNoSalesDay ? [] : paymentBreakdown).map((item) => ({ channel: String(item.channel || '').trim(), amount: Number(item.amount || 0) })).filter((item) => item.channel && item.amount > 0 && item.channel.toUpperCase() !== 'POS')
    const totalPaymentDeposits = normalizedPaymentBreakdown.reduce((sum, item) => sum + item.amount, 0)
    const cashSales = isNoSalesDay ? 0 : Number(formData.cashSales || 0)
    const resolvedPosValue = isNoSalesDay ? 0 : posValue
    const totalAmount = effectiveCashBf + cashSales
    const closingBalance = isFirstReport && formData.closingBalanceOverride != null && formData.closingBalanceOverride !== ''
      ? Number(formData.closingBalanceOverride)
      : totalAmount - totalPaymentDeposits - resolvedPosValue
    const receivedQuantity = receivedPMS + receivedAGO
    const receivedProductType = receivedPMS > 0 && receivedAGO > 0 ? 'BOTH' : receivedAGO > 0 ? 'AGO' : receivedPMS > 0 ? 'PMS' : null
    const productDispatchReceipts = receivedDispatches.map((dispatch) => {
      const productType = dispatch.approvedProductType || dispatch.requestedProductType || ''
      return {
        id: dispatch.id,
        productType,
        liters: Number(dispatch.approvedLiters || dispatch.requestedLiters || 0),
        tankDipAfterDelivery: Number(dispatch.receivedTankDip || 0),
        receivedAt: dispatch.receivedAt || null,
        receivedBy: dispatch.receivedBy || '',
        truckNumber: dispatch.truckNumber || '',
        truckDriver: dispatch.truckDriver || '',
        terminalReviewedAt: dispatch.terminalReviewedAt || null,
      }
    })
    const resolvedPriceBandsPMS = isNoSalesDay ? [] : pmsMultiPrice === 'yes' ? normalizePriceBands(priceBandsPMS) : totalSalesLitersPMS > 0 ? [{ price: Number(formData.pmsPrice), liters: totalSalesLitersPMS }] : []
    const resolvedPriceBandsAGO = isNoSalesDay ? [] : agoMultiPrice === 'yes' ? normalizePriceBands(priceBandsAGO) : totalSalesLitersAGO > 0 ? [{ price: Number(formData.agoPrice), liters: totalSalesLitersAGO }] : []
    const salesAmountPMS = computeSalesAmountFromBands(resolvedPriceBandsPMS)
    const salesAmountAGO = computeSalesAmountFromBands(resolvedPriceBandsAGO)
    const pmsPrice = isNoSalesDay ? 0 : pmsMultiPrice === 'yes' ? weightedAveragePrice(resolvedPriceBandsPMS, sumBandLiters(resolvedPriceBandsPMS)) : Number(formData.pmsPrice || 0)
    const agoPrice = isNoSalesDay ? 0 : agoMultiPrice === 'yes' ? weightedAveragePrice(resolvedPriceBandsAGO, sumBandLiters(resolvedPriceBandsAGO)) : Number(formData.agoPrice || 0)

    const discrepancies = [...buildDiscrepancies(), ...salesDiscrepancies]
    const payload = {
      stationId, openingStockPMS, openingStockAGO, closingStockPMS, closingStockAGO,
      pmsPrice, agoPrice, multiPricing: !isNoSalesDay && (pmsMultiPrice === 'yes' || agoMultiPrice === 'yes'),
      priceBandsPMS: resolvedPriceBandsPMS, priceBandsAGO: resolvedPriceBandsAGO,
      salesAmountPMS, salesAmountAGO, totalSalesAmount: salesAmountPMS + salesAmountAGO,
      receivedProduct: !isNoSalesDay && formData.receivedProduct === 'yes',
      receivedProductType: receivedProductType === 'BOTH' ? null : receivedProductType,
      quantityReceived: receivedQuantity, totalSalesLitersPMS, totalSalesLitersAGO,
      calculatedSalesLitersPMS: totalSalesLitersPMS,
      calculatedSalesLitersAGO: totalSalesLitersAGO,
      managerEnteredSalesLitersPMS,
      managerEnteredSalesLitersAGO,
      rttPMS, rttAGO, expenseItems: effectiveExpenseItems, expenseAmount: totalExpense, expenseDescription,
      remark: isNoSalesDay ? `No Sales Day - ${formData.noSalesReason}${formData.noSalesNote ? `: ${formData.noSalesNote}` : ''}` : formData.remark,
      noSalesDay: isNoSalesDay,
      noSalesReason: isNoSalesDay ? String(formData.noSalesReason || '').trim() : '',
      noSalesNote: isNoSalesDay ? String(formData.noSalesNote || '').trim() : '',
      openingPMS: openingStockPMS, openingAGO: openingStockAGO,
      receivedPMS, receivedAGO, salesPMS: totalSalesLitersPMS, salesAGO: totalSalesLitersAGO,
      productDispatchReceipts,
      remarks: isNoSalesDay ? `No Sales Day - ${formData.noSalesReason}${formData.noSalesNote ? `: ${formData.noSalesNote}` : ''}` : formData.remark,
      paymentBreakdown: normalizedPaymentBreakdown, totalPaymentDeposits, posValue: resolvedPosValue, posTerminalBreakdown: isNoSalesDay ? [] : posTerminalBreakdown,
      cashSales, cashBf: effectiveCashBf, totalAmount, closingBalance, pumpReadings: normalizedPumpReadings,
      discrepancies,
      hasDiscrepancy: discrepancies.length > 0,
      pumpSalesLitersPMS: pumpSalesPMS,
      pumpSalesLitersAGO: pumpSalesAGO,
      dipSalesLitersPMS: dipSalesPMS,
      dipSalesLitersAGO: dipSalesAGO,
      eodAttachments: eodUploads.filter((u) => u.status === 'done').map((u) => ({ label: u.slotLabel, category: u.category, url: u.url, fileName: u.file?.name || '' })),
    }
    if (reportDate) payload.reportDate = reportDate

    try {
      let outcome
      try { outcome = await submitReport(payload) } catch { outcome = { ok: false, error: 'unknown' } }
      if (outcome && outcome.ok === false) {
        const msg = outcome.error === 'duplicate_date' ? 'A report for this date already exists.'
          : outcome.error === 'catch_up_order' ? (outcome.allowedPast ? `Submit the oldest missing day first (${outcome.allowedPast}).` : 'Submit missing past dates in order.')
          : outcome.error === 'sync_failed' ? (outcome.message || 'Could not save to server. Check connection.')
          : 'Could not submit. Try again.'
        setSubmitError(msg); window.alert(msg); return
      }
      setFormData(defaultForm)
      setExpenseDraft({ category: 'Gas', otherLabel: '', amount: '' }); setExpenseItems([])
      setPaymentDraft({ channel: PAYMENT_CHANNEL_OPTIONS[0], otherChannel: '', amount: '' }); setPaymentBreakdown([])
      setPosTerminalAmounts({}); setOtherPosDraft(DEFAULT_OTHER_POS_DRAFT); setOtherPosEntries([])
      setPumpDraft(DEFAULT_PUMP_READING); setPumpReadings([])
      setPmsMultiPrice('no'); setAgoMultiPrice('no')
      setPriceBandDraftPMS(DEFAULT_PRICE_BAND_DRAFT); setPriceBandDraftAGO(DEFAULT_PRICE_BAND_DRAFT)
      setPriceBandsPMS([]); setPriceBandsAGO([])
      setOpeningConfirmed(null); setManualOpening({ pms: '', ago: '' }); setOpeningOverrideReason('')
      setCashBfConfirmed(null); setCashBfOverrideReason('')
      setPriceConfirmed(null); setPumpOpeningStates({}); setPumpOpeningDrafts({})
      setEodUploads([]); setEodInputKeys({}); setExtraSlotIds([])
      setStep(0); setSuccess(true)
      setTimeout(() => setSuccess(false), 2500)
      await Promise.resolve(onSubmitted?.(outcome))
    } finally { setSubmitting(false) }
  }

  if (success) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#a9cd39]/20 border border-[#a9cd39]/30">
          <span className="text-4xl text-[#a9cd39]">✓</span>
        </div>
        <p className="text-2xl font-bold text-white">Report Submitted!</p>
        <p className="text-sm text-slate-500">Your daily report has been saved successfully.</p>
      </div>
    )
  }


  // Step 0 — Did you sell today?
  const renderStep0 = () => (
    <div className="flex min-h-[70vh] flex-col">
      <StepHeader label={steps[0]} current={1} total={totalSteps} />

      {reportDate && (
        <div className="mb-6 inline-flex items-center gap-2 rounded-lg border border-white/5 bg-white/5 px-3 py-1.5 text-xs text-slate-400 self-start">
          <span className="h-1.5 w-1.5 rounded-full bg-[#a9cd39]" />
          Filing for <span className="font-semibold text-white">{reportDate}</span>
        </div>
      )}

      <div className="flex-1 flex flex-col justify-center">
        <p className="text-2xl font-bold text-white mb-2">Did the station sell today?</p>
        <p className="text-sm text-slate-500 mb-8">Select one to continue</p>

        <div className="space-y-3">
          {/* Yes — sold */}
          <button
            type="button"
            onClick={() => setFormData((prev) => ({ ...prev, noSalesDay: 'no' }))}
            className={`w-full flex items-center gap-4 rounded-2xl border-2 p-5 text-left transition-all ${
              formData.noSalesDay === 'no'
                ? 'border-[#a9cd39] bg-[#a9cd39]/10'
                : 'border-white/8 bg-white/3 hover:border-[#a9cd39]/30 hover:bg-[#a9cd39]/5'
            }`}
          >
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl ${formData.noSalesDay === 'no' ? 'bg-[#a9cd39]/20' : 'bg-white/5'}`}>
              ⛽
            </div>
            <div>
              <p className={`font-bold text-base ${formData.noSalesDay === 'no' ? 'text-[#a9cd39]' : 'text-white'}`}>Yes, we sold today</p>
              <p className="text-xs text-slate-500 mt-0.5">Continue to full daily report</p>
            </div>
            {formData.noSalesDay === 'no' && (
              <span className="ml-auto text-[#a9cd39] text-lg">✓</span>
            )}
          </button>

          {/* No sales */}
          <button
            type="button"
            onClick={() => setFormData((prev) => ({ ...prev, noSalesDay: 'yes' }))}
            className={`w-full flex items-center gap-4 rounded-2xl border-2 p-5 text-left transition-all ${
              formData.noSalesDay === 'yes'
                ? 'border-red-500/60 bg-red-500/10'
                : 'border-white/8 bg-white/3 hover:border-red-500/20 hover:bg-red-500/5'
            }`}
          >
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl ${formData.noSalesDay === 'yes' ? 'bg-red-500/20' : 'bg-white/5'}`}>
              🚫
            </div>
            <div>
              <p className={`font-bold text-base ${formData.noSalesDay === 'yes' ? 'text-red-400' : 'text-white'}`}>No sales today</p>
              <p className="text-xs text-slate-500 mt-0.5">Station did not sell — stock carries forward</p>
            </div>
            {formData.noSalesDay === 'yes' && (
              <span className="ml-auto text-red-400 text-lg">✓</span>
            )}
          </button>
        </div>
      </div>

      <NavButtons onNext={() => setStep(1)} />
    </div>
  )

  // No sales path — Step 1
  const renderNoSalesStep = () => (
    <div className="flex min-h-[70vh] flex-col">
      <StepHeader label={steps[1]} current={2} total={totalSteps} />
      <p className="text-2xl font-bold text-white mb-1">Why no sales?</p>
      <p className="text-sm text-slate-500 mb-8">Stock and cash will carry forward to tomorrow</p>
      <div className="flex-1 space-y-4">
        <label className="block space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Reason</span>
          <CustomSelect
            fullWidth
            value={formData.noSalesReason}
            onChange={(val) => setFormData((prev) => ({ ...prev, noSalesReason: val }))}
            options={[{ value: 'Sunday', label: 'Sunday' }, { value: 'Public Holiday', label: 'Public Holiday' }, { value: 'Station Closed', label: 'Station Closed' }, { value: 'Maintenance', label: 'Maintenance' }, { value: 'Other', label: 'Other' }]}
            placeholder="Select reason..."
          />
        </label>
        <label className="block space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Additional Note (Optional)</span>
          <input
            value={formData.noSalesNote}
            onChange={(e) => setFormData((prev) => ({ ...prev, noSalesNote: e.target.value }))}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-[#a9cd39]/40"
            placeholder="Add extra context..."
          />
        </label>
        {submitError && <p className="text-sm text-rose-400">{submitError}</p>}
      </div>
      <NavButtons onBack={() => setStep(0)} onNext={() => handleSubmit()} nextLabel={submitButtonLabel} submitting={submitting} />
    </div>
  )

  // Step 1 (normal) — Stock Readings with opening confirmation
  const renderStockStep = () => {
    const hasPrior = hasCarriedOpening

    return (
      <div>
        <StepHeader label={steps[1]} current={2} total={totalSteps} />

        {/* First report — enter opening baseline */}
        {isFirstReport && (
          <div className="mb-4 rounded-xl border border-[#a9cd39]/30 bg-[#a9cd39]/10 px-4 py-3">
            <p className="text-sm font-semibold text-[#a9cd39]">First Report</p>
            <p className="mt-0.5 text-xs text-slate-400">Enter your opening stock to set the baseline for this station.</p>
          </div>
        )}

        {/* Confirm yesterday's closing as today's opening */}
        {hasPrior && openingConfirmed === null && (
          <div className="mb-5 rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm font-semibold text-white mb-1">Opening Stock Confirmation</p>
            <p className="text-xs text-slate-400 mb-3">Yesterday you closed at:</p>
            <div className="flex gap-4 mb-4">
              <div className="flex-1 rounded-xl bg-[#a9cd39]/10 border border-[#a9cd39]/20 px-3 py-2 text-center">
                <p className="text-xs uppercase tracking-wider text-slate-400">PMS</p>
                <p className="text-lg font-bold text-[#a9cd39]">{Number(carriedOpening.pms).toLocaleString()} L</p>
              </div>
              <div className="flex-1 rounded-xl bg-[#a9cd39]/10 border border-[#a9cd39]/20 px-3 py-2 text-center">
                <p className="text-xs uppercase tracking-wider text-slate-400">AGO</p>
                <p className="text-lg font-bold text-[#a9cd39]">{Number(carriedOpening.ago).toLocaleString()} L</p>
              </div>
            </div>
            <p className="text-xs text-slate-400 mb-3">Is this correct as your opening stock today?</p>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setOpeningConfirmed(true)}
                className="rounded-xl border-2 border-[#a9cd39]/40 bg-[#a9cd39]/10 py-2.5 text-sm font-semibold text-[#a9cd39] hover:bg-[#a9cd39]/20 transition">
                ✓ Yes, use this
              </button>
              <button type="button" onClick={() => setOpeningConfirmed(false)}
                className="rounded-xl border-2 border-white/10 bg-white/5 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/10 transition">
                ✗ No, enter manually
              </button>
            </div>
          </div>
        )}

        {/* Confirmed — show locked opening */}
        {hasPrior && openingConfirmed === true && (
          <div className="mb-4 rounded-xl border border-[#a9cd39]/20 bg-[#a9cd39]/5 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400">Opening stock (from yesterday)</p>
              <p className="text-sm font-semibold text-white mt-0.5">
                PMS: <span className="text-[#a9cd39]">{Number(carriedOpening.pms).toLocaleString()} L</span>
                {' · '}AGO: <span className="text-[#a9cd39]">{Number(carriedOpening.ago).toLocaleString()} L</span>
              </p>
            </div>
            <button type="button" onClick={() => setOpeningConfirmed(null)} className="text-xs text-slate-500 hover:text-slate-300 underline">Change</button>
          </div>
        )}

        {/* Manual override */}
        {(openingConfirmed === false || isFirstReport) && (
          <div className="mb-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {isFirstReport ? 'Opening Stock (Baseline)' : 'Enter Correct Opening Stock'}
            </p>
            <FormInput type="number" min="0" label="Opening PMS (L)" value={manualOpening.pms}
              onChange={(e) => setManualOpening((prev) => ({ ...prev, pms: e.target.value }))} />
            <FormInput type="number" min="0" label="Opening AGO (L)" value={manualOpening.ago}
              onChange={(e) => setManualOpening((prev) => ({ ...prev, ago: e.target.value }))} />
            {!isFirstReport && (
              <div className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">Reason for discrepancy *</span>
                <textarea
                  value={openingOverrideReason}
                  onChange={(e) => setOpeningOverrideReason(e.target.value)}
                  placeholder="e.g. Physical dip reading differs from system calculation"
                  rows={2}
                  className="w-full rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none resize-none"
                />
                <p className="text-xs text-amber-500/70">This will flag the report for supervisor review.</p>
              </div>
            )}
          </div>
        )}

        {/* Closing stock + RTT — always shown once opening is resolved */}
        {(openingConfirmed !== null || isFirstReport) && (
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Closing Tank Dip & RTT</p>
            {[
              { name: 'closingStockPMS', label: 'Closing Stock PMS (L)' },
              { name: 'closingStockAGO', label: 'Closing Stock AGO (L)' },
              { name: 'rttPMS', label: 'RTT PMS (L)' },
              { name: 'rttAGO', label: 'RTT AGO (L)' },
            ].map((field) => (
              <FormInput key={field.name} type="number" min="0" required label={field.label}
                value={formData[field.name]}
                onChange={(e) => setFormData((prev) => ({ ...prev, [field.name]: e.target.value }))} />
            ))}

            {(formData.closingStockPMS || formData.closingStockAGO) && (
              <div className="rounded-xl bg-white/5 border border-white/5 px-4 py-3 text-sm">
                <p className="text-xs text-slate-400 mb-1">Computed Sales Today</p>
                <p className="font-bold text-white">
                  PMS: <span className="text-[#a9cd39]">{previewSales.pms.toLocaleString()} L</span>
                  {' · '}AGO: <span className="text-[#a9cd39]">{previewSales.ago.toLocaleString()} L</span>
                </p>
              </div>
            )}
          </div>
        )}

        <NavButtons
          onBack={() => setStep(0)}
          onNext={() => {
            if (openingConfirmed === null && !isFirstReport && hasPrior) { window.alert('Please confirm your opening stock first.'); return }
            if ((isFirstReport || openingConfirmed === false) && !manualOpening.pms.trim()) { window.alert('Enter opening PMS stock.'); return }
            if (!isFirstReport && openingConfirmed === false && !openingOverrideReason.trim()) { window.alert('Please provide a reason for the opening stock discrepancy.'); return }
            if (!formData.closingStockPMS.trim() || !formData.closingStockAGO.trim()) { window.alert('Enter closing stock for both PMS and AGO.'); return }
            setStep(2)
          }}
        />
      </div>
    )
  }

  // Step 2 — Pricing
  const renderManagerSalesStep = () => (
    <div className="flex min-h-[70vh] flex-col">
      <StepHeader label={steps[2]} current={3} total={totalSteps} />
      <p className="text-2xl font-bold text-white mb-1">Sales Quantity</p>
      <p className="text-sm text-slate-500 mb-6">Enter the litres you recorded for today.</p>
      <div className="flex-1 space-y-4">
        <div className="rounded-2xl border border-[#a9cd39]/15 bg-[#a9cd39]/5 p-4">
          <p className="text-xs font-black uppercase tracking-widest text-[#a9cd39]">Manager reference</p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormInput
              type="number"
              min="0"
              label="PMS sold by manager (L)"
              value={formData.managerSalesPMS}
              onChange={(e) => setFormData((prev) => ({ ...prev, managerSalesPMS: e.target.value }))}
            />
            <FormInput
              type="number"
              min="0"
              label="AGO sold by manager (L)"
              value={formData.managerSalesAGO}
              onChange={(e) => setFormData((prev) => ({ ...prev, managerSalesAGO: e.target.value }))}
            />
          </div>
        </div>
      </div>
      <NavButtons
        onBack={() => setStep(1)}
        onNext={() => {
          if (formData.managerSalesPMS === '' || formData.managerSalesAGO === '') {
            window.alert('Enter your PMS and AGO total sales litres.')
            return
          }
          setStep(3)
        }}
      />
    </div>
  )

  const hasPriorPrices = !isFirstReport && (priorPrices.pms > 0 || priorPrices.ago > 0)
  const renderPricingStep = () => (
    <div className="flex min-h-[70vh] flex-col">
      <StepHeader label={steps[3]} current={4} total={totalSteps} />
      <p className="text-2xl font-bold text-white mb-1">Product Pricing</p>
      <p className="text-sm text-slate-500 mb-4">Set today's selling price per litre</p>

      {/* Price confirmation from yesterday */}
      {hasPriorPrices && priceConfirmed === null && (
        <div className="mb-5 rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm font-semibold text-white mb-1">Yesterday's Prices</p>
          <p className="text-xs text-slate-400 mb-3">On {priorPrices.date} you sold at:</p>
          <div className="flex gap-3 mb-4">
            <div className="flex-1 rounded-xl bg-[#a9cd39]/10 border border-[#a9cd39]/20 px-3 py-2 text-center">
              <p className="text-xs uppercase tracking-wider text-slate-400">PMS</p>
              <p className="text-lg font-bold text-[#a9cd39]">₦{Number(priorPrices.pms).toLocaleString()}/L</p>
            </div>
            <div className="flex-1 rounded-xl bg-[#a9cd39]/10 border border-[#a9cd39]/20 px-3 py-2 text-center">
              <p className="text-xs uppercase tracking-wider text-slate-400">AGO</p>
              <p className="text-lg font-bold text-[#a9cd39]">₦{Number(priorPrices.ago).toLocaleString()}/L</p>
            </div>
          </div>
          <p className="text-xs text-slate-400 mb-3">Are today's prices the same?</p>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => {
              setPriceConfirmed(true)
              setFormData((prev) => ({ ...prev, pmsPrice: String(priorPrices.pms), agoPrice: String(priorPrices.ago) }))
            }} className="rounded-xl border-2 border-[#a9cd39]/40 bg-[#a9cd39]/10 py-2.5 text-sm font-semibold text-[#a9cd39] hover:bg-[#a9cd39]/20 transition">
              ✓ Same prices
            </button>
            <button type="button" onClick={() => setPriceConfirmed(false)}
              className="rounded-xl border-2 border-white/10 bg-white/5 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/10 transition">
              ✗ Prices changed
            </button>
          </div>
        </div>
      )}

      {/* Locked prices */}
      {hasPriorPrices && priceConfirmed === true && (
        <div className="mb-4 rounded-xl border border-[#a9cd39]/20 bg-[#a9cd39]/5 px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">Today's prices (same as yesterday)</p>
            <p className="text-sm font-semibold text-white mt-0.5">
              PMS: <span className="text-[#a9cd39]">₦{Number(priorPrices.pms).toLocaleString()}/L</span>
              {' · '}AGO: <span className="text-[#a9cd39]">₦{Number(priorPrices.ago).toLocaleString()}/L</span>
            </p>
          </div>
          <button type="button" onClick={() => { setPriceConfirmed(null); setFormData((prev) => ({ ...prev, pmsPrice: '', agoPrice: '' })) }} className="text-xs text-slate-500 hover:text-slate-300 underline">Change</button>
        </div>
      )}

      {/* Price entry — shown when: first report, no prior prices, or manager said prices changed */}
      {(isFirstReport || priceConfirmed === false || (priceConfirmed === null && !hasPriorPrices)) && (
        <div className="flex-1 space-y-5 overflow-y-auto">
          <ProductPriceSection productLabel="PMS" multiPrice={pmsMultiPrice} onMultiPriceChange={setPmsMultiPrice} singlePrice={formData.pmsPrice} onSinglePriceChange={(v) => setFormData((prev) => ({ ...prev, pmsPrice: v }))} bands={priceBandsPMS} bandDraft={priceBandDraftPMS} onBandDraftChange={setPriceBandDraftPMS} onAddBand={() => handleAddPriceBand('pms')} onRemoveBand={(id) => setPriceBandsPMS((prev) => prev.filter((b) => b.id !== id))} totalSalesLiters={previewSales.pms} />
          <ProductPriceSection productLabel="AGO" multiPrice={agoMultiPrice} onMultiPriceChange={setAgoMultiPrice} singlePrice={formData.agoPrice} onSinglePriceChange={(v) => setFormData((prev) => ({ ...prev, agoPrice: v }))} bands={priceBandsAGO} bandDraft={priceBandDraftAGO} onBandDraftChange={setPriceBandDraftAGO} onAddBand={() => handleAddPriceBand('ago')} onRemoveBand={(id) => setPriceBandsAGO((prev) => prev.filter((b) => b.id !== id))} totalSalesLiters={previewSales.ago} />
        </div>
      )}

      <NavButtons onBack={() => setStep(2)} onNext={() => {
        if (hasPriorPrices && priceConfirmed === null) { window.alert('Please confirm today\'s prices first.'); return }
        if (pmsMultiPrice === 'no' && !formData.pmsPrice.trim()) { window.alert('PMS price is required.'); return }
        if (agoMultiPrice === 'no' && !formData.agoPrice.trim()) { window.alert('AGO price is required.'); return }
        setStep(hasReceivedDispatches ? 5 : 4)
      }} />
    </div>
  )

  // Step 3 — Received Product
  const renderReceivedStep = () => (
    <div className="flex min-h-[70vh] flex-col">
      <StepHeader label={steps[4]} current={5} total={totalSteps} />
      <p className="text-2xl font-bold text-white mb-1">Received Product?</p>
      <p className="text-sm text-slate-500 mb-8">Did the station receive any fuel delivery today?</p>
      <div className="flex-1 space-y-3">
        {receivedDispatches.length > 0 && (
          <div className="rounded-2xl border border-[#a9cd39]/25 bg-[#a9cd39]/8 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a9cd39]">Terminal dispatch</p>
            <p className="mt-1 text-sm text-slate-200">This delivery will enter today&apos;s report.</p>
            <div className="mt-3 space-y-2">
              {receivedDispatches.map((dispatch) => {
                const productType = dispatch.approvedProductType || dispatch.requestedProductType || 'Product'
                const liters = Number(dispatch.approvedLiters || dispatch.requestedLiters || 0)
                const tankDip = Number(dispatch.receivedTankDip || 0)
                return (
                  <div key={dispatch.id} className="rounded-xl border border-white/8 bg-black/20 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-bold text-white">{productType}</span>
                      <span className="font-bold text-[#a9cd39]">{liters.toLocaleString()} L</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3 text-xs text-slate-400">
                      <span>Tank dip after delivery</span>
                      <span className="text-slate-200">{tankDip.toLocaleString()} L</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        <button type="button" onClick={() => setFormData((prev) => ({ ...prev, receivedProduct: 'no' }))}
          className={`w-full flex items-center gap-4 rounded-2xl border-2 p-5 text-left transition-all ${formData.receivedProduct === 'no' ? 'border-white/20 bg-white/8' : 'border-white/5 bg-white/3 hover:border-white/10'}`}>
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl ${formData.receivedProduct === 'no' ? 'bg-white/15' : 'bg-white/5'}`}>🚫</div>
          <div>
            <p className={`font-bold text-base ${formData.receivedProduct === 'no' ? 'text-white' : 'text-slate-300'}`}>No delivery</p>
            <p className="text-xs text-slate-500 mt-0.5">No product received today</p>
          </div>
          {formData.receivedProduct === 'no' && <span className="ml-auto text-white text-lg">✓</span>}
        </button>
        <button type="button" onClick={() => setFormData((prev) => ({ ...prev, receivedProduct: 'yes' }))}
          className={`w-full flex items-center gap-4 rounded-2xl border-2 p-5 text-left transition-all ${formData.receivedProduct === 'yes' ? 'border-[#a9cd39] bg-[#a9cd39]/10' : 'border-white/5 bg-white/3 hover:border-[#a9cd39]/20 hover:bg-[#a9cd39]/5'}`}>
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl ${formData.receivedProduct === 'yes' ? 'bg-[#a9cd39]/20' : 'bg-white/5'}`}>🛢️</div>
          <div>
            <p className={`font-bold text-base ${formData.receivedProduct === 'yes' ? 'text-[#a9cd39]' : 'text-slate-300'}`}>Yes, received product</p>
            <p className="text-xs text-slate-500 mt-0.5">Enter quantities below</p>
          </div>
          {formData.receivedProduct === 'yes' && <span className="ml-auto text-[#a9cd39] text-lg">✓</span>}
        </button>
        {formData.receivedProduct === 'yes' && (
          <div className="space-y-3 pt-2">
            <FormInput type="number" min="0" label="Received PMS (L)" value={formData.receivedQuantityPMS} onChange={(e) => setFormData((prev) => ({ ...prev, receivedQuantityPMS: e.target.value }))} />
            <FormInput type="number" min="0" label="Received AGO (L)" value={formData.receivedQuantityAGO} onChange={(e) => setFormData((prev) => ({ ...prev, receivedQuantityAGO: e.target.value }))} />
          </div>
        )}
      </div>
      <NavButtons onBack={() => setStep(3)} onNext={() => { if (formData.receivedProduct === 'yes' && Number(formData.receivedQuantityPMS || 0) <= 0 && Number(formData.receivedQuantityAGO || 0) <= 0) { window.alert('Enter at least one received quantity.'); return } setStep(5) }} />
    </div>
  )

  // Step 4 — Expenses
  const renderExpensesStep = () => (
    <div className="flex min-h-[70vh] flex-col">
      <StepHeader label={steps[5]} current={6} total={totalSteps} />
      <p className="text-2xl font-bold text-white mb-1">Expenses</p>
      <p className="text-sm text-slate-500 mb-6">Log any expenses incurred today</p>
      {reportingConfiguration.expenseLineItemsEnabled ? (
        <div className="flex-1 space-y-3">
          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Expense Type</span>
            <CustomSelect
              value={expenseDraft.category}
              onChange={(val) => setExpenseDraft((prev) => ({ ...prev, category: val, otherLabel: '' }))}
              options={toOpts(EXPENSE_OPTIONS)}
            />
          </div>
          {expenseDraft.category === 'Other' && <FormInput label="Expense Description" value={expenseDraft.otherLabel} onChange={(e) => setExpenseDraft((prev) => ({ ...prev, otherLabel: e.target.value }))} />}
          <FormInput type="number" min="0" label="Amount (NGN)" value={expenseDraft.amount} onChange={(e) => setExpenseDraft((prev) => ({ ...prev, amount: e.target.value }))} />
          <button type="button" onClick={handleAddExpense} className="w-full rounded-xl border border-[#a9cd39]/20 bg-[#a9cd39]/5 py-3 text-sm font-semibold text-[#a9cd39] hover:bg-[#a9cd39]/10 transition">+ Add Expense</button>
          <div className="space-y-2">
            {!expenseItems.length && <p className="text-sm text-slate-600">No expenses added yet.</p>}
            {expenseItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-3 py-2.5 text-sm">
                <span className="text-slate-200">{item.label} — NGN {item.amount.toLocaleString()}</span>
                <button type="button" onClick={() => setExpenseItems((prev) => prev.filter((x) => x.id !== item.id))} className="text-rose-400 font-semibold">✕</button>
              </div>
            ))}
            {expenseItems.length > 0 && <p className="text-sm font-bold text-[#a9cd39]">Total: NGN {expenseItems.reduce((s, i) => s + i.amount, 0).toLocaleString()}</p>}
          </div>
        </div>
      ) : <p className="text-sm text-slate-500 flex-1">Expense reporting is disabled in settings.</p>}
      <NavButtons onBack={() => setStep(hasReceivedDispatches ? 3 : 4)} onNext={() => setStep(6)} />
    </div>
  )

  // Step 5 — Cash Movement
  const hasPriorCashBf = !isFirstReport && Number(carriedCashBf) > 0
  const renderCashStep = () => (
    <div className="flex min-h-[70vh] flex-col">
      <StepHeader label={steps[6]} current={7} total={totalSteps} />
      <p className="text-2xl font-bold text-white mb-1">Cash Movement</p>
      <p className="text-sm text-slate-500 mb-4">
        {isFirstReport ? 'Enter your baseline cash figures' : "Enter today's cash figures"}
      </p>
      <div className="flex-1 space-y-4">
        {isFirstReport ? (
          <>
            <div className="rounded-xl border border-[#a9cd39]/20 bg-[#a9cd39]/5 px-4 py-3 text-xs text-[#a9cd39]">
              First report — enter the actual cash on hand to set your baseline.
            </div>
            <FormInput type="number" min="0" label="Cash Brought Forward (NGN)" value={formData.cashBfOverride ?? ''} onChange={(e) => setFormData((prev) => ({ ...prev, cashBfOverride: e.target.value }))} />
            <FormInput type="number" min="0" label="Cash Sales (NGN)" value={formData.cashSales} onChange={(e) => setFormData((prev) => ({ ...prev, cashSales: e.target.value }))} />
            <FormInput type="number" min="0" label="Closing Balance (NGN)" value={formData.closingBalanceOverride ?? ''} onChange={(e) => setFormData((prev) => ({ ...prev, closingBalanceOverride: e.target.value }))} />
          </>
        ) : (
          <>
            {/* Cash B/F confirmation */}
            {hasPriorCashBf && cashBfConfirmed === null && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-semibold text-white mb-1">Cash Brought Forward</p>
                <p className="text-xs text-slate-400 mb-3">Yesterday's closing balance was:</p>
                <div className="rounded-xl bg-[#a9cd39]/10 border border-[#a9cd39]/20 px-4 py-3 text-center mb-4">
                  <p className="text-3xl font-bold text-[#a9cd39]">NGN {Number(carriedCashBf).toLocaleString()}</p>
                </div>
                <p className="text-xs text-slate-400 mb-3">Is this correct as today's Cash B/F?</p>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => setCashBfConfirmed(true)}
                    className="rounded-xl border-2 border-[#a9cd39]/40 bg-[#a9cd39]/10 py-2.5 text-sm font-semibold text-[#a9cd39] hover:bg-[#a9cd39]/20 transition">
                    ✓ Yes, correct
                  </button>
                  <button type="button" onClick={() => setCashBfConfirmed(false)}
                    className="rounded-xl border-2 border-white/10 bg-white/5 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/10 transition">
                    ✗ No, it differs
                  </button>
                </div>
              </div>
            )}

            {/* Locked Cash B/F */}
            {hasPriorCashBf && cashBfConfirmed === true && (
              <div className="rounded-2xl border border-[#a9cd39]/20 bg-[#a9cd39]/5 px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Cash B/F (confirmed)</p>
                  <p className="text-3xl font-bold text-[#a9cd39] mt-1">NGN {Number(carriedCashBf).toLocaleString()}</p>
                </div>
                <button type="button" onClick={() => setCashBfConfirmed(null)} className="text-xs text-slate-500 hover:text-slate-300 underline">Change</button>
              </div>
            )}

            {/* Cash B/F override */}
            {cashBfConfirmed === false && (
              <div className="space-y-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <p className="text-xs text-amber-400 font-semibold">Enter actual Cash B/F</p>
                <FormInput type="number" min="0" label="Cash Brought Forward (NGN)" value={formData.cashBfOverride ?? ''} onChange={(e) => setFormData((prev) => ({ ...prev, cashBfOverride: e.target.value }))} />
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">Reason for discrepancy *</span>
                  <textarea
                    value={cashBfOverrideReason}
                    onChange={(e) => setCashBfOverrideReason(e.target.value)}
                    placeholder="e.g. Previous balance was corrected during reconciliation"
                    rows={2}
                    className="w-full rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none resize-none"
                  />
                  <p className="text-xs text-amber-500/70">This will flag the report for supervisor review.</p>
                </div>
              </div>
            )}

            {/* Sales fields — show once B/F is resolved */}
            {(cashBfConfirmed !== null || !hasPriorCashBf) && (
              <>
                <FormInput type="number" min="0" label="Cash Sales (NGN)" value={formData.cashSales} onChange={(e) => setFormData((prev) => ({ ...prev, cashSales: e.target.value }))} />
                {formData.cashSales && (
                  <div className="rounded-xl border border-[#a9cd39]/15 bg-[#a9cd39]/5 px-4 py-3">
                    <p className="text-xs text-slate-400">Total Cash (B/F + Sales)</p>
                    <p className="text-lg font-bold text-[#a9cd39]">NGN {(effectiveCashBf + Number(formData.cashSales || 0)).toLocaleString()}</p>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
      <NavButtons onBack={() => setStep(5)} onNext={() => {
        if (!isFirstReport && hasPriorCashBf && cashBfConfirmed === null) { window.alert('Please confirm your Cash B/F first.'); return }
        if (!isFirstReport && cashBfConfirmed === false && !cashBfOverrideReason.trim()) { window.alert('Please provide a reason for the Cash B/F discrepancy.'); return }
        setStep(7)
      }} />
    </div>
  )

  // Step 6 — Payment Breakdown
  const renderPosTerminalStep = () => (
    <div className="flex min-h-[70vh] flex-col">
      <StepHeader label={steps[7]} current={8} total={totalSteps} />
      <p className="text-2xl font-bold text-white mb-1">POS Terminals</p>
      <p className="text-sm text-slate-500 mb-6">Enter POS collections per terminal assigned to this station.</p>
      <div className="flex-1 space-y-3">
        {!assignedPosTerminals.length ? (
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
            <p className="text-sm font-bold text-amber-300">No POS terminal assigned to this station.</p>
            <p className="mt-1 text-xs text-slate-400">Use Other POS below if a terminal was used today.</p>
          </div>
        ) : (
          assignedPosTerminals.map((terminal) => (
            <div key={terminal.tid} className="rounded-2xl border border-white/8 bg-white/[0.04] p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-[#a9cd39]">{terminal.bank}</p>
                  <p className="mt-1 text-base font-bold text-white">{terminal.tid}</p>
                </div>
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-slate-300">Assigned</span>
              </div>
              <FormInput
                type="number"
                min="0"
                label="POS Amount (NGN)"
                value={posTerminalAmounts[terminal.tid] || ''}
                onChange={(e) => setPosTerminalAmounts((prev) => ({ ...prev, [terminal.tid]: e.target.value }))}
              />
            </div>
          ))
        )}
        <div className="rounded-2xl border border-dashed border-[#a9cd39]/25 bg-[#a9cd39]/5 p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-[#a9cd39]">Other POS</p>
              <p className="mt-1 text-sm text-slate-400">Use this if the POS terminal is not listed.</p>
            </div>
            <span className="rounded-full bg-amber-400/10 px-2.5 py-1 text-[11px] font-bold text-amber-300">Unmapped</span>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_0.8fr_auto] md:items-end">
            <FormInput
              label="POS Terminal ID / Name"
              value={otherPosDraft.terminalId}
              onChange={(e) => setOtherPosDraft((prev) => ({ ...prev, terminalId: e.target.value }))}
            />
            <FormInput
              type="number"
              min="0"
              label="Amount (NGN)"
              value={otherPosDraft.amount}
              onChange={(e) => setOtherPosDraft((prev) => ({ ...prev, amount: e.target.value }))}
            />
            <button
              type="button"
              onClick={addOtherPosEntry}
              disabled={!String(otherPosDraft.terminalId || '').trim() || Number(otherPosDraft.amount || 0) <= 0}
              className="rounded-xl border border-[#a9cd39]/25 bg-[#a9cd39]/10 px-4 py-3 text-sm font-black text-[#a9cd39] transition hover:bg-[#a9cd39]/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add
            </button>
          </div>
          {otherPosEntries.length > 0 && (
            <div className="mt-3 space-y-2">
              {otherPosEntries.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/20 px-3 py-2.5 text-sm">
                  <span className="min-w-0 truncate text-slate-200">{entry.terminalId} - NGN {Number(entry.amount || 0).toLocaleString()}</span>
                  <button
                    type="button"
                    onClick={() => setOtherPosEntries((prev) => prev.filter((item) => item.id !== entry.id))}
                    className="shrink-0 text-sm font-bold text-rose-400"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 rounded-2xl border border-[#a9cd39]/20 bg-[#a9cd39]/5 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">POS Total</p>
        <p className="mt-1 text-2xl font-black text-[#a9cd39]">NGN {posValue.toLocaleString()}</p>
      </div>
      <NavButtons onBack={() => setStep(6)} onNext={() => setStep(8)} />
    </div>
  )

  const renderPaymentsStep = () => (
    <div className="flex min-h-[70vh] flex-col">
      <StepHeader label={steps[8]} current={9} total={totalSteps} />
      <p className="text-2xl font-bold text-white mb-1">Bank Deposits</p>
      <p className="text-sm text-slate-500 mb-6">Record payments made to bank channels</p>
      <div className="flex-1 space-y-3">
        <div className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Bank / Channel</span>
          <CustomSelect
            value={paymentDraft.channel}
            onChange={(val) => setPaymentDraft((prev) => ({ ...prev, channel: val, otherChannel: val === 'Other' ? prev.otherChannel : '' }))}
            options={toOpts(PAYMENT_CHANNEL_OPTIONS)}
          />
        </div>
        {paymentDraft.channel === 'Other' && <FormInput label="Bank/Channel Name" value={paymentDraft.otherChannel} onChange={(e) => setPaymentDraft((prev) => ({ ...prev, otherChannel: e.target.value }))} />}
        <FormInput type="number" min="0" label="Amount (NGN)" value={paymentDraft.amount} onChange={(e) => setPaymentDraft((prev) => ({ ...prev, amount: e.target.value }))} />
        <button type="button" onClick={handleAddPaymentLine} className="w-full rounded-xl border border-[#a9cd39]/20 bg-[#a9cd39]/5 py-3 text-sm font-semibold text-[#a9cd39] hover:bg-[#a9cd39]/10 transition">+ Add Payment</button>
        <div className="space-y-2">
          {!paymentBreakdown.length && <p className="text-sm text-slate-600">No entries yet.</p>}
          {paymentBreakdown.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-3 py-2.5 text-sm">
              <span className="text-slate-200">{item.channel} - NGN {item.amount.toLocaleString()}</span>
              <button type="button" onClick={() => setPaymentBreakdown((prev) => prev.filter((x) => x.id !== item.id))} className="text-rose-400 font-semibold">x</button>
            </div>
          ))}
          {paymentBreakdown.length > 0 && <p className="text-sm font-bold text-[#a9cd39]">Total: NGN {paymentBreakdown.reduce((s, i) => s + i.amount, 0).toLocaleString()}</p>}
        </div>
      </div>
      <NavButtons onBack={() => setStep(7)} onNext={() => setStep(9)} />
    </div>
  )

  // Step 7 — Bank EOD Uploads
  const renderEodStep = () => {
    // Sync upload slots with current payment breakdown on first render
    // Define all slots (banks + expenses + any extra added manually)
    const fixedSlots = [
      ...paymentBreakdown.map((item) => ({ slotId: `bank-${item.id}`, slotLabel: item.channel, category: 'Bank' })),
      ...posTerminalBreakdown.map((item) => ({ slotId: `pos-${item.terminalId}`, slotLabel: item.label, category: 'POS' })),
      ...expenseItems.map((item) => ({ slotId: `exp-${item.id}`, slotLabel: item.label, category: 'Expense' })),
    ]
    const extraSlots = extraSlotIds.map((sid) => ({ slotId: sid, slotLabel: 'Extra Document', category: 'Extra' }))
    const allSlots = [...fixedSlots, ...extraSlots]

    const addFile = async (slotId, slotLabel, category, file) => {
      if (!file) return
      const fileId = `${slotId}-${Date.now()}`
      setEodUploads((prev) => [...prev, { fileId, slotId, slotLabel, category, file, url: '', status: 'idle', error: '' }])
      // Reset the input so the same file can be re-selected
      setEodInputKeys((prev) => ({ ...prev, [slotId]: Date.now() }))
      await uploadEodFile(fileId, file)
    }

    const removeFile = (fileId) => setEodUploads((prev) => prev.filter((u) => u.fileId !== fileId))

    const SlotCard = ({ slotId, slotLabel, category }) => {
      const files = eodUploads.filter((u) => u.slotId === slotId)
      const inputId = `eod-${slotId}`
      const inputKey = eodInputKeys[slotId] || slotId
      const anyUploading = files.some((f) => f.status === 'uploading')
      const badgeCls = category === 'Bank'
        ? 'bg-blue-500/15 text-blue-400'
        : category === 'POS'
          ? 'bg-[#a9cd39]/15 text-[#a9cd39]'
        : category === 'Expense'
          ? 'bg-purple-500/15 text-purple-400'
          : 'bg-white/10 text-slate-400'

      return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
          {/* Slot header */}
          <div className="flex items-center gap-2">
            <span className={`text-xs rounded-full px-2 py-0.5 font-semibold ${badgeCls}`}>{category}</span>
            <p className="text-sm font-semibold text-white">{slotLabel}</p>
            <span className="ml-auto text-xs text-slate-500">{files.filter((f) => f.status === 'done').length} uploaded</span>
          </div>

          {/* Uploaded files list */}
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
              <button type="button" onClick={() => removeFile(f.fileId)} className="ml-2 shrink-0 text-slate-500 hover:text-rose-400 transition text-sm">✕</button>
            </div>
          ))}

          {/* Add file button */}
          <label htmlFor={inputId} className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed py-3 text-sm transition ${anyUploading ? 'border-white/10 text-slate-600 cursor-not-allowed' : 'border-white/20 text-slate-400 hover:border-[#a9cd39]/40 hover:text-[#a9cd39]'}`}>
            <span>📎</span>
            <span>{files.length === 0 ? 'Tap to upload' : '+ Add another file'}</span>
          </label>
          <input
            id={inputId}
            key={inputKey}
            type="file"
            accept="image/*,application/pdf"
            disabled={anyUploading}
            onChange={(e) => addFile(slotId, slotLabel, category, e.target.files?.[0])}
            className="hidden"
          />
        </div>
      )
    }

    return (
      <div className="flex min-h-[70vh] flex-col">
        <StepHeader label={steps[9]} current={10} total={totalSteps} />
        <p className="text-2xl font-bold text-white mb-1">EOD Documents</p>
        <p className="text-sm text-slate-500 mb-5">Upload as many files as needed per bank or expense entry</p>

        <div className="flex-1 space-y-3 overflow-y-auto">
          {allSlots.length === 0 && (
            <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-6 text-center text-sm text-slate-500">
              No bank or expense entries yet. Use the button below to add documents manually.
            </div>
          )}

          {allSlots.map((slot) => (
            <SlotCard key={slot.slotId} slotId={slot.slotId} slotLabel={slot.slotLabel} category={slot.category} />
          ))}

          {/* Add a brand new extra slot */}
          <button
            type="button"
            onClick={() => setExtraSlotIds((prev) => [...prev, `extra-${Date.now()}`])}
            className="w-full rounded-xl border border-dashed border-white/10 py-3 text-sm font-medium text-slate-400 hover:border-[#a9cd39]/30 hover:text-[#a9cd39] transition"
          >
            + Add New Document Slot
          </button>
        </div>

        <NavButtons
          onBack={() => setStep(8)}
          onNext={() => {
            if (eodUploads.some((u) => u.status === 'uploading')) { window.alert('Please wait — files are still uploading.'); return }
            setStep(10)
          }}
          nextLabel="Next →"
        />
      </div>
    )
  }

  // Step 8 — Pump Readings
  const renderPumpStep = () => (
    <div className="flex min-h-[70vh] flex-col">
      <StepHeader label={steps[10]} current={11} total={totalSteps} />
      <p className="text-2xl font-bold text-white mb-1">Pump Readings</p>
      <p className="text-sm text-slate-500 mb-3">
        {isFirstReport ? 'Enter opening & closing meter readings for each pump' : 'Log the closing meter reading for each pump'}
      </p>
      <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-3 text-xs text-amber-300 leading-relaxed">
        💡 Using sub-pumps (e.g. 1a, 1b)? Select <span className="font-semibold">Other</span> and label each one individually — do not use P1, P2 from the list.
      </div>
      <div className="flex-1 space-y-4">
        <div className="space-y-3 rounded-2xl border border-white/5 bg-white/5 p-4">
          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pump Label</span>
            <CustomSelect
              value={pumpDraft.label}
              onChange={(val) => {
                setPumpDraft((prev) => ({ ...prev, label: val, otherLabel: val === 'Other' ? prev.otherLabel : '', opening: '' }))
              }}
              options={toOpts(PUMP_LABEL_OPTIONS)}
            />
          </div>
          {pumpDraft.label === 'Other' && (
            <FormInput label="Custom Label" value={pumpDraft.otherLabel} onChange={(e) => setPumpDraft((prev) => ({ ...prev, otherLabel: e.target.value }))} placeholder="e.g. AGO1" />
          )}

          {/* Pump opening confirmation — uses per-pump history */}
          {!isFirstReport && (() => {
            const effectiveLabel = pumpDraft.label === 'Other' ? pumpDraft.otherLabel?.trim() : pumpDraft.label
            const productType = normalizePumpProductType(pumpDraft.productType)
            const historyKey = getPumpHistoryKey(effectiveLabel, productType)
            const priorPump = historyKey ? pumpLastClosings[historyKey] : null
            const pumpState = pumpOpeningStates[historyKey] || { confirmed: null, overrideValue: '', reason: '' }
            const draftOpeningValue = pumpOpeningDrafts[historyKey] ?? pumpState.overrideValue ?? ''
            const commitOpeningOverride = () => {
              const val = String(draftOpeningValue).trim()
              if (val === '') {
                window.alert(`Enter the actual opening reading for ${effectiveLabel}.`)
                return
              }
              const numericValue = Number(val)
              if (!Number.isFinite(numericValue)) {
                window.alert(`Enter a valid opening reading for ${effectiveLabel}.`)
                return
              }
              setPumpOpeningStates((prev) => ({ ...prev, [historyKey]: { ...pumpState, overrideValue: val } }))
            }
            if (!priorPump || !effectiveLabel) return null
            return (
              <div className="space-y-3">
                {pumpState.confirmed === null && (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-xs text-slate-400 mb-2">
                      Last use of <span className="font-semibold text-white">{effectiveLabel} {productType}</span>
                      {priorPump.date ? <span className="text-slate-500"> ({priorPump.date})</span> : ''} closed at <span className="font-bold text-[#a9cd39]">{Number(priorPump.closing).toLocaleString()}</span> — use as opening?
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setPumpOpeningStates((prev) => ({ ...prev, [historyKey]: { ...pumpState, confirmed: true } }))}
                        className="rounded-xl border border-[#a9cd39]/30 bg-[#a9cd39]/10 py-2 text-xs font-semibold text-[#a9cd39]">✓ Yes</button>
                      <button type="button" onClick={() => {
                        setPumpOpeningDrafts((prev) => ({ ...prev, [historyKey]: pumpState.overrideValue || '' }))
                        setPumpOpeningStates((prev) => ({ ...prev, [historyKey]: { ...pumpState, confirmed: false } }))
                      }}
                        className="rounded-xl border border-white/10 bg-white/5 py-2 text-xs font-semibold text-slate-300">✗ No</button>
                    </div>
                  </div>
                )}
                {pumpState.confirmed === true && (
                  <div className="rounded-xl border border-[#a9cd39]/20 bg-[#a9cd39]/5 px-3 py-2 flex justify-between items-center">
                    <p className="text-xs text-white">Opening: <span className="font-bold text-[#a9cd39]">{priorPump.closing}</span> (confirmed)</p>
                    <button type="button" onClick={() => setPumpOpeningStates((prev) => ({ ...prev, [historyKey]: { ...pumpState, confirmed: null } }))} className="text-xs text-slate-500 underline">Change</button>
                  </div>
                )}
                {pumpState.confirmed === false && (
                  <div className="space-y-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <FormInput type="number" label="Actual Opening Reading" value={draftOpeningValue}
                          onChange={(e) => setPumpOpeningDrafts((prev) => ({ ...prev, [historyKey]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              commitOpeningOverride()
                            }
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={commitOpeningOverride}
                        className="mb-0.5 rounded-xl border border-[#a9cd39]/30 bg-[#a9cd39]/10 px-4 py-3 text-xs font-bold text-[#a9cd39] transition hover:bg-[#a9cd39]/15"
                      >
                        OK
                      </button>
                    </div>
                    {pumpState.overrideValue && (
                      <p className="text-xs text-[#a9cd39]">Opening saved: {Number(pumpState.overrideValue).toLocaleString()}</p>
                    )}
                    {draftOpeningValue !== (pumpState.overrideValue || '') && (
                      <p className="text-xs text-amber-300">Press Enter or OK to use this opening reading.</p>
                    )}
                    <div className="space-y-1">
                      <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">Reason *</span>
                      <textarea value={pumpState.reason} rows={2}
                        onChange={(e) => setPumpOpeningStates((prev) => ({ ...prev, [historyKey]: { ...pumpState, reason: e.target.value } }))}
                        placeholder="e.g. Meter was reset / recalibrated"
                        className="w-full rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none resize-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* PMS / AGO tag */}
          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Product Type</span>
            <div className="flex gap-2">
              {['PMS', 'AGO'].map((pt) => (
                <button key={pt} type="button"
                  onClick={() => setPumpDraft((prev) => ({ ...prev, productType: pt }))}
                  className={`flex-1 rounded-xl border py-2.5 text-sm font-bold transition ${pumpDraft.productType === pt ? 'border-[#a9cd39] bg-[#a9cd39]/15 text-[#a9cd39]' : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20'}`}
                >
                  {pt}
                </button>
              ))}
            </div>
          </div>

          {/* First time for this pump → show opening field */}
          {(() => {
            const effectiveLabel = pumpDraft.label === 'Other' ? pumpDraft.otherLabel?.trim() : pumpDraft.label
            const historyKey = getPumpHistoryKey(effectiveLabel, pumpDraft.productType)
            const hasPrior = historyKey && pumpLastClosings[historyKey]
            if (!hasPrior) {
              return <FormInput type="number" label={`Opening Reading${!isFirstReport ? ' (first use of this pump)' : ''}`} value={pumpDraft.opening ?? ''} onChange={(e) => setPumpDraft((prev) => ({ ...prev, opening: e.target.value }))} />
            }
            return null
          })()}

          <FormInput type="number" label="Closing Reading" value={pumpDraft.closing} onChange={(e) => setPumpDraft((prev) => ({ ...prev, closing: e.target.value }))} />
          <button type="button" onClick={handleAddPumpReading} className="w-full rounded-xl border border-[#a9cd39]/20 bg-[#a9cd39]/5 py-2.5 text-sm font-semibold text-[#a9cd39] hover:bg-[#a9cd39]/10 transition">
            + Add Pump Line
          </button>
        </div>

        {/* Added pump lines */}
        <div className="space-y-2">
          {!pumpReadings.length && <p className="text-sm text-slate-500">No pump lines added yet.</p>}
          {pumpReadings.map((item) => {
            const dispensed = item.opening != null ? Math.max(0, Number(item.closing) - Number(item.opening)) : null
            return (
              <div key={item.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{item.label}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${item.productType === 'AGO' ? 'bg-blue-500/15 text-blue-400' : 'bg-[#a9cd39]/15 text-[#a9cd39]'}`}>{item.productType || 'PMS'}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {item.opening != null ? `${item.opening.toLocaleString()} → ` : ''}
                    {Number(item.closing).toLocaleString()}
                    {dispensed != null ? <span className="ml-2 text-[#a9cd39]">({dispensed.toLocaleString()} L dispensed)</span> : ''}
                  </p>
                </div>
                <button type="button" onClick={() => setPumpReadings((prev) => prev.filter((x) => x.id !== item.id))} className="text-rose-400 hover:text-rose-300 transition ml-3">✕</button>
              </div>
            )
          })}
          {pumpReadings.length > 0 && (
            <div className="rounded-xl border border-white/5 bg-black/20 px-4 py-3">
              <p className="text-xs text-slate-400 mb-1">Pump-based sales total</p>
              <p className="text-sm font-bold text-white">
                PMS: <span className="text-[#a9cd39]">{(pumpSales.pms ?? 0).toLocaleString()} L</span>
                {' · '}AGO: <span className="text-blue-400">{(pumpSales.ago ?? 0).toLocaleString()} L</span>
              </p>
            </div>
          )}
        </div>
      </div>
      <NavButtons onBack={() => setStep(9)} onNext={() => setStep(11)} nextLabel="Next →" />
    </div>
  )

  // Step 9 — Review & Submit
  const renderSubmitStep = () => (
    <div className="flex min-h-[70vh] flex-col">
      <StepHeader label={steps[11]} current={12} total={totalSteps} />
      <p className="text-2xl font-bold text-white mb-1">Review & Submit</p>
      <p className="text-sm text-slate-500 mb-6">Add a final remark and submit your report</p>
      <div className="flex-1 space-y-4">
        {/* Quick summary */}
        <div className="rounded-2xl border border-white/5 bg-white/5 divide-y divide-white/5">
          {[
            { label: 'Opening PMS / AGO', value: `${effectiveOpening.pms.toLocaleString()} L / ${effectiveOpening.ago.toLocaleString()} L` },
            { label: 'Sales PMS (pump)', value: pumpSales.pms != null ? `${Math.round(pumpSales.pms).toLocaleString()} L` : '— (no pumps)' },
            { label: 'Sales AGO (pump)', value: pumpSales.ago != null ? `${Math.round(pumpSales.ago).toLocaleString()} L` : '— (no pumps)' },
            { label: 'Sales PMS (tank dip ref)', value: `${Math.round(dipSales.pms).toLocaleString()} L` },
            { label: 'Sales AGO (tank dip ref)', value: `${Math.round(dipSales.ago).toLocaleString()} L` },
            { label: 'Cash B/F', value: `NGN ${effectiveCashBf.toLocaleString()}` },
            { label: 'Cash Sales', value: `NGN ${Number(formData.cashSales || 0).toLocaleString()}` },
            { label: 'POS Terminals', value: `NGN ${posValue.toLocaleString()}` },
            { label: 'Bank Deposits', value: `NGN ${paymentBreakdown.reduce((s, i) => s + i.amount, 0).toLocaleString()}` },
            { label: 'Expenses', value: `NGN ${expenseItems.reduce((s, i) => s + i.amount, 0).toLocaleString()}` },
            { label: 'Bank EOD', value: `${eodUploads.filter((u) => u.slotId?.startsWith('bank-') && u.status === 'done').length} file(s) uploaded` },
            { label: 'Expense EOD', value: `${eodUploads.filter((u) => u.slotId?.startsWith('exp-') && u.status === 'done').length} file(s) uploaded` },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="text-slate-400">{label}</span>
              <span className="font-semibold text-white">{value}</span>
            </div>
          ))}
        </div>
        <label className="block space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Remark (Optional)</span>
          <textarea
            value={formData.remark}
            onChange={(e) => setFormData((prev) => ({ ...prev, remark: e.target.value }))}
            className="h-24 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-slate-600 focus:outline-none resize-none"
            placeholder="Any additional notes..."
          />
        </label>
        {buildDiscrepancies().length > 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <p className="text-xs font-semibold text-amber-400 mb-1">⚠ Discrepancies flagged ({buildDiscrepancies().length})</p>
            {buildDiscrepancies().map((d, i) => (
              <p key={i} className="text-xs text-amber-300 mt-1">• <span className="font-semibold">{d.field}</span>: {d.reason}</p>
            ))}
            <p className="text-xs text-amber-500/70 mt-2">This report will be marked for supervisor review.</p>
          </div>
        )}
        {submitError && <p className="text-sm text-rose-400">{submitError}</p>}
      </div>
      <NavButtons onBack={() => setStep(10)} onNext={() => setConfirmOpen(true)} nextLabel={submitButtonLabel} submitting={submitting} />
    </div>
  )

  const renderReceiptReviewStep = () => {
    const money = (value) => `NGN ${Math.round(Number(value || 0)).toLocaleString()}`
    const liters = (value) => `${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} L`
    const totalExpenses = expenseItems.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    const totalBankPayments = paymentBreakdown.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    const cashSales = Number(formData.cashSales || 0)
    const totalCash = effectiveCashBf + cashSales
    const closingCash = isFirstReport && formData.closingBalanceOverride !== ''
      ? Number(formData.closingBalanceOverride || 0)
      : totalCash - totalBankPayments - posValue
    const cashDifference = totalCash - totalBankPayments - posValue - closingCash
    const pmsPumpSold = pumpSales.pms != null ? Number(pumpSales.pms || 0) : null
    const agoPumpSold = pumpSales.ago != null ? Number(pumpSales.ago || 0) : null
    const discrepancies = buildDiscrepancies()
    const bankUploads = eodUploads.filter((u) => u.slotId?.startsWith('bank-') && u.status === 'done')
    const posUploads = eodUploads.filter((u) => u.slotId?.startsWith('pos-') && u.status === 'done')
    const expenseUploads = eodUploads.filter((u) => u.slotId?.startsWith('exp-') && u.status === 'done')
    const eodName = (upload) => upload.file?.name || upload.fileName || 'Uploaded file'

    const ReviewSection = ({ title, children }) => (
      <section className="rounded-2xl border border-white/8 bg-white/[0.04] p-4">
        <p className="mb-3 text-xs font-black uppercase tracking-widest text-[#a9cd39]">{title}</p>
        <div className="space-y-2">{children}</div>
      </section>
    )
    const ReviewRow = ({ label, value, strong = false, tone = 'text-white' }) => (
      <div className="flex items-start justify-between gap-4 rounded-xl bg-black/20 px-3 py-2.5 text-sm">
        <span className="text-slate-400">{label}</span>
        <span className={`text-right ${strong ? 'text-base font-black' : 'font-semibold'} ${tone}`}>{value}</span>
      </div>
    )

    return (
      <div className="flex min-h-[70vh] flex-col">
        <StepHeader label={steps[11]} current={12} total={totalSteps} />
        <p className="mb-1 text-2xl font-bold text-white">Review your report</p>
        <p className="mb-6 text-sm text-slate-500">Check every entry before sending it to your supervisor.</p>
        <div className="flex-1 space-y-4">
          <ReviewSection title="Report details">
            <ReviewRow label="Report date" value={reportDate || getReportingDateIso()} />
            <ReviewRow label="Station ID" value={stationId || '-'} />
            <ReviewRow label="Sales today" value={isNoSalesDay ? 'No' : 'Yes'} tone={isNoSalesDay ? 'text-amber-300' : 'text-[#a9cd39]'} strong />
          </ReviewSection>

          <ReviewSection title="Stock">
            <ReviewRow label="Open PMS" value={liters(effectiveOpening.pms)} />
            <ReviewRow label="Open AGO" value={liters(effectiveOpening.ago)} />
            <ReviewRow label="Received PMS" value={liters(formData.receivedProduct === 'yes' ? formData.receivedQuantityPMS : 0)} />
            <ReviewRow label="Received AGO" value={liters(formData.receivedProduct === 'yes' ? formData.receivedQuantityAGO : 0)} />
            <ReviewRow label="Closing PMS" value={liters(formData.closingStockPMS)} />
            <ReviewRow label="Closing AGO" value={liters(formData.closingStockAGO)} />
            <ReviewRow label="RTT PMS" value={liters(formData.rttPMS)} />
            <ReviewRow label="RTT AGO" value={liters(formData.rttAGO)} />
            <ReviewRow label="PMS sold" value={pmsPumpSold == null ? 'No pump reading added' : liters(pmsPumpSold)} strong tone="text-[#a9cd39]" />
            <ReviewRow label="AGO sold" value={agoPumpSold == null ? 'No pump reading added' : liters(agoPumpSold)} strong tone="text-blue-300" />
            <ReviewRow label="Manager PMS sold" value={liters(formData.managerSalesPMS)} />
            <ReviewRow label="Manager AGO sold" value={liters(formData.managerSalesAGO)} />
          </ReviewSection>

          {hasReceivedDispatches && (
            <ReviewSection title="Terminal delivery">
              {receivedDispatches.map((dispatch) => {
                const productType = dispatch.approvedProductType || dispatch.requestedProductType || 'Product'
                const sentLiters = Number(dispatch.approvedLiters || dispatch.requestedLiters || 0)
                const tankDip = Number(dispatch.receivedTankDip || 0)
                return (
                  <div key={dispatch.id} className="rounded-xl border border-[#a9cd39]/20 bg-[#a9cd39]/8 p-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <ReviewRow label="Product" value={productType} strong tone="text-[#a9cd39]" />
                      <ReviewRow label="Quantity sent" value={liters(sentLiters)} strong tone="text-white" />
                      <ReviewRow label="Tank dip ref" value={liters(tankDip)} strong tone="text-blue-300" />
                      <ReviewRow label="Truck" value={dispatch.truckNumber || '-'} />
                      <ReviewRow label="Driver" value={dispatch.truckDriver || '-'} />
                      <ReviewRow label="Received by" value={dispatch.receivedBy || '-'} />
                    </div>
                    {dispatch.receivedRemark ? (
                      <p className="mt-2 text-xs text-slate-400">{dispatch.receivedRemark}</p>
                    ) : null}
                  </div>
                )
              })}
            </ReviewSection>
          )}

          <ReviewSection title="Pump readings">
            {pumpReadings.length ? pumpReadings.map((item) => {
              const quantitySold = item.opening != null && item.closing != null ? Number(item.closing) - Number(item.opening) : 0
              return (
                <div key={item.id} className="rounded-xl border border-white/8 bg-black/20 p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <ReviewRow label="Pump name" value={item.label} />
                    <ReviewRow label="Product type" value={item.productType || 'PMS'} />
                    <ReviewRow label="Opening" value={item.opening != null ? Number(item.opening).toLocaleString() : 'No opening entered'} />
                    <ReviewRow label="Closing" value={Number(item.closing || 0).toLocaleString()} />
                    <ReviewRow label="Sold" value={liters(quantitySold)} strong tone="text-[#a9cd39]" />
                  </div>
                </div>
              )
            }) : (
              <ReviewRow label="Pump readings" value="No pump readings added" tone="text-amber-300" />
            )}
          </ReviewSection>

          <ReviewSection title="Prices">
            <ReviewRow label="PMS price" value={money(formData.pmsPrice) + ' per litre'} />
            <ReviewRow label="AGO price" value={money(formData.agoPrice) + ' per litre'} />
            {(priceBandsPMS.length > 0 || priceBandsAGO.length > 0) ? (
              <>
                {priceBandsPMS.map((band, index) => <ReviewRow key={`pms-${index}`} label={`PMS price entry ${index + 1}`} value={`${money(band.price)} for ${liters(band.liters)}`} />)}
                {priceBandsAGO.map((band, index) => <ReviewRow key={`ago-${index}`} label={`AGO price entry ${index + 1}`} value={`${money(band.price)} for ${liters(band.liters)}`} />)}
              </>
            ) : (
              <ReviewRow label="Multiple price entries" value="None" />
            )}
          </ReviewSection>

          <ReviewSection title="Expenses">
            {expenseItems.length ? expenseItems.map((item, index) => (
              <ReviewRow key={item.id || `${item.label}-${index}`} label={item.label} value={money(item.amount)} />
            )) : (
              <ReviewRow label="Expense lines" value="No expenses entered" />
            )}
            <ReviewRow label="Total expense" value={money(totalExpenses)} strong />
            <ReviewRow label="Expense evidence uploaded" value={`${expenseUploads.length} file(s)`} />
            {expenseUploads.map((upload, index) => <ReviewRow key={upload.fileId || index} label={`Expense file ${index + 1}`} value={eodName(upload)} />)}
          </ReviewSection>

          <ReviewSection title="Cash">
            <ReviewRow label="Cash B/F" value={money(effectiveCashBf)} />
            <ReviewRow label="Cash sales" value={money(cashSales)} />
            <ReviewRow label="Bank lodgements" value={money(totalBankPayments)} />
            <ReviewRow label="POS" value={money(posValue)} />
            <ReviewRow label="Closing cash balance" value={money(closingCash)} strong />
            <ReviewRow label="Difference" value={money(cashDifference)} tone={Math.abs(cashDifference) > 0 ? 'text-amber-300' : 'text-[#a9cd39]'} />
          </ReviewSection>

          <ReviewSection title="Bank and evidence">
            {posTerminalBreakdown.length ? posTerminalBreakdown.map((item) => (
              <ReviewRow key={item.terminalId} label={item.label} value={money(item.amount)} />
            )) : (
              <ReviewRow label="POS terminal entries" value="No POS terminal amount entered" />
            )}
            {paymentBreakdown.length ? paymentBreakdown.map((item) => (
              <ReviewRow key={item.id} label={item.channel} value={money(item.amount)} />
            )) : (
              <ReviewRow label="Bank/channel entries" value="No bank lodgement entered" />
            )}
            <ReviewRow label="Bank evidence uploaded" value={`${bankUploads.length} file(s)`} />
            {bankUploads.map((upload, index) => <ReviewRow key={upload.fileId || index} label={`Bank file ${index + 1}`} value={eodName(upload)} />)}
            <ReviewRow label="POS evidence uploaded" value={`${posUploads.length} file(s)`} />
            {posUploads.map((upload, index) => <ReviewRow key={upload.fileId || index} label={`POS file ${index + 1}`} value={eodName(upload)} />)}
          </ReviewSection>

          <ReviewSection title="Remarks">
            <label className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Manager remark</span>
              <textarea
                value={formData.remark}
                onChange={(e) => setFormData((prev) => ({ ...prev, remark: e.target.value }))}
                className="h-24 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white placeholder-slate-600 focus:outline-none resize-none"
                placeholder="Any additional notes..."
              />
            </label>
            {discrepancies.length ? discrepancies.map((item, index) => (
              <div key={`${item.field}-${index}`} className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-sm">
                <p className="font-bold text-amber-300">{item.field}</p>
                <p className="mt-1 text-slate-300">System expected: {item.systemValue}</p>
                <p className="text-slate-300">Manager entered: {item.enteredValue}</p>
                <p className="mt-1 text-amber-200">Reason: {item.reason || 'No reason entered'}</p>
              </div>
            )) : (
              <ReviewRow label="Discrepancy reasons" value="None" tone="text-[#a9cd39]" />
            )}
          </ReviewSection>

          {submitError && <p className="text-sm text-rose-400">{submitError}</p>}
        </div>
        <NavButtons onBack={() => setStep(10)} onNext={() => setConfirmOpen(true)} nextLabel={submitButtonLabel} submitting={submitting} />
      </div>
    )
  }

  const renderStep = () => {
    if (isNoSalesDay) {
      return step === 0 ? renderStep0() : renderNoSalesStep()
    }
    switch (step) {
      case 0: return renderStep0()
      case 1: return renderStockStep()
      case 2: return renderManagerSalesStep()
      case 3: return renderPricingStep()
      case 4: return renderReceivedStep()
      case 5: return renderExpensesStep()
      case 6: return renderCashStep()
      case 7: return renderPosTerminalStep()
      case 8: return renderPaymentsStep()
      case 9: return renderEodStep()
      case 10: return renderPumpStep()
      case 11: return renderReceiptReviewStep()
      default: return renderStep0()
    }
  }

  return (
    <form onSubmit={(e) => e.preventDefault()} noValidate>
      {!reportingConfiguration.dailyOpeningStockFormatEnabled && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          Daily reporting is currently disabled in settings.
        </div>
      )}
      {renderStep()}

      {/* Confirmation modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#131929] p-6 shadow-2xl">
            <div className="mb-5 flex flex-col items-center text-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#a9cd39]/15 border border-[#a9cd39]/25 text-2xl">
                📋
              </div>
              <p className="text-lg font-bold text-white">Ready to submit?</p>
              <p className="text-sm text-slate-400 leading-relaxed">
                Once submitted, this report will be sent to your supervisor. Make sure everything looks good.
              </p>
            </div>
            <div className="space-y-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => { setConfirmOpen(false); handleSubmit() }}
                className="w-full rounded-xl bg-[#a9cd39] py-3 text-sm font-bold text-black hover:bg-[#bcd94a] disabled:opacity-50 transition"
              >
                {submitting ? 'Submitting...' : '✓ Yes, Submit Report'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="w-full rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-semibold text-slate-300 hover:bg-white/10 transition"
              >
                ← Go Back &amp; Review
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  )
}

export default StaffClosingReportForm


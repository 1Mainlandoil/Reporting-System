import { useMemo, useState } from 'react'
import FormInput from '../ui/FormInput'
import { computeSalesFromMovement } from '../../utils/reportFields'

const EXPENSE_OPTIONS = ['Gas', 'Pms', 'Transport', 'Oil', 'Pos paper', 'Other']
const PAYMENT_CHANNEL_OPTIONS = ['Signature Bank', 'Moniepoint', 'First Bank', 'FCMB', 'Zenith', 'Other']
const PUMP_LABEL_OPTIONS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'Other']
const DEFAULT_PAYMENT_CHANNEL = { channel: '', amount: '' }
const DEFAULT_PUMP_READING = { label: 'P1', otherLabel: '', closing: '' }

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
  cashSales: '',
  posValue: '',
  remark: '',
}

/**
 * Closing-stock daily report form for managers (today or dated catch-up).
 * Caller supplies carried opening PMS/AGO for the report calendar date.
 */
const StaffClosingReportForm = ({
  stationId,
  carriedOpening,
  reportingConfiguration,
  submitReport,
  reportDate,
  formDisabled,
  openingBannerTitle = 'Opening stock today (from previous closing)',
  openingBannerDetail,
  showStationIdRow = true,
  onSubmitted,
  submitButtonLabel = 'Submit Report',
  carriedCashBf = 0,
}) => {
  const [formData, setFormData] = useState(defaultForm)
  const [expenseDraft, setExpenseDraft] = useState({
    category: 'Gas',
    otherLabel: '',
    amount: '',
  })
  const [expenseItems, setExpenseItems] = useState([])
  const [paymentDraft, setPaymentDraft] = useState({ channel: PAYMENT_CHANNEL_OPTIONS[0], otherChannel: '', amount: '' })
  const [paymentBreakdown, setPaymentBreakdown] = useState([])
  const [pumpDraft, setPumpDraft] = useState(DEFAULT_PUMP_READING)
  const [pumpReadings, setPumpReadings] = useState([])
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const previewSales = useMemo(() => {
    if (formData.noSalesDay === 'yes') {
      return { pms: 0, ago: 0 }
    }
    const receivedPMS = formData.receivedProduct === 'yes' ? Number(formData.receivedQuantityPMS || 0) : 0
    const receivedAGO = formData.receivedProduct === 'yes' ? Number(formData.receivedQuantityAGO || 0) : 0
    const closingPMS = Number(formData.closingStockPMS || 0)
    const closingAGO = Number(formData.closingStockAGO || 0)
    const rttPMS = Number(formData.rttPMS || 0)
    const rttAGO = Number(formData.rttAGO || 0)
    return {
      pms: computeSalesFromMovement({
        opening: carriedOpening.pms,
        received: receivedPMS,
        closing: closingPMS,
        rtt: rttPMS,
      }),
      ago: computeSalesFromMovement({
        opening: carriedOpening.ago,
        received: receivedAGO,
        closing: closingAGO,
        rtt: rttAGO,
      }),
    }
  }, [carriedOpening, formData])

  const fields = useMemo(
    () => [
      { name: 'closingStockPMS', label: 'CLOSING STOCK PMS (L)' },
      { name: 'closingStockAGO', label: 'CLOSING STOCK AGO (L)' },
      { name: 'pmsPrice', label: 'PMS PRICE' },
      { name: 'agoPrice', label: 'AGO PRICE' },
      { name: 'rttPMS', label: 'RTT PMS' },
      { name: 'rttAGO', label: 'RTT AGO' },
    ],
    [],
  )

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitError('')
    setSuccess(false)
    if (!stationId) {
      const message = 'Your account is not linked to a station.'
      setSubmitError(message)
      window.alert(message)
      return
    }
    if (formDisabled || !reportingConfiguration.dailyOpeningStockFormatEnabled) {
      const message = 'Daily reporting is disabled in Settings. Re-enable it, then submit again.'
      setSubmitError(message)
      window.alert(message)
      return
    }
    if (formData.noSalesDay === 'yes') {
      if (!String(formData.noSalesReason || '').trim()) {
        const message = 'Select a reason for No Sales Day.'
        setSubmitError(message)
        window.alert(message)
        return
      }
    } else {
      const requiredNumericFields = [
        ['closingStockPMS', 'Closing stock PMS'],
        ['closingStockAGO', 'Closing stock AGO'],
        ['pmsPrice', 'PMS price'],
        ['agoPrice', 'AGO price'],
        ['rttPMS', 'RTT PMS'],
        ['rttAGO', 'RTT AGO'],
      ]
      const missingRequired = requiredNumericFields.find(([key]) => String(formData[key] ?? '').trim() === '')
      if (missingRequired) {
        const message = `${missingRequired[1]} is required.`
        setSubmitError(message)
        window.alert(message)
        return
      }
      if (
        formData.receivedProduct === 'yes' &&
        Number(formData.receivedQuantityPMS || 0) <= 0 &&
        Number(formData.receivedQuantityAGO || 0) <= 0
      ) {
        const message = 'Enter at least one received quantity (PMS or AGO) when received product is Yes.'
        setSubmitError(message)
        window.alert(message)
        return
      }
    }
    setSubmitting(true)
    const isNoSalesDay = formData.noSalesDay === 'yes'
    const receivedPMS = !isNoSalesDay && formData.receivedProduct === 'yes' ? Number(formData.receivedQuantityPMS || 0) : 0
    const receivedAGO = !isNoSalesDay && formData.receivedProduct === 'yes' ? Number(formData.receivedQuantityAGO || 0) : 0
    const receivedQuantity = receivedPMS + receivedAGO
    const receivedProductType =
      receivedPMS > 0 && receivedAGO > 0 ? 'BOTH' : receivedAGO > 0 ? 'AGO' : receivedPMS > 0 ? 'PMS' : null
    const openingStockPMS = carriedOpening.pms
    const openingStockAGO = carriedOpening.ago
    const closingStockPMS = isNoSalesDay ? Number(openingStockPMS || 0) : Number(formData.closingStockPMS)
    const closingStockAGO = isNoSalesDay ? Number(openingStockAGO || 0) : Number(formData.closingStockAGO)
    const rttPMS = isNoSalesDay ? 0 : Number(formData.rttPMS || 0)
    const rttAGO = isNoSalesDay ? 0 : Number(formData.rttAGO || 0)
    const totalSalesLitersPMS = computeSalesFromMovement({
      opening: openingStockPMS,
      received: receivedPMS,
      closing: closingStockPMS,
      rtt: rttPMS,
    })
    const totalSalesLitersAGO = computeSalesFromMovement({
      opening: openingStockAGO,
      received: receivedAGO,
      closing: closingStockAGO,
      rtt: rttAGO,
    })
    const effectiveExpenseItems = isNoSalesDay ? [] : reportingConfiguration.expenseLineItemsEnabled ? expenseItems : []
    const totalExpense = effectiveExpenseItems.reduce((sum, item) => sum + item.amount, 0)
    const expenseDescription = effectiveExpenseItems.map((item) => item.label).join(', ')
    const normalizedPaymentBreakdown = (isNoSalesDay ? [] : paymentBreakdown)
      .map((item) => ({
        channel: String(item.channel || '').trim(),
        amount: Number(item.amount || 0),
      }))
      .filter((item) => item.channel && item.amount > 0 && item.channel.toUpperCase() !== 'POS')
    const totalPaymentDeposits = normalizedPaymentBreakdown.reduce((sum, item) => sum + item.amount, 0)
    const normalizedPumpReadings = (isNoSalesDay ? [] : pumpReadings)
      .map((item) => {
        const label = String(item.label || '').trim()
        const closing = item.closing != null && item.closing !== '' ? Number(item.closing) : null
        return {
          label,
          closing,
        }
      })
      .filter((item) => item.label && item.closing != null)
    const cashSales = isNoSalesDay ? 0 : Number(formData.cashSales || 0)
    const posValue = isNoSalesDay ? 0 : Number(formData.posValue || 0)
    const totalAmount = Number(carriedCashBf || 0) + cashSales
    const closingBalance = totalAmount - totalPaymentDeposits - posValue

    const payload = {
      stationId,
      openingStockPMS,
      openingStockAGO,
      closingStockPMS,
      closingStockAGO,
      pmsPrice: Number(formData.pmsPrice),
      agoPrice: Number(formData.agoPrice),
      receivedProduct: !isNoSalesDay && formData.receivedProduct === 'yes',
      receivedProductType: receivedProductType === 'BOTH' ? null : receivedProductType,
      quantityReceived: receivedQuantity,
      totalSalesLitersPMS,
      totalSalesLitersAGO,
      rttPMS,
      rttAGO,
      expenseItems: effectiveExpenseItems,
      expenseAmount: totalExpense,
      expenseDescription,
      remark: isNoSalesDay
        ? `No Sales Day - ${formData.noSalesReason}${formData.noSalesNote ? `: ${formData.noSalesNote}` : ''}`
        : formData.remark,
      noSalesDay: isNoSalesDay,
      noSalesReason: isNoSalesDay ? String(formData.noSalesReason || '').trim() : '',
      noSalesNote: isNoSalesDay ? String(formData.noSalesNote || '').trim() : '',
      openingPMS: openingStockPMS,
      openingAGO: openingStockAGO,
      receivedPMS,
      receivedAGO,
      salesPMS: totalSalesLitersPMS,
      salesAGO: totalSalesLitersAGO,
      remarks: isNoSalesDay
        ? `No Sales Day - ${formData.noSalesReason}${formData.noSalesNote ? `: ${formData.noSalesNote}` : ''}`
        : formData.remark,
      paymentBreakdown: normalizedPaymentBreakdown,
      totalPaymentDeposits,
      posValue,
      cashSales,
      totalAmount,
      closingBalance,
      pumpReadings: normalizedPumpReadings,
    }
    if (reportDate) {
      payload.reportDate = reportDate
    }

    try {
      let outcome
      try {
        outcome = await submitReport(payload)
      } catch {
        outcome = { ok: false, error: 'unknown' }
      }
      if (outcome && outcome.ok === false) {
        if (outcome.error === 'duplicate_date') {
          const message = 'A report for this date already exists.'
          setSubmitError(message)
          window.alert(message)
        } else if (outcome.error === 'catch_up_order') {
          const message = outcome.allowedPast
            ? `Submit the oldest missing day first (${outcome.allowedPast}), then work forward.`
            : 'Use the Daily Report screen for today, or submit missing past dates in order.'
          setSubmitError(message)
          window.alert(message)
        } else if (outcome.error === 'sync_failed') {
          const message = outcome.message
            ? `Report could not be saved to Supabase:\n\n${outcome.message}\n\nIf the table or policies are missing, run supabase/schema.sql in the Supabase SQL Editor. Also ensure this station exists in the stations table (foreign key).`
            : 'Report could not be saved to the server. Check your connection and try again.'
          setSubmitError(outcome.message || 'Report could not be saved to Supabase.')
          window.alert(message)
        } else {
          const message = 'Could not submit this report. Try again or contact support.'
          setSubmitError(message)
          window.alert(message)
        }
        return
      }

      setFormData(defaultForm)
      if (reportingConfiguration.expenseLineItemsEnabled) {
        setExpenseDraft({ category: 'Gas', otherLabel: '', amount: '' })
        setExpenseItems([])
      }
      setPaymentDraft(DEFAULT_PAYMENT_CHANNEL)
      setPaymentBreakdown([])
      setPumpDraft(DEFAULT_PUMP_READING)
      setPumpReadings([])
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2500)
      await Promise.resolve(onSubmitted?.())
    } finally {
      setSubmitting(false)
    }
  }

  const handleAddExpense = () => {
    const amount = Number(expenseDraft.amount || 0)
    const isOther = expenseDraft.category === 'Other'
    const label = isOther ? expenseDraft.otherLabel.trim() : expenseDraft.category

    if (!amount || !label) {
      return
    }

    setExpenseItems((prev) => [...prev, { id: `exp-${Date.now()}`, label, amount }])
    setExpenseDraft((prev) => ({ ...prev, amount: '', otherLabel: '' }))
  }

  const handleAddPaymentLine = () => {
    const isOther = paymentDraft.channel === 'Other'
    const channel = String(isOther ? paymentDraft.otherChannel : paymentDraft.channel || '').trim()
    const amount = Number(paymentDraft.amount || 0)
    if (!channel || amount <= 0) {
      return
    }
    setPaymentBreakdown((prev) => [...prev, { id: `pay-${Date.now()}`, channel, amount }])
    setPaymentDraft({ channel: PAYMENT_CHANNEL_OPTIONS[0], otherChannel: '', amount: '' })
  }

  const handleAddPumpReading = () => {
    const isOther = pumpDraft.label === 'Other'
    const label = String(isOther ? pumpDraft.otherLabel : pumpDraft.label || '').trim()
    const hasClosing = pumpDraft.closing !== ''
    if (!label || !hasClosing) {
      return
    }
    setPumpReadings((prev) => [
      ...prev,
      {
        id: `pump-${Date.now()}`,
        label,
        closing: Number(pumpDraft.closing),
      },
    ])
    setPumpDraft(DEFAULT_PUMP_READING)
  }

  const detailText =
    openingBannerDetail ||
    (reportDate
      ? 'Enter closing dip readings for this calendar date. Sales (L) use opening + receipts − closing − RTT.'
      : "Enter today's closing dip readings below. Total sales (L) will be computed as opening + receipts − closing − RTT per product.")

  return (
    <>
      {!reportingConfiguration.dailyOpeningStockFormatEnabled && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
          Daily opening stock report format is currently disabled in settings.
        </div>
      )}
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {showStationIdRow && (
          <div className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
            Station ID: <span className="font-semibold">{stationId || 'N/A'}</span>
          </div>
        )}
        <label className="space-y-1">
          <span className="text-sm font-medium">DID YOU SELL TODAY?</span>
          <select
            value={formData.noSalesDay}
            onChange={(event) =>
              setFormData((prev) => ({
                ...prev,
                noSalesDay: event.target.value,
                receivedProduct: event.target.value === 'yes' ? 'no' : prev.receivedProduct,
              }))
            }
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="no">No</option>
            <option value="yes">Yes - station did not sell</option>
          </select>
        </label>
        {formData.noSalesDay === 'yes' && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/35 dark:text-amber-200">
            This will submit a no-sales day and carry opening stock/cash forward to the next day.
          </div>
        )}
        {formData.noSalesDay === 'yes' ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-sm font-medium">NO SALES REASON</span>
              <select
                value={formData.noSalesReason}
                onChange={(event) => setFormData((prev) => ({ ...prev, noSalesReason: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">Select reason</option>
                <option value="Sunday">Sunday</option>
                <option value="Public Holiday">Public Holiday</option>
                <option value="Station Closed">Station Closed</option>
                <option value="Maintenance">Maintenance</option>
                <option value="Other">Other</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">NO SALES NOTE (OPTIONAL)</span>
              <input
                value={formData.noSalesNote}
                onChange={(event) => setFormData((prev) => ({ ...prev, noSalesNote: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                placeholder="Add extra context"
              />
            </label>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {fields.map((field) => (
              <FormInput
                key={field.name}
                type="number"
                min="0"
                required
                label={field.label}
                value={formData[field.name]}
                onChange={(event) => setFormData((prev) => ({ ...prev, [field.name]: event.target.value }))}
              />
            ))}
          </div>
        )}
        {formData.noSalesDay !== 'yes' && (
          <label className="space-y-1">
            <span className="text-sm font-medium">RECEIVED PRODUCT</span>
            <select
              value={formData.receivedProduct}
              onChange={(event) => setFormData((prev) => ({ ...prev, receivedProduct: event.target.value }))}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </label>
        )}
        {formData.noSalesDay !== 'yes' && formData.receivedProduct === 'yes' && (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormInput
                type="number"
                min="0"
                label="INPUT RECEIVED PMS (L)"
                value={formData.receivedQuantityPMS}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, receivedQuantityPMS: event.target.value }))
                }
              />
              <FormInput
                type="number"
                min="0"
                label="INPUT RECEIVED AGO (L)"
                value={formData.receivedQuantityAGO}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, receivedQuantityAGO: event.target.value }))
                }
              />
            </div>
          </>
        )}
        {reportingConfiguration.expenseLineItemsEnabled && formData.noSalesDay !== 'yes' && (
          <div className="mt-6 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
            <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">EXPENSE REPORTING</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Expense Type</span>
                <select
                  value={expenseDraft.category}
                  onChange={(event) =>
                    setExpenseDraft((prev) => ({ ...prev, category: event.target.value, otherLabel: '' }))
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
                >
                  {EXPENSE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <FormInput
                type="number"
                min="0"
                label="Value (NGN)"
                value={expenseDraft.amount}
                onChange={(event) => setExpenseDraft((prev) => ({ ...prev, amount: event.target.value }))}
              />
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleAddExpense}
                  className="w-full rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white dark:bg-slate-700"
                >
                  Add Expense Line
                </button>
              </div>
            </div>
            {expenseDraft.category === 'Other' && (
              <label className="mt-4 block space-y-1">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  OTHER EXPENSE DETAILS
                </span>
                <input
                  value={expenseDraft.otherLabel}
                  onChange={(event) =>
                    setExpenseDraft((prev) => ({ ...prev, otherLabel: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
                  placeholder="Describe the expense"
                />
              </label>
            )}
            <div className="mt-4 space-y-2">
              {!expenseItems.length && (
                <p className="text-sm text-slate-500">No expense lines added yet.</p>
              )}
              {expenseItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
                >
                  <p>
                    {item.label} - NGN {item.amount.toLocaleString()}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setExpenseItems((prev) => prev.filter((expenseItem) => expenseItem.id !== item.id))
                    }
                    className="text-red-600"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <p className="text-sm font-semibold">
                Total Expense: NGN {expenseItems.reduce((sum, item) => sum + item.amount, 0).toLocaleString()}
              </p>
            </div>
          </div>
        )}
        {formData.noSalesDay !== 'yes' && (
        <div className="mt-6 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">CASH MOVEMENT (NGN)</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormInput
              type="number"
              min="0"
              label="Cash Sales"
              value={formData.cashSales}
              onChange={(event) => setFormData((prev) => ({ ...prev, cashSales: event.target.value }))}
            />
            <FormInput
              type="number"
              min="0"
              label="POS Value (NGN)"
              value={formData.posValue}
              onChange={(event) => setFormData((prev) => ({ ...prev, posValue: event.target.value }))}
            />
          </div>
        </div>
        )}
        {formData.noSalesDay !== 'yes' && (
        <div className="mt-6 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
            PAYMENT BREAKDOWN (BANK/CHANNEL + NGN)
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Bank / Channel</span>
              <select
                value={paymentDraft.channel}
                onChange={(event) =>
                  setPaymentDraft((prev) => ({
                    ...prev,
                    channel: event.target.value,
                    otherChannel: event.target.value === 'Other' ? prev.otherChannel : '',
                  }))
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
              >
                {PAYMENT_CHANNEL_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <FormInput
              type="number"
              min="0"
              label="Amount (NGN)"
              value={paymentDraft.amount}
              onChange={(event) => setPaymentDraft((prev) => ({ ...prev, amount: event.target.value }))}
            />
          </div>
          {paymentDraft.channel === 'Other' && (
            <label className="mt-3 block space-y-1">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Other Bank/Channel</span>
              <input
                value={paymentDraft.otherChannel}
                onChange={(event) => setPaymentDraft((prev) => ({ ...prev, otherChannel: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
                placeholder="Enter bank/channel name"
              />
            </label>
          )}
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={handleAddPaymentLine}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white dark:bg-slate-700"
            >
              Add Payment Line
            </button>
          </div>
          <div className="mt-4 space-y-2">
            {!paymentBreakdown.length && (
              <p className="text-sm text-slate-500">No bank/channel entries added yet.</p>
            )}
            {paymentBreakdown.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
              >
                <p>
                  {item.channel} - NGN {item.amount.toLocaleString()}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setPaymentBreakdown((prev) => prev.filter((paymentItem) => paymentItem.id !== item.id))
                  }
                  className="text-red-600"
                >
                  Remove
                </button>
              </div>
            ))}
            <p className="text-sm font-semibold">
              Total Deposits: NGN {paymentBreakdown.reduce((sum, item) => sum + item.amount, 0).toLocaleString()}
            </p>
          </div>
        </div>
        )}
        {formData.noSalesDay !== 'yes' && (
        <div className="mt-6 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
            PUMP READINGS (e.g. P4, P5, AGO1)
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Label</span>
              <select
                value={pumpDraft.label}
                onChange={(event) =>
                  setPumpDraft((prev) => ({
                    ...prev,
                    label: event.target.value,
                    otherLabel: event.target.value === 'Other' ? prev.otherLabel : '',
                  }))
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
              >
                {PUMP_LABEL_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <FormInput
              type="number"
              label="Closing Reading"
              value={pumpDraft.closing}
              onChange={(event) => setPumpDraft((prev) => ({ ...prev, closing: event.target.value }))}
            />
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleAddPumpReading}
                className="w-full rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white dark:bg-slate-700"
              >
                Add Pump Line
              </button>
            </div>
          </div>
          {pumpDraft.label === 'Other' && (
            <label className="mt-3 block space-y-1">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Other Pump Label</span>
              <input
                value={pumpDraft.otherLabel}
                onChange={(event) => setPumpDraft((prev) => ({ ...prev, otherLabel: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
                placeholder="e.g. AGO1 or P12"
              />
            </label>
          )}
          <div className="mt-4 space-y-2">
            {!pumpReadings.length && (
              <p className="text-sm text-slate-500">No pump lines added yet.</p>
            )}
            {pumpReadings.map((item) => {
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
                >
                  <p>
                    {item.label}: Closing {item.closing ?? '-'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setPumpReadings((prev) => prev.filter((pumpItem) => pumpItem.id !== item.id))}
                    className="text-red-600"
                  >
                    Remove
                  </button>
                </div>
              )
            })}
          </div>
        </div>
        )}
        <label className="space-y-1">
          <span className="text-sm font-medium">REMARK</span>
          <textarea
            value={formData.remark}
            onChange={(event) => setFormData((prev) => ({ ...prev, remark: event.target.value }))}
            className="h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <button
          type="submit"
          disabled={submitting || formDisabled || !reportingConfiguration.dailyOpeningStockFormatEnabled}
          className="rounded-lg bg-blue-600 px-5 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Submitting...' : submitButtonLabel}
        </button>
        {submitError ? <p className="text-sm font-medium text-rose-600">{submitError}</p> : null}
      </form>
      {success && <p className="mt-4 text-sm font-medium text-emerald-600">Report submitted successfully.</p>}
    </>
  )
}

export default StaffClosingReportForm

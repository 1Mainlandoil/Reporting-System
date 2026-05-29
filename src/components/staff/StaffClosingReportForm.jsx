import { useMemo, useState } from 'react'
import FormInput from '../ui/FormInput'
import PhotoUploadInput from '../ui/PhotoUploadInput'
import ProductPriceSection from './ProductPriceSection'
import { uploadReportEvidence, uploadReportEvidenceFiles } from '../../services/supabaseStorage'
import { computeQuantityRemaining } from '../../utils/reportFields'
import {
  computePumpProductSales,
  getSalesQuantityValidation,
  SALES_QUANTITY_TOLERANCE_LITERS,
} from '../../utils/pumpSales'
import {
  formatFormValidationError,
  formatPhotoUploadError,
  formatReportSubmitError,
  formatSalesQuantityMismatchError,
  notifyBlockedProcess,
} from '../../utils/userErrorMessages'
import {
  computeSalesAmountFromBands,
  normalizePriceBands,
  validatePriceBandsForProduct,
  weightedAveragePrice,
} from '../../utils/priceBands'

const EXPENSE_OPTIONS = ['Gas', 'Pms', 'Transport', 'Oil', 'Pos paper', 'Other']
const PAYMENT_CHANNEL_OPTIONS = ['Signature Bank', 'Moniepoint', 'First Bank', 'FCMB', 'Zenith', 'Other']
const PUMP_LABEL_OPTIONS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'Other']
const DEFAULT_PAYMENT_CHANNEL = { channel: '', amount: '' }
const DEFAULT_PUMP_READING = { label: 'P1', otherLabel: '', productType: 'PMS', opening: '', closing: '' }
const DEFAULT_PRICE_BAND_DRAFT = { price: '', liters: '' }

const slugChannel = (value) =>
  String(value || 'channel')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'channel'

const defaultForm = {
  openingStockPMS: '',
  openingStockAGO: '',
  openingCashBf: '',
  closingStockPMS: '',
  closingStockAGO: '',
  pmsPrice: '',
  agoPrice: '',
  receivedProduct: 'no',
  receivedQuantityPMS: '',
  receivedQuantityAGO: '',
  soldToday: 'yes',
  noSalesRemark: '',
  rttPMS: '',
  rttAGO: '',
  managerSalesPMS: '',
  managerSalesAGO: '',
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
  openingBannerTitle = 'Book opening stock (previous quantity remaining)',
  openingBannerDetail,
  showStationIdRow = true,
  onSubmitted,
  submitButtonLabel = 'Submit Report',
  carriedCashBf = 0,
  isFirstReport = true,
  lastPumpClosingMap = new Map(),
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
  const [posEodPhotoFile, setPosEodPhotoFile] = useState(null)
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

  const isNoSalesDay = formData.soldToday === 'no'

  const effectiveOpening = useMemo(() => {
    if (!isFirstReport) {
      return carriedOpening
    }
    return {
      pms: Number(formData.openingStockPMS || 0),
      ago: Number(formData.openingStockAGO || 0),
    }
  }, [carriedOpening, formData.openingStockPMS, formData.openingStockAGO, isFirstReport])

  const effectiveCashBf = useMemo(() => {
    if (isFirstReport) {
      return Number(formData.openingCashBf || 0)
    }
    return Number(carriedCashBf || 0)
  }, [carriedCashBf, formData.openingCashBf, isFirstReport])

  const systemPumpSales = useMemo(() => {
    if (isNoSalesDay) {
      return { pms: 0, ago: 0, total: 0 }
    }
    const draftReadings = pumpReadings.map((item) => ({
      label: item.label,
      opening: item.opening,
      closing: item.closing,
      productType: item.productType,
    }))
    return computePumpProductSales(
      draftReadings,
      Number(formData.rttPMS || 0),
      Number(formData.rttAGO || 0),
    )
  }, [formData.rttAGO, formData.rttPMS, isNoSalesDay, pumpReadings])

  const effectiveManagerSales = useMemo(() => {
    const pms =
      formData.managerSalesPMS === '' ? systemPumpSales.pms : Number(formData.managerSalesPMS || 0)
    const ago =
      formData.managerSalesAGO === '' ? systemPumpSales.ago : Number(formData.managerSalesAGO || 0)
    return {
      pms: Number.isNaN(pms) ? 0 : pms,
      ago: Number.isNaN(ago) ? 0 : ago,
    }
  }, [formData.managerSalesAGO, formData.managerSalesPMS, systemPumpSales.ago, systemPumpSales.pms])

  const pmsSalesValidation = useMemo(
    () => getSalesQuantityValidation(formData.managerSalesPMS, systemPumpSales.pms),
    [formData.managerSalesPMS, systemPumpSales.pms],
  )

  const agoSalesValidation = useMemo(
    () => getSalesQuantityValidation(formData.managerSalesAGO, systemPumpSales.ago),
    [formData.managerSalesAGO, systemPumpSales.ago],
  )

  const previewQuantityRemaining = useMemo(() => {
    const receivedPMS = !isNoSalesDay && formData.receivedProduct === 'yes' ? Number(formData.receivedQuantityPMS || 0) : 0
    const receivedAGO = !isNoSalesDay && formData.receivedProduct === 'yes' ? Number(formData.receivedQuantityAGO || 0) : 0
    return {
      pms: computeQuantityRemaining({
        previousRemaining: effectiveOpening.pms,
        received: receivedPMS,
        salesLiters: effectiveManagerSales.pms,
      }),
      ago: computeQuantityRemaining({
        previousRemaining: effectiveOpening.ago,
        received: receivedAGO,
        salesLiters: effectiveManagerSales.ago,
      }),
    }
  }, [effectiveManagerSales, effectiveOpening, formData, isNoSalesDay])

  const previewTotalAmount = useMemo(() => {
    if (isNoSalesDay) {
      return effectiveCashBf
    }
    return effectiveCashBf + Number(formData.cashSales || 0)
  }, [effectiveCashBf, formData.cashSales, isNoSalesDay])

  const previewClosingBalance = useMemo(() => {
    if (isNoSalesDay) {
      return effectiveCashBf
    }
    const cashSales = Number(formData.cashSales || 0)
    const posValue = Number(formData.posValue || 0)
    const totalDeposits = paymentBreakdown.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    return effectiveCashBf + cashSales - totalDeposits - posValue
  }, [effectiveCashBf, formData.cashSales, formData.posValue, isNoSalesDay, paymentBreakdown])

  const stockFields = useMemo(
    () => [
      { name: 'closingStockPMS', label: 'TANK DIP — CLOSING STOCK PMS (L)' },
      { name: 'closingStockAGO', label: 'TANK DIP — CLOSING STOCK AGO (L)' },
    ],
    [],
  )

  const resolvePumpLabel = (draft) => {
    const isOther = draft.label === 'Other'
    return String(isOther ? draft.otherLabel : draft.label || '').trim()
  }

  const suggestedPumpOpening = (label) => {
    if (!label || isFirstReport) {
      return ''
    }
    const last = lastPumpClosingMap.get(label)
    return last != null && !Number.isNaN(last) ? String(last) : ''
  }

  const pumpHasPriorReading = (label) => {
    if (!label || isFirstReport) {
      return false
    }
    const last = lastPumpClosingMap.get(label)
    return last != null && !Number.isNaN(last)
  }

  const pumpOpeningLocked = (label) => !isFirstReport && pumpHasPriorReading(label)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitError('')
    setSuccess(false)
    if (!stationId) {
      notifyBlockedProcess(setSubmitError, formatReportSubmitError({ ok: false, error: 'no_station' }))
      return
    }
    if (formDisabled || !reportingConfiguration.dailyOpeningStockFormatEnabled) {
      notifyBlockedProcess(setSubmitError, formatFormValidationError('', 'reportingDisabled'))
      return
    }
    if (isFirstReport) {
      const baselineFields = [
        ['openingStockPMS', 'Opening stock PMS'],
        ['openingStockAGO', 'Opening stock AGO'],
        ['openingCashBf', 'Opening cash B/F'],
      ]
      const missingBaseline = baselineFields.find(([key]) => String(formData[key] ?? '').trim() === '')
      if (missingBaseline) {
        notifyBlockedProcess(
          setSubmitError,
          formatFormValidationError(missingBaseline[1], 'baseline'),
        )
        return
      }
    }
    if (isNoSalesDay) {
      if (!String(formData.noSalesRemark || '').trim()) {
        notifyBlockedProcess(setSubmitError, formatFormValidationError('', 'noSales'))
        return
      }
    } else {
      const requiredNumericFields = [
        ['closingStockPMS', 'Closing stock PMS'],
        ['closingStockAGO', 'Closing stock AGO'],
      ]
      const missingRequired = requiredNumericFields.find(([key]) => String(formData[key] ?? '').trim() === '')
      if (missingRequired) {
        notifyBlockedProcess(setSubmitError, formatFormValidationError(missingRequired[1], 'required'))
        return
      }
      if (pmsMultiPrice === 'no' && String(formData.pmsPrice ?? '').trim() === '') {
        notifyBlockedProcess(setSubmitError, formatFormValidationError('PMS price', 'price'))
        return
      }
      if (agoMultiPrice === 'no' && String(formData.agoPrice ?? '').trim() === '') {
        notifyBlockedProcess(setSubmitError, formatFormValidationError('AGO price', 'price'))
        return
      }
      if (
        formData.receivedProduct === 'yes' &&
        Number(formData.receivedQuantityPMS || 0) <= 0 &&
        Number(formData.receivedQuantityAGO || 0) <= 0
      ) {
        notifyBlockedProcess(setSubmitError, formatFormValidationError('', 'received'))
        return
      }
      if (!pumpReadings.length) {
        notifyBlockedProcess(setSubmitError, formatFormValidationError('', 'pump'))
        return
      }
      if (formData.managerSalesPMS === '' || formData.managerSalesAGO === '') {
        notifyBlockedProcess(setSubmitError, formatFormValidationError('Quantity sold PMS and AGO', 'required'))
        return
      }

      const submitCalculatedSales = computePumpProductSales(
        pumpReadings.map((item) => ({
          label: item.label,
          opening: item.opening,
          closing: item.closing,
          productType: item.productType,
        })),
        Number(formData.rttPMS || 0),
        Number(formData.rttAGO || 0),
      )
      const submitManagerPms = Number(formData.managerSalesPMS || 0)
      const submitManagerAgo = Number(formData.managerSalesAGO || 0)
      const pmsCheck = getSalesQuantityValidation(submitManagerPms, submitCalculatedSales.pms)
      if (!pmsCheck.withinTolerance) {
        notifyBlockedProcess(
          setSubmitError,
          formatSalesQuantityMismatchError({
            productLabel: 'PMS',
            managerLiters: submitManagerPms,
            calculatedLiters: submitCalculatedSales.pms,
          }),
        )
        return
      }
      const agoCheck = getSalesQuantityValidation(submitManagerAgo, submitCalculatedSales.ago)
      if (!agoCheck.withinTolerance) {
        notifyBlockedProcess(
          setSubmitError,
          formatSalesQuantityMismatchError({
            productLabel: 'AGO',
            managerLiters: submitManagerAgo,
            calculatedLiters: submitCalculatedSales.ago,
          }),
        )
        return
      }

      const pmsBandCheck = validatePriceBandsForProduct({
        bands: priceBandsPMS,
        totalSalesLiters: submitManagerPms,
        productLabel: 'PMS',
        multiPriceEnabled: pmsMultiPrice === 'yes',
      })
      if (!pmsBandCheck.ok) {
        notifyBlockedProcess(setSubmitError, pmsBandCheck.message)
        return
      }
      const agoBandCheck = validatePriceBandsForProduct({
        bands: priceBandsAGO,
        totalSalesLiters: submitManagerAgo,
        productLabel: 'AGO',
        multiPriceEnabled: agoMultiPrice === 'yes',
      })
      if (!agoBandCheck.ok) {
        notifyBlockedProcess(setSubmitError, agoBandCheck.message)
        return
      }
    }
    setSubmitting(true)
    const reportDay = reportDate || new Date().toISOString().split('T')[0]
    const evidenceFolder = `eod/${stationId}/${reportDay}`

    let normalizedPaymentBreakdown = []
    let posEodPhotoUrl = ''
    try {
      normalizedPaymentBreakdown = (
        await Promise.all(
          (isNoSalesDay ? [] : paymentBreakdown).map(async (item) => {
            const channel = String(item.channel || '').trim()
            const amount = Number(item.amount || 0)
            if (!channel || amount <= 0 || channel.toUpperCase() === 'POS') {
              return null
            }
            let eodPhotoUrls = [
              ...(Array.isArray(item.eodPhotoUrls) ? item.eodPhotoUrls : []),
              ...(item.eodPhotoUrl ? [item.eodPhotoUrl] : []),
            ].filter(Boolean)
            const pendingFiles = (item.eodPhotoFiles || []).filter(Boolean)
            if (pendingFiles.length) {
              const uploaded = await uploadReportEvidenceFiles(
                pendingFiles,
                `${evidenceFolder}/${slugChannel(channel)}`,
              )
              eodPhotoUrls = [...eodPhotoUrls, ...uploaded.filter(Boolean)]
            }
            eodPhotoUrls = [...new Set(eodPhotoUrls)]
            return {
              channel,
              amount,
              ...(eodPhotoUrls.length ? { eodPhotoUrls, eodPhotoUrl: eodPhotoUrls[0] } : {}),
            }
          }),
        )
      ).filter(Boolean)

      if (!isNoSalesDay && posEodPhotoFile) {
        posEodPhotoUrl =
          (await uploadReportEvidence(posEodPhotoFile, `${evidenceFolder}/pos`)) || ''
      }
    } catch (uploadError) {
      setSubmitting(false)
      notifyBlockedProcess(setSubmitError, formatPhotoUploadError(uploadError))
      return
    }

    const receivedPMS = !isNoSalesDay && formData.receivedProduct === 'yes' ? Number(formData.receivedQuantityPMS || 0) : 0
    const receivedAGO = !isNoSalesDay && formData.receivedProduct === 'yes' ? Number(formData.receivedQuantityAGO || 0) : 0
    const receivedProductType =
      receivedPMS > 0 && receivedAGO > 0 ? 'BOTH' : receivedAGO > 0 ? 'AGO' : receivedPMS > 0 ? 'PMS' : null
    const openingStockPMS = effectiveOpening.pms
    const openingStockAGO = effectiveOpening.ago
    const closingStockPMS = isNoSalesDay ? Number(openingStockPMS || 0) : Number(formData.closingStockPMS)
    const closingStockAGO = isNoSalesDay ? Number(openingStockAGO || 0) : Number(formData.closingStockAGO)
    const rttPMS = isNoSalesDay ? 0 : Number(formData.rttPMS || 0)
    const rttAGO = isNoSalesDay ? 0 : Number(formData.rttAGO || 0)
    const normalizedPumpReadings = (isNoSalesDay ? [] : pumpReadings)
      .map((item) => {
        const label = String(item.label || '').trim()
        const opening =
          item.opening != null && item.opening !== '' ? Number(item.opening) : null
        const closing = item.closing != null && item.closing !== '' ? Number(item.closing) : null
        const productType = item.productType === 'AGO' ? 'AGO' : 'PMS'
        return {
          label,
          opening,
          closing,
          productType,
        }
      })
      .filter((item) => item.label && item.opening != null && item.closing != null)
    const calculatedPumpSales = isNoSalesDay
      ? { pms: 0, ago: 0, total: 0 }
      : computePumpProductSales(normalizedPumpReadings, rttPMS, rttAGO)
    const totalSalesLitersPMS = isNoSalesDay ? 0 : Number(formData.managerSalesPMS || 0)
    const totalSalesLitersAGO = isNoSalesDay ? 0 : Number(formData.managerSalesAGO || 0)
    const effectiveExpenseItems = isNoSalesDay ? [] : reportingConfiguration.expenseLineItemsEnabled ? expenseItems : []
    const totalExpense = effectiveExpenseItems.reduce((sum, item) => sum + item.amount, 0)
    const expenseDescription = effectiveExpenseItems.map((item) => item.label).join(', ')
    const totalPaymentDeposits = normalizedPaymentBreakdown.reduce((sum, item) => sum + item.amount, 0)
    const cashSales = isNoSalesDay ? 0 : Number(formData.cashSales || 0)
    const posValue = isNoSalesDay ? 0 : Number(formData.posValue || 0)
    const totalAmount = effectiveCashBf + cashSales
    const closingBalance = totalAmount - totalPaymentDeposits - posValue
    const quantityRemainingPMS = computeQuantityRemaining({
      previousRemaining: openingStockPMS,
      received: receivedPMS,
      salesLiters: totalSalesLitersPMS,
    })
    const quantityRemainingAGO = computeQuantityRemaining({
      previousRemaining: openingStockAGO,
      received: receivedAGO,
      salesLiters: totalSalesLitersAGO,
    })

    const resolvedPriceBandsPMS = isNoSalesDay
      ? []
      : pmsMultiPrice === 'yes'
        ? normalizePriceBands(priceBandsPMS)
        : totalSalesLitersPMS > 0
          ? [{ price: Number(formData.pmsPrice), liters: totalSalesLitersPMS }]
          : []
    const resolvedPriceBandsAGO = isNoSalesDay
      ? []
      : agoMultiPrice === 'yes'
        ? normalizePriceBands(priceBandsAGO)
        : totalSalesLitersAGO > 0
          ? [{ price: Number(formData.agoPrice), liters: totalSalesLitersAGO }]
          : []
    const salesAmountPMS = computeSalesAmountFromBands(resolvedPriceBandsPMS)
    const salesAmountAGO = computeSalesAmountFromBands(resolvedPriceBandsAGO)
    const pmsPrice = isNoSalesDay
      ? 0
      : pmsMultiPrice === 'yes'
        ? weightedAveragePrice(resolvedPriceBandsPMS, totalSalesLitersPMS)
        : Number(formData.pmsPrice || 0)
    const agoPrice = isNoSalesDay
      ? 0
      : agoMultiPrice === 'yes'
        ? weightedAveragePrice(resolvedPriceBandsAGO, totalSalesLitersAGO)
        : Number(formData.agoPrice || 0)

    const payload = {
      stationId,
      openingStockPMS,
      openingStockAGO,
      closingStockPMS,
      closingStockAGO,
      quantityRemainingPMS,
      quantityRemainingAGO,
      pmsPrice,
      agoPrice,
      multiPricing: !isNoSalesDay && (pmsMultiPrice === 'yes' || agoMultiPrice === 'yes'),
      priceBandsPMS: resolvedPriceBandsPMS,
      priceBandsAGO: resolvedPriceBandsAGO,
      salesAmountPMS,
      salesAmountAGO,
      totalSalesAmount: salesAmountPMS + salesAmountAGO,
      receivedProduct: !isNoSalesDay && formData.receivedProduct === 'yes',
      receivedProductType: receivedProductType === 'BOTH' ? null : receivedProductType,
      quantityReceived: 0,
      totalSalesLitersPMS,
      totalSalesLitersAGO,
      calculatedSalesLitersPMS: calculatedPumpSales.pms,
      calculatedSalesLitersAGO: calculatedPumpSales.ago,
      rttPMS,
      rttAGO,
      expenseItems: effectiveExpenseItems,
      expenseAmount: totalExpense,
      expenseDescription,
      remark: isNoSalesDay ? `No Sales Day: ${String(formData.noSalesRemark || '').trim()}` : formData.remark,
      noSalesDay: isNoSalesDay,
      noSalesReason: isNoSalesDay ? String(formData.noSalesRemark || '').trim() : '',
      noSalesNote: '',
      openingPMS: openingStockPMS,
      openingAGO: openingStockAGO,
      receivedPMS,
      receivedAGO,
      salesPMS: totalSalesLitersPMS,
      salesAGO: totalSalesLitersAGO,
      remarks: isNoSalesDay ? `No Sales Day: ${String(formData.noSalesRemark || '').trim()}` : formData.remark,
      paymentBreakdown: normalizedPaymentBreakdown,
      totalPaymentDeposits,
      posValue,
      posEodPhotoUrl,
      cashSales,
      totalAmount,
      closingBalance,
      pumpReadings: normalizedPumpReadings,
    }
      payload.cashBf = effectiveCashBf
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
        notifyBlockedProcess(setSubmitError, formatReportSubmitError(outcome))
        return
      }

      setFormData(defaultForm)
      if (reportingConfiguration.expenseLineItemsEnabled) {
        setExpenseDraft({ category: 'Gas', otherLabel: '', amount: '' })
        setExpenseItems([])
      }
      setPaymentDraft(DEFAULT_PAYMENT_CHANNEL)
      setPaymentBreakdown([])
      setPosEodPhotoFile(null)
      setPumpDraft(DEFAULT_PUMP_READING)
      setPumpReadings([])
      setPmsMultiPrice('no')
      setAgoMultiPrice('no')
      setPriceBandDraftPMS(DEFAULT_PRICE_BAND_DRAFT)
      setPriceBandDraftAGO(DEFAULT_PRICE_BAND_DRAFT)
      setPriceBandsPMS([])
      setPriceBandsAGO([])
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
    setPaymentBreakdown((prev) => [...prev, { id: `pay-${Date.now()}`, channel, amount, eodPhotoFiles: [null] }])
    setPaymentDraft({ channel: PAYMENT_CHANNEL_OPTIONS[0], otherChannel: '', amount: '' })
  }

  const handleAddPumpReading = () => {
    const label = resolvePumpLabel(pumpDraft)
    const closingRaw = pumpDraft.closing !== '' ? Number(pumpDraft.closing) : null
    let openingRaw = null

    if (isFirstReport) {
      openingRaw = pumpDraft.opening !== '' ? Number(pumpDraft.opening) : null
    } else if (pumpHasPriorReading(label)) {
      const suggested = suggestedPumpOpening(label)
      openingRaw = suggested !== '' ? Number(suggested) : null
    } else {
      openingRaw = pumpDraft.opening !== '' ? Number(pumpDraft.opening) : null
    }

    if (!label || openingRaw == null || Number.isNaN(openingRaw) || closingRaw == null || Number.isNaN(closingRaw)) {
      notifyBlockedProcess(setSubmitError, formatFormValidationError('', 'pump'))
      return
    }
    setPumpReadings((prev) => [
      ...prev,
      {
        id: `pump-${Date.now()}`,
        label,
        productType: pumpDraft.productType === 'AGO' ? 'AGO' : 'PMS',
        opening: openingRaw,
        closing: closingRaw,
      },
    ])
    setPumpDraft(DEFAULT_PUMP_READING)
  }

  const handlePumpLabelChange = (labelValue) => {
    const nextLabel = resolvePumpLabel({ label: labelValue, otherLabel: pumpDraft.otherLabel })
    setPumpDraft((prev) => ({
      ...prev,
      label: labelValue,
      otherLabel: labelValue === 'Other' ? prev.otherLabel : '',
      ...(isFirstReport || !pumpHasPriorReading(nextLabel)
        ? { opening: isFirstReport ? suggestedPumpOpening(nextLabel) || prev.opening : '' }
        : { opening: suggestedPumpOpening(nextLabel) }),
    }))
  }

  const addPaymentPhotoSlot = (paymentId) => {
    setPaymentBreakdown((prev) =>
      prev.map((item) =>
        item.id === paymentId
          ? { ...item, eodPhotoFiles: [...(item.eodPhotoFiles || []), null] }
          : item,
      ),
    )
  }

  const updatePaymentPhotoFile = (paymentId, photoIndex, file) => {
    setPaymentBreakdown((prev) =>
      prev.map((item) => {
        if (item.id !== paymentId) {
          return item
        }
        const nextFiles = [...(item.eodPhotoFiles || [])]
        nextFiles[photoIndex] = file
        return { ...item, eodPhotoFiles: nextFiles }
      }),
    )
  }

  const removePaymentPhotoSlot = (paymentId, photoIndex) => {
    setPaymentBreakdown((prev) =>
      prev.map((item) => {
        if (item.id !== paymentId) {
          return item
        }
        return {
          ...item,
          eodPhotoFiles: (item.eodPhotoFiles || []).filter((_, index) => index !== photoIndex),
        }
      }),
    )
  }

  const handleAddPriceBand = (product) => {
    const isPms = product === 'pms'
    const draft = isPms ? priceBandDraftPMS : priceBandDraftAGO
    const price = Number(draft.price || 0)
    const liters = Number(draft.liters || 0)
    if (price <= 0 || liters <= 0) {
      return
    }
    const entry = { id: `band-${product}-${Date.now()}`, price, liters }
    if (isPms) {
      setPriceBandsPMS((prev) => [...prev, entry])
      setPriceBandDraftPMS(DEFAULT_PRICE_BAND_DRAFT)
    } else {
      setPriceBandsAGO((prev) => [...prev, entry])
      setPriceBandDraftAGO(DEFAULT_PRICE_BAND_DRAFT)
    }
  }

  const detailText =
    openingBannerDetail ||
    (isFirstReport
      ? 'Baseline — enter opening and closing meter readings for each pump.'
      : 'Enter closing for each pump. Opening auto-fills when the pump was used before; enter opening for a pump used for the first time.')

  const renderSalesValidationHint = (validation, calculatedLiters, productLabel) => {
    if (validation.status === 'empty') {
      return (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          System calculated {productLabel}: {Math.round(calculatedLiters).toLocaleString()} L (±
          {SALES_QUANTITY_TOLERANCE_LITERS} L tolerance)
        </p>
      )
    }
    if (validation.status === 'match') {
      return (
        <p className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          Matches pump readings — good to go.
        </p>
      )
    }
    return (
      <p className="mt-1 text-xs font-medium text-rose-700 dark:text-rose-300">
        Does not match pump readings — system shows {Math.round(calculatedLiters).toLocaleString()} L. Recheck
        closing, last reading, and RTT.
      </p>
    )
  }

  const renderPumpReadingsSection = () => (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">PUMP READINGS</p>
      <p className="mb-3 text-xs text-slate-500">{detailText}</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
        <label className="space-y-1">
          <span className="text-sm font-medium">Pump</span>
          <select
            value={pumpDraft.label}
            onChange={(event) => handlePumpLabelChange(event.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
          >
            {PUMP_LABEL_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Product</span>
          <select
            value={pumpDraft.productType}
            onChange={(event) =>
              setPumpDraft((prev) => ({ ...prev, productType: event.target.value }))
            }
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="PMS">PMS</option>
            <option value="AGO">AGO</option>
          </select>
        </label>
        {pumpOpeningLocked(resolvePumpLabel(pumpDraft)) ? (
          <div className="space-y-1">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Opening</span>
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
              {suggestedPumpOpening(resolvePumpLabel(pumpDraft))}
            </p>
          </div>
        ) : (
          <FormInput
            type="number"
            label="Opening"
            value={pumpDraft.opening}
            onChange={(event) => setPumpDraft((prev) => ({ ...prev, opening: event.target.value }))}
          />
        )}
        <FormInput
          type="number"
          label="Closing"
          value={pumpDraft.closing}
          onChange={(event) => setPumpDraft((prev) => ({ ...prev, closing: event.target.value }))}
        />
        <div className={`flex items-end ${pumpOpeningLocked(resolvePumpLabel(pumpDraft)) ? 'md:col-span-1' : 'md:col-span-2'}`}>
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
        <input
          value={pumpDraft.otherLabel}
          onChange={(event) => {
            const otherLabel = event.target.value
            const nextLabel = resolvePumpLabel({ label: 'Other', otherLabel })
            setPumpDraft((prev) => ({
              ...prev,
              otherLabel,
              ...(isFirstReport || !pumpHasPriorReading(nextLabel)
                ? { opening: isFirstReport ? suggestedPumpOpening(nextLabel) || prev.opening : '' }
                : { opening: suggestedPumpOpening(nextLabel) }),
            }))
          }}
          className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
          placeholder="e.g. AGO1"
        />
      )}
      <div className="mt-4 space-y-2">
        {pumpReadings.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
          >
            <p>
              {item.label} ({item.productType || 'PMS'}): {item.opening} → {item.closing}
            </p>
            <button
              type="button"
              onClick={() => setPumpReadings((prev) => prev.filter((pumpItem) => pumpItem.id !== item.id))}
              className="text-red-600"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <>
      {!reportingConfiguration.dailyOpeningStockFormatEnabled && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
          Daily opening stock report format is currently disabled in settings.
        </div>
      )}
      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        {showStationIdRow && (
          <div className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
            Station ID: <span className="font-semibold">{stationId || 'N/A'}</span>
          </div>
        )}
        {isFirstReport && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/35 dark:text-amber-200">
            Baseline report — complete every section below. Opening stock goes in Stock; opening cash B/F goes in Cash
            Movement.
          </div>
        )}

        <label className="block space-y-1">
          <span className="text-sm font-medium">DID YOU SELL TODAY?</span>
          <select
            value={formData.soldToday}
            onChange={(event) =>
              setFormData((prev) => ({
                ...prev,
                soldToday: event.target.value,
                receivedProduct: event.target.value === 'no' ? 'no' : prev.receivedProduct,
              }))
            }
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>

        <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">STOCK (LITRES)</p>
          {isFirstReport ? (
            <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormInput
                type="number"
                min="0"
                required
                label="OPENING STOCK PMS (L)"
                value={formData.openingStockPMS}
                onChange={(event) => setFormData((prev) => ({ ...prev, openingStockPMS: event.target.value }))}
              />
              <FormInput
                type="number"
                min="0"
                required
                label="OPENING STOCK AGO (L)"
                value={formData.openingStockAGO}
                onChange={(event) => setFormData((prev) => ({ ...prev, openingStockAGO: event.target.value }))}
              />
            </div>
          ) : (
            <div className="mb-4 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
              {openingBannerTitle}: PMS{' '}
              <span className="font-semibold">{carriedOpening.pms.toLocaleString()} L</span>
              {' · '}AGO <span className="font-semibold">{carriedOpening.ago.toLocaleString()} L</span>
            </div>
          )}

          {isNoSalesDay ? (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              No sales — book stock carries forward. Add a reason below and submit.
            </p>
          ) : (
            <>
              <label className="mb-4 block space-y-1">
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
              {formData.receivedProduct === 'yes' && (
                <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormInput
                    type="number"
                    min="0"
                    label="QUANTITY RECEIVED PMS (L)"
                    value={formData.receivedQuantityPMS}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, receivedQuantityPMS: event.target.value }))
                    }
                  />
                  <FormInput
                    type="number"
                    min="0"
                    label="QUANTITY RECEIVED AGO (L)"
                    value={formData.receivedQuantityAGO}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, receivedQuantityAGO: event.target.value }))
                    }
                  />
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {stockFields.map((field) => (
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
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormInput
                  type="number"
                  min="0"
                  label="RTT PMS (L)"
                  value={formData.rttPMS}
                  onChange={(event) => setFormData((prev) => ({ ...prev, rttPMS: event.target.value }))}
                />
                <FormInput
                  type="number"
                  min="0"
                  label="RTT AGO (L)"
                  value={formData.rttAGO}
                  onChange={(event) => setFormData((prev) => ({ ...prev, rttAGO: event.target.value }))}
                />
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                RTT is subtracted from pump-based sales for the matching product.
              </p>
              {renderPumpReadingsSection()}
              <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
                System calculated sales: PMS{' '}
                <span className="font-semibold">{Math.round(systemPumpSales.pms).toLocaleString()} L</span>
                {' · '}
                AGO <span className="font-semibold">{Math.round(systemPumpSales.ago).toLocaleString()} L</span>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <FormInput
                    type="number"
                    min="0"
                    required
                    label="QUANTITY SOLD PMS (L)"
                    value={formData.managerSalesPMS}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, managerSalesPMS: event.target.value }))
                    }
                    className={
                      pmsSalesValidation.status === 'match'
                        ? 'border-emerald-400 focus:border-emerald-500 dark:border-emerald-500'
                        : pmsSalesValidation.status === 'mismatch'
                          ? 'border-rose-400 focus:border-rose-500 dark:border-rose-500'
                          : ''
                    }
                  />
                  {renderSalesValidationHint(pmsSalesValidation, systemPumpSales.pms, 'PMS')}
                </div>
                <div>
                  <FormInput
                    type="number"
                    min="0"
                    required
                    label="QUANTITY SOLD AGO (L)"
                    value={formData.managerSalesAGO}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, managerSalesAGO: event.target.value }))
                    }
                    className={
                      agoSalesValidation.status === 'match'
                        ? 'border-emerald-400 focus:border-emerald-500 dark:border-emerald-500'
                        : agoSalesValidation.status === 'mismatch'
                          ? 'border-rose-400 focus:border-rose-500 dark:border-rose-500'
                          : ''
                    }
                  />
                  {renderSalesValidationHint(agoSalesValidation, systemPumpSales.ago, 'AGO')}
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-200">
                Book quantity remaining: PMS{' '}
                <span className="font-semibold">{previewQuantityRemaining.pms.toLocaleString()} L</span>
                {' · '}AGO <span className="font-semibold">{previewQuantityRemaining.ago.toLocaleString()} L</span>
                <span className="mt-1 block text-xs opacity-90">
                  Tank dip: PMS {Number(formData.closingStockPMS || 0).toLocaleString()} L · AGO{' '}
                  {Number(formData.closingStockAGO || 0).toLocaleString()} L
                </span>
              </div>
              <div className="mt-4 space-y-4">
                <ProductPriceSection
                  productLabel="PMS"
                  multiPrice={pmsMultiPrice}
                  onMultiPriceChange={setPmsMultiPrice}
                  singlePrice={formData.pmsPrice}
                  onSinglePriceChange={(value) => setFormData((prev) => ({ ...prev, pmsPrice: value }))}
                  bands={priceBandsPMS}
                  bandDraft={priceBandDraftPMS}
                  onBandDraftChange={setPriceBandDraftPMS}
                  onAddBand={() => handleAddPriceBand('pms')}
                  onRemoveBand={(id) => setPriceBandsPMS((prev) => prev.filter((band) => band.id !== id))}
                  totalSalesLiters={effectiveManagerSales.pms}
                />
                <ProductPriceSection
                  productLabel="AGO"
                  multiPrice={agoMultiPrice}
                  onMultiPriceChange={setAgoMultiPrice}
                  singlePrice={formData.agoPrice}
                  onSinglePriceChange={(value) => setFormData((prev) => ({ ...prev, agoPrice: value }))}
                  bands={priceBandsAGO}
                  bandDraft={priceBandDraftAGO}
                  onBandDraftChange={setPriceBandDraftAGO}
                  onAddBand={() => handleAddPriceBand('ago')}
                  onRemoveBand={(id) => setPriceBandsAGO((prev) => prev.filter((band) => band.id !== id))}
                  totalSalesLiters={effectiveManagerSales.ago}
                />
              </div>
            </>
          )}
        </div>

        {isNoSalesDay ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
              <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">CASH MOVEMENT (NGN)</p>
              {isFirstReport ? (
                <FormInput
                  type="number"
                  min="0"
                  required
                  label="CASH B/F (OPENING)"
                  value={formData.openingCashBf}
                  onChange={(event) => setFormData((prev) => ({ ...prev, openingCashBf: event.target.value }))}
                />
              ) : (
                <p className="text-sm">
                  Cash B/F: <span className="font-semibold">NGN {effectiveCashBf.toLocaleString()}</span> (carried)
                </p>
              )}
            </div>
            <label className="block space-y-1">
              <span className="text-sm font-medium">REASON FOR NO SALES</span>
              <textarea
                value={formData.noSalesRemark}
                onChange={(event) => setFormData((prev) => ({ ...prev, noSalesRemark: event.target.value }))}
                className="h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                placeholder="e.g. Sunday, public holiday, station closed..."
              />
            </label>
            <button
              type="submit"
              disabled={submitting || formDisabled || !reportingConfiguration.dailyOpeningStockFormatEnabled}
              className="rounded-lg bg-blue-600 px-5 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Sending...' : 'Send'}
            </button>
            {submitError ? <p className="text-sm font-medium text-rose-600">{submitError}</p> : null}
          </div>
        ) : (
          <>
            {reportingConfiguration.expenseLineItemsEnabled && (
              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">EXPENSES (INFORMATIONAL)</p>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <label className="space-y-1">
                    <span className="text-sm font-medium">Expense Type</span>
                    <select
                      value={expenseDraft.category}
                      onChange={(event) =>
                        setExpenseDraft((prev) => ({ ...prev, category: event.target.value, otherLabel: '' }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
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
                  <input
                    value={expenseDraft.otherLabel}
                    onChange={(event) => setExpenseDraft((prev) => ({ ...prev, otherLabel: event.target.value }))}
                    className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                    placeholder="Describe the expense"
                  />
                )}
                <div className="mt-4 space-y-2">
                  {expenseItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
                    >
                      <p>
                        {item.label} — NGN {item.amount.toLocaleString()}
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
                </div>
              </div>
            )}

            <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
              <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">CASH MOVEMENT (NGN)</p>
              {isFirstReport ? (
                <div className="mb-4 max-w-md">
                  <FormInput
                    type="number"
                    min="0"
                    required
                    label="CASH B/F (OPENING)"
                    value={formData.openingCashBf}
                    onChange={(event) => setFormData((prev) => ({ ...prev, openingCashBf: event.target.value }))}
                  />
                </div>
              ) : (
                <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
                  Cash B/F: <span className="font-semibold">NGN {effectiveCashBf.toLocaleString()}</span>
                </div>
              )}
              <FormInput
                type="number"
                min="0"
                label="CASH SALES"
                value={formData.cashSales}
                onChange={(event) => setFormData((prev) => ({ ...prev, cashSales: event.target.value }))}
              />
              <p className="mt-3 text-sm font-medium text-slate-600 dark:text-slate-300">
                Total amount: NGN {previewTotalAmount.toLocaleString()} (B/F + cash sales)
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
              <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">BANK DEPOSITS</p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <label className="space-y-1 md:col-span-2">
                  <span className="text-sm font-medium">Bank / Channel</span>
                  <select
                    value={paymentDraft.channel}
                    onChange={(event) =>
                      setPaymentDraft((prev) => ({
                        ...prev,
                        channel: event.target.value,
                        otherChannel: event.target.value === 'Other' ? prev.otherChannel : '',
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
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
                <input
                  value={paymentDraft.otherChannel}
                  onChange={(event) => setPaymentDraft((prev) => ({ ...prev, otherChannel: event.target.value }))}
                  className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                  placeholder="Other bank/channel name"
                />
              )}
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={handleAddPaymentLine}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white dark:bg-slate-700"
                >
                  Add Deposit Line
                </button>
              </div>
              <div className="mt-4 space-y-2">
                {paymentBreakdown.map((item) => (
                  <div
                    key={item.id}
                    className="space-y-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
                  >
                    <div className="flex items-center justify-between">
                      <p>
                        {item.channel} — NGN {item.amount.toLocaleString()}
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
                    <div className="space-y-2 border-t border-slate-100 pt-2 dark:border-slate-800">
                      <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        EOD proof photos (add as many as needed)
                      </p>
                      {(item.eodPhotoFiles || []).length === 0 ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400">No photos added yet.</p>
                      ) : (
                        (item.eodPhotoFiles || []).map((file, photoIndex) => (
                          <div key={`${item.id}-photo-${photoIndex}`} className="flex items-start gap-2">
                            <PhotoUploadInput
                              className="flex-1"
                              label={`Photo ${photoIndex + 1}`}
                              value={file}
                              onChange={(nextFile) => updatePaymentPhotoFile(item.id, photoIndex, nextFile)}
                              disabled={submitting}
                            />
                            <button
                              type="button"
                              onClick={() => removePaymentPhotoSlot(item.id, photoIndex)}
                              className="mt-6 text-xs text-rose-600"
                            >
                              Remove
                            </button>
                          </div>
                        ))
                      )}
                      <button
                        type="button"
                        onClick={() => addPaymentPhotoSlot(item.id)}
                        disabled={submitting}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium dark:border-slate-600"
                      >
                        Add photo
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
              <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">POS & CLOSING CASH</p>
              <FormInput
                type="number"
                min="0"
                label="POS VALUE (NGN)"
                value={formData.posValue}
                onChange={(event) => setFormData((prev) => ({ ...prev, posValue: event.target.value }))}
              />
              <PhotoUploadInput
                label="POS EOD proof photo"
                value={posEodPhotoFile}
                onChange={setPosEodPhotoFile}
                disabled={submitting}
              />
              <p
                className={`mt-3 text-sm font-semibold ${previewClosingBalance < 0 ? 'text-rose-600' : 'text-slate-700 dark:text-slate-200'}`}
              >
                Closing cash balance: NGN {previewClosingBalance.toLocaleString()}
              </p>
            </div>

            <label className="block space-y-1">
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
          </>
        )}
      </form>
      {success && <p className="mt-4 text-sm font-medium text-emerald-600">Report submitted successfully.</p>}
    </>
  )
}

export default StaffClosingReportForm

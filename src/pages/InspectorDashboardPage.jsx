import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import DescribedPhotoUploadSection from '../components/inspector/DescribedPhotoUploadSection'
import DynamicNamedReadingSection from '../components/inspector/DynamicNamedReadingSection'
import InspectorVisitDetailModal from '../components/reports/InspectorVisitDetailModal'
import Card from '../components/ui/Card'
import DateInput from '../components/ui/DateInput'
import EmptyState from '../components/ui/EmptyState'
import FormInput from '../components/ui/FormInput'
import {
  emptyNamedReadings,
  sanitizeNamedReadings,
} from '../constants/inspectorVisit'
import { uploadReportEvidence } from '../services/supabaseStorage'
import { useAppStore } from '../store/useAppStore'
import { formatIsoToDmy, isValidIsoDate } from '../utils/dateFormat'
import { getManagerNameForStation } from '../utils/stationManagers'
import { formatPhotoUploadError } from '../utils/userErrorMessages'

const todayIso = () => new Date().toISOString().split('T')[0]

const emptyForm = () => ({
  stationId: '',
  visitDate: todayIso(),
  arrivalTime: '',
  departureTime: '',
  managerInCharge: '',
  cashBf: '',
  cash: '',
  posBf: '',
  pos: '',
  remark: '',
  tankReadings: emptyNamedReadings(),
  pumpReadings: emptyNamedReadings(),
  photoDrafts: [],
})

const InspectorDashboardPage = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const stations = useAppStore((state) => state.stations)
  const users = useAppStore((state) => state.users)
  const inspectorVisits = useAppStore((state) => state.inspectorVisits)
  const currentUser = useAppStore((state) => state.currentUser)
  const submitInspectorVisit = useAppStore((state) => state.submitInspectorVisit)
  const [form, setForm] = useState(emptyForm)
  const [notice, setNotice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [detailVisit, setDetailVisit] = useState(null)

  const activeView = searchParams.get('view') === 'history' ? 'history' : 'form'

  const myVisits = useMemo(
    () =>
      inspectorVisits
        .filter((visit) => visit.inspectorId === currentUser?.id)
        .map((visit) => ({
          ...visit,
          stationName: stations.find((station) => station.id === visit.stationId)?.name || visit.stationId,
        }))
        .sort((a, b) => {
          const byDate = String(b.visitDate).localeCompare(String(a.visitDate))
          if (byDate !== 0) {
            return byDate
          }
          return String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
        }),
    [currentUser?.id, inspectorVisits, stations],
  )

  const handleStationChange = (stationId) => {
    setForm((prev) => ({
      ...prev,
      stationId,
      managerInCharge: getManagerNameForStation(users, stationId),
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setNotice('')
    if (!form.stationId) {
      setNotice('Select a station for this visit.')
      return
    }
    if (!form.visitDate || !isValidIsoDate(form.visitDate)) {
      setNotice('Enter a valid visit date in DD/MM/YYYY format.')
      return
    }

    const incompletePhoto = form.photoDrafts.find(
      (draft) => (draft.description.trim() && !draft.file) || (!draft.description.trim() && draft.file),
    )
    if (incompletePhoto) {
      setNotice('Each photo needs both a description and an uploaded image.')
      return
    }

    const visitId = `insp-visit-${Date.now()}`
    setIsSubmitting(true)

    try {
      const photoEvidence = []
      for (const draft of form.photoDrafts) {
        if (!draft.file) {
          continue
        }
        const url = await uploadReportEvidence(draft.file, `inspector-visits/${visitId}`)
        if (!url) {
          throw new Error('Photo upload failed. Check your connection and try again.')
        }
        photoEvidence.push({
          description: draft.description.trim(),
          url,
        })
      }

      const result = await submitInspectorVisit({
        id: visitId,
        stationId: form.stationId,
        visitDate: form.visitDate,
        arrivalTime: form.arrivalTime,
        departureTime: form.departureTime,
        managerInCharge: form.managerInCharge,
        cashBf: form.cashBf,
        cash: form.cash,
        posBf: form.posBf,
        pos: form.pos,
        remark: form.remark,
        tankReadings: sanitizeNamedReadings(form.tankReadings),
        pumpReadings: sanitizeNamedReadings(form.pumpReadings),
        photoEvidence,
      })

      if (!result.ok) {
        setNotice(result.message || 'Could not save visit. Try again.')
        return
      }

      setForm(emptyForm())
      setNotice('Visit saved successfully.')
      navigate('/inspector?view=history')
    } catch (error) {
      setNotice(formatPhotoUploadError(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card className="bg-gradient-to-r from-blue-50 to-white dark:from-slate-900 dark:to-slate-900">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {activeView === 'history' ? 'Visit history' : 'Station Inspection Report'}
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Reporting as {currentUser?.name || 'Inspector'}. Record on-site tank, pump, cash/POS, and photo evidence.
          </p>
        </div>
      </Card>

      {activeView === 'form' ? (
        <Card>
          <form onSubmit={handleSubmit} className="space-y-6">
            {notice && (
              <div
                className={`rounded-lg border px-3 py-2 text-sm ${
                  notice.includes('success')
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200'
                    : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200'
                }`}
              >
                {notice}
              </div>
            )}

            <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
              <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">VISIT DETAILS</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1 sm:col-span-2">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Station</span>
                  <select
                    required
                    value={form.stationId}
                    onChange={(event) => handleStationChange(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <option value="">Select station</option>
                    {stations.map((station) => (
                      <option key={station.id} value={station.id}>
                        {station.name}
                      </option>
                    ))}
                  </select>
                </label>
                <DateInput
                  required
                  label="Visit date"
                  value={form.visitDate}
                  onChange={(visitDate) => setForm((prev) => ({ ...prev, visitDate }))}
                />
                <FormInput
                  readOnly
                  label="Inspector"
                  value={currentUser?.name || 'Inspector'}
                  className="bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                />
                <FormInput
                  type="time"
                  label="Time of arrival"
                  value={form.arrivalTime}
                  onChange={(event) => setForm((prev) => ({ ...prev, arrivalTime: event.target.value }))}
                />
                <FormInput
                  type="time"
                  label="Time of departure"
                  value={form.departureTime}
                  onChange={(event) => setForm((prev) => ({ ...prev, departureTime: event.target.value }))}
                />
                <FormInput
                  className="sm:col-span-2"
                  label="Manager in charge"
                  value={form.managerInCharge}
                  placeholder="Station manager name"
                  onChange={(event) => setForm((prev) => ({ ...prev, managerInCharge: event.target.value }))}
                />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
              <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">CASH / POS</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormInput
                  type="number"
                  inputMode="decimal"
                  step="any"
                  label="Cash (BF)"
                  value={form.cashBf}
                  onChange={(event) => setForm((prev) => ({ ...prev, cashBf: event.target.value }))}
                />
                <FormInput
                  type="number"
                  inputMode="decimal"
                  step="any"
                  label="Cash"
                  value={form.cash}
                  onChange={(event) => setForm((prev) => ({ ...prev, cash: event.target.value }))}
                />
                <FormInput
                  type="number"
                  inputMode="decimal"
                  step="any"
                  label="POS (BF)"
                  value={form.posBf}
                  onChange={(event) => setForm((prev) => ({ ...prev, posBf: event.target.value }))}
                />
                <FormInput
                  type="number"
                  inputMode="decimal"
                  step="any"
                  label="POS"
                  value={form.pos}
                  onChange={(event) => setForm((prev) => ({ ...prev, pos: event.target.value }))}
                />
              </div>
            </div>

            <DynamicNamedReadingSection
              title="TANK DIP"
              hint="Start with one tank dip, then add more as needed (e.g. Tank 1 PMS, Tank 2 AGO)."
              readings={form.tankReadings}
              onChange={(tankReadings) => setForm((prev) => ({ ...prev, tankReadings }))}
              addLabel="Add tank dip"
              nameLabel="Tank"
              namePlaceholder="e.g. Tank 1 (PMS)"
            />

            <DynamicNamedReadingSection
              title="PUMP READINGS"
              hint="Start with one pump, then add more as needed (e.g. Pump 1a PMS)."
              readings={form.pumpReadings}
              onChange={(pumpReadings) => setForm((prev) => ({ ...prev, pumpReadings }))}
              addLabel="Add pump"
              nameLabel="Pump"
              namePlaceholder="e.g. Pump 1a (PMS)"
            />

            <DescribedPhotoUploadSection
              photos={form.photoDrafts}
              onChange={(photoDrafts) => setForm((prev) => ({ ...prev, photoDrafts }))}
            />

            <label className="block space-y-1">
              <span className="text-sm font-medium">REMARK</span>
              <textarea
                rows={3}
                value={form.remark}
                onChange={(event) => setForm((prev) => ({ ...prev, remark: event.target.value }))}
                placeholder="Optional notes from the visit"
                className="h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
              />
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-blue-600 px-5 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? 'Submitting...' : 'Submit visit report'}
            </button>
          </form>
        </Card>
      ) : myVisits.length === 0 ? (
        <EmptyState title="No visits yet" description="Submitted station visits will appear here." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Station</th>
                <th className="px-3 py-2">Manager</th>
                <th className="px-3 py-2">Arrival</th>
                <th className="px-3 py-2">Departure</th>
                <th className="px-3 py-2">Cash</th>
                <th className="px-3 py-2">POS</th>
              </tr>
            </thead>
            <tbody>
              {myVisits.map((visit) => (
                <tr
                  key={visit.id}
                  onClick={() => setDetailVisit(visit)}
                  className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/60"
                >
                  <td className="px-3 py-3">{formatIsoToDmy(visit.visitDate) || visit.visitDate}</td>
                  <td className="px-3 py-3 font-medium">{visit.stationName}</td>
                  <td className="px-3 py-3">{visit.managerInCharge || '?'}</td>
                  <td className="px-3 py-3">{visit.arrivalTime || '?'}</td>
                  <td className="px-3 py-3">{visit.departureTime || '?'}</td>
                  <td className="px-3 py-3">{Number(visit.cash || 0).toLocaleString()}</td>
                  <td className="px-3 py-3">{Number(visit.pos || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <InspectorVisitDetailModal visit={detailVisit} onClose={() => setDetailVisit(null)} />
    </div>
  )
}

export default InspectorDashboardPage

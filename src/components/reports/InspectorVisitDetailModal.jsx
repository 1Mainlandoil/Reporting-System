import { normalizeNamedReadings } from '../../utils/inspectorVisitReadings'
import { formatIsoToDmy } from '../../utils/dateFormat'
import DescribedPhotoEvidenceList from '../ui/DescribedPhotoEvidenceList'

const DetailField = ({ label, value, className = '' }) => (
  <div className={className}>
    <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">{value ?? '—'}</p>
  </div>
)

const NamedReadingsList = ({ title, readings = [] }) => {
  const items = normalizeNamedReadings(readings)
  if (!items.length) {
    return null
  }

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, index) => (
          <div key={`${item.name}-${index}`}>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300">{item.name}</p>
            <p className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
              {item.value || '—'}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

const InspectorVisitDetailModal = ({ visit, onClose, title = 'Visit report' }) => {
  if (!visit) {
    return null
  }

  const visitDateLabel = formatIsoToDmy(visit.visitDate) || visit.visitDate

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {visit.stationName || visit.stationId} · {visitDateLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-1 text-sm dark:border-slate-600"
          >
            Close
          </button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <DetailField label="Inspector" value={visit.inspectorName} />
          <DetailField label="Manager in charge" value={visit.managerInCharge} />
          <DetailField label="Arrival" value={visit.arrivalTime} />
          <DetailField label="Departure" value={visit.departureTime} />
          <DetailField label="Cash (BF)" value={Number(visit.cashBf || 0).toLocaleString()} />
          <DetailField label="Cash" value={Number(visit.cash || 0).toLocaleString()} />
          <DetailField label="POS (BF)" value={Number(visit.posBf || 0).toLocaleString()} />
          <DetailField label="POS" value={Number(visit.pos || 0).toLocaleString()} />
        </div>

        <div className="mt-6 space-y-6">
          <NamedReadingsList title="Tank dip" readings={visit.tankReadings} />
          <NamedReadingsList title="Pump" readings={visit.pumpReadings} />
          <DescribedPhotoEvidenceList photos={visit.photoEvidence} />
          {visit.remark ? <DetailField label="Remark" value={visit.remark} className="sm:col-span-2" /> : null}
        </div>
      </div>
    </div>
  )
}

export default InspectorVisitDetailModal

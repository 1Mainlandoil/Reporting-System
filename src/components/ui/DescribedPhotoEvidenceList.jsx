import { normalizePhotoEvidence } from '../../utils/inspectorVisitReadings'

const DescribedPhotoEvidenceList = ({ title = 'Photo evidence', photos = [] }) => {
  const items = normalizePhotoEvidence(photos)
  if (!items.length) {
    return null
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((item, index) => (
          <div key={`${item.url}-${index}`} className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            <a href={item.url} target="_blank" rel="noreferrer" className="block">
              <img src={item.url} alt={item.description || `Photo ${index + 1}`} className="max-h-48 w-full object-cover" />
            </a>
            {item.description ? (
              <p className="border-t border-slate-200 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200">
                {item.description}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

export default DescribedPhotoEvidenceList

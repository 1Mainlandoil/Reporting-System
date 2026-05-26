import PhotoUploadInput from '../ui/PhotoUploadInput'

const PhotoDraftRow = ({ draft, onChange, onRemove }) => {
  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Photo description</span>
          <input
            value={draft.description}
            onChange={(event) => onChange({ ...draft, description: event.target.value })}
            placeholder="Describe what this photo shows"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={onRemove}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-rose-600 dark:border-slate-600"
          >
            Remove
          </button>
        </div>
      </div>
      <PhotoUploadInput
        className="mt-3"
        label="Upload image"
        value={draft.file}
        onChange={(file) => onChange({ ...draft, file })}
      />
    </div>
  )
}

const DescribedPhotoUploadSection = ({ photos, onChange }) => {
  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <p className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">PHOTO EVIDENCE</p>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Add as many photos as needed. Describe each image so supervisors can understand what it shows.
      </p>

      {photos.length ? (
        <div className="space-y-3">
          {photos.map((draft) => (
            <PhotoDraftRow
              key={draft.id}
              draft={draft}
              onChange={(next) => onChange(photos.map((item) => (item.id === draft.id ? next : item)))}
              onRemove={() => onChange(photos.filter((item) => item.id !== draft.id))}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">No photos added yet.</p>
      )}

      <button
        type="button"
        onClick={() =>
          onChange([
            ...photos,
            { id: `photo-${Date.now()}`, description: '', file: null },
          ])
        }
        className="mt-4 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white dark:bg-slate-700"
      >
        Add photo
      </button>
    </div>
  )
}

export default DescribedPhotoUploadSection

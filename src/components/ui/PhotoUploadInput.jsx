import { useEffect, useState } from 'react'

const PhotoUploadInput = ({ label = 'Upload photo', value = null, onChange, disabled = false, className = '' }) => {
  const [previewUrl, setPreviewUrl] = useState(null)

  useEffect(() => {
    if (!value) {
      setPreviewUrl(null)
      return undefined
    }
    const objectUrl = URL.createObjectURL(value)
    setPreviewUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [value])

  return (
    <div className={className}>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{label}</span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          disabled={disabled}
          onChange={(event) => onChange?.(event.target.files?.[0] || null)}
          className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 dark:text-slate-300 dark:file:bg-slate-700 dark:file:text-slate-100"
        />
      </label>
      {previewUrl ? (
        <div className="mt-2 flex items-start gap-2">
          <img src={previewUrl} alt="Preview" className="max-h-28 rounded-lg border border-slate-200 dark:border-slate-700" />
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange?.(null)}
            className="text-xs text-rose-600"
          >
            Remove
          </button>
        </div>
      ) : null}
    </div>
  )
}

export default PhotoUploadInput

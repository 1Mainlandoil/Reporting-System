import FormInput from '../ui/FormInput'

const DynamicNamedReadingSection = ({
  title,
  hint,
  readings,
  onChange,
  addLabel = 'Add reading',
  nameLabel = 'Field name',
  namePlaceholder = 'e.g. Tank 1 (PMS)',
  valuePlaceholder = 'Reading value',
}) => {
  const updateReading = (id, field, value) => {
    onChange(readings.map((item) => (item.id === id ? { ...item, [field]: value } : item)))
  }

  const removeReading = (id) => {
    if (readings.length <= 1) {
      onChange([{ id: `reading-${Date.now()}`, name: '', value: '' }])
      return
    }
    onChange(readings.filter((item) => item.id !== id))
  }

  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <p className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      {hint ? <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}

      <div className="space-y-3">
        {readings.map((reading) => (
          <div key={reading.id} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <FormInput
              label={nameLabel}
              value={reading.name}
              placeholder={namePlaceholder}
              onChange={(event) => updateReading(reading.id, 'name', event.target.value)}
            />
            <FormInput
              type="number"
              inputMode="decimal"
              step="any"
              label="Value"
              value={reading.value}
              placeholder={valuePlaceholder}
              onChange={(event) => updateReading(reading.id, 'value', event.target.value)}
            />
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => removeReading(reading.id)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-rose-600 dark:border-slate-600"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() =>
          onChange([
            ...readings,
            { id: `reading-${Date.now()}`, name: '', value: '' },
          ])
        }
        className="mt-4 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white dark:bg-slate-700"
      >
        {addLabel}
      </button>
    </div>
  )
}

export default DynamicNamedReadingSection

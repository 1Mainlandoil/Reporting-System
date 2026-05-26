import { useEffect, useState } from 'react'
import { formatIsoToDmy, isValidIsoDate, parseDmyToIso } from '../../utils/dateFormat'

const DateInput = ({ label, value, onChange, required = false, readOnly = false, className = '' }) => {
  const [display, setDisplay] = useState(() => formatIsoToDmy(value))

  useEffect(() => {
    setDisplay(formatIsoToDmy(value))
  }, [value])

  const handleChange = (event) => {
    const nextDisplay = event.target.value
    setDisplay(nextDisplay)
    const iso = parseDmyToIso(nextDisplay)
    if (iso && isValidIsoDate(iso)) {
      onChange?.(iso)
    }
  }

  const handleBlur = () => {
    const iso = parseDmyToIso(display)
    if (iso && isValidIsoDate(iso)) {
      onChange?.(iso)
      setDisplay(formatIsoToDmy(iso))
      return
    }
    setDisplay(formatIsoToDmy(value))
  }

  return (
    <label className="space-y-1">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        placeholder="DD/MM/YYYY"
        value={display}
        readOnly={readOnly}
        required={required}
        onChange={handleChange}
        onBlur={handleBlur}
        className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 ${className}`}
      />
      {!readOnly ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">Day / month / year (DD/MM/YYYY)</p>
      ) : null}
    </label>
  )
}

export default DateInput

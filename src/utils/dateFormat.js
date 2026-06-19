export const isValidIsoDate = (iso) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return false
  }
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export const getLocalIsoDate = (date = new Date()) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const getReportingDateIso = (date = new Date()) => {
  const reportingDate = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1)
  return getLocalIsoDate(reportingDate)
}

export const formatIsoToDmy = (iso) => {
  if (!iso || !isValidIsoDate(iso)) {
    return ''
  }
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

export const parseDmyToIso = (display) => {
  if (!display) {
    return null
  }

  const normalized = String(display).trim().replace(/-/g, '/')
  const parts = normalized.split('/').map((part) => part.trim())
  if (parts.length !== 3) {
    return null
  }

  const [dayPart, monthPart, yearPart] = parts
  const day = Number(dayPart)
  const month = Number(monthPart)
  const year = Number(yearPart)
  if (!day || !month || !year || year < 1000) {
    return null
  }

  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return isValidIsoDate(iso) ? iso : null
}

/** ISO calendar date YYYY-MM-DD (UTC). */
export const addCalendarDaysIso = (isoDate, deltaDays) => {
  const [y, m, d] = isoDate.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + deltaDays)
  return dt.toISOString().slice(0, 10)
}

const formatIsoHuman = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Locale-friendly label for a calendar day (staff reminders). */
export const formatStaffCalendarDay = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** ISO dates from firstMissingIso through todayIso inclusive (missing streak). */
/**
 * Earliest calendar date ≤ todayIso with no submission, scanning from the station's
 * earliest stored report date forward (does not invent days before first submission).
 */
export const getOldestMissingReportDateUpTo = (todayIso, reportDatesSet) => {
  if (!reportDatesSet || reportDatesSet.size === 0) {
    return null
  }
  const sorted = [...reportDatesSet].filter(Boolean).sort()
  const minSubmitted = sorted[0]
  if (!minSubmitted || minSubmitted > todayIso) {
    return null
  }
  let cursor = minSubmitted
  while (cursor <= todayIso) {
    if (!reportDatesSet.has(cursor)) {
      return cursor
    }
    cursor = addCalendarDaysIso(cursor, 1)
  }
  return null
}

export const listMissedReportDatesInclusive = (firstMissingIso, todayIso) => {
  if (!firstMissingIso || !todayIso || firstMissingIso > todayIso) {
    return []
  }
  const out = []
  let cursor = firstMissingIso
  for (;;) {
    out.push(cursor)
    if (cursor === todayIso) {
      break
    }
    cursor = addCalendarDaysIso(cursor, 1)
  }
  return out
}

const formatRangeHuman = (startIso, endIso) => {
  if (startIso === endIso) {
    return formatIsoHuman(startIso)
  }
  return `${formatIsoHuman(startIso)} – ${formatIsoHuman(endIso)}`
}

/**
 * Walk backward from today until we hit a calendar day that has a submission.
 * @param {string} todayIso
 * @param {Set<string>} reportDatesSet distinct report dates for one station
 */
export const getDailyReportPendingInfo = (todayIso, reportDatesSet) => {
  if (!reportDatesSet || reportDatesSet.size === 0) {
    return {
      pendingDays: null,
      firstMissingIso: null,
      lastSubmittedIso: null,
      noPriorSubmissions: true,
    }
  }

  let cursor = todayIso
  let pendingDays = 0
  const maxScan = 370

  while (pendingDays < maxScan) {
    if (reportDatesSet.has(cursor)) {
      break
    }
    pendingDays++
    cursor = addCalendarDaysIso(cursor, -1)
  }

  if (pendingDays >= maxScan) {
    const firstMissingIso = addCalendarDaysIso(todayIso, -(maxScan - 1))
    return {
      pendingDays: maxScan,
      firstMissingIso,
      lastSubmittedIso: null,
      noPriorSubmissions: false,
    }
  }

  const lastSubmittedIso = cursor

  if (pendingDays === 0) {
    return {
      pendingDays: 0,
      firstMissingIso: null,
      lastSubmittedIso,
      noPriorSubmissions: false,
    }
  }

  const firstMissingIso = addCalendarDaysIso(lastSubmittedIso, 1)

  return {
    pendingDays,
    firstMissingIso,
    lastSubmittedIso,
    noPriorSubmissions: false,
  }
}

/**
 * UI / export strings for pending streak (daily report not filed through today).
 */
export const formatPendingSubmissionSummary = (info, todayIso) => {
  if (info.noPriorSubmissions) {
    return {
      tableTitle: 'No submissions yet',
      exportText: 'No prior daily submissions on record',
    }
  }
  if (info.pendingDays === 0) {
    return {
      tableTitle: `Up to date (${formatIsoHuman(todayIso)})`,
      exportText: `Submitted for ${todayIso}`,
    }
  }
  const rangeHuman = formatRangeHuman(info.firstMissingIso, todayIso)
  const subtitleParts = [rangeHuman]
  if (info.lastSubmittedIso) {
    subtitleParts.push(`last submitted ${formatIsoHuman(info.lastSubmittedIso)}`)
  }
  return {
    tableTitle: `${info.pendingDays} day${info.pendingDays !== 1 ? 's' : ''}`,
    tableSubtitle: subtitleParts.join(' · '),
    exportText: `${info.pendingDays} calendar day(s) without submission (${info.firstMissingIso} → ${todayIso})${
      info.lastSubmittedIso ? `; prior submission ${info.lastSubmittedIso}` : ''
    }`,
  }
}

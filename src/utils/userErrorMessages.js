/** Turn unknown thrown values (incl. Supabase objects) into readable text. */
export const extractErrorMessage = (error) => {
  if (!error) {
    return ''
  }
  if (typeof error === 'string') {
    return error
  }
  if (error instanceof Error) {
    return error.message || 'Unknown error'
  }
  if (typeof error === 'object') {
    const parts = [error.message, error.details, error.hint, error.code].filter(Boolean)
    if (parts.length) {
      return parts.join(' — ')
    }
    try {
      const json = JSON.stringify(error)
      if (json && json !== '{}') {
        return json
      }
    } catch {
      /* ignore */
    }
  }
  return String(error)
}

export const withSolution = (problem, solution) => `${problem}\n\nWhat to do: ${solution}`

export const notifyBlockedProcess = (setSubmitError, message) => {
  if (typeof setSubmitError === 'function') {
    setSubmitError(message)
  }
  window.alert(message)
}

export const formatSupabaseSaveError = (error) => {
  const raw = extractErrorMessage(error)
  if (raw.includes('What to do:')) {
    return raw
  }
  const lower = raw.toLowerCase()

  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('load failed')
  ) {
    return withSolution(
      'Could not reach the server to save your report.',
      'Check mobile data or Wi‑Fi, wait a few seconds, and submit again. If it keeps failing, try another network or contact IT.',
    )
  }

  if (!raw || lower === '[object object]') {
    return withSolution(
      'The report could not be saved to the server.',
      'Check your internet connection and try again. If the problem continues, contact IT with your station name and the time you tried.',
    )
  }

  if (lower.includes('supabase is not configured')) {
    return withSolution(
      'This app is not connected to the database.',
      'Contact IT — the live site may be missing Supabase settings.',
    )
  }

  if (
    lower.includes('station_id') ||
    lower.includes('foreign key') ||
    lower.includes('stations')
  ) {
    return withSolution(
      'This station is not set up correctly in the database.',
      'Contact IT or your admin. They must confirm your station exists in Supabase and your manager account is linked to it.',
    )
  }

  if (
    lower.includes('column') &&
    (lower.includes('does not exist') ||
      lower.includes('not found') ||
      lower.includes('schema cache'))
  ) {
    return withSolution(
      'The database is missing fields required for daily reports.',
      'Ask IT to run the latest supabase/schema.sql in the Supabase SQL Editor, then try again.',
    )
  }

  if (
    lower.includes('duplicate key') ||
    lower.includes('ux_daily_reports_station_date') ||
    lower.includes('already exists')
  ) {
    return withSolution(
      'A report for this station and date is already saved.',
      'Open History to view that report. Do not submit the same date again.',
    )
  }

  if (lower.includes('row-level security') || lower.includes('policy')) {
    return withSolution(
      'The server blocked this save (database permissions).',
      'Ask IT to run supabase/schema.sql so report insert policies are in place.',
    )
  }

  if (lower.includes('bucket') || lower.includes('storage')) {
    return withSolution(
      'Photo storage is not ready on the server.',
      'Ask IT to run supabase/schema.sql (report-evidence bucket). You can retry without photos, or try again after IT fixes storage.',
    )
  }

  return withSolution(`Could not save your report: ${raw}`, 'Try again in a moment. If it keeps failing, contact IT with this message.')
}

export const formatPhotoUploadError = (error) => {
  const raw = extractErrorMessage(error)
  const lower = raw.toLowerCase()

  if (
    lower.includes('failed to fetch') ||
    lower.includes('network') ||
    lower.includes('load failed')
  ) {
    return withSolution(
      'Could not upload the photo — no stable connection to the server.',
      'Switch to stronger mobile data or Wi‑Fi and try again. You can also remove the photo and submit the report, then ask IT to fix photo upload later.',
    )
  }

  if (lower.includes('bucket') || lower.includes('not found')) {
    return withSolution(
      'Photo storage is not set up on the server.',
      'Contact IT to run supabase/schema.sql. Submit without the photo for now if you are blocked.',
    )
  }

  if (raw) {
    return withSolution(`Could not upload the photo: ${raw}`, 'Retry with a smaller image or better network, or submit without the photo.')
  }

  return withSolution(
    'Could not upload the photo.',
    'Check your connection and try again, or submit the report without the photo.',
  )
}

export const formatReportSubmitError = (outcome) => {
  if (!outcome || outcome.ok !== false) {
    return withSolution('Could not submit this report.', 'Try again. If it keeps failing, contact support.')
  }

  switch (outcome.error) {
    case 'no_station':
      return withSolution(
        'Your account is not linked to a retail station.',
        'Ask your admin to assign you to the correct station before submitting daily reports.',
      )
    case 'duplicate_date':
      return withSolution(
        'A report for this date is already saved.',
        'Open History to view it. Use Daily Report for today only, or History if you need a different date.',
      )
    case 'catch_up_order':
      return outcome.allowedPast
        ? withSolution(
            `You must submit ${outcome.allowedPast} before this date.`,
            `Go to History, select ${outcome.allowedPast}, complete and submit that report, then work forward day by day.`,
          )
        : withSolution(
            'An older missing report must be submitted first.',
            'Open History, pick the earliest missing date allowed, submit it, then continue in date order.',
          )
    case 'sync_failed':
      return formatSupabaseSaveError(outcome.rawError ?? outcome.message)
    default:
      return withSolution(
        'Could not submit this report.',
        'Check your connection and try again. Contact support if the problem continues.',
      )
  }
}

export const formatFormValidationError = (fieldLabel, context = 'default') => {
  const solutions = {
    baseline: `Enter ${fieldLabel} — required for the first report after a reset.`,
    noSales: 'Type a short reason (e.g. station closed, no power) and submit again.',
    required: `Fill in ${fieldLabel}, then submit again.`,
    received: 'Enter liters received for PMS and/or AGO, or change Received Product to No.',
    price: `Enter ${fieldLabel} before submitting.`,
    pump: 'Choose the pump, enter opening and closing readings, then add the line.',
    reportingDisabled:
      'Daily reporting is turned off in Settings. Ask admin to re-enable it, then try again.',
  }

  if (context === 'reportingDisabled') {
    return withSolution('Daily reporting is disabled.', solutions.reportingDisabled)
  }
  if (context === 'noSales') {
    return withSolution('No-sales day needs a reason.', solutions.noSales)
  }
  if (context === 'received') {
    return withSolution('Received product quantities are missing.', solutions.received)
  }
  if (context === 'baseline') {
    return withSolution(`${fieldLabel} is required.`, solutions.baseline)
  }
  if (context === 'price') {
    return withSolution(`${fieldLabel} is required.`, solutions.price)
  }
  if (context === 'pump') {
    return withSolution('Pump reading is incomplete.', solutions.pump)
  }
  if (context === 'salesQuantity') {
    return withSolution(
      'Quantity sold does not match pump readings.',
      'Recheck today’s pump closing, last reading, RTT, and the liters you entered for PMS and AGO.',
    )
  }

  return withSolution(`${fieldLabel} is required.`, solutions.required)
}

export const formatSalesQuantityMismatchError = ({ productLabel, managerLiters, calculatedLiters }) =>
  withSolution(
    `${productLabel} quantity sold does not match pump readings (you entered ${Math.round(Number(managerLiters) || 0).toLocaleString()} L; system shows ${Math.round(Number(calculatedLiters) || 0).toLocaleString()} L).`,
    'Recheck today’s pump closing, last reading, RTT, and your entered quantity sold.',
  )

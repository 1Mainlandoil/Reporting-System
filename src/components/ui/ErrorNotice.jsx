const ErrorNotice = ({ message, tone = 'error' }) => {
  if (!message) return null

  const isError = tone === 'error'
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-sm ${
        isError
          ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200'
          : 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200'
      }`}
    >
      {message}
    </div>
  )
}

export default ErrorNotice

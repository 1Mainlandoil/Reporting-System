const EmptyState = ({ title, message }) => {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center dark:border-slate-700">
      <h3 className="text-base font-semibold text-slate-700 dark:text-slate-100">{title}</h3>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{message}</p>
    </div>
  )
}

export default EmptyState

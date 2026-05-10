const LoadingSkeleton = () => {
  return (
    <div className="space-y-3">
      <div className="h-4 w-1/3 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
      <div className="h-40 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-700" />
      <div className="h-24 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-700" />
    </div>
  )
}

export default LoadingSkeleton

/** Consistent block for dedicated filter screens (stacked layout). */
const FilterScreenSection = ({ title, description, children }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
    {(title || description) && (
      <header className="mb-4 border-b border-slate-100 pb-3 dark:border-slate-800">
        {title ? (
          <h3 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h3>
        ) : null}
        {description ? (
          <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>
        ) : null}
      </header>
    )}
    {children}
  </section>
)

export default FilterScreenSection

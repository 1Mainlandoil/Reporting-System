/** Consistent block for dedicated filter screens (stacked layout). */
const FilterScreenSection = ({ title, description, children }) => (
  <section className="rounded-2xl border border-white/8 bg-white/5 p-5 shadow-sm dark:border-slate-700 dark:bg-[#0d1220]">
    {(title || description) && (
      <header className="mb-4 border-b border-white/5 pb-3 dark:border-slate-800">
        {title ? (
          <h3 className="text-sm font-semibold tracking-tight text-white dark:text-white">{title}</h3>
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

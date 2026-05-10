import clsx from 'clsx'

const Card = ({ children, className }) => {
  return (
    <div
      className={clsx(
        'rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-900 dark:shadow-none',
        className,
      )}
    >
      {children}
    </div>
  )
}

export default Card

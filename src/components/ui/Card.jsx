import clsx from 'clsx'

const Card = ({ children, className }) => {
  return (
    <div
      className={clsx(
        'rounded-2xl border border-white/5 bg-[#0d1220] p-5 shadow-[0_4px_24px_rgba(0,0,0,0.4)]',
        className,
      )}
    >
      {children}
    </div>
  )
}

export default Card

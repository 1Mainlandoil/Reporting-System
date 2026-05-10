import clsx from 'clsx'
import { STATUS_META } from '../../constants/status'

const StatusBadge = ({ status }) => {
  const meta = STATUS_META[status] || {
    label: 'Unknown',
    classes: 'bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-200',
  }
  return (
    <span className={clsx('rounded-full px-3 py-1 text-xs font-semibold', meta.classes)}>
      {meta.label}
    </span>
  )
}

export default StatusBadge

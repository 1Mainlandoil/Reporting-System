export const STATION_STATUS = {
  CRITICAL: 'critical',
  WARNING: 'warning',
  SAFE: 'safe',
}

export const STATUS_META = {
  [STATION_STATUS.CRITICAL]: {
    label: 'Critical',
    classes: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
  },
  [STATION_STATUS.WARNING]: {
    label: 'Warning',
    classes: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-300',
  },
  [STATION_STATUS.SAFE]: {
    label: 'Safe',
    classes: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  },
}

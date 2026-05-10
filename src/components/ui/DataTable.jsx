import clsx from 'clsx'
import EmptyState from './EmptyState'

const DataTable = ({
  columns,
  rows,
  onRowClick,
  tableClassName = 'min-w-full',
  wrapHeaders = false,
  wrapCells = false,
  stickyColumns = [],
  stickyColumnWidths = {},
  emptyState,
}) => {
  const getRowKey = (row, index) => row.id || row.stationId || `${index}-${row.date || 'row'}`
  const stickySet = new Set(stickyColumns)

  const stickyLeftByKey = columns.reduce(
    (acc, column) => {
      if (!stickySet.has(column.key)) {
        return acc
      }
      const width = stickyColumnWidths[column.key] ?? 180
      acc.leftByKey[column.key] = acc.nextLeft
      acc.nextLeft += width
      return acc
    },
    { leftByKey: {}, nextLeft: 0 },
  ).leftByKey

  return (
    <div className="space-y-3">
      {!rows.length && emptyState ? (
        <EmptyState
          title={emptyState.title || 'No records found'}
          message={emptyState.message || 'Try adjusting filters or adding records.'}
        />
      ) : null}
      {rows.length ? (
      <div className="grid gap-3 md:hidden">
        {rows.map((row, index) => (
          <div
            key={getRowKey(row, index)}
            onClick={() => onRowClick?.(row)}
            className={clsx(
              'rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950',
              onRowClick ? 'cursor-pointer active:opacity-90' : '',
            )}
          >
            <div className="space-y-2">
              {columns.map((column) => (
                <div key={column.key} className="flex items-start justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {column.header}
                  </p>
                  <div className="text-right text-sm text-slate-700 dark:text-slate-200">
                    {column.render ? column.render(row) : row[column.key]}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      ) : null}

      {rows.length ? (
      <div className="hidden overflow-x-auto scroll-smooth rounded-xl border border-slate-200 md:block dark:border-slate-800">
        <table className={clsx(tableClassName, 'divide-y divide-slate-200 text-sm dark:divide-slate-800')}>
          <thead className="bg-slate-50 dark:bg-slate-900/70">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={clsx(
                    'px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300',
                    wrapHeaders ? 'whitespace-normal' : 'whitespace-nowrap',
                    stickySet.has(column.key) &&
                      'sticky z-20 border-r border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/95',
                  )}
                  style={
                    stickySet.has(column.key)
                      ? {
                          left: `${stickyLeftByKey[column.key]}px`,
                          minWidth: `${stickyColumnWidths[column.key] ?? column.minWidth ?? 180}px`,
                          width: column.width ? `${column.width}px` : undefined,
                        }
                      : {
                          minWidth: column.minWidth ? `${column.minWidth}px` : undefined,
                          width: column.width ? `${column.width}px` : undefined,
                        }
                  }
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-950">
            {rows.map((row, index) => (
              <tr
                key={getRowKey(row, index)}
                onClick={() => onRowClick?.(row)}
                className={`transition ${
                  onRowClick
                    ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/60'
                    : ''
                }`}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={clsx(
                      'px-4 py-3 text-slate-700 dark:text-slate-200',
                      wrapCells ? 'whitespace-normal' : 'whitespace-nowrap',
                      stickySet.has(column.key) &&
                        'sticky z-10 border-r border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-950',
                    )}
                    style={
                      stickySet.has(column.key)
                        ? {
                            left: `${stickyLeftByKey[column.key]}px`,
                            minWidth: `${stickyColumnWidths[column.key] ?? column.minWidth ?? 180}px`,
                            width: column.width ? `${column.width}px` : undefined,
                          }
                        : {
                            minWidth: column.minWidth ? `${column.minWidth}px` : undefined,
                            width: column.width ? `${column.width}px` : undefined,
                          }
                    }
                  >
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      ) : null}
    </div>
  )
}

export default DataTable

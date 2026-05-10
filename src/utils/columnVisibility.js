/** Columns with pickable === false always show (e.g. actions). */
export const filterColumnsForTable = (columns, visibleKeys) =>
  columns.filter((c) => c.pickable === false || visibleKeys.has(c.key))

/** Build Excel column specs from visible table/export columns (every column included). */
export const columnsToExportSpecs = (columns) =>
  columns.map((c) => ({
    header: String(c.exportHeader ?? c.header),
    pick: c.exportPick ?? ((row) => row[c.key]),
  }))

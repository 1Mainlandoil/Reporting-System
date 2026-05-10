/** Empty stationIds (and legacy stationId "all") means no station restriction. */
export const matchesStationMultiFilter = (stationId, filters) => {
  const ids = filters?.stationIds
  if (Array.isArray(ids) && ids.length > 0) {
    return ids.includes(stationId)
  }
  const legacy = filters?.stationId
  if (legacy && legacy !== 'all') {
    return legacy === stationId
  }
  return true
}

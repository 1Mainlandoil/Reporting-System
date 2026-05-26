export const buildManagerNameByStation = (users = []) =>
  new Map(
    users
      .filter((user) => user.role === 'staff' && user.stationId)
      .map((user) => [user.stationId, user.name]),
  )

export const getManagerNameForStation = (users, stationId) => {
  if (!stationId) {
    return ''
  }
  return buildManagerNameByStation(users).get(stationId) || ''
}

const stationNames = [
  'ABA 1',
  'ABA 2',
  'ABA 3',
  'ABAKALIKI 1',
  'ABAKILIKI 2',
  'ABUJA 1',
  'ABUJA 2',
  'AMUDA',
  'ASABA',
  'AWKA ROAD',
  'CALABAR 1',
  'CALABAR 2',
  'CALABAR 3',
  'CALABAR 4',
  'ENUGU 1',
  'ENUGU 2',
  'ENUGU 3',
  'GBOKO',
  'IKORODU',
  'JOS',
  'KANO',
  'LIMCA',
  'LOKPA',
  'NGODO',
  'NNEATO',
  'NSUKKA',
  'OGUTA',
  'OKIGWE',
  'ONITSHA 33',
  'ORON 1',
  'ORON 2',
  'UMUAHIA 1',
  'UMUAHIA 2',
  'UMUAHIA 3',
  'UMUEHIHIE',
  'UMUOJI',
  'UYO',
  'UYO 2',
]

const random = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

const formatDate = (offset) => {
  const date = new Date()
  date.setDate(date.getDate() - offset)
  return date.toISOString().split('T')[0]
}

export const stations = stationNames.map((name, index) => ({
  id: `stn-${index + 1}`,
  name,
  location: `Zone ${index % 4 + 1}`,
}))

/** Bump when this catalog changes so persisted localStorage refreshes `stations`. */
export const STATION_CATALOG_PERSIST_VERSION = 1

export const mockUsers = [
  { id: 'mgr-1', name: 'Chinedu Okafor', role: 'staff', stationId: 'stn-1' },
  { id: 'mgr-2', name: 'Amina Bello', role: 'staff', stationId: 'stn-2' },
  { id: 'mgr-3', name: 'Grace Effiong', role: 'staff', stationId: 'stn-3' },
  { id: 'sup-1', name: 'Tunde Alabi', role: 'supervisor', stationId: null },
  { id: 'sup-2', name: 'Martha Eze', role: 'supervisor', stationId: null },
  { id: 'admin-1', name: 'System Admin', role: 'admin', stationId: null },
]

export const dailyReports = stations.flatMap((station) => {
  return Array.from({ length: 7 }).map((_, dayIndex) => {
    const openingPMS = random(14000, 32000)
    const receivedPMS = random(1000, 10000)
    const salesPMS = random(7000, 14000)
    const openingAGO = random(7000, 18000)
    const receivedAGO = random(500, 6000)
    const salesAGO = random(3000, 9500)

    return {
      id: `${station.id}-${dayIndex + 1}`,
      stationId: station.id,
      date: formatDate(6 - dayIndex),
      openingPMS,
      receivedPMS,
      salesPMS,
      openingAGO,
      receivedAGO,
      salesAGO,
      remarks: dayIndex % 2 ? 'Normal dispatch window' : 'Slight queue during peak hours',
    }
  })
})

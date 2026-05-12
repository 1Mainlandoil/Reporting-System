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


export const stations = stationNames.map((name, index) => ({
  id: `stn-${index + 1}`,
  name,
  location: `Zone ${index % 4 + 1}`,
}))

/** Bump when this catalog changes so persisted localStorage refreshes `stations`. */
export const STATION_CATALOG_PERSIST_VERSION = 2

export const mockUsers = []

export const dailyReports = []

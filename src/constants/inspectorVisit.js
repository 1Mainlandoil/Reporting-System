export const DEMO_INSPECTOR = {
  email: 'inspector@mainlandoil.com',
  password: 'Inspector1!',
  userId: 'insp-demo-1',
  name: 'Demo Inspector',
}

export const createNamedReading = () => ({
  id: `reading-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  name: '',
  value: '',
})

export const createPhotoDraft = () => ({
  id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  description: '',
  file: null,
})

export const emptyNamedReadings = () => [createNamedReading()]

export const sanitizeNamedReadings = (readings = []) =>
  (Array.isArray(readings) ? readings : [])
    .map((item) => ({
      id: item.id || createNamedReading().id,
      name: String(item.name ?? '').trim(),
      value: String(item.value ?? '').trim(),
    }))
    .filter((item) => item.name && item.value)

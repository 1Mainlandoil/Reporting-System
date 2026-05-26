export const normalizeNamedReadings = (readings = []) => {
  if (!Array.isArray(readings)) {
    return []
  }

  return readings
    .map((item, index) => {
      if (item?.name != null) {
        return {
          name: String(item.name || '').trim(),
          value: String(item.value ?? '').trim(),
        }
      }

      return {
        name: String(item?.label || item?.key || `Reading ${index + 1}`).trim(),
        value: String(item?.value ?? '').trim(),
      }
    })
    .filter((item) => item.name || item.value)
}

export const normalizePhotoEvidence = (photos = []) => {
  if (!Array.isArray(photos)) {
    return []
  }

  return photos
    .map((item) => ({
      description: String(item?.description || '').trim(),
      url: String(item?.url || '').trim(),
    }))
    .filter((item) => item.url)
}

/**
 * Merge remote station rows with the in-code catalog so names/locations stay
 * current while preserving any extra fields from Supabase for matching ids.
 * Stations only present remotely are appended after the canonical list.
 */
export function mergeStationCatalog(canonical, remote) {
  if (!Array.isArray(canonical) || !canonical.length) {
    return Array.isArray(remote) ? remote : []
  }
  if (!Array.isArray(remote) || !remote.length) {
    return canonical
  }
  const remoteById = new Map(remote.map((r) => [r.id, r]))
  const merged = canonical.map((c) => {
    const r = remoteById.get(c.id)
    return r ? { ...r, name: c.name, location: c.location } : c
  })
  const canonIds = new Set(canonical.map((c) => c.id))
  const extras = remote.filter((r) => r?.id && !canonIds.has(r.id))
  return [...merged, ...extras]
}

/** URL for files in `public/` when using a non-root Vite `base` (e.g. GitHub Pages `/Reporting-System/`). */
export function publicUrl(path) {
  const base = import.meta.env.BASE_URL || '/'
  const p = path.startsWith('/') ? path.slice(1) : path
  return `${base}${p}`
}

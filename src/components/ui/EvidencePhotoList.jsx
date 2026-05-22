const EvidencePhotoList = ({ title = 'Photo evidence', photos = [] }) => {
  const urls = (Array.isArray(photos) ? photos : [photos]).filter(Boolean)
  if (!urls.length) {
    return null
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <p className="mb-2 text-xs uppercase text-slate-500">{title}</p>
      <div className="flex flex-wrap gap-3">
        {urls.map((url, index) => (
          <a
            key={`${url}-${index}`}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700"
          >
            <img src={url} alt={`${title} ${index + 1}`} className="max-h-40 max-w-full object-cover" />
          </a>
        ))}
      </div>
    </div>
  )
}

export default EvidencePhotoList

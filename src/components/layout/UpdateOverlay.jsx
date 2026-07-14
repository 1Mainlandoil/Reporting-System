import { useState } from 'react'
import { MAINLAND_LOGO_SRC } from '../../constants/brandLogo'
import { APP_VERSION } from '../../constants/appVersion'

export default function UpdateOverlay({ onDismiss }) {
  const [status, setStatus] = useState('idle') // idle | updating | done

  const handleUpdate = async () => {
    setStatus('updating')
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        await Promise.all(registrations.map((r) => r.unregister()))
      }
      if (window.caches) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
      localStorage.setItem('app_version', APP_VERSION)
      setStatus('done')
      window.setTimeout(() => window.location.reload(true), 800)
    } catch {
      localStorage.setItem('app_version', APP_VERSION)
      window.location.reload(true)
    }
  }

  return (
    <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-[#0a0e1a] px-6">
      <img src={MAINLAND_LOGO_SRC} alt="MEST" className="mb-10 h-20 w-auto" />

      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0d1220] p-8 text-center shadow-2xl">
        <div className="mb-2 text-3xl">🚀</div>
        <h2 className="mb-2 text-xl font-bold text-white">New Update Available</h2>
        <p className="mb-6 text-sm text-slate-400">
          A new version of the app is ready. Tap below to install the update — it only takes a few seconds.
        </p>

        <button
          type="button"
          onClick={handleUpdate}
          disabled={status !== 'idle'}
          className={`w-full rounded-xl px-4 py-3 text-sm font-bold transition ${
            status === 'done'
              ? 'bg-[#a9cd39]/20 text-[#a9cd39]'
              : status === 'updating'
                ? 'cursor-not-allowed bg-white/5 text-slate-400'
                : 'bg-[#a9cd39] text-black hover:bg-[#bcd94a]'
          }`}
        >
          {status === 'updating'
            ? '⟳ Installing update...'
            : status === 'done'
              ? '✓ Done — reloading...'
              : '↺ Update Now'}
        </button>

        <p className="mt-4 text-xs text-slate-600">v{APP_VERSION}</p>
      </div>
    </div>
  )
}

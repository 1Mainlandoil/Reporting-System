import { useEffect, useRef, useState } from 'react'
import { MAINLAND_LOGO_SRC } from '../../constants/brandLogo'

export default function SplashOverlay() {
  const [phase, setPhase] = useState('show')   // show | fallback | fade | hidden
  const videoRef = useRef(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const dismiss = () => setPhase('fade')

    video.addEventListener('ended', dismiss)

    const tryPlay = () => {
      const promise = video.play()
      if (promise !== undefined) {
        promise.catch(() => {
          // Autoplay blocked — show logo fallback, let user tap to continue
          setPhase('fallback')
        })
      }
    }

    const t = window.setTimeout(tryPlay, 80)
    // Hard cap — never block the app more than 10s
    const hardFallback = window.setTimeout(dismiss, 10000)

    return () => {
      video.removeEventListener('ended', dismiss)
      window.clearTimeout(t)
      window.clearTimeout(hardFallback)
    }
  }, [])

  useEffect(() => {
    if (phase !== 'fade') return
    const t = window.setTimeout(() => setPhase('hidden'), 400)
    return () => window.clearTimeout(t)
  }, [phase])

  if (phase === 'hidden') return null

  return (
    <div
      onClick={() => setPhase('fade')}
      className={`fixed inset-0 z-[200] bg-black transition-opacity duration-400 ease-out ${
        phase === 'fade' ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
      aria-hidden="true"
    >
      <video
        ref={videoRef}
        src="/splash.mp4"
        autoPlay
        muted
        playsInline
        preload="auto"
        className={`h-full w-full object-cover transition-opacity duration-300 ${
          phase === 'fallback' ? 'opacity-0' : 'opacity-100'
        }`}
      />

      {phase === 'fallback' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
          <img src={MAINLAND_LOGO_SRC} alt="MEST" className="h-24 w-auto" />
          <p className="animate-pulse text-xs text-white/40">Tap anywhere to continue</p>
        </div>
      )}
    </div>
  )
}

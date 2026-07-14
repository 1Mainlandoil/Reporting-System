import { useEffect, useRef, useState } from 'react'

export default function SplashOverlay() {
  const [phase, setPhase] = useState('show')
  const videoRef = useRef(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onEnded = () => setPhase('fade')
    video.addEventListener('ended', onEnded)

    // Fallback: if video fails to load or play, hide after 5s
    const fallback = window.setTimeout(() => setPhase('fade'), 8000)

    video.play().catch(() => setPhase('fade'))

    return () => {
      video.removeEventListener('ended', onEnded)
      window.clearTimeout(fallback)
    }
  }, [])

  useEffect(() => {
    if (phase === 'fade') {
      const t = window.setTimeout(() => setPhase('hidden'), 400)
      return () => window.clearTimeout(t)
    }
  }, [phase])

  if (phase === 'hidden') return null

  return (
    <div
      className={`fixed inset-0 z-[200] bg-black transition-opacity duration-400 ease-out ${
        phase === 'fade' ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
      aria-hidden="true"
    >
      <video
        ref={videoRef}
        src="/splash.mp4"
        muted
        playsInline
        className="h-full w-full object-cover"
      />
    </div>
  )
}

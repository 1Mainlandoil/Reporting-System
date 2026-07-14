import { useEffect, useRef, useState } from 'react'

export default function SplashOverlay() {
  const [phase, setPhase] = useState('show')
  const videoRef = useRef(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const dismiss = () => setPhase('fade')

    video.addEventListener('ended', dismiss)

    // Force play — works on mobile when muted + playsInline + autoPlay are all set
    const tryPlay = () => {
      const promise = video.play()
      if (promise !== undefined) {
        promise.catch(() => {
          // Browser blocked autoplay — skip splash immediately
          dismiss()
        })
      }
    }

    // Small delay lets the DOM settle before play() on iOS Safari
    const t = window.setTimeout(tryPlay, 80)

    // Hard fallback — never block the app more than 8 seconds
    const fallback = window.setTimeout(dismiss, 8000)

    return () => {
      video.removeEventListener('ended', dismiss)
      window.clearTimeout(t)
      window.clearTimeout(fallback)
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
        className="h-full w-full object-cover"
      />
    </div>
  )
}

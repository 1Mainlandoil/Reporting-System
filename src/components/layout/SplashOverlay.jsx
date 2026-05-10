import { useEffect, useState } from 'react'

const SPLASH_MS = 3000
const FADE_MS = 400

/** Facebook-style branded splash on cold load (full page refresh). */
export default function SplashOverlay() {
  const [phase, setPhase] = useState('show')

  useEffect(() => {
    const fadeTimer = window.setTimeout(() => setPhase('fade'), SPLASH_MS - FADE_MS)
    const hideTimer = window.setTimeout(() => setPhase('hidden'), SPLASH_MS)
    return () => {
      window.clearTimeout(fadeTimer)
      window.clearTimeout(hideTimer)
    }
  }, [])

  if (phase === 'hidden') {
    return null
  }

  return (
    <div
      className={`fixed inset-0 z-[200] flex flex-col items-center justify-center gap-5 bg-[#000000] px-6 transition-opacity duration-300 ease-out ${
        phase === 'fade' ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
      aria-hidden="true"
    >
      <img
        src="/mainland-logo.png"
        alt=""
        className="h-16 w-auto max-w-[min(280px,85vw)] object-contain brightness-110 contrast-105 drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)]"
      />
      <p className="text-center font-serif text-lg font-extrabold uppercase tracking-[0.18em] text-white md:text-xl">
        Mainland Reporting System
      </p>
    </div>
  )
}

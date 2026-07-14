import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import SplashOverlay from './components/layout/SplashOverlay.jsx'
import UpdateOverlay from './components/layout/UpdateOverlay.jsx'
import { APP_VERSION } from './constants/appVersion.js'

function Root() {
  const [needsUpdate, setNeedsUpdate] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('app_version')
    if (stored !== APP_VERSION) {
      setNeedsUpdate(true)
    }
  }, [])

  if (needsUpdate) {
    return <UpdateOverlay />
  }

  return (
    <>
      <SplashOverlay />
      <App />
    </>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename={(import.meta.env.BASE_URL || '/').replace(/\/$/, '') || undefined}>
      <Root />
    </BrowserRouter>
  </StrictMode>,
)

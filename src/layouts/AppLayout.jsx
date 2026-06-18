import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Navbar from '../components/layout/Navbar'
import Sidebar from '../components/layout/Sidebar'
import ChatPanel from '../components/layout/ChatPanel'
import { useAppStore } from '../store/useAppStore'

const AppLayout = () => {
  const role = useAppStore((state) => state.role)
  const hydrateFromSupabase = useAppStore((state) => state.hydrateFromSupabase)
  const showSidebar = role !== 'staff'
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [supervisorTheme, setSupervisorTheme] = useState(() => {
    if (typeof window === 'undefined') return 'light'
    return window.localStorage.getItem('supervisor-theme') || 'light'
  })

  useEffect(() => {
    hydrateFromSupabase()
  }, [hydrateFromSupabase])

  useEffect(() => {
    if (role === 'supervisor') {
      window.localStorage.setItem('supervisor-theme', supervisorTheme)
    }
  }, [role, supervisorTheme])

  const isSupervisorLight = role === 'supervisor' && supervisorTheme === 'light'

  return (
    <div className={`min-h-screen bg-[#0a0e1a] text-slate-100 ${isSupervisorLight ? 'supervisor-light-mode' : ''}`}>
      <Navbar
        onToggleSidebar={showSidebar ? () => setSidebarOpen((p) => !p) : undefined}
        supervisorTheme={role === 'supervisor' ? supervisorTheme : undefined}
        onToggleSupervisorTheme={role === 'supervisor' ? () => setSupervisorTheme((current) => current === 'light' ? 'dark' : 'light') : undefined}
      />

      {showSidebar && (
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      )}

      {/* Backdrop when sidebar open */}
      {showSidebar && sidebarOpen && (
        <div
          className="fixed inset-0 z-[35] bg-black/50 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="min-w-0 flex-1 overflow-x-hidden p-4 pt-[80px] md:p-6 md:pt-[80px] lg:p-8 lg:pt-[80px]">
        <Outlet />
      </main>

      <ChatPanel />
    </div>
  )
}

export default AppLayout

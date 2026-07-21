import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Navbar from '../components/layout/Navbar'
import Sidebar from '../components/layout/Sidebar'
import ChatPanel from '../components/layout/ChatPanel'
import SupervisorDashboardPage from '../pages/SupervisorDashboardPage'
import { useAppStore } from '../store/useAppStore'
import { useSupabaseRealtime } from '../hooks/useSupabaseRealtime'

const AppLayout = () => {
  const role = useAppStore((state) => state.role)
  const viewAsRole = useAppStore((state) => state.viewAsRole)
  const hydrateFromSupabase = useAppStore((state) => state.hydrateFromSupabase)

  useSupabaseRealtime()
  const showSidebar = role !== 'staff'
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [supervisorTheme, setSupervisorTheme] = useState(() => {
    if (typeof window === 'undefined') return 'light'
    return window.localStorage.getItem('supervisor-theme') || 'light'
  })
  const [terminalTheme, setTerminalTheme] = useState(() => {
    if (typeof window === 'undefined') return 'light'
    return window.localStorage.getItem('terminal-theme') || 'light'
  })

  useEffect(() => {
    hydrateFromSupabase()
  }, [hydrateFromSupabase])

  useEffect(() => {
    if (role === 'supervisor') {
      window.localStorage.setItem('supervisor-theme', supervisorTheme)
    }
  }, [role, supervisorTheme])

  useEffect(() => {
    if (role === 'terminal_operator') {
      window.localStorage.setItem('terminal-theme', terminalTheme)
    }
  }, [role, terminalTheme])

  const effectiveRole = (role === 'admin' && viewAsRole) ? viewAsRole : role
  const isSupervisorLight = effectiveRole === 'supervisor' && supervisorTheme === 'light'
  const isTerminalLight = effectiveRole === 'terminal_operator' && terminalTheme === 'light'
  const activeTheme = effectiveRole === 'supervisor' ? supervisorTheme : effectiveRole === 'terminal_operator' ? terminalTheme : undefined
  const toggleTheme = effectiveRole === 'supervisor'
    ? () => setSupervisorTheme((current) => current === 'light' ? 'dark' : 'light')
    : effectiveRole === 'terminal_operator'
      ? () => setTerminalTheme((current) => current === 'light' ? 'dark' : 'light')
      : undefined

  return (
    <div className={`min-h-screen bg-[#0a0e1a] text-slate-100 ${isSupervisorLight || isTerminalLight ? 'supervisor-light-mode' : ''} ${isTerminalLight ? 'terminal-light-mode' : ''}`}>
      <Navbar
        onToggleSidebar={showSidebar ? () => setSidebarOpen((p) => !p) : undefined}
        supervisorTheme={activeTheme}
        onToggleSupervisorTheme={toggleTheme}
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
        {role === 'admin' && viewAsRole === 'supervisor' ? <SupervisorDashboardPage /> : <Outlet />}
      </main>

      <ChatPanel />
    </div>
  )
}

export default AppLayout

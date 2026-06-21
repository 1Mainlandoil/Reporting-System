import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAppStore } from '../../store/useAppStore'
import { MAINLAND_LOGO_SRC } from '../../constants/brandLogo'
import NavIcon from './NavIcon'

const mobileMenuByRole = {
  supervisor: [
    { label: 'Dashboard', path: '/supervisor?view=dashboard', icon: 'dashboard' },
    { label: 'Reports', path: '/supervisor?view=daily-openings', icon: 'reports' },
    { label: 'Product Requests', path: '/supervisor?view=product-requests', icon: 'product' },
    { label: 'History', path: '/supervisor?view=history', icon: 'history' },
    { label: 'Reconciliation', path: '/reconciliation', icon: 'reconciliation' },
    { label: 'Alerts', path: '/alerts', icon: 'alerts' },
    { label: 'Analytics', path: '/analytics', icon: 'analytics' },
    { label: 'Stations', path: '/stations', icon: 'stations' },
    { label: 'Users', path: '/users', icon: 'users' },
    { label: 'Settings', path: '/settings', icon: 'settings' },
  ],
  admin: [
    { label: 'Dashboard', path: '/admin/dashboard', icon: 'dashboard' },
    { label: 'Reports', path: '/admin/reports', icon: 'reports' },
    { label: 'Product Requests', path: '/admin/product-requests', icon: 'product' },
    { label: 'History', path: '/admin/history', icon: 'history' },
    { label: 'Reconciliation', path: '/reconciliation', icon: 'reconciliation' },
    { label: 'Alerts', path: '/alerts', icon: 'alerts' },
    { label: 'Analytics', path: '/analytics', icon: 'analytics' },
    { label: 'Stations', path: '/stations', icon: 'stations' },
    { label: 'Users', path: '/users', icon: 'users' },
    { label: 'Settings', path: '/settings', icon: 'settings' },
  ],
}

const chatUnreadSelector = (state) => {
  const uid = state.currentUser?.id
  if (!uid) return 0
  return state.chatMessages.filter(
    (m) => m.toUserId === uid && m.fromUserId !== uid && String(m.status || '') !== 'seen',
  ).length
}

const MenuIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <rect x="2" y="4" width="14" height="1.5" rx="0.75" fill="currentColor" />
    <rect x="2" y="8.25" width="10" height="1.5" rx="0.75" fill="currentColor" />
    <rect x="2" y="12.5" width="14" height="1.5" rx="0.75" fill="currentColor" />
  </svg>
)

const Navbar = ({ onToggleSidebar, supervisorTheme, onToggleSupervisorTheme }) => {
  const location = useLocation()
  const role = useAppStore((state) => state.role)
  const currentUser = useAppStore((state) => state.currentUser)
  const getCurrentStation = useAppStore((state) => state.getCurrentStation)
  const logout = useAppStore((state) => state.logout)
  const setChatOpen = useAppStore((state) => state.setChatOpen)
  const chatUnreadCount = useAppStore(chatUnreadSelector)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const station = getCurrentStation()
  const roleLabel = role === 'staff'
    ? 'Manager'
    : role === 'supervisor'
      ? 'Supervisor'
      : role === 'terminal_operator'
        ? 'Terminal Operator'
        : role === 'inspector'
          ? 'Inspector'
          : 'Admin'
  const staffHistoryPath = currentUser?.stationId ? `/stations/${currentUser.stationId}/history` : ''
  const mobileLinks = role === 'staff'
    ? [
        ...(staffHistoryPath ? [{ label: 'History', path: staffHistoryPath, icon: 'history' }] : []),
        { label: 'Order Product', path: '/staff/stock-ordering', icon: 'order' },
      ]
    : mobileMenuByRole[role] || []

  const isMobileLinkActive = (pathWithQuery) => {
    const [path, queryString] = pathWithQuery.split('?')
    if (location.pathname !== path) return false
    if (!queryString) return !location.search
    const targetParams = new URLSearchParams(queryString)
    const currentParams = new URLSearchParams(location.search)
    return Array.from(targetParams.entries()).every(([key, value]) => currentParams.get(key) === value)
  }

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-[#0d1220]/95 backdrop-blur-md">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex min-w-0 items-center gap-3">
            {onToggleSidebar ? (
              <button
                type="button"
                onClick={onToggleSidebar}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white transition hover:bg-white/10"
                aria-label="Open menu"
              >
                <MenuIcon />
              </button>
            ) : null}
            <img src={MAINLAND_LOGO_SRC} alt="Mainland Oil" className="h-7 w-auto" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-white leading-none">Mainland Oil</p>
              <p className="mt-0.5 text-xs uppercase leading-none tracking-widest text-[#a9cd39]">{roleLabel}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {currentUser && (
              <div className="mr-1 text-right">
                <p className="text-xs font-semibold leading-none text-white">{currentUser.name}</p>
                {station
                  ? <p className="mt-0.5 text-xs leading-none text-slate-400">{station.name}</p>
                  : <p className="mt-0.5 text-xs leading-none text-[#a9cd39]">{roleLabel}</p>
                }
              </div>
            )}

            {onToggleSupervisorTheme && (
              <button
                type="button"
                onClick={onToggleSupervisorTheme}
                className="inline-flex rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
              >
                {supervisorTheme === 'light' ? 'Dark' : 'Light'}
              </button>
            )}

            {role === 'staff' && (
              <button
                type="button"
                onClick={() => setChatOpen(true)}
                className="relative hidden items-center gap-1.5 rounded-lg border border-[#a9cd39]/30 bg-[#a9cd39]/10 px-3 py-1.5 text-xs font-semibold text-[#a9cd39] transition hover:bg-[#a9cd39]/20 md:flex"
              >
                Chat
                {chatUnreadCount > 0 && (
                  <span className="ml-1 rounded-full bg-[#a9cd39] px-1.5 py-0.5 text-[9px] font-bold text-black">
                    {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                  </span>
                )}
              </button>
            )}

            {!onToggleSidebar && (
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white transition hover:bg-white/10"
                aria-label="Open menu"
              >
                <MenuIcon />
              </button>
            )}
          </div>
        </div>
      </header>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <aside
        className={`fixed right-0 top-0 z-[70] flex h-full w-72 flex-col border-l border-white/5 bg-[#0d1220] transition-transform duration-300 ease-out ${
          drawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <div className="flex items-center gap-3">
            <img src={MAINLAND_LOGO_SRC} alt="" className="h-7 w-auto" />
            <div>
              <p className="text-sm font-bold text-white">Menu</p>
              <p className="text-xs uppercase tracking-widest text-[#a9cd39]">{roleLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-slate-400 transition hover:text-white"
          >
            x
          </button>
        </div>

        {currentUser && (
          <div className="mx-4 mt-4 rounded-xl border border-white/5 bg-white/5 px-4 py-3">
            <p className="text-sm font-semibold text-white">{currentUser.name}</p>
            {station && <p className="mt-0.5 text-xs text-[#a9cd39]">{station.name}</p>}
            <p className="mt-0.5 text-xs uppercase tracking-wider text-slate-500">{roleLabel}</p>
          </div>
        )}

        <nav className="mt-4 flex-1 space-y-1 overflow-y-auto px-4">
          {mobileLinks.map((link) => {
            const isActive = isMobileLinkActive(link.path)
            return (
              <NavLink
                key={link.path}
                to={link.path}
                onClick={() => setDrawerOpen(false)}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? 'border-[#a9cd39]/30 bg-[#a9cd39]/15 text-[#a9cd39]'
                    : 'border-transparent text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${isActive ? 'bg-[#a9cd39]/20' : 'bg-white/5'}`}>
                  <NavIcon name={link.icon} />
                </span>
                {link.label}
              </NavLink>
            )
          })}
        </nav>

        <div className="space-y-2 border-t border-white/5 p-4">
          <button
            type="button"
            onClick={() => { setChatOpen(true); setDrawerOpen(false) }}
            className="relative flex w-full items-center gap-3 rounded-xl border border-[#a9cd39]/20 bg-[#a9cd39]/10 px-3 py-2.5 text-sm font-semibold text-[#a9cd39] transition hover:bg-[#a9cd39]/20"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#a9cd39]/20">
              <NavIcon name="chat" />
            </span>
            Chat
            {chatUnreadCount > 0 && (
              <span className="ml-auto rounded-full bg-[#a9cd39] px-2 py-0.5 text-xs font-bold text-black">
                {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => { logout(); setDrawerOpen(false) }}
            className="flex w-full items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm font-medium text-red-400 transition hover:bg-red-500/20"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/10">
              <NavIcon name="logout" />
            </span>
            Logout
          </button>
        </div>
      </aside>
    </>
  )
}

export default Navbar

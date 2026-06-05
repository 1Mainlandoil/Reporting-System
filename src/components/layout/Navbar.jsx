import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/useAppStore'
import { MAINLAND_LOGO_SRC } from '../../constants/brandLogo'

const mobileMenuByRole = {
  supervisor: [
    { label: 'Dashboard', path: '/supervisor?view=dashboard', icon: '▦' },
    { label: 'Reports', path: '/supervisor?view=daily-openings', icon: '☰' },
    { label: 'Product Requests', path: '/supervisor?view=product-requests', icon: '⬒' },
    { label: 'History', path: '/supervisor?view=history', icon: '🕘' },
    { label: 'Reconciliation', path: '/reconciliation', icon: '◍' },
    { label: 'Alerts', path: '/alerts', icon: '⚑' },
    { label: 'Analytics', path: '/analytics', icon: '◔' },
    { label: 'Stations', path: '/stations', icon: '⌂' },
    { label: 'Users', path: '/users', icon: '◌' },
    { label: 'Settings', path: '/settings', icon: '⚙' },
  ],
  admin: [
    { label: 'Dashboard', path: '/admin/dashboard', icon: '▦' },
    { label: 'Reports', path: '/admin/reports', icon: '☰' },
    { label: 'Product Requests', path: '/admin/product-requests', icon: '⬒' },
    { label: 'History', path: '/admin/history', icon: '🕘' },
    { label: 'Reconciliation', path: '/reconciliation', icon: '◍' },
    { label: 'Alerts', path: '/alerts', icon: '⚑' },
    { label: 'Analytics', path: '/analytics', icon: '◔' },
    { label: 'Stations', path: '/stations', icon: '⌂' },
    { label: 'Users', path: '/users', icon: '◌' },
    { label: 'Settings', path: '/settings', icon: '⚙' },
  ],
}

const chatUnreadSelector = (state) => {
  const uid = state.currentUser?.id
  if (!uid) return 0
  return state.chatMessages.filter(
    (m) => m.toUserId === uid && m.fromUserId !== uid && String(m.status || '') !== 'seen',
  ).length
}

const Navbar = ({ onToggleSidebar }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const role = useAppStore((state) => state.role)
  const currentUser = useAppStore((state) => state.currentUser)
  const getCurrentStation = useAppStore((state) => state.getCurrentStation)
  const logout = useAppStore((state) => state.logout)
  const setChatOpen = useAppStore((state) => state.setChatOpen)
  const chatUnreadCount = useAppStore(chatUnreadSelector)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const station = getCurrentStation()
  const roleLabel = role === 'staff' ? 'Manager' : role === 'supervisor' ? 'Supervisor' : 'Admin'
  const staffHistoryPath = currentUser?.stationId ? `/stations/${currentUser.stationId}/history` : ''

  const mobileLinks = role === 'staff'
    ? [
        ...(staffHistoryPath ? [{ label: 'History', path: staffHistoryPath, icon: '🕘' }] : []),
        { label: 'Order Product', path: '/staff/stock-ordering', icon: '⬒' },
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
      {/* Top navbar */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-[#0d1220]/95 backdrop-blur-md">
        <div className="flex h-16 items-center justify-between px-4">
          {/* Left — hamburger (supervisor/admin) OR logo (staff) */}
          <div className="flex items-center gap-3 min-w-0">
            {onToggleSidebar ? (
              /* Supervisor/Admin: hamburger on the left */
              <button
                onClick={onToggleSidebar}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10 transition"
                aria-label="Open menu"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <rect x="2" y="4" width="14" height="1.5" rx="0.75" fill="currentColor"/>
                  <rect x="2" y="8.25" width="10" height="1.5" rx="0.75" fill="currentColor"/>
                  <rect x="2" y="12.5" width="14" height="1.5" rx="0.75" fill="currentColor"/>
                </svg>
              </button>
            ) : null}
            <img src={MAINLAND_LOGO_SRC} alt="Mainland Oil" className="h-7 w-auto" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-white leading-none">Mainland Oil</p>
              <p className="text-xs uppercase tracking-widest text-[#a9cd39] leading-none mt-0.5">{roleLabel}</p>
            </div>
          </div>

          {/* Right — user info + staff menu button */}
          <div className="flex items-center gap-2">
            {currentUser && (
              <div className="text-right mr-1">
                <p className="text-xs font-semibold text-white leading-none">{currentUser.name}</p>
                {station
                  ? <p className="text-xs text-slate-400 leading-none mt-0.5">{station.name}</p>
                  : <p className="text-xs text-[#a9cd39] leading-none mt-0.5">{roleLabel}</p>
                }
              </div>
            )}

            {/* Chat button (staff desktop) */}
            {role === 'staff' && (
              <button
                type="button"
                onClick={() => setChatOpen(true)}
                className="relative hidden md:flex items-center gap-1.5 rounded-lg border border-[#a9cd39]/30 bg-[#a9cd39]/10 px-3 py-1.5 text-xs font-semibold text-[#a9cd39] hover:bg-[#a9cd39]/20 transition"
              >
                💬 Chat
                {chatUnreadCount > 0 && (
                  <span className="ml-1 rounded-full bg-[#a9cd39] px-1.5 py-0.5 text-[9px] font-bold text-black">
                    {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                  </span>
                )}
              </button>
            )}

            {/* Staff only: right-side menu button */}
            {!onToggleSidebar && (
              <button
                onClick={() => setDrawerOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10 transition"
                aria-label="Open menu"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <rect x="2" y="4" width="14" height="1.5" rx="0.75" fill="currentColor"/>
                  <rect x="2" y="8.25" width="10" height="1.5" rx="0.75" fill="currentColor"/>
                  <rect x="2" y="12.5" width="14" height="1.5" rx="0.75" fill="currentColor"/>
                </svg>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Drawer backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Right slide drawer */}
      <aside
        className={`fixed right-0 top-0 z-[70] h-full w-72 bg-[#0d1220] border-l border-white/5 flex flex-col transition-transform duration-300 ease-out ${
          drawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <div className="flex items-center gap-3">
            <img src={MAINLAND_LOGO_SRC} alt="" className="h-7 w-auto" />
            <div>
              <p className="text-sm font-bold text-white">Menu</p>
              <p className="text-xs uppercase tracking-widest text-[#a9cd39]">{roleLabel}</p>
            </div>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-slate-400 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {/* User info */}
        {currentUser && (
          <div className="mx-4 mt-4 rounded-xl border border-white/5 bg-white/5 px-4 py-3">
            <p className="text-sm font-semibold text-white">{currentUser.name}</p>
            {station && <p className="text-xs text-[#a9cd39] mt-0.5">{station.name}</p>}
            <p className="text-xs text-slate-500 mt-0.5 uppercase tracking-wider">{roleLabel}</p>
          </div>
        )}

        {/* Nav links */}
        <nav className="mt-4 flex-1 overflow-y-auto px-4 space-y-1">
          {mobileLinks.map((link) => {
            const isActive = isMobileLinkActive(link.path)
            return (
              <NavLink
                key={link.path}
                to={link.path}
                onClick={() => setDrawerOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? 'bg-[#a9cd39]/15 text-[#a9cd39] border border-[#a9cd39]/30'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white border border-transparent'
                }`}
              >
                <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs ${isActive ? 'bg-[#a9cd39]/20' : 'bg-white/5'}`}>
                  {link.icon}
                </span>
                {link.label}
              </NavLink>
            )
          })}
        </nav>

        {/* Bottom actions */}
        <div className="border-t border-white/5 p-4 space-y-2">
          <button
            type="button"
            onClick={() => { setChatOpen(true); setDrawerOpen(false) }}
            className="relative flex w-full items-center gap-3 rounded-xl border border-[#a9cd39]/20 bg-[#a9cd39]/10 px-3 py-2.5 text-sm font-semibold text-[#a9cd39] hover:bg-[#a9cd39]/20 transition"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#a9cd39]/20 text-xs">💬</span>
            Chat
            {chatUnreadCount > 0 && (
              <span className="ml-auto rounded-full bg-[#a9cd39] px-2 py-0.5 text-xs font-bold text-black">
                {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => { logout(); setDrawerOpen(false) }}
            className="flex w-full items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/20 transition"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/10 text-xs">⎋</span>
            Logout
          </button>
        </div>
      </aside>
    </>
  )
}

export default Navbar

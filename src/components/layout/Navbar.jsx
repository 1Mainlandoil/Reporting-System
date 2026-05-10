import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/useAppStore'
import { linksByRole } from '../../constants/navigation'

const mobileMenuByRole = {
  supervisor: [
    { label: 'Dashboard', path: '/supervisor?view=dashboard' },
    { label: 'Reports', path: '/supervisor?view=daily-openings' },
    { label: 'Product Requests', path: '/supervisor?view=product-requests' },
    { label: 'History', path: '/supervisor?view=history' },
    { label: 'Reconciliation', path: '/reconciliation' },
    { label: 'Alerts', path: '/alerts' },
    { label: 'Analytics', path: '/analytics' },
    { label: 'Stations', path: '/stations' },
    { label: 'Users', path: '/users' },
    { label: 'Settings', path: '/settings' },
  ],
  admin: [
    { label: 'Dashboard', path: '/admin/dashboard' },
    { label: 'Reports', path: '/admin/reports' },
    { label: 'Product Requests', path: '/admin/product-requests' },
    { label: 'History', path: '/admin/history' },
    { label: 'Reconciliation', path: '/reconciliation' },
    { label: 'Alerts', path: '/alerts' },
    { label: 'Analytics', path: '/analytics' },
    { label: 'Stations', path: '/stations' },
    { label: 'Users', path: '/users' },
    { label: 'Settings', path: '/settings' },
  ],
}

const chatUnreadSelector = (state) => {
  const uid = state.currentUser?.id
  if (!uid) return 0
  return state.chatMessages.filter(
    (m) => m.toUserId === uid && m.fromUserId !== uid && String(m.status || '') !== 'seen',
  ).length
}

const Navbar = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const role = useAppStore((state) => state.role)
  const currentUser = useAppStore((state) => state.currentUser)
  const getCurrentStation = useAppStore((state) => state.getCurrentStation)
  const logout = useAppStore((state) => state.logout)
  const setChatOpen = useAppStore((state) => state.setChatOpen)
  const chatUnreadCount = useAppStore(chatUnreadSelector)
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)

  const openChatDrawer = () => {
    setChatOpen(true)
    setIsMobileNavOpen(false)
  }

  const station = getCurrentStation()
  const links = linksByRole[role] || []
  const staffHistoryPath = currentUser?.stationId ? `/stations/${currentUser.stationId}/history` : ''
  const roleLabel = role === 'staff' ? 'manager' : role
  const mobileLinks = role === 'staff'
    ? [
      ...(staffHistoryPath ? [{ label: 'History', path: staffHistoryPath }] : []),
      { label: 'Stock Ordering', path: '/staff/stock-ordering' },
    ]
    : mobileMenuByRole[role] || links.filter((link) => !['Supervisor', 'Reconciliation'].includes(link.label))

  const isMobileLinkActive = (pathWithQuery) => {
    const [path, queryString] = pathWithQuery.split('?')
    if (location.pathname !== path) {
      return false
    }
    if (!queryString) {
      return !location.search
    }
    const targetParams = new URLSearchParams(queryString)
    const currentParams = new URLSearchParams(location.search)
    return Array.from(targetParams.entries()).every(([key, value]) => currentParams.get(key) === value)
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">Mainland Report System</h1>
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{roleLabel}</p>
          {currentUser && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {currentUser.name}
              {station ? ` - ${station.name}` : ''}
            </p>
          )}
        </div>
        <button
          onClick={() => setIsMobileNavOpen((prev) => !prev)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:hidden dark:border-slate-700"
          aria-label="Toggle navigation menu"
        >
          ☰
        </button>
        {role === 'staff' && (
          <div className="hidden items-center gap-2 md:flex">
            <button
              type="button"
              onClick={() => {
                if (currentUser?.stationId) {
                  navigate(staffHistoryPath)
                }
              }}
              disabled={!currentUser?.stationId}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              History
            </button>
            <button
              type="button"
              onClick={() => navigate('/staff/stock-ordering')}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              Stock Ordering
            </button>
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              className="relative rounded-lg border border-blue-600 bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-500 dark:border-blue-500"
            >
              Chat
              {chatUnreadCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-slate-950">
                  {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                </span>
              )}
            </button>
            <button
              onClick={logout}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white dark:bg-slate-700"
            >
              Logout
            </button>
          </div>
        )}
      </div>

      {isMobileNavOpen && (
        <div className="mt-3 max-h-[calc(100dvh-95px)] space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm md:hidden dark:border-slate-800 dark:bg-slate-900/95">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Menu</p>
            <nav className="space-y-2">
              {mobileLinks.map((link) => {
                const isActive = isMobileLinkActive(link.path)
                return (
                  <NavLink
                    key={link.path}
                    to={link.path}
                    onClick={() => setIsMobileNavOpen(false)}
                    className={`block rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                      isActive
                        ? 'border-blue-500 bg-blue-600 text-white shadow-sm'
                        : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'
                    }`}
                  >
                    {link.label}
                  </NavLink>
                )
              })}
            </nav>
          </div>
          <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Messages</p>
            <button
              type="button"
              onClick={openChatDrawer}
              className="relative flex w-full items-center justify-center rounded-xl border border-blue-600 bg-blue-600 px-3 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-500"
            >
              Open Chat
              {chatUnreadCount > 0 && (
                <span className="ml-2 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold">
                  {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                </span>
              )}
            </button>
          </div>
          <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Account</p>
            <button
              onClick={logout}
              className="w-full rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-medium text-white dark:bg-slate-700"
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </header>
  )
}

export default Navbar

import { NavLink, useLocation } from 'react-router-dom'
import { MAINLAND_LOGO_SRC } from '../../constants/brandLogo'
import { useAppStore } from '../../store/useAppStore'
import { linksByRole } from '../../constants/navigation'

const chatUnreadSelector = (state) => {
  const uid = state.currentUser?.id
  if (!uid) return 0
  return state.chatMessages.filter(
    (m) => m.toUserId === uid && m.fromUserId !== uid && String(m.status || '') !== 'seen',
  ).length
}

const Sidebar = () => {
  const role = useAppStore((state) => state.role)
  const logout = useAppStore((state) => state.logout)
  const setChatOpen = useAppStore((state) => state.setChatOpen)
  const chatUnreadCount = useAppStore(chatUnreadSelector)
  const location = useLocation()
  const links = linksByRole[role] || []
  const linkMap = Object.fromEntries(links.map((item) => [item.label.toLowerCase(), item.path]))
  const currentView = new URLSearchParams(location.search).get('view')

  const menuItems = [
    { label: 'Dashboard', icon: '▦', path: role === 'staff' ? '/staff' : linkMap.dashboard },
    {
      label: 'Reports',
      icon: '☰',
      path: role === 'supervisor' ? '/supervisor?view=stock-flow' : linkMap.reports,
    },
    ...(role === 'supervisor'
      ? [{ label: 'Month-End Summary', icon: '◍', path: '/supervisor?view=month-end-summary' }]
      : []),
    { label: 'Reconciliation', icon: '◍', path: linkMap.reconciliation },
    {
      label: 'Product Requests',
      icon: '⬒',
      path: role === 'supervisor' ? '/supervisor?view=product-requests' : linkMap['product requests'],
    },
    { label: 'History', icon: '🕘', path: role === 'supervisor' ? '/supervisor?view=history' : linkMap.history },
    { label: 'Alerts', icon: '⚑', path: linkMap.alerts },
    { label: 'Analytics', icon: '◔', path: linkMap.analytics },
    { label: 'Stations', icon: '⌂', path: linkMap.stations },
    { label: 'Users', icon: '◌', path: linkMap.users },
    { label: 'Settings', icon: '⚙', path: linkMap.settings },
  ]

  return (
    <aside className="hidden w-full border-b border-slate-200 bg-white p-4 md:fixed md:left-0 md:top-[73px] md:block md:h-[calc(100vh-73px)] md:w-64 md:overflow-y-auto md:border-b-0 md:border-r md:border-[#c4151d] md:bg-[#f01d26] md:dark:border-[#c4151d] md:dark:bg-[#f01d26]">
      <div className="mb-6 flex flex-col items-center rounded-2xl border border-white/10 bg-[#000000] px-3 py-3 text-center text-white shadow-lg shadow-black/60">
        <img src={MAINLAND_LOGO_SRC} alt="Mainland Oil logo" className="mb-2 h-10 w-auto" />
        <p className="font-serif text-base font-extrabold uppercase tracking-[0.12em] text-white">Mainland Oil</p>
      </div>
      <nav className="space-y-1.5">
        {menuItems.map((item) =>
          item.path ? (
            <NavLink
              key={item.label}
              to={item.path}
              className={({ isActive }) => {
                const isSupervisorDashboard =
                  role === 'supervisor' &&
                  item.label === 'Dashboard' &&
                  location.pathname === '/supervisor' &&
                  (!currentView || currentView === 'dashboard' || currentView === 'risk-monitor')
                const isSupervisorReports =
                  role === 'supervisor' &&
                  item.label === 'Reports' &&
                  location.pathname === '/supervisor' &&
                  (
                    currentView === 'daily-openings' ||
                    currentView === 'stock-flow' ||
                    currentView === 'cash-flow' ||
                    currentView === 'expense-monitor'
                  )
                const isSupervisorMonthEnd =
                  role === 'supervisor' &&
                  item.label === 'Month-End Summary' &&
                  location.pathname === '/supervisor' &&
                  currentView === 'month-end-summary'
                const isSupervisorProductRequests =
                  role === 'supervisor' &&
                  item.label === 'Product Requests' &&
                  location.pathname === '/supervisor' &&
                  currentView === 'product-requests'
                const isSupervisorHistory =
                  role === 'supervisor' &&
                  item.label === 'History' &&
                  location.pathname === '/supervisor' &&
                  currentView === 'history'
                const isCustomActive =
                  role === 'supervisor' &&
                  (item.label === 'Dashboard' ||
                    item.label === 'Reports' ||
                    item.label === 'Month-End Summary' ||
                    item.label === 'Product Requests' ||
                    item.label === 'History')
                    ? isSupervisorDashboard ||
                      isSupervisorReports ||
                      isSupervisorMonthEnd ||
                      isSupervisorProductRequests ||
                      isSupervisorHistory
                    : isActive

                return (
                `group flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                  isCustomActive
                    ? 'border-white/45 bg-white/20 text-white shadow-sm shadow-black/15'
                    : 'border-transparent text-white/85 hover:border-white/15 hover:bg-white/10 hover:text-white'
                }`
                )
              }}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-black/15 text-[11px] text-white group-hover:bg-black/25">
                {item.icon}
              </span>
              <span className="tracking-wide">{item.label}</span>
            </NavLink>
          ) : (
            <button
              key={item.label}
              type="button"
              className="flex w-full items-center gap-2.5 rounded-xl border border-transparent px-3 py-2.5 text-left text-sm font-medium text-white/45 transition hover:border-white/10 hover:bg-white/5 hover:text-white/75"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-black/10 text-[11px] text-white/50">
                {item.icon}
              </span>
              <span className="tracking-wide">{item.label}</span>
            </button>
          ),
        )}
      </nav>
      <div className="mt-6 border-t border-white/20 pt-4">
        <button
          type="button"
          onClick={() => setChatOpen(true)}
          className="relative mb-3 flex w-full items-center gap-2.5 rounded-xl border border-white/35 bg-white/15 px-3 py-2.5 text-sm font-semibold text-white shadow-sm shadow-black/20 transition hover:bg-white/25"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-black/25 text-[11px]">💬</span>
          <span className="tracking-wide">Chat</span>
          {chatUnreadCount > 0 && (
            <span className="ml-auto rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white">
              {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
            </span>
          )}
        </button>
      </div>
      <div className="mt-2 border-t border-white/20 pt-4">
        <button
          onClick={logout}
          className="flex w-full items-center gap-2.5 rounded-xl border border-white/25 bg-black/20 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-black/35"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-black/25 text-[11px]">⎋</span>
          <span>Logout</span>
        </button>
      </div>
    </aside>
  )
}

export default Sidebar

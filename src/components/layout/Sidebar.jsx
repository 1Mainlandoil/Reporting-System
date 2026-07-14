import { NavLink, useLocation } from 'react-router-dom'
import { MAINLAND_LOGO_SRC } from '../../constants/brandLogo'
import { useAppStore } from '../../store/useAppStore'
import { linksByRole } from '../../constants/navigation'
import NavIcon from './NavIcon'

const chatUnreadSelector = (state) => {
  const uid = state.currentUser?.id
  if (!uid) return 0
  return state.chatMessages.filter(
    (m) => m.toUserId === uid && m.fromUserId !== uid && String(m.status || '') !== 'seen',
  ).length
}

const supervisorLinksForAdmin = [
  { label: 'Dashboard', icon: 'dashboard', path: '/admin/profit-loss?view=dashboard' },
  { label: 'Reports', icon: 'reports', path: '/admin/profit-loss?view=daily-openings' },
  { label: 'Month-End Summary', icon: 'summary', path: '/admin/profit-loss?view=month-end-summary' },
  { label: 'Station Scorecard', icon: 'analytics', path: '/admin/profit-loss?view=scorecard' },
  { label: 'Product Requests', icon: 'product', path: '/admin/profit-loss?view=product-requests' },
  { label: 'History', icon: 'history', path: '/admin/profit-loss?view=history' },
  { label: 'Alerts', icon: 'alerts', path: '/alerts' },
  { label: 'Analytics', icon: 'analytics', path: '/analytics' },
  { label: 'Stations', icon: 'stations', path: '/stations' },
  { label: 'Users', icon: 'users', path: '/users' },
  { label: 'Settings', icon: 'settings', path: '/settings' },
]

const Sidebar = ({ isOpen = false, onClose = () => {} }) => {
  const role = useAppStore((state) => state.role)
  const viewAsRole = useAppStore((state) => state.viewAsRole)
  const logout = useAppStore((state) => state.logout)
  const setChatOpen = useAppStore((state) => state.setChatOpen)
  const currentUser = useAppStore((state) => state.currentUser)
  const chatUnreadCount = useAppStore(chatUnreadSelector)
  const location = useLocation()

  const isSupervisorView = role === 'admin' && viewAsRole === 'supervisor'
  const effectiveRole = isSupervisorView ? 'supervisor' : role
  const links = linksByRole[effectiveRole] || []
  const linkMap = Object.fromEntries(links.map((item) => [item.label.toLowerCase(), item.path]))
  const currentView = new URLSearchParams(location.search).get('view')
  const currentPathWithSearch = `${location.pathname}${location.search}`
  const terminalIconByLabel = {
    Dashboard: 'dashboard',
    'Station Requests': 'product',
    'Direct Dispatch': 'order',
    'Dispatch History': 'history',
    'Delivery Reviews': 'reports',
    Costing: 'analytics',
    'Terminal Stock': 'stations',
    Reports: 'reports',
    Settings: 'settings',
  }
  const adminIconByLabel = {
    Dashboard: 'dashboard',
    Costing: 'reconciliation',
    'Daily P/L': 'reports',
    'Weekly P/L': 'summary',
    'Monthly P/L': 'summary',
    'Yearly P/L': 'summary',
    'Station P/L': 'stations',
    'Finalised Report': 'reports',
    Users: 'users',
    Settings: 'settings',
  }

  const menuItems = isSupervisorView
    ? supervisorLinksForAdmin
    : effectiveRole === 'terminal_operator'
      ? links.map((item) => ({ ...item, icon: terminalIconByLabel[item.label] || 'dashboard' }))
      : effectiveRole === 'admin'
        ? links.map((item) => ({ ...item, icon: adminIconByLabel[item.label] || 'dashboard' }))
      : [
          { label: 'Dashboard', icon: 'dashboard', path: effectiveRole === 'staff' ? '/staff' : linkMap.dashboard },
          { label: 'Reports', icon: 'reports', path: effectiveRole === 'supervisor' ? '/supervisor?view=stock-flow' : linkMap.reports },
          ...(effectiveRole === 'supervisor' ? [{ label: 'Month-End Summary', icon: 'summary', path: '/supervisor?view=month-end-summary' }] : []),
          { label: 'Station Scorecard', icon: 'analytics', path: '/supervisor?view=scorecard' },
          { label: 'Product Requests', icon: 'product', path: effectiveRole === 'supervisor' ? '/supervisor?view=product-requests' : linkMap['product requests'] },
          { label: 'History', icon: 'history', path: effectiveRole === 'supervisor' ? '/supervisor?view=history' : linkMap.history },
          { label: 'Alerts', icon: 'alerts', path: linkMap.alerts },
          { label: 'Analytics', icon: 'analytics', path: linkMap.analytics },
          { label: 'Stations', icon: 'stations', path: linkMap.stations },
          { label: 'Users', icon: 'users', path: linkMap.users },
          { label: 'Settings', icon: 'settings', path: linkMap.settings },
        ]

  const handleNav = () => onClose()

  return (
    <aside
      className={`fixed left-0 top-0 z-[40] flex h-full w-72 flex-col border-r border-white/5 bg-[#0d1220] transition-transform duration-300 ease-out ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      } ${effectiveRole === 'supervisor' ? 'border-l-4 border-l-[#c4151d]' : ''}`}
    >
      <div className="mt-16 flex items-center justify-between border-b border-white/5 px-5 py-4">
        <div className="flex items-center gap-3">
          <img src={MAINLAND_LOGO_SRC} alt="MEST" className="h-12 w-auto" />
          <p className="text-xs uppercase tracking-widest text-[#a9cd39]">{isSupervisorView ? 'Supervisor View' : effectiveRole}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-slate-400 transition hover:text-white"
        >
          x
        </button>
      </div>

      {currentUser && (
        <div className="mx-4 mt-4 rounded-xl border border-white/5 bg-white/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#a9cd39]/20 text-sm font-bold text-[#a9cd39]">
              {String(currentUser.name || '?')[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{currentUser.name}</p>
              <p className="text-xs uppercase tracking-widest text-[#a9cd39]">{isSupervisorView ? 'Supervisor View' : effectiveRole}</p>
            </div>
          </div>
        </div>
      )}

      <nav className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-3">
        {menuItems.map((item) =>
          item.path ? (
            <NavLink
              key={item.label}
              to={item.path}
              onClick={handleNav}
              className={({ isActive }) => {
                const isSupervisorDashboard = role === 'supervisor' && item.label === 'Dashboard' && location.pathname === '/supervisor' && (!currentView || currentView === 'dashboard' || currentView === 'risk-monitor')
                const isSupervisorReports = role === 'supervisor' && item.label === 'Reports' && location.pathname === '/supervisor' && ['daily-openings','stock-flow','cash-flow','expense-monitor'].includes(currentView)
                const isSupervisorMonthEnd = role === 'supervisor' && item.label === 'Month-End Summary' && location.pathname === '/supervisor' && currentView === 'month-end-summary'
                const isSupervisorProductRequests = role === 'supervisor' && item.label === 'Product Requests' && location.pathname === '/supervisor' && currentView === 'product-requests'
                const isSupervisorHistory = role === 'supervisor' && item.label === 'History' && location.pathname === '/supervisor' && currentView === 'history'
                const isSupervisorScorecard = role === 'supervisor' && item.label === 'Station Scorecard' && location.pathname === '/supervisor' && currentView === 'scorecard'
                const isTerminalActive = role === 'terminal_operator' && item.path === currentPathWithSearch
                const isAdminActive = role === 'admin' && item.path === location.pathname
                const isCustomActive = role === 'terminal_operator'
                  ? isTerminalActive
                  : role === 'admin'
                    ? isAdminActive
                  : role === 'supervisor' && ['Dashboard','Reports','Month-End Summary','Product Requests','History','Station Scorecard'].includes(item.label)
                    ? isSupervisorDashboard || isSupervisorReports || isSupervisorMonthEnd || isSupervisorProductRequests || isSupervisorHistory || isSupervisorScorecard
                    : isActive
                return `flex items-center gap-3 rounded-xl border px-3 py-3 text-sm font-medium transition ${
                  isCustomActive
                    ? 'border-[#a9cd39]/25 bg-[#a9cd39]/15 text-[#a9cd39]'
                    : 'border-transparent text-slate-300 hover:bg-white/5 hover:text-white'
                }`
              }}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5">
                <NavIcon name={item.icon} />
              </span>
              <span>{item.label}</span>
            </NavLink>
          ) : (
            <div key={item.label} className="flex items-center gap-3 rounded-xl border border-transparent px-3 py-3 text-sm text-slate-600">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5">
                <NavIcon name={item.icon} />
              </span>
              <span>{item.label}</span>
            </div>
          ),
        )}
      </nav>

      <div className="space-y-2 border-t border-white/5 p-3">
        <button
          type="button"
          onClick={() => { setChatOpen(true); onClose() }}
          className="relative flex w-full items-center gap-3 rounded-xl border border-[#a9cd39]/20 bg-[#a9cd39]/10 px-3 py-3 text-sm font-semibold text-[#a9cd39] transition hover:bg-[#a9cd39]/20"
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
          onClick={() => { logout(); onClose() }}
          className="flex w-full items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-3 text-sm font-medium text-red-400 transition hover:bg-red-500/20"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/10">
            <NavIcon name="logout" />
          </span>
          Logout
        </button>
      </div>
    </aside>
  )
}

export default Sidebar

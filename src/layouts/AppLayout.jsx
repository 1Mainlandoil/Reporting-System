import { Outlet } from 'react-router-dom'
import Navbar from '../components/layout/Navbar'
import Sidebar from '../components/layout/Sidebar'
import ChatPanel from '../components/layout/ChatPanel'
import { useAppStore } from '../store/useAppStore'

const AppLayout = () => {
  const role = useAppStore((state) => state.role)
  const showSidebar = role !== 'staff'

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#a9cd39]/90 text-slate-900 dark:bg-[#a9cd39]/90 dark:text-slate-100">
      <Navbar />
      <div className="flex w-full min-w-0 flex-col pt-[73px]">
        {showSidebar && <Sidebar />}
        <main className={`min-w-0 flex-1 overflow-x-hidden p-4 md:p-6 lg:p-8 ${showSidebar ? 'md:ml-64' : ''}`}>
          <Outlet />
        </main>
      </div>
      <ChatPanel />
    </div>
  )
}

export default AppLayout

import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './layouts/AppLayout'
import { ProtectedRoute } from './hooks/useAuthRedirect'
import { useAppStore } from './store/useAppStore'
import { ROLE_ROUTE_MAP } from './constants/roles'
import SignInPage from './pages/SignInPage'
import AuthCallbackPage from './pages/AuthCallbackPage'
import SetPasswordPage from './pages/SetPasswordPage'
import StaffDashboardPage from './pages/StaffDashboardPage'
import StaffStockOrderingPage from './pages/StaffStockOrderingPage'
import SupervisorDashboardPage from './pages/SupervisorDashboardPage'
import AdminDashboardPage from './pages/AdminDashboardPage'
import StationsPage from './pages/StationsPage'
import StationDetailsPage from './pages/StationDetailsPage'
import StationReportHistoryPage from './pages/StationReportHistoryPage'
import ReconciliationDashboardPage from './pages/ReconciliationDashboardPage'
import AlertsPage from './pages/AlertsPage'
import AnalyticsPage from './pages/AnalyticsPage'
import UsersPage from './pages/UsersPage'
import SettingsPage from './pages/SettingsPage'
import ITAdminPage from './pages/ITAdminPage'

const RootRoute = () => {
  const role = useAppStore((state) => state.role)
  if (!role) return <Navigate to="/sign-in" replace />
  return <Navigate to={ROLE_ROUTE_MAP[role] || '/sign-in'} replace />
}

const App = () => (
  <Routes>
    <Route path="/" element={<RootRoute />} />
    <Route path="/login" element={<Navigate to="/sign-in" replace />} />
    <Route path="/sign-in" element={<SignInPage />} />
    <Route path="/auth/callback" element={<AuthCallbackPage />} />
    <Route path="/set-password" element={<SetPasswordPage />} />

    <Route
      path="/staff"
      element={
        <ProtectedRoute allowedRoles={['staff']}>
          <AppLayout />
        </ProtectedRoute>
      }
    >
      <Route index element={<Navigate to="/staff/report" replace />} />
      <Route path="report" element={<StaffDashboardPage />} />
      <Route path="stock-ordering" element={<StaffStockOrderingPage />} />
    </Route>

    <Route
      path="/supervisor"
      element={
        <ProtectedRoute allowedRoles={['supervisor']}>
          <AppLayout />
        </ProtectedRoute>
      }
    >
      <Route index element={<SupervisorDashboardPage />} />
    </Route>

    <Route
      path="/admin"
      element={
        <ProtectedRoute allowedRoles={['admin']}>
          <AppLayout />
        </ProtectedRoute>
      }
    >
      <Route index element={<Navigate to="/admin/dashboard" replace />} />
      <Route path="dashboard" element={<AdminDashboardPage />} />
      <Route path="reports" element={<AdminDashboardPage />} />
      <Route path="product-requests" element={<AdminDashboardPage />} />
      <Route path="history" element={<AdminDashboardPage />} />
    </Route>

    <Route
      element={
        <ProtectedRoute allowedRoles={['admin', 'supervisor', 'staff']}>
          <AppLayout />
        </ProtectedRoute>
      }
    >
      <Route path="/stations" element={<StationsPage />} />
      <Route path="/stations/:stationId" element={<StationDetailsPage />} />
      <Route path="/stations/:stationId/history" element={<StationReportHistoryPage />} />
      <Route path="/reconciliation" element={<ReconciliationDashboardPage />} />
      <Route path="/alerts" element={<AlertsPage />} />
      <Route path="/analytics" element={<AnalyticsPage />} />
      <Route path="/users" element={<UsersPage />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Route>

    <Route path="/it-admin" element={<ITAdminPage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
)

export default App

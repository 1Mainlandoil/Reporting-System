import { Navigate } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'

export const ProtectedRoute = ({ children, allowedRoles }) => {
  const role = useAppStore((state) => state.role)

  if (!role) {
    return <Navigate to="/sign-in" replace />
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/" replace />
  }

  return children
}

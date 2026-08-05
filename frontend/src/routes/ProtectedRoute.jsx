import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { hasRole } from '../utils/permissions';

// Gates a route behind login, and optionally behind specific roles
export default function ProtectedRoute({ children, allowedRoles = [] }) {
  const { user, status } = useAuth();

  if (status === 'loading') return null; // session check in flight, avoid a redirect flash
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles.length > 0 && !hasRole(user, ...allowedRoles)) return <Navigate to="/dashboard" replace />;

  return children;
}

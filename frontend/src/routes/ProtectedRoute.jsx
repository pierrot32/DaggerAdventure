import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { hasAccessLevel } from '../utils/permissions';

// Gates a route behind login, and optionally behind access levels
export default function ProtectedRoute({ children, allowedAccessLevels = [] }) {
  const { user, status } = useAuth();

  if (status === 'loading') return null; // session check in flight, avoid a redirect flash
  if (!user) return <Navigate to="/login" replace />;
  if (allowedAccessLevels.length > 0 && !hasAccessLevel(user, ...allowedAccessLevels)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

import { useAuthStore } from '../store/authStore';

// Thin selector hook - components depend on this, not on the store shape directly
export function useAuth() {
  const user = useAuthStore((state) => state.user);
  const status = useAuthStore((state) => state.status);
  const login = useAuthStore((state) => state.login);
  const register = useAuthStore((state) => state.register);
  const logout = useAuthStore((state) => state.logout);
  return { user, status, isAuthenticated: Boolean(user), login, register, logout };
}

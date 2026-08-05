// Central place for role constants so future feature-gating stays consistent
export const ROLES = {
  PLAYER: 'player',
  GM: 'gm',
  ADMIN: 'admin',
};

// True if the user's role is one of `allowedRoles` (no roles required = any authed user)
export function hasRole(user, ...allowedRoles) {
  if (!user) return false;
  if (allowedRoles.length === 0) return true;
  return allowedRoles.includes(user.role);
}

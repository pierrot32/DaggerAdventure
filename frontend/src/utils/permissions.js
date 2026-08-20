// Central place for access levels so every feature uses the same policy
export const ACCESS_LEVELS = {
	NOTHING: "nothing",
	PLAYER_ONLY: "player_only",
	ADVENTURE_MAKER: "adventure_maker",
	ADMIN: "admin",
};

const ACCESS_RANK = {
	[ACCESS_LEVELS.NOTHING]: 0,
	[ACCESS_LEVELS.PLAYER_ONLY]: 1,
	[ACCESS_LEVELS.ADVENTURE_MAKER]: 2,
	[ACCESS_LEVELS.ADMIN]: 3,
};

export function hasAccessLevel(user, ...allowedLevels) {
	if (!user) return false;
	if (allowedLevels.length === 0) return true;
	return allowedLevels.some(
		(level) => ACCESS_RANK[user.access_level] >= ACCESS_RANK[level],
	);
}

export const canPlay = (user) =>
	hasAccessLevel(user, ACCESS_LEVELS.PLAYER_ONLY);
export const canCreateAdventure = (user) =>
	hasAccessLevel(user, ACCESS_LEVELS.ADVENTURE_MAKER);
export const canManageUsers = (user) =>
	hasAccessLevel(user, ACCESS_LEVELS.ADMIN);

import { create } from "zustand";
import * as authApi from "../api/authApi";

// Central auth state: shared across pages instead of prop-drilling user/setUser
export const useAuthStore = create((set) => ({
	user: null,
	status: "loading", // 'loading' | 'ready' - lets ProtectedRoute wait for the initial /me check
	error: null,

	// Called once on app boot to restore a session from the auth cookie
	loadSession: async () => {
		try {
			const user = await authApi.fetchMe();
			set({ user, status: "ready" });
		} catch {
			set({ user: null, status: "ready" });
		}
	},

	login: async (email, password) => {
		set({ error: null });
		const user = await authApi.login(email, password);
		set({ user });
		return user;
	},

	register: async (payload) => {
		set({ error: null });
		const user = await authApi.register(payload);
		set({ user });
		return user;
	},

	logout: async () => {
		await authApi.logout();
		set({ user: null });
	},

	updateProfile: async (name) => {
		const user = await authApi.updateMe(name);
		set({ user });
		return user;
	},

	deleteAccount: async () => {
		await authApi.deleteMe();
		try {
			await authApi.logout();
		} catch {}
		set({ user: null, status: "ready" });
	},
}));

import { request } from "./client";

// One function per backend auth endpoint - keeps route paths in a single place
export const login = (email, password) =>
	request("/api/auth/login", {
		method: "POST",
		body: JSON.stringify({ email, password }),
	});

export const register = ({ email, name, password }) =>
	request("/api/auth/register", {
		method: "POST",
		body: JSON.stringify({ email, name, password }),
	});

export const logout = () => request("/api/auth/logout", { method: "POST" });

export const fetchMe = () => request("/api/auth/me");

export const updateMe = (name) =>
	request("/api/auth/me", {
		method: "PATCH",
		body: JSON.stringify({ name }),
	});

export const deleteMe = () => request("/api/auth/me", { method: "DELETE" });

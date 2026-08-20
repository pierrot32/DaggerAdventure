import { request } from "../../api/client";

export const listBuiltinFrames = () => request("/api/frames/builtins");
export const listLibraryFrames = () => request("/api/frames/library");
export const createLibraryFrame = (payload) =>
	request("/api/frames/library", {
		method: "POST",
		body: JSON.stringify(payload),
	});
export const updateLibraryFrame = (id, payload) =>
	request(`/api/frames/library/${id}`, {
		method: "PUT",
		body: JSON.stringify(payload),
	});
export const deleteLibraryFrame = (id) =>
	request(`/api/frames/library/${id}`, { method: "DELETE" });
export const getAdventureFrame = (id) => request(`/api/adventures/${id}/frame`);
export const attachAdventureFrame = (id, payload) =>
	request(`/api/adventures/${id}/frame`, {
		method: "POST",
		body: JSON.stringify(payload),
	});
export const updateAdventureFrame = (id, payload) =>
	request(`/api/adventures/${id}/frame`, {
		method: "PUT",
		body: JSON.stringify(payload),
	});
export const getAdventureCharacterContext = (id) =>
	request(`/api/adventures/${id}/character-context`);

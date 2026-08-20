import { request } from "../../api/client";

export const listSoundBoards = () => request("/api/soundboards");
export const getSoundBoard = (boardId) =>
	request(`/api/soundboards/${boardId}`);
export const createSoundBoard = (payload) =>
	request("/api/soundboards", {
		method: "POST",
		body: JSON.stringify(payload),
	});
export const updateSoundBoard = (boardId, payload) =>
	request(`/api/soundboards/${boardId}`, {
		method: "PATCH",
		body: JSON.stringify(payload),
	});
export const deleteSoundBoard = (boardId) =>
	request(`/api/soundboards/${boardId}`, { method: "DELETE" });

export const uploadSound = (boardId, formData) =>
	request(`/api/soundboards/${boardId}/sounds`, {
		method: "POST",
		body: formData,
	});
export const deleteSound = (boardId, soundId) =>
	request(`/api/soundboards/${boardId}/sounds/${soundId}`, {
		method: "DELETE",
	});

export const listSoundSources = () => request("/api/sound-sources");
export const createSoundSource = (payload) =>
	request("/api/sound-sources", {
		method: "POST",
		body: JSON.stringify(payload),
	});
export const updateSoundSource = (sourceId, payload) =>
	request(`/api/sound-sources/${sourceId}`, {
		method: "PUT",
		body: JSON.stringify(payload),
	});
export const deleteSoundSource = (sourceId) =>
	request(`/api/sound-sources/${sourceId}`, { method: "DELETE" });

export const listSoundLibrary = () => request("/api/sound-library");
export const uploadLibraryTrack = (formData) =>
	request("/api/sound-library", {
		method: "POST",
		body: formData,
	});
export const deleteLibraryTrack = (trackId) =>
	request(`/api/sound-library/${trackId}`, { method: "DELETE" });
export const attachLibraryTrack = (boardId, trackId) =>
	request(`/api/soundboards/${boardId}/library/${trackId}`, { method: "POST" });
export const detachLibraryTrack = (boardId, trackId) =>
	request(`/api/soundboards/${boardId}/library/${trackId}`, {
		method: "DELETE",
	});

export function soundMediaUrl(boardId, soundId, kind) {
	return `/api/soundboards/${boardId}/sounds/${soundId}/${kind}`;
}

export function libraryMediaUrl(trackId, kind) {
	return `/api/sound-library/${trackId}/${kind}`;
}

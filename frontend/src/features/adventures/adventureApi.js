import { request } from "../../api/client";

// Adventure API calls keep private-resource rules behind one feature boundary
export const listAdventures = () => request("/api/adventures");
export const getAdventure = (id) => request(`/api/adventures/${id}`);
export const deleteAdventure = (id) =>
	request(`/api/adventures/${id}`, { method: "DELETE" });
export const listAdventureCharacters = (id) =>
	request(`/api/adventures/${id}/characters`);
export const listAdventurePlayers = (id) =>
	request(`/api/adventures/${id}/players`);
export const createAdventure = (payload) =>
	request("/api/adventures", { method: "POST", body: JSON.stringify(payload) });
export const listInvites = (id) => request(`/api/adventures/${id}/invites`);
export const createInvite = (id, email) =>
	request(`/api/adventures/${id}/invites`, {
		method: "POST",
		body: JSON.stringify({ email }),
	});
export const acceptInvite = (id) =>
	request(`/api/invites/${id}/accept`, { method: "POST" });
export const declineInvite = (id) =>
	request(`/api/invites/${id}/decline`, { method: "POST" });
export const listMyInvites = () => request("/api/invites");
export const updateFear = (id, fear) =>
	request(`/api/adventures/${id}/fear`, {
		method: "PATCH",
		body: JSON.stringify({ fear }),
	});
export const listAdventureNotes = (id) =>
	request(`/api/adventures/${id}/notes`);
export const listAdventureNoteSections = (id) =>
	request(`/api/adventures/${id}/note-sections`);
export const createAdventureNoteSection = (id, payload) =>
	request(`/api/adventures/${id}/note-sections`, {
		method: "POST",
		body: JSON.stringify(payload),
	});
export const updateAdventureNoteSection = (adventureId, sectionId, payload) =>
	request(`/api/adventures/${adventureId}/note-sections/${sectionId}`, {
		method: "PUT",
		body: JSON.stringify(payload),
	});
export const deleteAdventureNoteSection = (adventureId, sectionId) =>
	request(`/api/adventures/${adventureId}/note-sections/${sectionId}`, {
		method: "DELETE",
	});
export const createAdventureNote = (id, payload) =>
	request(`/api/adventures/${id}/notes`, {
		method: "POST",
		body: JSON.stringify(payload),
	});
export const updateAdventureNote = (adventureId, noteId, payload) =>
	request(`/api/adventures/${adventureId}/notes/${noteId}`, {
		method: "PUT",
		body: JSON.stringify(payload),
	});
export const deleteAdventureNote = (adventureId, noteId) =>
	request(`/api/adventures/${adventureId}/notes/${noteId}`, {
		method: "DELETE",
	});

export const getAdventureStory = (id) =>
	request(`/api/adventures/${id}/story`);
export const generateStory = (id, payload) =>
	request(`/api/adventures/${id}/story/generate`, {
		method: "POST",
		body: JSON.stringify(payload),
	});
export const applyStoryProposal = (id, applyKey, proposal) =>
	request(`/api/adventures/${id}/story/apply`, {
		method: "POST",
		body: JSON.stringify({ ...proposal, apply_key: applyKey }),
	});
export const createStoryGoal = (id, payload) =>
	request(`/api/adventures/${id}/story/goals`, {
		method: "POST",
		body: JSON.stringify(payload),
	});
export const updateStoryGoal = (adventureId, goalId, payload) =>
	request(`/api/adventures/${adventureId}/story/goals/${goalId}`, {
		method: "PUT",
		body: JSON.stringify(payload),
	});
export const deleteStoryGoal = (adventureId, goalId) =>
	request(`/api/adventures/${adventureId}/story/goals/${goalId}`, {
		method: "DELETE",
	});
export const createStoryMilestone = (id, payload) =>
	request(`/api/adventures/${id}/story/milestones`, {
		method: "POST",
		body: JSON.stringify(payload),
	});
export const updateStoryMilestone = (adventureId, milestoneId, payload) =>
	request(`/api/adventures/${adventureId}/story/milestones/${milestoneId}`, {
		method: "PUT",
		body: JSON.stringify(payload),
	});
export const deleteStoryMilestone = (adventureId, milestoneId) =>
	request(`/api/adventures/${adventureId}/story/milestones/${milestoneId}`, {
		method: "DELETE",
	});
export const createStoryEvent = (adventureId, milestoneId, payload) =>
	request(`/api/adventures/${adventureId}/story/milestones/${milestoneId}/events`, {
		method: "POST",
		body: JSON.stringify(payload),
	});
export const updateStoryEvent = (adventureId, eventId, payload) =>
	request(`/api/adventures/${adventureId}/story/events/${eventId}`, {
		method: "PUT",
		body: JSON.stringify(payload),
	});
export const deleteStoryEvent = (adventureId, eventId) =>
	request(`/api/adventures/${adventureId}/story/events/${eventId}`, {
		method: "DELETE",
	});

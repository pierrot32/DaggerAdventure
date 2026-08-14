import { request } from '../../api/client';

// Adventure API calls keep private-resource rules behind one feature boundary
export const listAdventures = () => request('/api/adventures');
export const getAdventure = (id) => request(`/api/adventures/${id}`);
export const deleteAdventure = (id) => request(`/api/adventures/${id}`, { method: 'DELETE' });
export const listAdventureCharacters = (id) => request(`/api/adventures/${id}/characters`);
export const listAdventurePlayers = (id) => request(`/api/adventures/${id}/players`);
export const createAdventure = (payload) => request('/api/adventures', { method: 'POST', body: JSON.stringify(payload) });
export const listInvites = (id) => request(`/api/adventures/${id}/invites`);
export const createInvite = (id, email) => request(`/api/adventures/${id}/invites`, { method: 'POST', body: JSON.stringify({ email }) });
export const acceptInvite = (id) => request(`/api/invites/${id}/accept`, { method: 'POST' });
export const declineInvite = (id) => request(`/api/invites/${id}/decline`, { method: 'POST' });
export const listMyInvites = () => request('/api/invites');
export const updateFear = (id, fear) => request(`/api/adventures/${id}/fear`, { method: 'PATCH', body: JSON.stringify({ fear }) });
export const listAdventureNotes = (id) => request(`/api/adventures/${id}/notes`);
export const createAdventureNote = (id, payload) => request(`/api/adventures/${id}/notes`, { method: 'POST', body: JSON.stringify(payload) });
export const updateAdventureNote = (adventureId, noteId, payload) => request(`/api/adventures/${adventureId}/notes/${noteId}`, { method: 'PUT', body: JSON.stringify(payload) });
export const deleteAdventureNote = (adventureId, noteId) => request(`/api/adventures/${adventureId}/notes/${noteId}`, { method: 'DELETE' });

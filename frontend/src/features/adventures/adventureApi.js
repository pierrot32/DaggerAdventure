import { request } from '../../api/client';

// Adventure API calls keep private-resource rules behind one feature boundary
export const listAdventures = () => request('/api/adventures');
export const getAdventure = (id) => request(`/api/adventures/${id}`);
export const listAdventureCharacters = (id) => request(`/api/adventures/${id}/characters`);
export const createAdventure = (payload) => request('/api/adventures', { method: 'POST', body: JSON.stringify(payload) });
export const listInvites = (id) => request(`/api/adventures/${id}/invites`);
export const createInvite = (id, email) => request(`/api/adventures/${id}/invites`, { method: 'POST', body: JSON.stringify({ email }) });
export const acceptInvite = (id) => request(`/api/invites/${id}/accept`, { method: 'POST' });
export const declineInvite = (id) => request(`/api/invites/${id}/decline`, { method: 'POST' });
export const listMyInvites = () => request('/api/invites');
export const updateFear = (id, fear) => request(`/api/adventures/${id}/fear`, { method: 'PATCH', body: JSON.stringify({ fear }) });

import { request } from '../../api/client';

export const listSoundBoards = () => request('/api/soundboards');
export const getSoundBoard = (boardId) => request(`/api/soundboards/${boardId}`);
export const createSoundBoard = (payload) => request('/api/soundboards', {
  method: 'POST',
  body: JSON.stringify(payload),
});
export const updateSoundBoard = (boardId, payload) => request(`/api/soundboards/${boardId}`, {
  method: 'PATCH',
  body: JSON.stringify(payload),
});
export const deleteSoundBoard = (boardId) => request(`/api/soundboards/${boardId}`, { method: 'DELETE' });

export const uploadSound = (boardId, formData) => request(`/api/soundboards/${boardId}/sounds`, {
  method: 'POST',
  body: formData,
});
export const deleteSound = (boardId, soundId) => request(`/api/soundboards/${boardId}/sounds/${soundId}`, { method: 'DELETE' });

export function soundMediaUrl(boardId, soundId, kind) {
  return `/api/soundboards/${boardId}/sounds/${soundId}/${kind}`;
}
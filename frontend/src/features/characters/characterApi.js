import { request } from '../../api/client';

export const getCharacterCreationBook = () => request('/api/content/character-creation');
export const listCharacters = () => request('/api/characters');
export const getCharacter = (id) => request(`/api/characters/${id}`);
export const deleteCharacter = (id) => request(`/api/characters/${id}`, { method: 'DELETE' });
export const linkCharacterToAdventure = (id, adventureId) => request(`/api/characters/${id}/adventure`, {
  method: 'PATCH',
  body: JSON.stringify({ adventure_id: adventureId }),
});
export const updateCharacterStats = (id, stats) => request(`/api/characters/${id}/stats`, {
  method: 'PATCH',
  body: JSON.stringify({ stats }),
});
export const advanceCharacter = (id, payload) => request(`/api/characters/${id}/advancement`, {
  method: 'PATCH',
  body: JSON.stringify(payload),
});
export const updateCharacter = (id, payload) => request(`/api/characters/${id}`, {
  method: 'PUT',
  body: JSON.stringify(payload),
});
export const listCharacterNotes = (id) => request(`/api/characters/${id}/notes`);
export const createCharacterNoteSection = (id, payload) => request(`/api/characters/${id}/note-sections`, { method: 'POST', body: JSON.stringify(payload) });
export const updateCharacterNoteSection = (characterId, sectionId, payload) => request(`/api/characters/${characterId}/note-sections/${sectionId}`, { method: 'PUT', body: JSON.stringify(payload) });
export const deleteCharacterNoteSection = (characterId, sectionId) => request(`/api/characters/${characterId}/note-sections/${sectionId}`, { method: 'DELETE' });
export const createCharacterNote = (id, payload) => request(`/api/characters/${id}/notes`, { method: 'POST', body: JSON.stringify(payload) });
export const updateCharacterNote = (characterId, noteId, payload) => request(`/api/characters/${characterId}/notes/${noteId}`, { method: 'PUT', body: JSON.stringify(payload) });
export const deleteCharacterNote = (characterId, noteId) => request(`/api/characters/${characterId}/notes/${noteId}`, { method: 'DELETE' });
export const createCharacter = (payload) => request('/api/characters', {
  method: 'POST',
  body: JSON.stringify(payload),
});

export const generateCharacter = (payload) => request('/api/ai/character', {
  method: 'POST',
  body: JSON.stringify(payload),
});
export const generateCharacterImage = (characterId) => request('/api/ai/character-image', {
  method: 'POST',
  body: JSON.stringify({ character_id: characterId }),
});

export const importBook = (payload) => request('/api/content/books/import', {
  method: 'POST',
  body: JSON.stringify(payload),
});
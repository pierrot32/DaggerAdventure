import { request } from '../../api/client';

export const getCharacterCreationBook = () => request('/api/content/character-creation');
export const listCharacters = () => request('/api/characters');
export const getCharacter = (id) => request(`/api/characters/${id}`);
export const linkCharacterToAdventure = (id, adventureId) => request(`/api/characters/${id}/adventure`, {
  method: 'PATCH',
  body: JSON.stringify({ adventure_id: adventureId }),
});
export const createCharacter = (payload) => request('/api/characters', {
  method: 'POST',
  body: JSON.stringify(payload),
});

export const importBook = (payload) => request('/api/content/books/import', {
  method: 'POST',
  body: JSON.stringify(payload),
});
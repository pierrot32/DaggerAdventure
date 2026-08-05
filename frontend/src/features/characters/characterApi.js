import { request } from '../../api/client';

export const getCharacterCreationBook = () => request('/api/content/character-creation');
export const listCharacters = () => request('/api/characters');
export const createCharacter = (payload) => request('/api/characters', {
  method: 'POST',
  body: JSON.stringify(payload),
});

export const importBook = (payload) => request('/api/content/books/import', {
  method: 'POST',
  body: JSON.stringify(payload),
});
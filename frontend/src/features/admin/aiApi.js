import { request } from '../../api/client';

export const generate = (prompt) => request('/api/ai/generate', {
  method: 'POST',
  body: JSON.stringify({ prompt }),
});
export const listPromptTemplates = () => request('/api/admin/ai-prompts');
export const updatePromptTemplate = (generationType, template) => request(`/api/admin/ai-prompts/${generationType}`, {
  method: 'PUT',
  body: JSON.stringify({ template }),
});
export const resetPromptTemplate = (generationType) => request(`/api/admin/ai-prompts/${generationType}`, {
  method: 'DELETE',
});
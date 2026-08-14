import { request } from '../../api/client';

// Admin API calls stay isolated from presentation components
export async function listUsers({ search = '', access_level = '', page = 1, limit = 25 } = {}) {
  const params = new URLSearchParams({ search, page, limit });
  if (access_level) params.set('access_level', access_level);
  return request(`/api/admin/users?${params}`);
}

export const updateAccessLevel = (userId, access_level) =>
  request(`/api/admin/users/${userId}/access-level`, {
    method: 'PATCH',
    body: JSON.stringify({ access_level }),
  });

export const updateApproval = (userId, approved) =>
  request(`/api/admin/users/${userId}/approval`, {
    method: 'PATCH',
    body: JSON.stringify({ approved }),
  });

export const updateAiGenerationAccess = (userId, enabled) =>
  request(`/api/admin/users/${userId}/ai-generation`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });

export const listAuditEvents = (page = 1, limit = 50) =>
  request(`/api/admin/access-audit?page=${page}&limit=${limit}`);

export const listAiLogs = (page = 1, limit = 50) =>
  request(`/api/admin/ai-logs?page=${page}&limit=${limit}`);

export const listBooks = () => request('/api/admin/content/books');

export const updateBookContent = (bookId, content) => request(`/api/admin/content/books/${bookId}`, {
  method: 'PUT',
  body: JSON.stringify({ content }),
});

export const exportBooks = () => request('/api/admin/content/books/export');

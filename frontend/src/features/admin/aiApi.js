import { request } from '../../api/client';

export const generate = (prompt) => request('/api/ai/generate', {
  method: 'POST',
  body: JSON.stringify({ prompt }),
});
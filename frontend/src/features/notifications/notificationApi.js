import { request } from '../../api/client';

// Notifications are always scoped by the backend to the current account
export const listNotifications = () => request('/api/notifications');
export const markRead = (id) => request(`/api/notifications/${id}/read`, { method: 'POST' });

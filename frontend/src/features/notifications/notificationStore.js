import { create } from 'zustand';
import * as notificationApi from './notificationApi';

// Notification state exposes unread count without leaking request details to views
export const useNotificationStore = create((set) => ({
  notifications: [],
  loading: false,
  error: null,

  fetchNotifications: async () => {
    set({ loading: true, error: null });
    try { set({ notifications: await notificationApi.listNotifications(), loading: false }); }
    catch (error) { set({ error: error.message, loading: false }); }
  },

  markRead: async (id) => {
    try {
      const updated = await notificationApi.markRead(id);
      set((state) => ({ notifications: state.notifications.map((item) => item.id === updated.id ? updated : item) }));
    } catch (error) { set({ error: error.message }); }
  },
}));

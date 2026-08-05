import { create } from 'zustand';
import * as adminApi from './adminApi';

// Admin state owns list, pagination, and mutation feedback
export const useAdminStore = create((set, get) => ({
  users: [],
  total: 0,
  page: 1,
  limit: 25,
  loading: false,
  error: null,
  auditEvents: [],

  fetchUsers: async (filters = {}) => {
    set({ loading: true, error: null });
    try {
      const data = await adminApi.listUsers({ ...filters, page: filters.page || get().page });
      set({ users: data.users, total: data.total, page: data.page, limit: data.limit, loading: false });
    } catch (error) {
      set({ error: error.message, loading: false });
    }
  },

  changeAccessLevel: async (userId, access_level) => {
    set({ loading: true, error: null });
    try {
      const updated = await adminApi.updateAccessLevel(userId, access_level);
      set({ users: get().users.map((user) => user.id === updated.id ? updated : user), loading: false });
    } catch (error) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  fetchAudit: async () => {
    set({ loading: true, error: null });
    try {
      const auditEvents = await adminApi.listAuditEvents();
      set({ auditEvents, loading: false });
    } catch (error) {
      set({ error: error.message, loading: false });
    }
  },
}));

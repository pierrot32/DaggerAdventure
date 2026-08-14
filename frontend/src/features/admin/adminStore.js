import { create } from 'zustand';
import * as adminApi from './adminApi';

const normalizeUserListQuery = (filters, state) => ({
  search: filters.search ?? '',
  access_level: filters.access_level ?? '',
  page: filters.page || state.page || 1,
  limit: filters.limit || state.limit || 25,
});

const userListQueryKey = (query) => JSON.stringify(query);

// Admin state owns list, pagination, and mutation feedback
export const useAdminStore = create((set, get) => ({
  users: [],
  total: 0,
  page: 1,
  limit: 25,
  loading: false,
  mutationLoading: false,
  error: null,
  auditEvents: [],
  userListRequestId: 0,
  userListQueryVersion: 0,
  activeUserListQuery: null,
  activeUserListQueryKey: null,

  fetchUsers: async (filters = {}) => {
    const state = get();
    const requestId = state.userListRequestId + 1;
    const query = normalizeUserListQuery(filters, state);
    const queryKey = userListQueryKey(query);
    const queryVersion = state.userListQueryVersion + 1;
    set({
      userListRequestId: requestId,
      userListQueryVersion: queryVersion,
      activeUserListQuery: query,
      activeUserListQueryKey: queryKey,
      loading: true,
      error: null,
    });
    try {
      const data = await adminApi.listUsers(query);
      if (get().userListRequestId === requestId) {
        set({ users: data.users, total: data.total, page: data.page, limit: data.limit, loading: false });
      }
    } catch (error) {
      if (get().userListRequestId === requestId) {
        set({ users: [], total: 0, error: error.message, loading: false });
      }
    }
  },

  changeAccessLevel: async (userId, access_level) => {
    set({ mutationLoading: true, error: null });
    try {
      const updated = await adminApi.updateAccessLevel(userId, access_level);
      set({ users: get().users.map((user) => user.id === updated.id ? updated : user), mutationLoading: false });
    } catch (error) {
      set({ error: error.message, mutationLoading: false });
      throw error;
    }
  },

  changeApproval: async (userId, approved, filters = {}) => {
    const state = get();
    const capturedQuery = normalizeUserListQuery(filters, state);
    const capturedQueryKey = userListQueryKey(capturedQuery);
    const capturedQueryVersion = state.userListQueryVersion;
    set({ mutationLoading: true, error: null });
    try {
      await adminApi.updateApproval(userId, approved);
      const current = get();
      if (
        current.userListQueryVersion === capturedQueryVersion
        && current.activeUserListQueryKey === capturedQueryKey
      ) {
        await get().fetchUsers(capturedQuery);
      }
      set({ mutationLoading: false });
    } catch (error) {
      const mutationError = error.message;
      const activeQuery = get().activeUserListQuery;
      if (activeQuery) {
        await get().fetchUsers(activeQuery);
      } else {
        set({ users: [], total: 0 });
      }
      set({ error: mutationError, mutationLoading: false });
    }
  },

  changeAiGenerationAccess: async (userId, enabled) => {
    set({ mutationLoading: true, error: null });
    try {
      const updated = await adminApi.updateAiGenerationAccess(userId, enabled);
      set({ users: get().users.map((user) => user.id === updated.id ? updated : user), mutationLoading: false });
    } catch (error) {
      set({ error: error.message, mutationLoading: false });
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

import { create } from 'zustand';
import * as adventureApi from './adventureApi';

// Adventure state centralizes loading and mutation errors for all adventure pages
export const useAdventureStore = create((set) => ({
  adventures: [],
  current: null,
  invites: [],
  loading: false,
  error: null,

  fetchAdventures: async () => {
    set({ loading: true, error: null });
    try { set({ adventures: await adventureApi.listAdventures(), loading: false }); }
    catch (error) { set({ error: error.message, loading: false }); }
  },

  fetchAdventure: async (id) => {
    set({ loading: true, error: null });
    try { set({ current: await adventureApi.getAdventure(id), loading: false }); }
    catch (error) { set({ error: error.message, loading: false }); }
  },

  create: async (payload) => {
    set({ loading: true, error: null });
    try {
      const current = await adventureApi.createAdventure(payload);
      set({ current, loading: false });
      return current;
    } catch (error) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  fetchInvites: async (id) => {
    set({ loading: true, error: null });
    try { set({ invites: await adventureApi.listInvites(id), loading: false }); }
    catch (error) { set({ error: error.message, loading: false }); }
  },

  invite: async (id, email) => {
    set({ loading: true, error: null });
    try {
      const invite = await adventureApi.createInvite(id, email);
      set((state) => ({ invites: [invite, ...state.invites], loading: false }));
      return invite;
    } catch (error) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  respondToInvite: async (inviteId, accepted) => {
    set({ loading: true, error: null });
    try {
      const invite = accepted
        ? await adventureApi.acceptInvite(inviteId)
        : await adventureApi.declineInvite(inviteId);
      set({ loading: false });
      return invite;
    } catch (error) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },
}));

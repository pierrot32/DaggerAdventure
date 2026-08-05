import { create } from 'zustand';
import * as adventureApi from './adventureApi';

// Adventure state centralizes loading and mutation errors for all adventure pages
export const useAdventureStore = create((set) => ({
  adventures: [],
  current: null,
  invites: [],
  pendingInvites: [],
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
      set((state) => ({
        pendingInvites: state.pendingInvites.filter((item) => item.id !== inviteId),
        loading: false,
      }));
      if (accepted) await useAdventureStore.getState().fetchAdventures();
      return invite;
    } catch (error) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  fetchPendingInvites: async () => {
    try { set({ pendingInvites: await adventureApi.listMyInvites() }); }
    catch (error) { set({ error: error.message }); }
  },

  setFear: async (id, fear) => {
    const previous = useAdventureStore.getState().current;
    set({ current: { ...previous, fear } });
    try {
      set({ current: await adventureApi.updateFear(id, fear) });
    } catch (error) {
      set({ current: previous, error: error.message });
    }
  },
}));

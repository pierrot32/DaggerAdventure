import { create } from 'zustand';
import * as adventureApi from './adventureApi';

let adventureFetchGeneration = 0;

// Adventure state centralizes loading and mutation errors for all adventure pages
export const useAdventureStore = create((set) => ({
  adventures: [],
  current: null,
  invites: [],
  pendingInvites: [],
  loading: false,
  error: null,

  clearInvites: () => set({ invites: [] }),

  fetchAdventures: async () => {
    set({ loading: true, error: null });
    try { set({ adventures: await adventureApi.listAdventures(), loading: false }); }
    catch (error) { set({ error: error.message, loading: false }); }
  },

  fetchAdventure: async (id) => {
    const requestGeneration = ++adventureFetchGeneration;
    set((state) => ({
      loading: true,
      error: null,
      current: state.current?.id === id ? state.current : null,
    }));
    try {
      const adventure = await adventureApi.getAdventure(id);
      if (requestGeneration === adventureFetchGeneration) set({ current: adventure, loading: false });
    } catch (error) {
      if (requestGeneration === adventureFetchGeneration) set({ error: error.message, loading: false });
    }
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

  deleteAdventure: async (id, canCommit = () => true) => {
    set({ loading: true, error: null });
    try {
      await adventureApi.deleteAdventure(id);
      if (!canCommit()) return;
      set((state) => ({
        adventures: state.adventures.filter((adventure) => adventure.id !== id),
        current: state.current?.id === id ? null : state.current,
        loading: false,
      }));
    } catch (error) {
      if (canCommit()) set({ error: error.message, loading: false });
      throw error;
    }
  },

  fetchInvites: async (id, canCommit = () => true) => {
    set({ invites: [], loading: true, error: null });
    try {
      const invites = await adventureApi.listInvites(id);
      if (canCommit()) set({ invites, loading: false });
      return invites;
    } catch (error) {
      if (canCommit()) set({ error: error.message, loading: false });
    }
  },

  invite: async (id, email, canCommit = () => true) => {
    set({ loading: true, error: null });
    try {
      const invite = await adventureApi.createInvite(id, email);
      if (canCommit()) set((state) => ({ invites: [invite, ...state.invites], loading: false }));
      return invite;
    } catch (error) {
      if (canCommit()) set({ error: error.message, loading: false });
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

  setFear: async (id, fear, canCommit = () => true) => {
    const previous = useAdventureStore.getState().current;
    set({ current: { ...previous, fear } });
    try {
      const updated = await adventureApi.updateFear(id, fear);
      if (canCommit()) set({ current: updated });
    } catch (error) {
      if (canCommit()) set({ current: previous, error: error.message });
    }
  },
}));

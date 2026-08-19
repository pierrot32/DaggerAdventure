import { create } from 'zustand';

export const useSoundPlayerStore = create((set) => ({
  current: null,
  playing: false,
  play: (sound) => set({ current: sound, playing: true }),
  setPlaying: (playing) => set({ playing }),
  clear: () => set({ current: null, playing: false }),
}));
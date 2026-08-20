import { create } from "zustand";

let queueSequence = 0;

const createQueueEntry = (sound) => ({
	...sound,
	queueId: `queue-${++queueSequence}`,
});

export const useSoundPlayerStore = create((set) => ({
	current: null,
	playing: false,
	queue: [],
	playbackVersion: 0,
	play: (sound) =>
		set((state) => ({
			current: sound,
			playing: true,
			playbackVersion: state.playbackVersion + 1,
		})),
	addToQueue: (sound) =>
		set((state) =>
			state.current
				? { queue: [...state.queue, createQueueEntry(sound)] }
				: {
						current: sound,
						playing: true,
						playbackVersion: state.playbackVersion + 1,
					},
		),
	removeFromQueue: (queueId) =>
		set((state) => ({
			queue: state.queue.filter((sound) => sound.queueId !== queueId),
		})),
	clearQueue: () => set({ queue: [] }),
	advanceQueue: () =>
		set((state) => {
			if (state.queue.length === 0) return { playing: false };
			const [next, ...remaining] = state.queue;
			return {
				current: next,
				queue: remaining,
				playing: true,
				playbackVersion: state.playbackVersion + 1,
			};
		}),
	setPlaying: (playing) => set({ playing }),
	clear: () => set({ current: null, playing: false, queue: [] }),
}));

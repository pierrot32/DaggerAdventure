import { create } from "zustand";

let queueSequence = 0;

const createQueueEntry = (sound) => ({
	...sound,
	queueId: `queue-${++queueSequence}`,
});

export const useSoundPlayerStore = create((set, get) => ({
	current: null,
	playing: false,
	queue: [],
	playbackVersion: 0,
	repeatMode: "off",
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
	advanceQueue: (mode = get().repeatMode) =>
		set((state) => {
			if (mode === "song" || state.queue.length === 0) {
				return mode === "song" && state.current
					? {
							playing: true,
							playbackVersion: state.playbackVersion + 1,
						}
					: state.queue.length === 0 && mode === "queue" && state.current
						? {
								playing: true,
								playbackVersion: state.playbackVersion + 1,
							}
						: { playing: false };
			}
			const [next, ...remaining] = state.queue;
			return {
				current: next,
				queue: mode === "queue" ? [...remaining, state.current] : remaining,
				playing: true,
				playbackVersion: state.playbackVersion + 1,
			};
		}),
	setRepeatMode: (repeatMode) =>
		set({
			repeatMode: ["off", "song", "queue"].includes(repeatMode)
				? repeatMode
				: "off",
		}),
	cycleRepeatMode: () =>
		set((state) => ({
			repeatMode:
				state.repeatMode === "off"
					? "song"
					: state.repeatMode === "song"
						? "queue"
						: "off",
		})),
	getRepeatMode: () => get().repeatMode,
	setPlaying: (playing) => set({ playing }),
	clear: () => set({ current: null, playing: false, queue: [] }),
}));

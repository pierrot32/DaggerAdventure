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
	sequence: [],
	sequenceIndex: -1,
	history: [],
	playbackVersion: 0,
	repeatMode: "off",
	play: (sound) =>
		set((state) => ({
			current: sound,
			playing: true,
			sequence: [],
			sequenceIndex: -1,
			history:
				state.current && state.current.audioSource !== sound.audioSource
					? [...state.history, state.current]
					: state.history,
			playbackVersion: state.playbackVersion + 1,
		})),
	addToQueue: (sound) =>
		set((state) =>
			state.current
				? { queue: [...state.queue, createQueueEntry(sound)] }
				: {
						current: sound,
						playing: true,
						sequence: [],
						sequenceIndex: -1,
						history: [],
						playbackVersion: state.playbackVersion + 1,
					},
		),
	launchSequence: (sounds) =>
		set((state) => {
			if (sounds.length === 0) return state;
			return {
				sequence: sounds,
				sequenceIndex: 0,
				current: sounds[0],
				playing: true,
				history: [],
				playbackVersion: state.playbackVersion + 1,
			};
		}),
	removeFromQueue: (queueId) =>
		set((state) => ({
			queue: state.queue.filter((sound) => sound.queueId !== queueId),
		})),
	clearQueue: () => set({ queue: [] }),
	advanceQueue: (mode = get().repeatMode) =>
		set((state) => {
			if (mode === "song") {
				return mode === "song" && state.current
					? {
							playing: true,
							playbackVersion: state.playbackVersion + 1,
						}
					: state;
			}
			if (state.sequence.length > 0) {
				const nextIndex = state.sequenceIndex + 1;
				if (nextIndex < state.sequence.length) {
					return {
						current: state.sequence[nextIndex],
						sequenceIndex: nextIndex,
						playing: true,
						playbackVersion: state.playbackVersion + 1,
					};
				}
				if (mode === "queue") {
					return {
						current: state.sequence[0],
						sequenceIndex: 0,
						playing: true,
						playbackVersion: state.playbackVersion + 1,
					};
				}
			}
			if (state.queue.length === 0) {
				return { playing: false };
			}
			const [next, ...remaining] = state.queue;
			return {
				current: next,
				queue: mode === "queue" ? [...remaining, state.current] : remaining,
				sequence: [],
				sequenceIndex: -1,
				history: state.current
					? [...state.history, state.current]
					: state.history,
				playing: true,
				playbackVersion: state.playbackVersion + 1,
			};
		}),
	next: () =>
		get().advanceQueue(
			get().repeatMode === "song" ? "off" : get().repeatMode,
		),
	previous: () =>
		set((state) => {
			if (state.sequence.length > 0 && state.sequenceIndex > 0) {
				const previousIndex = state.sequenceIndex - 1;
				return {
					current: state.sequence[previousIndex],
					sequenceIndex: previousIndex,
					playing: true,
					playbackVersion: state.playbackVersion + 1,
				};
			}
			if (state.history.length === 0) return state;
			const previous = state.history[state.history.length - 1];
			return {
				current: previous,
				history: state.history.slice(0, -1),
				queue: state.current
					? [createQueueEntry(state.current), ...state.queue]
					: state.queue,
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
	clear: () =>
		set({
			current: null,
			playing: false,
			queue: [],
			sequence: [],
			sequenceIndex: -1,
			history: [],
		}),
}));

import { create } from "zustand";
import { resetPlayback } from "./playbackController";

let queueSequence = 0;
let fallbackPlaybackSequence = 0;
const fallbackPlaybackIds = new WeakMap();
const MAX_HISTORY_ENTRIES = 50;

function appendHistory(history, sound) {
	return [...history, sound].slice(-MAX_HISTORY_ENTRIES);
}

function fallbackPlaybackId(sound) {
	if (sound && typeof sound === "object") {
		if (!fallbackPlaybackIds.has(sound))
			fallbackPlaybackIds.set(sound, `object:${++fallbackPlaybackSequence}`);
		return fallbackPlaybackIds.get(sound);
	}
	return `value:${String(sound)}`;
}

export function getSoundPlaybackId(sound, options = {}) {
	if (sound?.playbackId) return sound.playbackId;
	const sourceKind =
		options.sourceKind || (sound?.library_track_id ? "library" : "direct");
	const sourceId =
		options.sourceId ?? sound?.library_track_id ?? sound?.id;
	const boardId =
		options.boardId ?? sound?.board_id ?? sound?.boardId ?? "unknown";
	if (sourceId != null)
		return `${sourceKind}:${sourceId}:board:${boardId}`;
	return fallbackPlaybackId(sound);
}

export function createPlayerSound(sound, options = {}) {
	const playerSound = {
		...sound,
		playbackId: getSoundPlaybackId(sound, options),
	};
	if (options.audioSource !== undefined)
		playerSound.audioSource = options.audioSource;
	if (options.imageSource !== undefined)
		playerSound.imageSource = options.imageSource;
	if (options.boardName !== undefined)
		playerSound.boardName = options.boardName;
	return playerSound;
}

function ensurePlaybackId(sound) {
	return sound?.playbackId
		? sound
		: { ...sound, playbackId: getSoundPlaybackId(sound) };
}

const createQueueEntry = (sound) => ({
	...ensurePlaybackId(sound),
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
		set((state) => {
			const nextSound = ensurePlaybackId(sound);
			const current = state.current && ensurePlaybackId(state.current);
			return {
				current: nextSound,
				playing: true,
				sequence: [],
				sequenceIndex: -1,
				history:
					current && current.playbackId !== nextSound.playbackId
						? appendHistory(state.history, current)
						: state.history,
				playbackVersion: state.playbackVersion + 1,
			};
		}),
	addToQueue: (sound) =>
		set((state) =>
			state.current
				? { queue: [...state.queue, createQueueEntry(sound)] }
				: {
						current: ensurePlaybackId(sound),
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
			const sequence = sounds.map(ensurePlaybackId);
			return {
				sequence,
				sequenceIndex: 0,
				current: sequence[0],
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
				queue:
					mode === "queue"
						? [...remaining, createQueueEntry(state.current)]
						: remaining,
				sequence: [],
				sequenceIndex: -1,
				history: state.current
					? appendHistory(state.history, state.current)
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
	stop: () =>
		set({
			current: null,
			playing: false,
			sequence: [],
			sequenceIndex: -1,
			history: [],
		}),
	clear: () => {
		resetPlayback();
		set((state) => ({
			current: null,
			playing: false,
			queue: [],
			sequence: [],
			sequenceIndex: -1,
			history: [],
			playbackVersion: state.playbackVersion + 1,
		}));
	},
}));

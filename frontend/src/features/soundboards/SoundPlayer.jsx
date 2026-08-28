import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSoundPlayerStore } from "./soundboardStore";
import {
	audioElement,
	beginPlayAttempt,
	getLoadedPlayback,
	hasActivePlayAttempt,
	invalidatePlayAttempt,
	isCurrentPlayAttempt,
	setLoadedPlayback,
} from "./playbackController";
import styles from "./SoundPlayer.module.css";

let appliedPlaybackVersion = null;

function isCurrentMedia(mediaIdentity) {
	const state = useSoundPlayerStore.getState();
	return (
		Boolean(mediaIdentity.current.source) &&
		mediaIdentity.current.version === state.playbackVersion &&
		mediaIdentity.current.source === state.current?.audioSource
	);
}

function formatTime(value) {
	if (!Number.isFinite(value)) return "0:00";
	const minutes = Math.floor(value / 60);
	const seconds = Math.floor(value % 60)
		.toString()
		.padStart(2, "0");
	return `${minutes}:${seconds}`;
}

function requestPlay(version, source) {
	const attempt = beginPlayAttempt();
	audioElement?.play().catch(() => {
		const state = useSoundPlayerStore.getState();
		if (
			isCurrentPlayAttempt(attempt) &&
			state.playbackVersion === version &&
			state.current?.audioSource === source
		) {
			invalidatePlayAttempt();
			state.setPlaying(false);
		}
	});
}

export default function SoundPlayer() {
	const current = useSoundPlayerStore((state) => state.current);
	const playing = useSoundPlayerStore((state) => state.playing);
	const queue = useSoundPlayerStore((state) => state.queue);
	const playbackVersion = useSoundPlayerStore((state) => state.playbackVersion);
	const repeatMode = useSoundPlayerStore((state) => state.repeatMode);
	const sequence = useSoundPlayerStore((state) => state.sequence);
	const sequenceIndex = useSoundPlayerStore((state) => state.sequenceIndex);
	const history = useSoundPlayerStore((state) => state.history);
	const setPlaying = useSoundPlayerStore((state) => state.setPlaying);
	const advanceQueue = useSoundPlayerStore((state) => state.advanceQueue);
	const next = useSoundPlayerStore((state) => state.next);
	const previous = useSoundPlayerStore((state) => state.previous);
	const cycleRepeatMode = useSoundPlayerStore((state) => state.cycleRepeatMode);
	const getRepeatMode = useSoundPlayerStore((state) => state.getRepeatMode);
	const removeFromQueue = useSoundPlayerStore((state) => state.removeFromQueue);
	const clearQueue = useSoundPlayerStore((state) => state.clearQueue);
	const stop = useSoundPlayerStore((state) => state.stop);
	const clear = useSoundPlayerStore((state) => state.clear);
	const navigate = useNavigate();
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [queueVisible, setQueueVisible] = useState(false);
	const [playerVisible, setPlayerVisible] = useState(true);
	const seeking = useRef(false);
	const mediaIdentity = useRef(getLoadedPlayback());
	const seekSequence = useRef(0);
	const seekRequest = useRef(null);
	useEffect(() => {
		if (!audioElement) return undefined;
		const handlePlay = () => {
			if (
				hasActivePlayAttempt() &&
				!audioElement.paused &&
				isCurrentMedia(mediaIdentity)
			)
				setPlaying(true);
		};
		const handleEnded = () => {
			if (!isCurrentMedia(mediaIdentity) || audioElement.ended === false)
				return;
			if (
				Number.isFinite(audioElement.duration) &&
				audioElement.currentTime < audioElement.duration - 0.05
			)
				return;
			advanceQueue(getRepeatMode());
		};
		const handleTimeUpdate = () => {
			if (isCurrentMedia(mediaIdentity) && !seeking.current)
				setCurrentTime(audioElement.currentTime);
		};
		const handleDurationChange = () => {
			if (isCurrentMedia(mediaIdentity))
				setDuration(
					Number.isFinite(audioElement.duration) ? audioElement.duration : 0,
				);
		};
		const handleSeeked = () => {
			const request = seekRequest.current;
			if (
				!request ||
				request.id !== seekSequence.current ||
				!isCurrentMedia(mediaIdentity)
			)
				return;
			if (
				!Number.isFinite(audioElement.currentTime) ||
				Math.abs(audioElement.currentTime - request.position) > 0.05
			)
				return;
			setCurrentTime(audioElement.currentTime);
			seekRequest.current = null;
			seeking.current = false;
		};
		audioElement.addEventListener("play", handlePlay);
		audioElement.addEventListener("ended", handleEnded);
		audioElement.addEventListener("timeupdate", handleTimeUpdate);
		audioElement.addEventListener("loadedmetadata", handleDurationChange);
		audioElement.addEventListener("durationchange", handleDurationChange);
		audioElement.addEventListener("seeked", handleSeeked);
		return () => {
			audioElement.removeEventListener("play", handlePlay);
			audioElement.removeEventListener("ended", handleEnded);
			audioElement.removeEventListener("timeupdate", handleTimeUpdate);
			audioElement.removeEventListener("loadedmetadata", handleDurationChange);
			audioElement.removeEventListener("durationchange", handleDurationChange);
			audioElement.removeEventListener("seeked", handleSeeked);
		};
	}, [advanceQueue, getRepeatMode, setPlaying]);

	useEffect(() => {
		if (queue.length === 0) setQueueVisible(false);
	}, [queue.length]);

	useEffect(() => {
		if (!audioElement || !current) {
			if (audioElement) {
				audioElement.pause();
			}
			mediaIdentity.current = { version: null, source: null };
			seekSequence.current += 1;
			seekRequest.current = null;
			seeking.current = false;
			return;
		}
		if (
			appliedPlaybackVersion !== playbackVersion ||
			mediaIdentity.current.version !== playbackVersion ||
			mediaIdentity.current.source !== current.audioSource
		) {
			invalidatePlayAttempt();
			audioElement.pause();
			mediaIdentity.current = {
				version: playbackVersion,
				source: current.audioSource,
			};
			setLoadedPlayback(playbackVersion, current.audioSource);
			audioElement.src = current.audioSource;
			audioElement.load();
			appliedPlaybackVersion = playbackVersion;
			seekSequence.current += 1;
			seekRequest.current = null;
			seeking.current = false;
			setCurrentTime(0);
			setDuration(0);
		} else {
			setCurrentTime(audioElement.currentTime);
			setDuration(
				Number.isFinite(audioElement.duration) ? audioElement.duration : 0,
			);
		}
		if (playing) requestPlay(playbackVersion, current.audioSource);
		else audioElement.pause();
	}, [current, playbackVersion, playing, setPlaying]);

	const togglePlaying = () => {
		if (playing) {
			invalidatePlayAttempt();
			audioElement?.pause();
			setPlaying(false);
		} else if (current) {
			requestPlay(playbackVersion, current.audioSource);
		}
	};
	const stopPlaying = () => {
		invalidatePlayAttempt();
		audioElement?.pause();
		stop();
	};
	const seek = (event) => {
		const nextTime = Number(event.currentTarget.value);
		if (
			!audioElement ||
			!Number.isFinite(nextTime) ||
			!Number.isFinite(audioElement.duration)
		)
			return;
		if (!isCurrentMedia(mediaIdentity)) return;
		const position = Math.max(0, Math.min(nextTime, audioElement.duration));
		const requestId = ++seekSequence.current;
		seeking.current = true;
		seekRequest.current = {
			id: requestId,
			version: playbackVersion,
			source: current.audioSource,
			position,
		};
		audioElement.currentTime = position;
		setCurrentTime(position);
	};
	const cancelSeeking = () => {
		seekSequence.current += 1;
		seekRequest.current = null;
		seeking.current = false;
		if (audioElement) setCurrentTime(audioElement.currentTime);
	};
	const seekProgress = duration
		? Math.min(100, Math.max(0, (currentTime / duration) * 100))
		: 0;
	const repeatLabels = { off: "Off", song: "Song", queue: "Queue" };
	const hasPrevious =
		(sequence.length > 0 && sequenceIndex > 0) || history.length > 0;
	const hasNext =
		(sequence.length > 0 && sequenceIndex < sequence.length - 1) ||
		queue.length > 0 ||
		(sequence.length > 0 && repeatMode === "queue");

	if (!current) return null;
	if (!playerVisible)
		return (
			<button
				className={styles.collapsedPlayer}
				type="button"
				onClick={() => setPlayerVisible(true)}
				aria-label={`Show sound player for ${current.name}`}
				title={`Show sound player for ${current.name}`}
			>
				<span aria-hidden="true">♪</span>
				<strong>{current.name}</strong>
			</button>
		);

	return (
		<aside className={styles.player} aria-label="Sound player">
			<button
				className={styles.trackLink}
				type="button"
				onClick={() => navigate("/soundboards")}
				aria-label="Open soundboards"
			>
				{current.imageSource ? (
					<img className={styles.art} src={current.imageSource} alt="" />
				) : (
					<div className={styles.artPlaceholder}>SFX</div>
				)}
				<span className={styles.details}>
					<span className={styles.eyebrow}>NOW PLAYING</span>
					<strong>{current.name}</strong>
					<small>{current.boardName}</small>
				</span>
			</button>
			<div className={styles.controls}>
				<button
					className={styles.navButton}
					type="button"
					onClick={previous}
					disabled={!hasPrevious}
					aria-label="Previous sound"
					title="Previous sound"
				>
					<span aria-hidden="true">‹</span>
				</button>
				<button
					className={styles.playToggle}
					type="button"
					onClick={togglePlaying}
					aria-label={playing ? "Pause sound" : "Play sound"}
					title={playing ? "Pause sound" : "Play sound"}
				>
					<span aria-hidden="true">{playing ? "❚❚" : "▶"}</span>
				</button>
				<button
					className={styles.stopButton}
					type="button"
					onClick={stopPlaying}
					aria-label="Stop sound"
					title="Stop sound"
				>
					<span aria-hidden="true">■</span>
				</button>
				<button
					className={styles.navButton}
					type="button"
					onClick={next}
					disabled={!hasNext}
					aria-label="Next sound"
					title="Next sound"
				>
					<span aria-hidden="true">›</span>
				</button>
				<input
					className={styles.seek}
					type="range"
					min="0"
					max={duration || 1}
					step="any"
					value={duration ? Math.min(currentTime, duration) : 0}
					style={{ "--seek-progress": `${seekProgress}%` }}
					onPointerDown={() => {
						seeking.current = true;
					}}
					onPointerCancel={cancelSeeking}
					onInput={seek}
					aria-label="Seek sound"
					disabled={!duration}
				/>
				<span className={styles.time}>
					{formatTime(currentTime)} / {formatTime(duration)}
				</span>
			</div>
			<button
				className={styles.repeatMode}
				type="button"
				onClick={cycleRepeatMode}
				aria-label={`Repeat mode: ${repeatLabels[repeatMode]}. Activate to change.`}
				title="Cycle repeat mode"
			>
				{repeatMode === "off" ? (
					<span aria-hidden="true">↻̸</span>
				) : (
					<>↻ {repeatLabels[repeatMode]}</>
				)}
			</button>
			<button
				className={styles.queueToggle}
				type="button"
				onClick={() => setQueueVisible((visible) => !visible)}
				aria-expanded={queueVisible && queue.length > 0}
				disabled={queue.length === 0}
			>
				Queue ({queue.length})
			</button>
			<button
				className={styles.hide}
				type="button"
				onClick={() => setPlayerVisible(false)}
				aria-label="Hide sound player"
				title="Hide sound player"
			>
				Hide
			</button>
			<button
				className={styles.close}
				type="button"
				onClick={clear}
				aria-label="Close sound player"
				title="Close sound player"
			>
				×
			</button>
			{queueVisible && queue.length > 0 && (
				<section className={styles.queue} aria-label="Sound queue">
					<div className={styles.queueHeading}>
						<strong>Queue</strong>
						<button type="button" onClick={clearQueue}>
							Clear queue
						</button>
					</div>
					<ol>
						{queue.map((sound) => (
							<li key={sound.queueId}>
								<span>{sound.name}</span>
								<button
									type="button"
									onClick={() => removeFromQueue(sound.queueId)}
									aria-label={`Remove ${sound.name} from queue`}
								>
									Remove
								</button>
							</li>
						))}
					</ol>
				</section>
			)}
		</aside>
	);
}

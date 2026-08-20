import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSoundPlayerStore } from './soundboardStore';
import styles from './SoundPlayer.module.css';

const audioElement = typeof Audio === 'undefined' ? null : new Audio();
let appliedPlaybackVersion = null;
let playAttempt = 0;
let activePlayAttempt = null;

function isCurrentMedia(mediaIdentity) {
  const state = useSoundPlayerStore.getState();
  return Boolean(mediaIdentity.current.source) &&
    mediaIdentity.current.version === state.playbackVersion &&
    mediaIdentity.current.source === state.current?.audioSource;
}

function formatTime(value) {
  if (!Number.isFinite(value)) return '0:00';
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function requestPlay(version, source) {
  const attempt = ++playAttempt;
  activePlayAttempt = attempt;
  audioElement?.play().catch(() => {
    const state = useSoundPlayerStore.getState();
    if (attempt === playAttempt && state.playbackVersion === version && state.current?.audioSource === source) {
      activePlayAttempt = null;
      state.setPlaying(false);
    }
  });
}

function invalidatePlayAttempt() {
  playAttempt += 1;
  activePlayAttempt = null;
}

export default function SoundPlayer() {
  const current = useSoundPlayerStore((state) => state.current);
  const playing = useSoundPlayerStore((state) => state.playing);
  const queue = useSoundPlayerStore((state) => state.queue);
  const playbackVersion = useSoundPlayerStore((state) => state.playbackVersion);
  const setPlaying = useSoundPlayerStore((state) => state.setPlaying);
  const advanceQueue = useSoundPlayerStore((state) => state.advanceQueue);
  const removeFromQueue = useSoundPlayerStore((state) => state.removeFromQueue);
  const clearQueue = useSoundPlayerStore((state) => state.clearQueue);
  const clear = useSoundPlayerStore((state) => state.clear);
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [queueVisible, setQueueVisible] = useState(false);
  const seeking = useRef(false);
  const mediaIdentity = useRef({ version: null, source: null });
  const seekSequence = useRef(0);
  const seekRequest = useRef(null);
  useEffect(() => {
    if (!audioElement) return undefined;
    const handlePlay = () => {
      if (activePlayAttempt === playAttempt && !audioElement.paused && isCurrentMedia(mediaIdentity)) setPlaying(true);
    };
    const handleEnded = () => {
      if (!isCurrentMedia(mediaIdentity) || audioElement.ended === false) return;
      if (Number.isFinite(audioElement.duration) && audioElement.currentTime < audioElement.duration - 0.05) return;
      advanceQueue();
    };
    const handleTimeUpdate = () => {
      if (isCurrentMedia(mediaIdentity) && !seeking.current) setCurrentTime(audioElement.currentTime);
    };
    const handleDurationChange = () => {
      if (isCurrentMedia(mediaIdentity)) setDuration(Number.isFinite(audioElement.duration) ? audioElement.duration : 0);
    };
    const handleSeeked = () => {
      const request = seekRequest.current;
      if (!request || request.id !== seekSequence.current || !isCurrentMedia(mediaIdentity)) return;
      if (!Number.isFinite(audioElement.currentTime) || Math.abs(audioElement.currentTime - request.position) > 0.05) return;
      setCurrentTime(audioElement.currentTime);
      seekRequest.current = null;
      seeking.current = false;
    };
    audioElement.addEventListener('play', handlePlay);
    audioElement.addEventListener('ended', handleEnded);
    audioElement.addEventListener('timeupdate', handleTimeUpdate);
    audioElement.addEventListener('loadedmetadata', handleDurationChange);
    audioElement.addEventListener('durationchange', handleDurationChange);
    audioElement.addEventListener('seeked', handleSeeked);
    return () => {
      audioElement.removeEventListener('play', handlePlay);
      audioElement.removeEventListener('ended', handleEnded);
      audioElement.removeEventListener('timeupdate', handleTimeUpdate);
      audioElement.removeEventListener('loadedmetadata', handleDurationChange);
      audioElement.removeEventListener('durationchange', handleDurationChange);
      audioElement.removeEventListener('seeked', handleSeeked);
    };
  }, [advanceQueue, setPlaying]);

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
      mediaIdentity.current = { version: playbackVersion, source: current.audioSource };
      audioElement.src = current.audioSource;
      audioElement.load();
      appliedPlaybackVersion = playbackVersion;
      seekSequence.current += 1;
      seekRequest.current = null;
      seeking.current = false;
      setCurrentTime(0);
      setDuration(0);
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
  const seek = (event) => {
    const nextTime = Number(event.currentTarget.value);
    if (!audioElement || !Number.isFinite(nextTime) || !Number.isFinite(audioElement.duration)) return;
    if (!isCurrentMedia(mediaIdentity)) return;
    const position = Math.max(0, Math.min(nextTime, audioElement.duration));
    const requestId = ++seekSequence.current;
    seeking.current = true;
    seekRequest.current = { id: requestId, version: playbackVersion, source: current.audioSource, position };
    audioElement.currentTime = position;
    setCurrentTime(position);
  };
  const cancelSeeking = () => {
    seekSequence.current += 1;
    seekRequest.current = null;
    seeking.current = false;
    if (audioElement) setCurrentTime(audioElement.currentTime);
  };

  if (!current) return null;

  return (
    <aside className={styles.player} aria-label="Sound player">
      <button className={styles.trackLink} type="button" onClick={() => navigate('/soundboards')} aria-label="Open soundboards">
        {current.imageSource ? <img className={styles.art} src={current.imageSource} alt="" /> : <div className={styles.artPlaceholder}>SFX</div>}
        <span className={styles.details}>
          <span className={styles.eyebrow}>NOW PLAYING</span>
          <strong>{current.name}</strong>
          <small>{current.boardName}</small>
        </span>
      </button>
      <div className={styles.controls}>
        <button className={styles.playToggle} type="button" onClick={togglePlaying} aria-label={playing ? 'Pause sound' : 'Play sound'}>{playing ? 'Pause' : 'Play'}</button>
        <input className={styles.seek} type="range" min="0" max={duration || 1} step="any" value={duration ? Math.min(currentTime, duration) : 0} onPointerDown={() => { seeking.current = true; }} onPointerCancel={cancelSeeking} onInput={seek} aria-label="Seek sound" disabled={!duration} />
        <span className={styles.time}>{formatTime(currentTime)} / {formatTime(duration)}</span>
      </div>
      <button className={styles.queueToggle} type="button" onClick={() => setQueueVisible((visible) => !visible)} aria-expanded={queueVisible && queue.length > 0} disabled={queue.length === 0}>Queue ({queue.length})</button>
      <button className={styles.close} type="button" onClick={clear} aria-label="Close sound player" title="Close sound player">×</button>
      {queueVisible && queue.length > 0 && <section className={styles.queue} aria-label="Sound queue"><div className={styles.queueHeading}><strong>Queue</strong><button type="button" onClick={clearQueue}>Clear queue</button></div><ol>{queue.map((sound) => <li key={sound.queueId}><span>{sound.name}</span><button type="button" onClick={() => removeFromQueue(sound.queueId)} aria-label={`Remove ${sound.name} from queue`}>Remove</button></li>)}</ol></section>}
    </aside>
  );
}
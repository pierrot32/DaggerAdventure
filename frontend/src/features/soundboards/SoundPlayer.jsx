import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSoundPlayerStore } from './soundboardStore';
import styles from './SoundPlayer.module.css';

const audioElement = typeof Audio === 'undefined' ? null : new Audio();
let appliedPlaybackVersion = null;
let playAttempt = 0;

function formatTime(value) {
  if (!Number.isFinite(value)) return '0:00';
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function requestPlay(version, source) {
  const attempt = ++playAttempt;
  audioElement?.play().catch(() => {
    const state = useSoundPlayerStore.getState();
    if (attempt === playAttempt && state.playbackVersion === version && state.current?.audioSource === source) state.setPlaying(false);
  });
}

function invalidatePlayAttempt() {
  playAttempt += 1;
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
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  useEffect(() => {
    if (!audioElement) return undefined;
    const handlePlay = () => setPlaying(true);
    const handleEnded = () => advanceQueue();
    const handleTimeUpdate = () => setCurrentTime(audioElement.currentTime);
    const handleDurationChange = () => setDuration(audioElement.duration);
    audioElement.addEventListener('play', handlePlay);
    audioElement.addEventListener('ended', handleEnded);
    audioElement.addEventListener('timeupdate', handleTimeUpdate);
    audioElement.addEventListener('loadedmetadata', handleDurationChange);
    audioElement.addEventListener('durationchange', handleDurationChange);
    return () => {
      audioElement.removeEventListener('play', handlePlay);
      audioElement.removeEventListener('ended', handleEnded);
      audioElement.removeEventListener('timeupdate', handleTimeUpdate);
      audioElement.removeEventListener('loadedmetadata', handleDurationChange);
      audioElement.removeEventListener('durationchange', handleDurationChange);
    };
  }, [advanceQueue, setPlaying]);

  useEffect(() => {
    if (!audioElement || !current) {
      if (audioElement) {
        audioElement.pause();
      }
      return;
    }
    if (appliedPlaybackVersion !== playbackVersion) {
      audioElement.pause();
      audioElement.src = current.audioSource;
      audioElement.load();
      appliedPlaybackVersion = playbackVersion;
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
    const nextTime = Number(event.target.value);
    if (audioElement) audioElement.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  if (!current) return null;

  return (
    <aside className={styles.player} aria-label="Sound player">
      <Link className={styles.trackLink} to="/soundboards" aria-label="Open soundboards">
        {current.imageSource ? <img className={styles.art} src={current.imageSource} alt="" /> : <div className={styles.artPlaceholder}>SFX</div>}
        <span className={styles.details}>
          <span className={styles.eyebrow}>NOW PLAYING</span>
          <strong>{current.name}</strong>
          <small>{current.boardName}</small>
        </span>
      </Link>
      <div className={styles.controls}>
        <button className={styles.playToggle} type="button" onClick={togglePlaying} aria-label={playing ? 'Pause sound' : 'Play sound'}>{playing ? 'Pause' : 'Play'}</button>
        <input className={styles.seek} type="range" min="0" max={duration || 0} step="0.1" value={Math.min(currentTime, duration || 0)} onChange={seek} aria-label="Seek sound" disabled={!duration} />
        <span className={styles.time}>{formatTime(currentTime)} / {formatTime(duration)}</span>
      </div>
      <button className={styles.close} type="button" onClick={clear} aria-label="Close sound player" title="Close sound player">×</button>
      {queue.length > 0 && <section className={styles.queue} aria-label="Sound queue"><div className={styles.queueHeading}><strong>Queue</strong><button type="button" onClick={clearQueue}>Clear queue</button></div><ol>{queue.map((sound) => <li key={sound.queueId}><span>{sound.name}</span><button type="button" onClick={() => removeFromQueue(sound.queueId)} aria-label={`Remove ${sound.name} from queue`}>Remove</button></li>)}</ol></section>}
    </aside>
  );
}
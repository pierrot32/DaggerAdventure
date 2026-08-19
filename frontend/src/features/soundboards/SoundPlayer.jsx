import { useEffect, useRef } from 'react';
import { useSoundPlayerStore } from './soundboardStore';
import styles from './SoundPlayer.module.css';

export default function SoundPlayer() {
  const audioRef = useRef(null);
  const current = useSoundPlayerStore((state) => state.current);
  const playing = useSoundPlayerStore((state) => state.playing);
  const setPlaying = useSoundPlayerStore((state) => state.setPlaying);
  const clear = useSoundPlayerStore((state) => state.clear);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current) return undefined;
    audio.src = current.audioSource;
    audio.load();
    if (playing) audio.play().catch(() => setPlaying(false));
    return () => audio.pause();
  }, [current, playing, setPlaying]);

  if (!current) return null;

  return (
    <aside className={styles.player} aria-label="Sound player">
      {current.imageSource ? <img className={styles.art} src={current.imageSource} alt="" /> : <div className={styles.artPlaceholder}>SFX</div>}
      <div className={styles.details}>
        <span className={styles.eyebrow}>NOW PLAYING</span>
        <strong>{current.name}</strong>
        <small>{current.boardName}</small>
      </div>
      <audio
        ref={audioRef}
        className={styles.audio}
        controls
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        aria-label={current.name}
      />
      <button className={styles.close} type="button" onClick={clear} aria-label="Close sound player" title="Close sound player">×</button>
    </aside>
  );
}
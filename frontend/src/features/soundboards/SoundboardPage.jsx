import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { canManageUsers } from '../../utils/permissions';
import Button from '../../components/Button/Button';
import {
  createSoundBoard,
  deleteSound,
  deleteSoundBoard,
  getSoundBoard,
  listSoundBoards,
  soundMediaUrl,
  uploadSound,
} from './soundboardApi';
import { useSoundPlayerStore } from './soundboardStore';
import styles from './SoundboardPage.module.css';

const LABEL_PRESETS = ['ambiance', 'music', 'minimal music'];

export default function SoundboardPage() {
  const { user } = useAuth();
  const play = useSoundPlayerStore((state) => state.play);
  const [boards, setBoards] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState(null);
  const [state, setState] = useState({ loading: true, detailLoading: false, error: '', message: '' });
  const [boardForm, setBoardForm] = useState({ name: '', description: '', shared: false });
  const [soundForm, setSoundForm] = useState({ name: '', labels: '', audioUrl: '', imageUrl: '', creatorName: '', sourceName: '', sourceUrl: '', audioMode: 'upload' });
  const [audioFile, setAudioFile] = useState(null);
  const [imageFile, setImageFile] = useState(null);

  const loadBoards = async (preferredId = selectedId) => {
    const response = await listSoundBoards();
    setBoards(response);
    const nextId = response.some((board) => board.id === preferredId) ? preferredId : response[0]?.id || '';
    setSelectedId(nextId);
    return nextId;
  };

  useEffect(() => {
    loadBoards()
      .then(() => setState((current) => ({ ...current, loading: false, error: '' })))
      .catch((error) => setState((current) => ({ ...current, loading: false, error: error.message })));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return undefined;
    }
    let active = true;
    setState((current) => ({ ...current, detailLoading: true, error: '' }));
    getSoundBoard(selectedId)
      .then((response) => { if (active) { setDetail(response); setState((current) => ({ ...current, detailLoading: false })); } })
      .catch((error) => { if (active) setState((current) => ({ ...current, detailLoading: false, error: error.message })); });
    return () => { active = false; };
  }, [selectedId]);

  const board = detail?.board;
  const canEditBoard = board?.owner_id === user?.id;
  const credits = useMemo(() => {
    const seen = new Set();
    return (detail?.sounds || []).filter((sound) => sound.creator_name || sound.source_name || sound.source_url).filter((sound) => {
      const key = [sound.creator_name, sound.source_name, sound.source_url].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [detail]);

  const submitBoard = async (event) => {
    event.preventDefault();
    setState((current) => ({ ...current, message: '', error: '' }));
    try {
      const created = await createSoundBoard(boardForm);
      setBoards((current) => [created, ...current]);
      setSelectedId(created.id);
      setBoardForm({ name: '', description: '', shared: false });
      setState((current) => ({ ...current, message: `${created.name} created.` }));
    } catch (error) {
      setState((current) => ({ ...current, error: error.message }));
    }
  };

  const submitSound = async (event) => {
    event.preventDefault();
    if (!board) return;
    const formData = new FormData();
    formData.append('name', soundForm.name);
    formData.append('labels', soundForm.labels);
    formData.append('image_url', soundForm.imageUrl);
    formData.append('creator_name', soundForm.creatorName);
    formData.append('source_name', soundForm.sourceName);
    formData.append('source_url', soundForm.sourceUrl);
    if (soundForm.audioMode === 'upload' && audioFile) formData.append('audio', audioFile);
    if (soundForm.audioMode === 'url') formData.append('audio_url', soundForm.audioUrl);
    if (imageFile) formData.append('image', imageFile);
    setState((current) => ({ ...current, message: '', error: '' }));
    try {
      await uploadSound(board.id, formData);
      const refreshed = await getSoundBoard(board.id);
      setDetail(refreshed);
      setBoards((current) => current.map((item) => item.id === refreshed.board.id ? refreshed.board : item));
      setSoundForm({ name: '', labels: '', audioUrl: '', imageUrl: '', creatorName: '', sourceName: '', sourceUrl: '', audioMode: 'upload' });
      setAudioFile(null);
      setImageFile(null);
      event.target.reset();
      setState((current) => ({ ...current, message: 'Sound added to the board.' }));
    } catch (error) {
      setState((current) => ({ ...current, error: error.message }));
    }
  };

  const removeSound = async (soundId) => {
    if (!board || !window.confirm('Remove this sound from the board?')) return;
    try {
      await deleteSound(board.id, soundId);
      const refreshed = await getSoundBoard(board.id);
      setDetail(refreshed);
      setBoards((current) => current.map((item) => item.id === refreshed.board.id ? refreshed.board : item));
    } catch (error) {
      setState((current) => ({ ...current, error: error.message }));
    }
  };

  const removeBoard = async () => {
    if (!board || !window.confirm(`Delete ${board.name} and all its sounds?`)) return;
    try {
      await deleteSoundBoard(board.id);
      await loadBoards('');
      setDetail(null);
      setState((current) => ({ ...current, message: 'Soundboard deleted.', error: '' }));
    } catch (error) {
      setState((current) => ({ ...current, error: error.message }));
    }
  };

  const addPreset = (preset) => {
    const labels = soundForm.labels.split(',').map((label) => label.trim()).filter(Boolean);
    if (!labels.includes(preset)) setSoundForm((current) => ({ ...current, labels: [...labels, preset].join(', ') }));
  };

  return (
    <section className={styles.page}>
      <header className={styles.heading}>
        <div><p className="eyebrow">GM SOUND LIBRARY</p><h2>Soundboards</h2><p className="muted">Keep ambience, music, and table-ready moments close while you run the game.</p></div>
      </header>
      {state.error && <p className={styles.error} role="alert">{state.error}</p>}
      {state.message && <p className={styles.message} role="status">{state.message}</p>}
      <div className={styles.workspace}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeading}><h3>Boards</h3><span>{boards.length}</span></div>
          <div className={styles.boardList}>
            {boards.map((item) => <button className={`${styles.boardButton} ${item.id === selectedId ? styles.selected : ''}`} type="button" key={item.id} onClick={() => setSelectedId(item.id)}><strong>{item.name}</strong><span>{item.shared ? 'Shared GM board' : 'Private board'} · {item.sound_count} sounds</span></button>)}
            {!state.loading && boards.length === 0 && <p className="muted">No boards yet.</p>}
          </div>
          <form className={styles.boardForm} onSubmit={submitBoard}>
            <p className={styles.formEyebrow}>NEW BOARD</p>
            <label>Name<input value={boardForm.name} onChange={(event) => setBoardForm({ ...boardForm, name: event.target.value })} required maxLength={120} /></label>
            <label>Description<textarea value={boardForm.description} onChange={(event) => setBoardForm({ ...boardForm, description: event.target.value })} rows="3" maxLength={800} /></label>
            {canManageUsers(user) && <label className={styles.checkbox}><input type="checkbox" checked={boardForm.shared} onChange={(event) => setBoardForm({ ...boardForm, shared: event.target.checked })} /> Share with every GM</label>}
            <Button type="submit">Create board</Button>
          </form>
        </aside>
        <main className={styles.main}>
          {state.loading || state.detailLoading ? <p className="muted">Loading soundboard...</p> : !board ? <div className={styles.empty}><p className="eyebrow">READY ROOM</p><h3>Create a board for the table</h3><p className="muted">Admins can publish shared boards. Every GM can keep private boards for their own sessions.</p></div> : <>
            <div className={styles.boardHeading}><div><p className="eyebrow">{board.shared ? 'SHARED GM BOARD' : 'PRIVATE GM BOARD'}</p><h3>{board.name}</h3><p className="muted">{board.description || 'No description yet.'}</p></div>{canEditBoard && <button className={styles.deleteBoard} type="button" onClick={removeBoard}>Delete board</button>}</div>
            {canEditBoard && <form className={styles.soundForm} onSubmit={submitSound}>
              <div className={styles.formHeading}><div><p className="formEyebrow">ADD A SOUND</p><h3>Give the table a little atmosphere</h3></div><span className={styles.limit}>Audio up to 50 MB · artwork up to 5 MB</span></div>
              <div className={styles.formGrid}>
                <label>Sound name<input value={soundForm.name} onChange={(event) => setSoundForm({ ...soundForm, name: event.target.value })} required maxLength={160} placeholder="Rain on the shutters" /></label>
                <label>Labels<input value={soundForm.labels} onChange={(event) => setSoundForm({ ...soundForm, labels: event.target.value })} placeholder="ambiance, music" /><span className={styles.hint}>Separate labels with commas.</span><span className={styles.presets}>{LABEL_PRESETS.map((preset) => <button type="button" key={preset} onClick={() => addPreset(preset)}>{preset}</button>)}</span></label>
                <fieldset><legend>Audio source</legend><div className={styles.modeSwitch}><button type="button" className={soundForm.audioMode === 'upload' ? styles.activeMode : ''} onClick={() => setSoundForm({ ...soundForm, audioMode: 'upload' })}>Upload file</button><button type="button" className={soundForm.audioMode === 'url' ? styles.activeMode : ''} onClick={() => setSoundForm({ ...soundForm, audioMode: 'url' })}>External URL</button></div>{soundForm.audioMode === 'upload' ? <input type="file" accept="audio/*" onChange={(event) => setAudioFile(event.target.files?.[0] || null)} /> : <input value={soundForm.audioUrl} onChange={(event) => setSoundForm({ ...soundForm, audioUrl: event.target.value })} placeholder="https://..." type="url" />}</fieldset>
                <fieldset><legend>Artwork or logo</legend><input type="file" accept="image/*" onChange={(event) => setImageFile(event.target.files?.[0] || null)} /><input value={soundForm.imageUrl} onChange={(event) => setSoundForm({ ...soundForm, imageUrl: event.target.value })} placeholder="Optional artwork URL" type="url" /></fieldset>
                <label>Created by<input value={soundForm.creatorName} onChange={(event) => setSoundForm({ ...soundForm, creatorName: event.target.value })} placeholder="Creator or studio name" maxLength={160} /></label>
                <label>Source name<input value={soundForm.sourceName} onChange={(event) => setSoundForm({ ...soundForm, sourceName: event.target.value })} placeholder="Tabletop Audio" maxLength={160} /></label>
                <label className={styles.wide}>Source URL<input value={soundForm.sourceUrl} onChange={(event) => setSoundForm({ ...soundForm, sourceUrl: event.target.value })} placeholder="https://tabletopaudio.com/..." type="url" /></label>
              </div>
              <Button type="submit">Add sound</Button>
            </form>}
            <section className={styles.soundSection}><div className={styles.sectionHeading}><h3>Sounds</h3><span>{detail.sounds.length}</span></div>{detail.sounds.length === 0 ? <p className="muted">This board is quiet for now.</p> : <div className={styles.soundGrid}>{detail.sounds.map((sound) => <SoundCard key={sound.id} sound={sound} board={board} canEdit={canEditBoard} onPlay={play} onDelete={removeSound} />)}</div>}</section>
            {credits.length > 0 && <section className={styles.credits}><p className="eyebrow">CREDITS</p><h3>Sound sources and creators</h3>{credits.map((sound) => <p key={sound.id}>{sound.creator_name && <strong>{sound.creator_name}</strong>}{sound.creator_name && (sound.source_name || sound.source_url) ? ' · ' : ''}{sound.source_url ? <a href={sound.source_url} target="_blank" rel="noreferrer">{sound.source_name || sound.source_url}</a> : sound.source_name}</p>)}</section>}
          </>}
        </main>
      </div>
    </section>
  );
}

function SoundCard({ sound, board, canEdit, onPlay, onDelete }) {
  const audioSource = sound.audio_url || (sound.has_audio_upload ? soundMediaUrl(board.id, sound.id, 'audio') : '');
  const imageSource = sound.image_url || (sound.has_image_upload ? soundMediaUrl(board.id, sound.id, 'image') : '');
  return <article className={styles.soundCard}>
    {imageSource ? <img className={styles.soundImage} src={imageSource} alt="" /> : <div className={styles.soundImagePlaceholder}>SOUND</div>}
    <div className={styles.soundBody}><div className={styles.soundTitle}><h4>{sound.name}</h4>{canEdit && <button className={styles.removeSound} type="button" onClick={() => onDelete(sound.id)} aria-label={`Remove ${sound.name}`} title="Remove sound">×</button>}</div><div className={styles.labels}>{sound.labels.map((label) => <span key={label.id}>{label.name}</span>)}</div><button className={styles.playButton} type="button" onClick={() => onPlay({ ...sound, audioSource, imageSource, boardName: board.name })} disabled={!audioSource}>Play sound</button>{(sound.source_name || sound.creator_name) && <small className={styles.cardCredit}>{sound.creator_name || 'Unknown creator'}{sound.source_name ? ` · ${sound.source_name}` : ''}</small>}</div>
  </article>;
}
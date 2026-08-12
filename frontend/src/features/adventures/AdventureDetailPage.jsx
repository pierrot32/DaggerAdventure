import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import Button from '../../components/Button/Button';
import { useAdventureStore } from './adventureStore';
import { listAdventureCharacters } from './adventureApi';
import { createLibraryFrame, getAdventureFrame, updateAdventureFrame } from '../frames/frameApi';
import styles from './AdventureDetailPage.module.css';

// Detail page displays a private adventure and lets its creator manage invites
export default function AdventureDetailPage() {
  const { adventureId } = useParams();
  const { user } = useAuth();
  const { current, invites, loading, error, fetchAdventure, fetchInvites, invite, setFear } = useAdventureStore();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [characters, setCharacters] = useState([]);
  const [frame, setFrame] = useState(null);
  const [frameState, setFrameState] = useState({ loading: true, saving: false, error: '', message: '' });

  useEffect(() => { fetchAdventure(adventureId); }, [adventureId, fetchAdventure]);
  useEffect(() => {
    if (current?.id === adventureId && current.creator_id === user?.id) fetchInvites(adventureId);
  }, [adventureId, current, user, fetchInvites]);
  useEffect(() => {
    if (current?.id === adventureId && current.creator_id === user?.id) {
      listAdventureCharacters(adventureId).then(setCharacters).catch(() => setCharacters([]));
    }
  }, [adventureId, current, user]);
  useEffect(() => {
    if (!current || current.id !== adventureId) return;
    getAdventureFrame(adventureId)
      .then((value) => { setFrame(value); setFrameState({ loading: false, saving: false, error: '', message: '' }); })
      .catch((frameError) => setFrameState({ loading: false, saving: false, error: frameError.message, message: '' }));
  }, [adventureId, current]);

  const submitInvite = async (event) => {
    event.preventDefault();
    try {
      await invite(adventureId, email);
      setEmail('');
      setMessage('Invitation created.');
    } catch {
      setMessage('The invitation could not be created.');
    }
  };

  if (loading && !current) return <p className="muted">Loading adventure...</p>;
  if (!current) return <p className={styles.error}>{error || 'Adventure not found.'}</p>;
  const isCreator = current.creator_id === user?.id;
  const canCreateCharacter = Boolean(frame) && !isCreator;

  const updateSelection = (key, value) => setFrame((currentFrame) => ({
    ...currentFrame,
    selections: { ...currentFrame.selections, [key]: value },
  }));
  const updateEntrySelection = (kind, id, value) => setFrame((currentFrame) => ({
    ...currentFrame,
    selections: {
      ...currentFrame.selections,
      [kind]: { ...(currentFrame.selections?.[kind] || {}), [id]: value },
    },
  }));
  const saveFrame = async () => {
    setFrameState((state) => ({ ...state, saving: true, error: '', message: '' }));
    try {
      const saved = await updateAdventureFrame(adventureId, { content: frame.content, selections: frame.selections });
      setFrame(saved);
      setFrameState({ loading: false, saving: false, error: '', message: 'Frame selections saved.' });
    } catch (saveError) {
      setFrameState((state) => ({ ...state, saving: false, error: saveError.message }));
    }
  };
  const saveFrameToLibrary = async () => {
    try {
      await createLibraryFrame({ name: frame.content.name, description: frame.content.description || '', complexity_rating: frame.content.complexity_rating || 3, content: frame.content });
      setFrameState((state) => ({ ...state, error: '', message: 'Saved to your frame library.' }));
    } catch (saveError) {
      setFrameState((state) => ({ ...state, error: saveError.message }));
    }
  };

  return (
    <section>
      <p className="eyebrow">PRIVATE ADVENTURE</p>
      <h2>{current.name}</h2>
      <p className={styles.description}>{current.description || 'No description yet.'}</p>
      {error && <p className={styles.error}>{error}</p>}
      {frame && <section className={styles.frameSection}>
        <div className={styles.frameHeading}><div><p className="eyebrow">ACTIVE CAMPAIGN FRAME</p><h3>{frame.content.name}</h3></div><span>Complexity {frame.content.complexity_rating}/5</span></div>
        <FrameViewer content={filterFrame(frame.content, frame.selections)} />
        {canCreateCharacter && <Link className={styles.characterLink} to={`/characters/create?adventure=${adventureId}`}>Create a character for this adventure</Link>}
        {isCreator && <FrameManager frame={frame} updateSelection={updateSelection} updateEntrySelection={updateEntrySelection} onSave={saveFrame} onSaveLibrary={saveFrameToLibrary} saving={frameState.saving} />}
        {frameState.message && <p className="muted">{frameState.message}</p>}
        {frameState.error && <p className={styles.error}>{frameState.error}</p>}
      </section>}
      {!frameState.loading && !frame && !isCreator && <p className="muted">The GM has not attached a campaign frame yet.</p>}
      {isCreator && (
        <div className={styles.manage}>
          <h3>Fear pool</h3>
          <div className={styles.fear}>
            {Array.from({ length: 12 }, (_, index) => (
              <button
                type="button"
                key={index}
                className={index < (current.fear || 0) ? styles.fearFilled : styles.fearSlot}
                aria-label={`Set Fear to ${index + 1}`}
                onClick={() => setFear(adventureId, index + 1 === current.fear ? index : index + 1)}
              />
            ))}
            <span className={styles.fearValue}>{current.fear || 0} / 12</span>
          </div>

          <h3>Invite a player</h3>
          <form onSubmit={submitInvite} className={styles.inviteForm}>
            <input required type="email" placeholder="player@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
            <Button type="submit" disabled={loading}>Invite</Button>
          </form>
          {message && <p className="muted">{message}</p>}
          <h3>Invitations</h3>
          <ul className={styles.invites}>{invites.map((inviteItem) => <li key={inviteItem.id}><span>{inviteItem.recipient_email}</span><span>{inviteItem.status}</span></li>)}</ul>
          <h3>Player characters</h3>
          <div className={styles.characters}>{characters.map((character) => <Link to={`/characters/${character.id}`} key={character.id}><strong>{character.name}</strong><span>Level {character.level} · {character.class_id} · player {character.user_id.slice(0, 8)}</span></Link>)}</div>
        </div>
      )}
    </section>
  );
}

const frameSectionKeys = ['pitch', 'tone_and_feel', 'themes', 'touchstones', 'overview', 'modifications', 'player_principles', 'gm_principles', 'distinctions', 'inciting_incident', 'campaign_mechanics', 'session_zero_questions'];
const frameSectionLabels = { pitch: 'Pitch', tone_and_feel: 'Tone & feel', themes: 'Themes', touchstones: 'Touchstones', overview: 'Overview', modifications: 'Character guidance', player_principles: 'Player principles', gm_principles: 'GM principles', distinctions: 'Distinctions', inciting_incident: 'The inciting incident', campaign_mechanics: 'Campaign mechanics', session_zero_questions: 'Session-zero questions' };

function FrameViewer({ content }) {
  return <div className={styles.frameViewer}>
    {content.pitch && <TextBlock title="Pitch" text={content.pitch} />}
    {content.tone_and_feel?.length > 0 && <TagBlock title="Tone & feel" values={content.tone_and_feel} />}
    {content.themes?.length > 0 && <TagBlock title="Themes" values={content.themes} />}
    {content.touchstones?.length > 0 && <TagBlock title="Touchstones" values={content.touchstones} />}
    {content.overview && <TextBlock title="Overview" text={content.overview} />}
    {content.modifications && Object.entries(content.modifications).map(([kind, entries]) => <EntryBlock title={kind} entries={entries} key={kind} />)}
    {['player_principles', 'gm_principles', 'distinctions', 'campaign_mechanics'].map((key) => <EntryBlock title={key.replaceAll('_', ' ')} entries={content[key]} key={key} />)}
    {content.inciting_incident && <TextBlock title="The inciting incident" text={content.inciting_incident} />}
    {content.session_zero_questions?.length > 0 && <ul className={styles.questions}>{content.session_zero_questions.map((question) => <li key={question}>{question}</li>)}</ul>}
  </div>;
}

function FrameManager({ frame, updateSelection, updateEntrySelection, onSave, onSaveLibrary, saving }) {
  return <div className={styles.frameManager}><div className={styles.managerHeader}><div><strong>GM frame controls</strong><p className="muted">Choose what players see during character creation and play.</p></div><div className={styles.managerActions}><Button type="button" variant="text" onClick={onSaveLibrary}>Save as library frame</Button><Button type="button" onClick={onSave} disabled={saving}>{saving ? 'Saving...' : 'Save selections'}</Button></div></div><div className={styles.selectionGrid}>{frameSectionKeys.map((key) => <label key={key} className={styles.selection}><input type="checkbox" checked={frame.selections?.[key] !== false} onChange={(event) => updateSelection(key, event.target.checked)} /><span>{frameSectionLabels[key]}</span></label>)}</div><div className={styles.entrySelections}>{Object.entries(frame.content.modifications || {}).map(([kind, entries]) => <div key={kind}><strong>{kind}</strong>{entries.map((entry) => <label className={styles.selection} key={entry.id}><input type="checkbox" checked={frame.selections?.[kind]?.[entry.id] !== false} onChange={(event) => updateEntrySelection(kind, entry.id, event.target.checked)} /><span>{entry.title}</span></label>)}</div>)}</div></div>;
}

function TextBlock({ title, text }) { return <div className={styles.textBlock}><h4>{title}</h4><p>{text}</p></div>; }
function TagBlock({ title, values }) { return <div className={styles.textBlock}><h4>{title}</h4><div className={styles.tags}>{values.map((value) => <span key={value}>{value}</span>)}</div></div>; }
function EntryBlock({ title, entries = [] }) { return entries?.length > 0 ? <div className={styles.textBlock}><h4>{title}</h4>{entries.map((entry) => <article className={styles.entry} key={entry.id}><strong>{entry.title}</strong><p>{entry.description}</p>{entry.questions?.map((question) => <small key={question}>{question}</small>)}</article>)}</div> : null; }

function filterFrame(content, selections) {
  const filtered = Object.fromEntries(Object.entries(content).filter(([key]) => key === 'id' || key === 'name' || key === 'description' || key === 'complexity_rating' || (key === 'modifications' ? selections?.modifications !== false : selections?.[key] !== false)));
  if (content.modifications) {
    filtered.modifications = Object.fromEntries(Object.entries(content.modifications).map(([kind, entries]) => [kind, entries.filter((entry) => selections?.[kind]?.[entry.id] !== false)]));
  }
  return filtered;
}

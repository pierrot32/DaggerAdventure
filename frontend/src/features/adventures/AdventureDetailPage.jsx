import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import Button from '../../components/Button/Button';
import { useAdventureStore } from './adventureStore';
import { listAdventureCharacters } from './adventureApi';
import { createLibraryFrame, getAdventureFrame, updateAdventureFrame } from '../frames/frameApi';
import styles from './AdventureDetailPage.module.css';

// Detail page displays a private adventure and lets its creator manage invites
export default function AdventureDetailPage() {
  const { adventureId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { current, invites, loading, error, clearInvites, fetchAdventure, fetchInvites, invite, setFear, deleteAdventure } = useAdventureStore();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [characters, setCharacters] = useState([]);
  const [frame, setFrame] = useState(null);
  const [frameState, setFrameState] = useState({ loading: true, saving: false, error: '', message: '' });
  const [deleteState, setDeleteState] = useState({ saving: false, error: '' });
  const routeRequestRef = useRef(0);

  useEffect(() => {
    const requestGeneration = ++routeRequestRef.current;
    return () => {
      if (routeRequestRef.current === requestGeneration) routeRequestRef.current += 1;
    };
  }, [adventureId]);

  useEffect(() => {
    clearInvites();
    setEmail('');
    setMessage('');
    setCharacters([]);
    setFrame(null);
    setFrameState({ loading: true, saving: false, error: '', message: '' });
    setDeleteState({ saving: false, error: '' });
  }, [adventureId, clearInvites]);

  const isCurrentRoute = (requestGeneration) => routeRequestRef.current === requestGeneration;

  useEffect(() => { fetchAdventure(adventureId); }, [adventureId, fetchAdventure]);
  useEffect(() => {
    let active = true;
    const requestGeneration = routeRequestRef.current;
    if (current?.id === adventureId && current.creator_id === user?.id) {
      clearInvites();
      fetchInvites(adventureId, () => active && isCurrentRoute(requestGeneration));
    }
    return () => { active = false; };
  }, [adventureId, current, user, clearInvites, fetchInvites]);
  useEffect(() => {
    let active = true;
    const requestGeneration = routeRequestRef.current;
    setCharacters([]);
    if (current?.id === adventureId && current.creator_id === user?.id) {
      listAdventureCharacters(adventureId)
        .then((value) => {
          if (active && isCurrentRoute(requestGeneration)) setCharacters(value);
        })
        .catch(() => {
          if (active && isCurrentRoute(requestGeneration)) setCharacters([]);
        });
    }
    return () => { active = false; };
  }, [adventureId, current, user]);
  useEffect(() => {
    let active = true;
    const requestGeneration = routeRequestRef.current;
    setFrame(null);
    setFrameState({ loading: true, saving: false, error: '', message: '' });
    if (!current || current.id !== adventureId) return () => { active = false; };
    getAdventureFrame(adventureId)
      .then((value) => {
        if (!active || !isCurrentRoute(requestGeneration)) return;
        setFrame(value);
        setFrameState({ loading: false, saving: false, error: '', message: '' });
      })
      .catch((frameError) => {
        if (active && isCurrentRoute(requestGeneration)) setFrameState({ loading: false, saving: false, error: frameError.message, message: '' });
      });
    return () => { active = false; };
  }, [adventureId, current]);

  const submitInvite = async (event) => {
    event.preventDefault();
    const requestGeneration = routeRequestRef.current;
    const isActive = () => isCurrentRoute(requestGeneration);
    try {
      await invite(adventureId, email, isActive);
      if (!isActive()) return;
      setEmail('');
      setMessage('Invitation created.');
    } catch {
      if (isActive()) setMessage('The invitation could not be created.');
    }
  };

  if (loading || (current && current.id !== adventureId)) return <p className="muted">Loading adventure...</p>;
  if (!current) return <p className={styles.error}>{error || 'Adventure not found.'}</p>;
  const isCreator = current.creator_id === user?.id;
  const canCreateCharacter = Boolean(frame) && !isCreator;

  const updateSelection = (key, value) => setFrame((currentFrame) => ({
    ...currentFrame,
    selections: { ...currentFrame.selections, [key]: value },
  }));
  const updateEntrySelection = (kind, mapKey, entryId, value) => setFrame((currentFrame) => ({
    ...currentFrame,
    selections: {
      ...currentFrame.selections,
      [kind]: {
        ...(currentFrame.selections?.[kind] || {}),
        [mapKey]: value,
        ...(entryId && entryId !== mapKey ? { [entryId]: value } : {}),
      },
    },
  }));
  const saveFrame = async () => {
    const requestGeneration = routeRequestRef.current;
    const frameToSave = frame;
    setFrameState((state) => ({ ...state, saving: true, error: '', message: '' }));
    try {
      const saved = await updateAdventureFrame(adventureId, { content: frameToSave.content, selections: frameToSave.selections });
      if (!isCurrentRoute(requestGeneration)) return;
      setFrame(saved);
      setFrameState({ loading: false, saving: false, error: '', message: 'Frame selections saved.' });
    } catch (saveError) {
      if (isCurrentRoute(requestGeneration)) setFrameState((state) => ({ ...state, saving: false, error: saveError.message }));
    }
  };
  const saveFrameToLibrary = async () => {
    const requestGeneration = routeRequestRef.current;
    const frameToSave = frame;
    try {
      await createLibraryFrame({ name: frameToSave.content.name, description: frameToSave.content.description || '', complexity_rating: frameToSave.content.complexity_rating || 3, content: frameToSave.content });
      if (isCurrentRoute(requestGeneration)) setFrameState((state) => ({ ...state, error: '', message: 'Saved to your frame library.' }));
    } catch (saveError) {
      if (isCurrentRoute(requestGeneration)) setFrameState((state) => ({ ...state, error: saveError.message }));
    }
  };

  const removeAdventure = async () => {
    if (!window.confirm(`Delete ${current.name}? This removes its members, invitations, and frame. Player characters are unlinked from the adventure but preserved.`)) return;
    const requestGeneration = routeRequestRef.current;
    const isActive = () => isCurrentRoute(requestGeneration);
    setDeleteState({ saving: true, error: '' });
    try {
      await deleteAdventure(adventureId, isActive);
      if (!isActive()) return;
      navigate('/adventures');
    } catch (deleteError) {
      if (isActive()) setDeleteState({ saving: false, error: deleteError.message });
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
        <FrameViewer content={filterFrame(frame.content, frame.selections, isCreator)} showGmNotes={isCreator} />
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
                onClick={() => {
                  const requestGeneration = routeRequestRef.current;
                  setFear(adventureId, index + 1 === current.fear ? index : index + 1, () => isCurrentRoute(requestGeneration));
                }}
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
          <div className={styles.dangerZone}>
            <h3>Delete adventure</h3>
            <p className="muted">This permanently removes the table, invitations, and frame. Player characters are unlinked but preserved.</p>
            <Button type="button" variant="text" onClick={removeAdventure} disabled={deleteState.saving}>{deleteState.saving ? 'Deleting...' : 'Delete adventure'}</Button>
            {deleteState.error && <p className={styles.error} role="alert">{deleteState.error}</p>}
          </div>
        </div>
      )}
    </section>
  );
}

const frameSectionKeys = ['pitch', 'tone_and_feel', 'themes', 'touchstones', 'overview', 'modifications', 'player_principles', 'gm_principles', 'distinctions', 'inciting_incident', 'campaign_mechanics', 'session_zero_questions'];
const frameSectionLabels = { pitch: 'Pitch', tone_and_feel: 'Tone & feel', themes: 'Themes', touchstones: 'Touchstones', overview: 'Overview', modifications: 'Character guidance', player_principles: 'Player principles', gm_principles: 'GM principles', distinctions: 'Distinctions', inciting_incident: 'The inciting incident', campaign_mechanics: 'Campaign mechanics', session_zero_questions: 'Session-zero questions' };
const modificationLabels = { communities: 'Communities', ancestries: 'Ancestries', classes: 'Classes' };

function FrameViewer({ content, showGmNotes = false }) {
  return <div className={styles.frameViewer}>
    {content.pitch && <TextBlock title={frameSectionLabels.pitch} text={content.pitch} gmMessage={content.gm_messages?.pitch} showGmNotes={showGmNotes} />}
    {content.tone_and_feel?.length > 0 && <TagBlock title={frameSectionLabels.tone_and_feel} values={content.tone_and_feel} gmMessage={content.gm_messages?.tone_and_feel} showGmNotes={showGmNotes} />}
    {content.themes?.length > 0 && <TagBlock title={frameSectionLabels.themes} values={content.themes} gmMessage={content.gm_messages?.themes} showGmNotes={showGmNotes} />}
    {content.touchstones?.length > 0 && <TagBlock title={frameSectionLabels.touchstones} values={content.touchstones} gmMessage={content.gm_messages?.touchstones} showGmNotes={showGmNotes} />}
    {content.overview && <TextBlock title={frameSectionLabels.overview} text={content.overview} gmMessage={content.gm_messages?.overview} showGmNotes={showGmNotes} />}
    {Object.entries(modificationLabels).map(([kind, label]) => <EntryBlock title={label} entries={content.modifications?.[kind]} gmMessage={content.gm_messages?.[kind] || content.gm_messages?.modifications} key={kind} showGmNotes={showGmNotes} />)}
    <EntryBlock title={frameSectionLabels.player_principles} entries={content.player_principles} gmMessage={content.gm_messages?.player_principles} showGmNotes={showGmNotes} />
    <EntryBlock title={frameSectionLabels.gm_principles} entries={content.gm_principles} gmMessage={content.gm_messages?.gm_principles} showGmNotes={showGmNotes} />
    <EntryBlock title={frameSectionLabels.distinctions} entries={content.distinctions} gmMessage={content.gm_messages?.distinctions} showGmNotes={showGmNotes} />
    {content.inciting_incident && <TextBlock title={frameSectionLabels.inciting_incident} text={content.inciting_incident} gmMessage={content.gm_messages?.inciting_incident} showGmNotes={showGmNotes} />}
    <EntryBlock title={frameSectionLabels.campaign_mechanics} entries={content.campaign_mechanics} gmMessage={content.gm_messages?.campaign_mechanics} showGmNotes={showGmNotes} />
    {content.session_zero_questions?.length > 0 && <div className={styles.textBlock}><h4>{frameSectionLabels.session_zero_questions}</h4><ul className={styles.questions}>{content.session_zero_questions.map((question) => <li key={question}>{question}</li>)}</ul><GmNote message={content.gm_messages?.session_zero_questions} show={showGmNotes} /></div>}
  </div>;
}

function FrameManager({ frame, updateSelection, updateEntrySelection, onSave, onSaveLibrary, saving }) {
  return <div className={styles.frameManager}><div className={styles.managerHeader}><div><strong>GM frame controls</strong><p className="muted">Choose what players see during character creation and play.</p></div><div className={styles.managerActions}><Button type="button" variant="text" onClick={onSaveLibrary} disabled={saving}>Save as library frame</Button><Button type="button" onClick={onSave} disabled={saving}>{saving ? 'Saving...' : 'Save selections'}</Button></div></div><div className={styles.selectionGrid}>{frameSectionKeys.map((key) => <label key={key} className={styles.selection}><input type="checkbox" disabled={saving} checked={frame.selections?.[key] !== false} onChange={(event) => updateSelection(key, event.target.checked)} /><span>{frameSectionLabels[key]}</span></label>)}</div><div className={styles.entrySelections}>{Object.entries(frame.content.modifications || {}).map(([kind, entries]) => <div key={kind}><strong>{modificationLabels[kind] || kind}</strong>{entryListWithKeys(entries).map(({ entry, mapKey }) => { const selectionKey = mapKey ?? entry.id; return <label className={styles.selection} key={selectionKey}><input type="checkbox" disabled={saving} checked={entryIsSelected(frame.selections?.[kind], mapKey, entry)} onChange={(event) => updateEntrySelection(kind, selectionKey, entry.id, event.target.checked)} /><span>{entry.title}</span></label>; })}</div>)}</div></div>;
}

function TextBlock({ title, text, gmMessage, showGmNotes }) { return <div className={styles.textBlock}><h4>{title}</h4><p>{text}</p><GmNote message={gmMessage} show={showGmNotes} /></div>; }
function TagBlock({ title, values, gmMessage, showGmNotes }) { return <div className={styles.textBlock}><h4>{title}</h4><div className={styles.tags}>{values.map((value) => <span key={value}>{value}</span>)}</div><GmNote message={gmMessage} show={showGmNotes} /></div>; }
function EntryBlock({ title, entries = [], gmMessage, showGmNotes = false }) { const normalizedEntries = entryList(entries); return normalizedEntries.length > 0 ? <div className={styles.textBlock}><h4>{title}</h4>{normalizedEntries.map((entry) => <article className={styles.entry} key={entry.id}><strong>{entry.title}</strong><p>{entry.description}</p>{entry.questions?.map((question) => <small key={question}>{question}</small>)}</article>)}<GmNote message={gmMessage} show={showGmNotes} /></div> : null; }
function GmNote({ message, show }) { return show && message ? <aside className={styles.gmNote}><strong>GM-only note</strong><p>{message}</p></aside> : null; }

function entryList(entries) {
  if (Array.isArray(entries)) return entries;
  if (!entries || typeof entries !== 'object') return [];
  return Object.entries(entries).map(([key, entry]) => ({ ...(entry || {}), id: entry?.id || key }));
}

function entryListWithKeys(entries) {
  if (Array.isArray(entries)) return entries.map((entry) => ({ entry, mapKey: undefined }));
  if (!entries || typeof entries !== 'object') return [];
  return Object.entries(entries).map(([mapKey, entry]) => ({ entry: entry || {}, mapKey }));
}

function entryIsSelected(selection, mapKey, entry) {
  const entryId = entry?.id || mapKey;
  return (mapKey === undefined || selection?.[mapKey] !== false) && selection?.[entryId] !== false;
}

function filterFrame(content, selections, showGmNotes = false) {
  const filtered = Object.fromEntries(Object.entries(content).filter(([key]) => key === 'id' || key === 'name' || key === 'description' || key === 'complexity_rating' || (key === 'gm_messages' ? showGmNotes : key === 'modifications' ? selections?.modifications !== false : selections?.[key] !== false)));
  if (content.modifications && selections?.modifications !== false) {
    filtered.modifications = Object.fromEntries(Object.entries(content.modifications).map(([kind, entries]) => {
      const isObjectMap = entries && typeof entries === 'object' && !Array.isArray(entries);
      const selectedEntries = entryListWithKeys(entries).filter(({ entry, mapKey }) => entryIsSelected(selections?.[kind], mapKey, entry));
      if (!isObjectMap) return [kind, selectedEntries.map(({ entry }) => entry)];
      const selectedKeys = new Set(selectedEntries.map(({ mapKey }) => mapKey));
      return [kind, Object.fromEntries(Object.entries(entries).filter(([key]) => selectedKeys.has(key)))];
    }));
  }
  return showGmNotes ? filtered : stripGmOnly(filtered);
}

function stripGmOnly(value) {
  if (Array.isArray(value)) return value.map(stripGmOnly);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'gm_message' && key !== 'gm_messages')
      .map(([key, child]) => [key, stripGmOnly(child)]),
  );
}

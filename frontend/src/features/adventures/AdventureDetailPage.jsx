import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import Button from '../../components/Button/Button';
import { useAdventureStore } from './adventureStore';
import * as adventureApi from './adventureApi';
import { createLibraryFrame, getAdventureFrame, updateAdventureFrame } from '../frames/frameApi';
import { contentToForm, draftToContent } from '../frames/frameDraft';
import { FrameDraftForm } from './CreateAdventurePage';
import styles from './AdventureDetailPage.module.css';

const tabs = [
  { id: 'campaign', label: 'Campaign' },
  { id: 'players', label: 'Players' },
  { id: 'notes', label: 'Notes', creatorOnly: true },
  { id: 'settings', label: 'Settings', creatorOnly: true },
];

// Detail page displays a private adventure and lets its creator manage invites
export default function AdventureDetailPage() {
  const { adventureId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { current, invites, loading, error, clearInvites, fetchAdventure, fetchInvites, invite, setFear, deleteAdventure } = useAdventureStore();
  const [activeTab, setActiveTab] = useState('campaign');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [frame, setFrame] = useState(null);
  const [frameForm, setFrameForm] = useState(null);
  const [frameState, setFrameState] = useState({ loading: true, saving: false, error: '', message: '' });
  const [deleteState, setDeleteState] = useState({ saving: false, error: '' });
  const [players, setPlayers] = useState([]);
  const [playersState, setPlayersState] = useState({ loading: true, error: '' });
  const [notes, setNotes] = useState([]);
  const [notesState, setNotesState] = useState({ loading: true, saving: false, error: '', message: '' });
  const [noteDraft, setNoteDraft] = useState({ id: null, title: '', body: '' });
  const routeRequestRef = useRef(0);
  const frameRevision = useRef(0);

  useEffect(() => {
    const requestGeneration = ++routeRequestRef.current;
    return () => {
      if (routeRequestRef.current === requestGeneration) routeRequestRef.current += 1;
    };
  }, [adventureId]);

  useEffect(() => {
    clearInvites();
    setActiveTab('campaign');
    setEmail('');
    setMessage('');
    setFrame(null);
    setFrameForm(null);
    frameRevision.current = 0;
    setFrameState({ loading: true, saving: false, error: '', message: '' });
    setDeleteState({ saving: false, error: '' });
    setPlayers([]);
    setPlayersState({ loading: true, error: '' });
    setNotes([]);
    setNoteDraft({ id: null, title: '', body: '' });
    setNotesState({ loading: true, saving: false, error: '', message: '' });
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
    if (!current || current.id !== adventureId) return () => { active = false; };
    adventureApi.listAdventurePlayers(adventureId)
      .then((value) => {
        if (active && isCurrentRoute(requestGeneration)) {
          setPlayers(value);
          setPlayersState({ loading: false, error: '' });
        }
      })
      .catch((requestError) => {
        if (active && isCurrentRoute(requestGeneration)) setPlayersState({ loading: false, error: requestError.message });
      });
    return () => { active = false; };
  }, [adventureId, current]);
  useEffect(() => {
    let active = true;
    const requestGeneration = routeRequestRef.current;
    setFrame(null);
    frameRevision.current = 0;
    setFrameState({ loading: true, saving: false, error: '', message: '' });
    if (!current || current.id !== adventureId) return () => { active = false; };
    getAdventureFrame(adventureId)
      .then((value) => {
        if (!active || !isCurrentRoute(requestGeneration)) return;
        setFrame(value);
        setFrameForm(contentToForm(value.content));
        frameRevision.current = 0;
        setFrameState({ loading: false, saving: false, error: '', message: '' });
      })
      .catch((frameError) => {
        if (active && isCurrentRoute(requestGeneration)) setFrameState({ loading: false, saving: false, error: frameError.message, message: '' });
      });
    return () => { active = false; };
  }, [adventureId, current]);

  useEffect(() => {
    let active = true;
    const requestGeneration = routeRequestRef.current;
    if (!current || current.id !== adventureId || current.creator_id !== user?.id) return () => { active = false; };
    adventureApi.listAdventureNotes(adventureId)
      .then((value) => {
        if (!active || !isCurrentRoute(requestGeneration)) return;
        setNotes(value);
        setNoteDraft(value[0] || { id: null, title: '', body: '' });
        setNotesState({ loading: false, saving: false, error: '', message: '' });
      })
      .catch((requestError) => {
        if (active && isCurrentRoute(requestGeneration)) setNotesState({ loading: false, saving: false, error: requestError.message, message: '' });
      });
    return () => { active = false; };
  }, [adventureId, current, user]);

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

  const updateSelection = (key, value) => {
    frameRevision.current += 1;
    setFrame((currentFrame) => ({
      ...currentFrame,
      selections: { ...currentFrame.selections, [key]: value },
    }));
  };
  const updateEntrySelection = (kind, entryId, value) => {
    frameRevision.current += 1;
    setFrame((currentFrame) => ({
      ...currentFrame,
      selections: {
        ...currentFrame.selections,
        [kind]: {
          ...(currentFrame.selections?.[kind] || {}),
          [entryId]: value,
        },
      },
    }));
  };
  const updateFrameField = (field, value) => {
    frameRevision.current += 1;
    setFrameForm((form) => ({ ...form, [field]: value }));
  };
  const saveFrame = async () => {
    const requestGeneration = routeRequestRef.current;
    const saveRevision = frameRevision.current;
    const content = draftToContent(frameForm);
    setFrameState((state) => ({ ...state, saving: true, error: '', message: '' }));
    try {
      const saved = await updateAdventureFrame(adventureId, { content, selections: frame.selections });
      if (!isCurrentRoute(requestGeneration)) return;
      const hasNewerEdits = frameRevision.current !== saveRevision;
      if (!hasNewerEdits) {
        setFrame(saved);
        setFrameForm(contentToForm(saved.content));
      }
      setFrameState({ loading: false, saving: false, error: '', message: hasNewerEdits ? 'Campaign snapshot saved. Newer edits remain unsaved.' : 'Campaign saved.' });
    } catch (saveError) {
      if (isCurrentRoute(requestGeneration)) setFrameState((state) => ({ ...state, saving: false, error: saveError.message }));
    }
  };
  const saveFrameToLibrary = async () => {
    const requestGeneration = routeRequestRef.current;
    const content = draftToContent(frameForm);
    try {
      await createLibraryFrame({ name: content.name, description: content.description || '', complexity_rating: content.complexity_rating || 3, content });
      if (isCurrentRoute(requestGeneration)) setFrameState((state) => ({ ...state, error: '', message: 'Saved to your frame library.' }));
    } catch (saveError) {
      if (isCurrentRoute(requestGeneration)) setFrameState((state) => ({ ...state, error: saveError.message }));
    }
  };

  const selectNote = (note) => {
    setNoteDraft(note);
    setNotesState((state) => ({ ...state, error: '', message: '' }));
  };
  const newNote = () => {
    setNoteDraft({ id: null, title: '', body: '' });
    setNotesState((state) => ({ ...state, error: '', message: '' }));
  };
  const saveNote = async (event) => {
    event.preventDefault();
    const requestGeneration = routeRequestRef.current;
    const isActive = () => isCurrentRoute(requestGeneration);
    setNotesState((state) => ({ ...state, saving: true, error: '', message: '' }));
    try {
      const saved = noteDraft.id
        ? await adventureApi.updateAdventureNote(adventureId, noteDraft.id, { title: noteDraft.title, body: noteDraft.body })
        : await adventureApi.createAdventureNote(adventureId, { title: noteDraft.title, body: noteDraft.body });
      if (!isActive()) return;
      setNotes((currentNotes) => noteDraft.id ? currentNotes.map((note) => note.id === saved.id ? saved : note) : [saved, ...currentNotes]);
      setNoteDraft(saved);
      setNotesState({ loading: false, saving: false, error: '', message: 'Note saved.' });
    } catch (saveError) {
      if (isActive()) setNotesState((state) => ({ ...state, saving: false, error: saveError.message, message: '' }));
    }
  };
  const removeNote = async () => {
    if (!noteDraft.id || !window.confirm('Delete this GM note?')) return;
    const requestGeneration = routeRequestRef.current;
    const isActive = () => isCurrentRoute(requestGeneration);
    const noteId = noteDraft.id;
    setNotesState((state) => ({ ...state, saving: true, error: '', message: '' }));
    try {
      await adventureApi.deleteAdventureNote(adventureId, noteId);
      if (!isActive()) return;
      const remaining = notes.filter((note) => note.id !== noteId);
      setNotes(remaining);
      setNoteDraft(remaining[0] || { id: null, title: '', body: '' });
      setNotesState({ loading: false, saving: false, error: '', message: 'Note deleted.' });
    } catch (deleteError) {
      if (isActive()) setNotesState((state) => ({ ...state, saving: false, error: deleteError.message }));
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

  return <section>
    <p className="eyebrow">PRIVATE ADVENTURE</p><h2>{current.name}</h2><p className={styles.description}>{current.description || 'No description yet.'}</p>{error && <p className={styles.error}>{error}</p>}
    <nav className={styles.workspaceTabs} aria-label="Adventure workspace">{tabs.filter((tab) => !tab.creatorOnly || isCreator).map((tab) => <button type="button" key={tab.id} className={activeTab === tab.id ? styles.activeTab : ''} onClick={() => setActiveTab(tab.id)} aria-current={activeTab === tab.id ? 'page' : undefined}>{tab.label}</button>)}</nav>
    {activeTab === 'campaign' && <CampaignPanel frame={frame} frameForm={frameForm} frameState={frameState} isCreator={isCreator} canCreateCharacter={canCreateCharacter} adventureId={adventureId} updateFrameField={updateFrameField} updateSelection={updateSelection} updateEntrySelection={updateEntrySelection} saveFrame={saveFrame} saveFrameToLibrary={saveFrameToLibrary} />}
    {activeTab === 'players' && <PlayersPanel players={players} playersState={playersState} currentUserId={user?.id} isCreator={isCreator} current={current} invites={invites} email={email} setEmail={setEmail} message={message} submitInvite={submitInvite} setFear={setFear} adventureId={adventureId} />}
    {activeTab === 'notes' && isCreator && <NotesPanel notes={notes} notesState={notesState} noteDraft={noteDraft} setNoteDraft={setNoteDraft} selectNote={selectNote} newNote={newNote} saveNote={saveNote} removeNote={removeNote} />}
    {activeTab === 'settings' && isCreator && <SettingsPanel deleteState={deleteState} removeAdventure={removeAdventure} />}
  </section>;
}

function CampaignPanel({ frame, frameForm, frameState, isCreator, canCreateCharacter, adventureId, updateFrameField, updateSelection, updateEntrySelection, saveFrame, saveFrameToLibrary }) {
  if (frameState.loading) return <p className="muted">Loading campaign frame...</p>;
  if (!frame) return <p className={styles.mutedPanel}>{isCreator ? 'Attach a campaign frame to begin shaping this game.' : 'The GM has not attached a campaign frame yet.'}</p>;
  const onSelectionChange = (key, value) => {
    if (['communities', 'ancestries', 'classes'].includes(key)) {
      const changedId = Object.keys(value).find((entryId) => value[entryId] !== frame.selections?.[key]?.[entryId]);
      if (changedId) updateEntrySelection(key, changedId, value[changedId]);
    } else updateSelection(key, value);
  };
  return <section className={styles.frameSection}>
    <div className={styles.frameHeading}><div><p className="eyebrow">ACTIVE CAMPAIGN FRAME</p><h3>{frame.content.name}</h3></div><span>Complexity {frame.content.complexity_rating}/5</span></div>
    {isCreator ? <div className={styles.campaignEditor}><div className={styles.editorIntro}><strong>Campaign description</strong><p className="muted">Edit the complete frame. Source content stays marked, and anything you add is labeled for the table.</p></div><FrameDraftForm form={frameForm} update={updateFrameField} selections={frame.selections || {}} onSelectionChange={onSelectionChange} /><div className={styles.managerActions}><Button type="button" variant="text" onClick={saveFrameToLibrary} disabled={frameState.saving}>Save as library frame</Button><Button type="button" onClick={saveFrame} disabled={frameState.saving}>{frameState.saving ? 'Saving...' : 'Save campaign'}</Button></div></div> : <FrameViewer content={filterFrame(frame.content, frame.selections)} />}
    {canCreateCharacter && <Link className={styles.characterLink} to={`/characters/create?adventure=${adventureId}`}>Create a character for this adventure</Link>}
    {frameState.message && <p className="muted" role="status">{frameState.message}</p>}{frameState.error && <p className={styles.error} role="alert">{frameState.error}</p>}
  </section>;
}

function PlayersPanel({ players, playersState, currentUserId, isCreator, current, invites, email, setEmail, message, submitInvite, setFear, adventureId }) {
  return <section className={styles.workspacePanel}><div className={styles.panelHeading}><div><p className="eyebrow">ADVENTURE ROSTER</p><h3>Players</h3></div><span className="muted">Accepted members only</span></div>{playersState.loading && <p className="muted">Loading players...</p>}{playersState.error && <p className={styles.error} role="alert">{playersState.error}</p>}{!playersState.loading && !playersState.error && players.length === 0 && <p className="muted">No accepted players yet.</p>}
    <div className={styles.roster}>{players.map((player) => <article className={styles.rosterCard} key={player.user_id}><div><strong>{player.user_name}</strong>{player.user_id === current.creator_id && <span className={styles.roleLabel}>GM</span>}</div>{player.character ? ((isCreator || player.user_id === currentUserId) ? <Link to={`/characters/${player.character.id}`}><strong>{player.character.name}</strong><span>Level {player.character.level} · {player.character.class_id} · {player.character.ancestry_id} · {player.character.community_id}</span></Link> : <span className="muted">Character assigned</span>) : <span className="muted">No character yet</span>}</article>)}</div>
    {isCreator && <div className={styles.playerManagement}><h3>Fear pool</h3><div className={styles.fear}>{Array.from({ length: 12 }, (_, index) => <button type="button" key={index} className={index < (current.fear || 0) ? styles.fearFilled : styles.fearSlot} aria-label={`Set Fear to ${index + 1}`} onClick={() => setFear(adventureId, index + 1 === current.fear ? index : index + 1)} />)}<span className={styles.fearValue}>{current.fear || 0} / 12</span></div><h3>Invite a player</h3><form onSubmit={submitInvite} className={styles.inviteForm}><input required type="email" placeholder="player@example.com" value={email} onChange={(event) => setEmail(event.target.value)} /><Button type="submit">Invite</Button></form>{message && <p className="muted">{message}</p>}<h3>Invitations</h3>{invites.length === 0 ? <p className="muted">No invitations yet.</p> : <ul className={styles.invites}>{invites.map((invite) => <li key={invite.id}><span>{invite.recipient_email}</span><span>{invite.status}</span></li>)}</ul>}</div>}
  </section>;
}

function NotesPanel({ notes, notesState, noteDraft, setNoteDraft, selectNote, newNote, saveNote, removeNote }) {
  return <section className={styles.workspacePanel}><div className={styles.panelHeading}><div><p className="eyebrow">GM NOTEBOOK</p><h3>Notes</h3></div><Button type="button" variant="text" onClick={newNote}>New note</Button></div>{notesState.loading ? <p className="muted">Loading notes...</p> : <div className={styles.notesLayout}><div className={styles.noteList}>{notes.length === 0 ? <p className="muted">No notes yet. Start a private thread for future story-line planning.</p> : notes.map((note) => <button type="button" className={note.id === noteDraft.id ? styles.selectedNote : ''} key={note.id} onClick={() => selectNote(note)}><strong>{note.title}</strong><span>{new Date(note.updated_at).toLocaleDateString()}</span></button>)}</div><form className={styles.noteEditor} onSubmit={saveNote}><label>Title<input required maxLength="160" value={noteDraft.title} onChange={(event) => setNoteDraft({ ...noteDraft, title: event.target.value })} /></label><label>Note body<textarea required maxLength="10000" value={noteDraft.body} onChange={(event) => setNoteDraft({ ...noteDraft, body: event.target.value })} /></label><div className={styles.noteActions}><Button type="submit" disabled={notesState.saving}>{notesState.saving ? 'Saving...' : 'Save note'}</Button>{noteDraft.id && <Button type="button" variant="text" onClick={removeNote} disabled={notesState.saving}>Delete note</Button>}</div></form></div>}{notesState.message && <p className="muted" role="status">{notesState.message}</p>}{notesState.error && <p className={styles.error} role="alert">{notesState.error}</p>}</section>;
}

function SettingsPanel({ deleteState, removeAdventure }) {
  return <section className={styles.workspacePanel}><div className={styles.panelHeading}><div><p className="eyebrow">GAME CONTROL</p><h3>Settings</h3></div></div><div className={styles.dangerZone}><h3>Delete adventure</h3><p className="muted">This permanently removes the table, invitations, and frame. Player characters are unlinked but preserved.</p><Button type="button" variant="text" onClick={removeAdventure} disabled={deleteState.saving}>{deleteState.saving ? 'Deleting...' : 'Delete adventure'}</Button>{deleteState.error && <p className={styles.error} role="alert">{deleteState.error}</p>}</div></section>;
}

const frameSectionLabels = { pitch: 'Pitch', tone_and_feel: 'Tone & feel', themes: 'Themes', touchstones: 'Touchstones', overview: 'Overview', modifications: 'Character guidance', player_principles: 'Player principles', gm_principles: 'GM principles', distinctions: 'Distinctions', inciting_incident: 'The inciting incident', campaign_mechanics: 'Campaign mechanics', session_zero_questions: 'Session-zero questions' };
const modificationLabels = { communities: 'Communities', ancestries: 'Ancestries', classes: 'Classes' };

function FrameViewer({ content, showGmNotes = false }) {
  const toneValues = normalizeDisplayValues(content.tone_and_feel, 'tone');
  const themeValues = normalizeDisplayValues(content.themes, 'theme');
  const touchstoneValues = normalizeDisplayValues(content.touchstones, 'touchstone');
  const sessionQuestions = normalizeDisplayValues(content.session_zero_questions, 'session-question');
  return <div className={styles.frameViewer}>
    {content.pitch && <TextBlock title={frameSectionLabels.pitch} text={content.pitch} gmMessage={content.gm_messages?.pitch} showGmNotes={showGmNotes} />}
    {toneValues.length > 0 && <TagBlock title={frameSectionLabels.tone_and_feel} values={toneValues} gmMessage={content.gm_messages?.tone_and_feel} showGmNotes={showGmNotes} />}
    {themeValues.length > 0 && <TagBlock title={frameSectionLabels.themes} values={themeValues} gmMessage={content.gm_messages?.themes} showGmNotes={showGmNotes} />}
    {touchstoneValues.length > 0 && <TagBlock title={frameSectionLabels.touchstones} values={touchstoneValues} gmMessage={content.gm_messages?.touchstones} showGmNotes={showGmNotes} />}
    {content.overview && <TextBlock title={frameSectionLabels.overview} text={content.overview} gmMessage={content.gm_messages?.overview} showGmNotes={showGmNotes} />}
    {Object.entries(modificationLabels).map(([kind, label]) => <EntryBlock title={label} entries={content.modifications?.[kind]} gmMessage={content.gm_messages?.[kind] || content.gm_messages?.modifications} key={kind} showGmNotes={showGmNotes} />)}
    <EntryBlock title={frameSectionLabels.player_principles} entries={content.player_principles} gmMessage={content.gm_messages?.player_principles} showGmNotes={showGmNotes} />
    <EntryBlock title={frameSectionLabels.gm_principles} entries={content.gm_principles} gmMessage={content.gm_messages?.gm_principles} showGmNotes={showGmNotes} />
    <EntryBlock title={frameSectionLabels.distinctions} entries={content.distinctions} gmMessage={content.gm_messages?.distinctions} showGmNotes={showGmNotes} />
    {content.inciting_incident && <TextBlock title={frameSectionLabels.inciting_incident} text={content.inciting_incident} gmMessage={content.gm_messages?.inciting_incident} showGmNotes={showGmNotes} />}
    <EntryBlock title={frameSectionLabels.campaign_mechanics} entries={content.campaign_mechanics} gmMessage={content.gm_messages?.campaign_mechanics} showGmNotes={showGmNotes} />
    {sessionQuestions.length > 0 && <div className={styles.textBlock}><h4>{frameSectionLabels.session_zero_questions}</h4><ul className={styles.questions}>{sessionQuestions.map((question) => <li key={question.key}>{question.text}</li>)}</ul><GmNote message={content.gm_messages?.session_zero_questions} show={showGmNotes} /></div>}
  </div>;
}

function TextBlock({ title, text, gmMessage, showGmNotes }) { return <div className={styles.textBlock}><h4>{title}</h4><p>{text}</p><GmNote message={gmMessage} show={showGmNotes} /></div>; }
function TagBlock({ title, values, gmMessage, showGmNotes }) { const normalizedValues = normalizeDisplayValues(values, title); return <div className={styles.textBlock}><h4>{title}</h4><div className={styles.tags}>{normalizedValues.map((value) => <span key={value.key}>{value.text}</span>)}</div><GmNote message={gmMessage} show={showGmNotes} /></div>; }
function EntryBlock({ title, entries = [], gmMessage, showGmNotes = false }) { const normalizedEntries = entryList(entries, title); return normalizedEntries.length > 0 ? <div className={styles.textBlock}><h4>{title}</h4>{normalizedEntries.map((entry) => <article className={styles.entry} key={entry.id}><strong>{entry.title}</strong><p>{entry.description}</p>{entry.questions?.map((question) => <small key={question.key}>{question.text}</small>)}</article>)}<GmNote message={gmMessage} show={showGmNotes} /></div> : null; }
function GmNote({ message, show }) { return show && message ? <aside className={styles.gmNote}><strong>GM-only note</strong><p>{message}</p></aside> : null; }

function displayText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return String(value);
  return displayText(value.description ?? value.text ?? value.value ?? value.title ?? value.name);
}

function normalizeDisplayValues(values, prefix) {
  const entries = Array.isArray(values)
    ? values.map((value, index) => ({ value, mapKey: undefined, index }))
    : values && typeof values === 'object'
      ? Object.entries(values).map(([mapKey, value], index) => ({ value, mapKey, index }))
      : typeof values === 'string'
        ? [{ value: values, mapKey: undefined, index: 0 }]
        : [];
  return entries.map(({ value, mapKey, index }) => ({
    key: String(value?.id || mapKey || `${prefix}-${index + 1}`),
    text: displayText(value),
  })).filter((entry) => entry.text);
}

function entryList(entries, prefix = 'entry') {
  const sourceEntries = Array.isArray(entries)
    ? entries.map((entry, index) => ({ entry, mapKey: undefined, index }))
    : entries && typeof entries === 'object'
      ? Object.entries(entries).map(([mapKey, entry], index) => ({ entry, mapKey, index }))
      : typeof entries === 'string'
        ? [{ entry: entries, mapKey: undefined, index: 0 }]
        : [];
  return sourceEntries.map(({ entry, mapKey, index }) => {
    const objectEntry = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {};
    const id = String(objectEntry.id || mapKey || `${prefix}-${index + 1}`);
    const questions = Array.isArray(objectEntry.questions)
      ? objectEntry.questions.map((question, questionIndex) => ({
        key: String(question?.id || `${id}-question-${questionIndex + 1}`),
        text: displayText(question),
      })).filter((question) => question.text)
      : [];
    return {
      ...objectEntry,
      id,
      title: displayText(objectEntry.title ?? objectEntry.name),
      description: displayText(objectEntry.description ?? objectEntry.text ?? objectEntry.value ?? entry),
      questions,
    };
  }).filter((entry) => entry.description || entry.title || entry.questions.length > 0);
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

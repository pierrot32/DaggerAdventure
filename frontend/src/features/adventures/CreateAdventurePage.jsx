import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/Button/Button';
import { listBuiltinFrames, listLibraryFrames } from '../frames/frameApi';
import { getCharacterCreationBook } from '../characters/characterApi';
import { autoFeatureIds, contentToForm, draftToContent, emptyFrame, frameModificationKinds, newModificationEntry } from '../frames/frameDraft';
import { useAdventureStore } from './adventureStore';
import styles from './CreateAdventurePage.module.css';

const initialAdventure = { name: '', description: '' };

export default function CreateAdventurePage() {
  const navigate = useNavigate();
  const { create, loading, error } = useAdventureStore();
  const [adventure, setAdventure] = useState(initialAdventure);
  const [source, setSource] = useState({ type: 'blank', id: '' });
  const [builtins, setBuiltins] = useState([]);
  const [library, setLibrary] = useState([]);
  const [frameForm, setFrameForm] = useState(contentToForm(emptyFrame()));
  const [book, setBook] = useState(null);
  const [frameState, setFrameState] = useState({ loading: true, error: '' });

  useEffect(() => {
    Promise.all([listBuiltinFrames(), listLibraryFrames(), getCharacterCreationBook().catch(() => ({ content: null }))])
      .then(([nextBuiltins, nextLibrary, nextBook]) => {
        setBuiltins(nextBuiltins);
        setLibrary(nextLibrary);
        setBook(nextBook.content);
        setFrameState({ loading: false, error: '' });
      })
      .catch((requestError) => setFrameState({ loading: false, error: requestError.message }));
  }, []);

  const selectedSource = source.type === 'builtin'
    ? builtins.find((frame) => frame.id === source.id)
    : source.type === 'library'
      ? library.find((frame) => frame.id === source.id)?.content
      : draftToContent(frameForm, book);

  const chooseSource = (type, id = '') => {
    setSource({ type, id });
    if (type === 'blank') setFrameForm(contentToForm(emptyFrame()));
  };

  const updateFrameField = (field, value) => setFrameForm((current) => ({ ...current, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    const frameSource = source.type === 'blank'
      ? { source_type: 'blank', source_id: null, content: draftToContent(frameForm, book) }
      : { source_type: source.type, source_id: source.id };
    const created = await create({ ...adventure, frame_source: frameSource });
    navigate(`/adventures/${created.id}`);
  };

  return (
    <section className={styles.page}>
      <p className="eyebrow">NEW ADVENTURE</p>
      <h2>Build a table with a frame</h2>
      <p className={styles.intro}>Choose the campaign shape first. You can refine its sections and guidance after the table exists.</p>
      <form onSubmit={submit} className={styles.form}>
        <div className={styles.adventureFields}>
          <label>Name<input required maxLength="80" value={adventure.name} onChange={(event) => setAdventure({ ...adventure, name: event.target.value })} /></label>
          <label>Description<textarea maxLength="2000" value={adventure.description} onChange={(event) => setAdventure({ ...adventure, description: event.target.value })} /></label>
        </div>

        <div className={styles.frameHeader}>
          <div><p className="eyebrow">CAMPAIGN FRAME</p><h3>Choose the shape of play</h3></div>
          {frameState.loading && <span className="muted">Loading frame library...</span>}
        </div>
        {frameState.error && <p className={styles.error}>{frameState.error}</p>}
        <div className={styles.sourceGrid}>
          <button type="button" className={`${styles.sourceCard} ${source.type === 'blank' ? styles.selected : ''}`} onClick={() => chooseSource('blank')}>
            <strong>Start from scratch</strong><span>Author a frame for this table while you create it.</span>
          </button>
          {builtins.map((frame) => <button type="button" className={`${styles.sourceCard} ${source.type === 'builtin' && source.id === frame.id ? styles.selected : ''}`} onClick={() => chooseSource('builtin', frame.id)} key={frame.id}>
            <strong>{frame.name}</strong><span>{frame.description}</span><small>Complexity {frame.complexity_rating}/5</small>
          </button>)}
          {library.map((frame) => <button type="button" className={`${styles.sourceCard} ${source.type === 'library' && source.id === frame.id ? styles.selected : ''}`} onClick={() => chooseSource('library', frame.id)} key={frame.id}>
            <strong>{frame.name}</strong><span>{frame.description || 'Your reusable campaign frame.'}</span><small>GM library · complexity {frame.complexity_rating}/5</small>
          </button>)}
        </div>

        {source.type === 'blank' ? <FrameDraftForm form={frameForm} update={updateFrameField} optionLists={book} /> : <FramePreview content={selectedSource} />}
        {error && <p className={styles.error}>{error}</p>}
        <Button type="submit" disabled={loading}>{loading ? 'Creating adventure...' : 'Create adventure'}</Button>
      </form>
    </section>
  );
}

export function FramePreview({ content }) {
  if (!content) return <p className="muted">Choose a frame to preview it.</p>;
  return <article className={styles.preview}><div className={styles.previewTop}><div><p className="eyebrow">SELECTED FRAME</p><h3>{content.name}</h3></div><span>Complexity {content.complexity_rating}/5</span></div><p>{content.description}</p><p className={styles.pitch}>{content.pitch}</p><div className={styles.tags}>{(content.tone_and_feel || []).map((tone) => <span key={tone}>{tone}</span>)}</div></article>;
}

export function FrameDraftForm({ form, update, optionLists = {}, activeSection = '', metadataPersistent = false }) {
  const availableOptions = optionLists || {};
  const showSection = (section) => !activeSection || activeSection === section;
  const updateGmMessage = (section, value) => update('gm_messages', { ...(form.gm_messages || {}), [section]: value });
  const updateModification = (kind, entries) => update('modifications', { ...(form.modifications || {}), [kind]: entries });
  return <div className={styles.draft}>
    <div className={styles.draftIntro}><p className="eyebrow">HAND-AUTHORED FRAME</p><h3>Give the campaign a playable spine</h3><p>Build character guidance as individual features. The GM can turn each section or feature on and off later.</p></div>
    {(!activeSection || showSection('details') || metadataPersistent) && <div className={styles.frameGrid}>
      <label>Name<input required value={form.name} onChange={(event) => update('name', event.target.value)} /></label>
      <label>Frame ID<input required pattern="[a-z0-9][a-z0-9-]*" value={form.id} onChange={(event) => update('id', event.target.value)} /></label>
      <label>Complexity<select value={form.complexity_rating} onChange={(event) => update('complexity_rating', event.target.value)}>{[1, 2, 3, 4, 5].map((value) => <option value={value} key={value}>{value} / 5</option>)}</select></label>
      <TextField className={styles.full} label="Description" value={form.description} update={update} field="description" />
    </div>}
    {showSection('pitch') && <SectionFields note={<TextField className={`${styles.full} ${styles.gmNote}`} label="GM-only note for Pitch" value={form.gm_messages?.pitch} update={updateGmMessage} field="pitch" />}><TextField label="Pitch" value={form.pitch} update={update} field="pitch" required /></SectionFields>}
    {showSection('overview') && <SectionFields note={<TextField className={`${styles.full} ${styles.gmNote}`} label="GM-only note for Overview" value={form.gm_messages?.overview} update={updateGmMessage} field="overview" />}><TextField label="Overview" value={form.overview} update={update} field="overview" required /></SectionFields>}
    {showSection('inciting_incident') && <SectionFields note={<TextField className={`${styles.full} ${styles.gmNote}`} label="GM-only note for The inciting incident" value={form.gm_messages?.inciting_incident} update={updateGmMessage} field="inciting_incident" />}><TextField label="The inciting incident" value={form.inciting_incident} update={update} field="inciting_incident" /></SectionFields>}
    {showSection('tone_and_feel') && <SectionFields note={<TextField className={`${styles.full} ${styles.gmNote}`} label="GM-only note for Tone & feel" value={form.gm_messages?.tone_and_feel} update={updateGmMessage} field="tone_and_feel" />}><TextField label="Tone & feel" value={form.tone_and_feel} update={update} field="tone_and_feel" hint="Comma-separated" /></SectionFields>}
    {showSection('themes') && <SectionFields note={<TextField className={`${styles.full} ${styles.gmNote}`} label="GM-only note for Themes" value={form.gm_messages?.themes} update={updateGmMessage} field="themes" />}><TextField label="Themes" value={form.themes} update={update} field="themes" hint="Comma-separated" /></SectionFields>}
    {showSection('touchstones') && <SectionFields note={<TextField className={`${styles.full} ${styles.gmNote}`} label="GM-only note for Touchstones" value={form.gm_messages?.touchstones} update={updateGmMessage} field="touchstones" />}><TextField label="Touchstones" value={form.touchstones} update={update} field="touchstones" hint="Comma-separated" /></SectionFields>}
    {showSection('session_zero_questions') && <SectionFields note={<TextField className={`${styles.full} ${styles.gmNote}`} label="GM-only note for Session-zero questions" value={form.gm_messages?.session_zero_questions} update={updateGmMessage} field="session_zero_questions" />}><TextField label="Session-zero questions" value={form.session_zero_questions} update={update} field="session_zero_questions" hint="One question per line" /></SectionFields>}
    {frameModificationKinds.map((kind) => showSection(kind.id) && <SectionFields key={kind.id} note={<TextField className={`${styles.full} ${styles.gmNote}`} label={`GM-only note for ${kind.label}`} value={form.gm_messages?.[kind.id]} update={updateGmMessage} field={kind.id} />}><ModificationList kind={kind} frameName={form.name} entries={form.modifications?.[kind.id] || []} options={availableOptions[kind.id] || []} onChange={(entries) => updateModification(kind.id, entries)} /></SectionFields>)}
    {showSection('player_principles') && <SectionFields note={<TextField className={`${styles.full} ${styles.gmNote}`} label="GM-only note for Player principles" value={form.gm_messages?.player_principles} update={updateGmMessage} field="player_principles" />}><TextField className={styles.full} label="Player principles" value={form.player_principles} update={update} field="player_principles" hint="Separate entries with a blank line" /></SectionFields>}
    {showSection('gm_principles') && <SectionFields note={<TextField className={`${styles.full} ${styles.gmNote}`} label="GM-only note for GM principles" value={form.gm_messages?.gm_principles} update={updateGmMessage} field="gm_principles" />}><TextField className={styles.full} label="GM principles" value={form.gm_principles} update={update} field="gm_principles" hint="Separate entries with a blank line" /></SectionFields>}
    {showSection('distinctions') && <SectionFields note={<TextField className={`${styles.full} ${styles.gmNote}`} label="GM-only note for Distinctions" value={form.gm_messages?.distinctions} update={updateGmMessage} field="distinctions" />}><TextField className={styles.full} label="Distinctions" value={form.distinctions} update={update} field="distinctions" hint="Separate entries with a blank line" /></SectionFields>}
    {showSection('campaign_mechanics') && <SectionFields note={<TextField className={`${styles.full} ${styles.gmNote}`} label="GM-only note for Campaign mechanics" value={form.gm_messages?.campaign_mechanics} update={updateGmMessage} field="campaign_mechanics" />}><TextField className={styles.full} label="Campaign mechanics" value={form.campaign_mechanics} update={update} field="campaign_mechanics" hint="Separate entries with a blank line" /></SectionFields>}
  </div>;
}

function SectionFields({ note, children }) {
  return <div className={styles.sectionFields}>{note}{children}</div>;
}

function TextField({ label, value, update, field, hint, required = false, className = '' }) {
  const stripNewlines = () => update(field, (value || '').replace(/\n/g, ''));
  return <label className={className}>{label}{hint && <small>{hint}</small>}<span className={styles.textareaControl}><textarea required={required} value={value || ''} onChange={(event) => update(field, event.target.value)} /><button type="button" className={styles.stripNewlines} onClick={stripNewlines} title="Remove all newline characters" aria-label={`Remove all newline characters from ${label}`}>Remove newlines</button></span></label>;
}

function ModificationList({ kind, frameName, entries, options, onChange }) {
  const [selectedTargetId, setSelectedTargetId] = useState(options[0]?.id || '');
  useEffect(() => {
    if (!options.some((option) => option.id === selectedTargetId)) setSelectedTargetId(options[0]?.id || '');
  }, [options, selectedTargetId]);

  const entriesWithIds = autoFeatureIds(entries, kind.id, frameName, options);
  const updateEntries = (nextEntries) => onChange(autoFeatureIds(nextEntries, kind.id, frameName, options));
  const updateEntry = (index, field, value) => updateEntries(entries.map((entry, entryIndex) => entryIndex === index ? { ...entry, [field]: value } : entry));
  const addEntry = () => updateEntries([...entries, { ...newModificationEntry(kind.id, entries.length + 1), target_ids: selectedTargetId ? [selectedTargetId] : [] }]);
  const removeEntry = (index) => updateEntries(entries.filter((_, entryIndex) => entryIndex !== index));
  return <section className={styles.modificationSection}>
    <div className={styles.modificationHeader}><div><h4>{kind.label}</h4><p>Add a feature for a selected {kind.optionLabel}. A feature can be assigned to more than one {kind.optionLabel} after it is created.</p></div><div className={styles.addFeatureControls}><select aria-label={`${kind.optionLabel} to add`} value={selectedTargetId} onChange={(event) => setSelectedTargetId(event.target.value)}><option value="">All {kind.optionPlural}</option>{options.map((option) => <option value={option.id} key={option.id}>{option.name || option.id}</option>)}</select><button type="button" className={styles.smallButton} onClick={addEntry}>Add {kind.optionLabel}</button></div></div>
    {entriesWithIds.map((entry, index) => <article className={styles.modificationEntry} key={entry.id || `${kind.id}-${index}`}>
      <div className={styles.modificationEntryHeader}><strong>Feature {index + 1}</strong><button type="button" className={styles.removeButton} onClick={() => removeEntry(index)}>Remove</button></div>
      <div className={styles.modificationGrid}>
        <div className={styles.autoId}><span>Automatic feature ID</span><code>{entry.id}</code></div>
        <label>Feature title<input value={entry.title || ''} onChange={(event) => updateEntry(index, 'title', event.target.value)} /></label>
        <TextField className={styles.full} label="Player-facing guidance" value={entry.description} update={(field, value) => updateEntry(index, field, value)} field="description" />
        <TargetPicker kind={kind} options={options} selected={entry.target_ids || []} onChange={(value) => updateEntry(index, 'target_ids', value)} />
      </div>
    </article>)}
    {entries.length === 0 && <p className="muted">No {kind.optionLabel} features added.</p>}
  </section>;
}

function TargetPicker({ kind, options, selected, onChange }) {
  const updateText = (value) => onChange(value.split(',').map((item) => item.trim()).filter(Boolean));
  return <fieldset className={`${styles.targetPicker} ${styles.full}`}>
    <legend>Applies to {kind.optionPlural}</legend>
    {options.length > 0 ? <>
      <div className={styles.targetOptions}>{selected.length > 0 ? selected.map((targetId) => {
        const option = options.find((item) => item.id === targetId);
        return <span className={styles.targetTag} key={targetId}>{option?.name || targetId}<button type="button" className={styles.removeTarget} onClick={() => onChange(selected.filter((id) => id !== targetId))} aria-label={`Remove ${option?.name || targetId}`}>x</button></span>;
      }) : <span className={styles.targetEmpty}>All {kind.optionPlural}</span>}</div>
      <select aria-label={`Add ${kind.optionLabel} target`} value="" onChange={(event) => event.target.value && onChange([...selected, event.target.value])}><option value="">Add another {kind.optionLabel}</option>{options.filter((option) => !selected.includes(option.id)).map((option) => <option value={option.id} key={option.id}>{option.name || option.id}</option>)}</select>
    </> : <input aria-label={`Target ${kind.optionLabel} IDs`} value={selected.join(', ')} onChange={(event) => updateText(event.target.value)} placeholder={`Enter ${kind.optionLabel} IDs, separated by commas`} />}
    <small>Leave empty to make this feature general.</small>
  </fieldset>;
}

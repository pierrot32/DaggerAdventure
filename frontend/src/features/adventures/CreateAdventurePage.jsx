import { useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/Button/Button';
import { listBuiltinFrames, listLibraryFrames } from '../frames/frameApi';
import { getCharacterCreationBook } from '../characters/characterApi';
import { autoFeatureIds, contentToForm, draftToContent, emptyFrame, frameModificationKinds, newModificationEntry, newRepeatableEntry, preserveFrameEntryMapShape } from '../frames/frameDraft';
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
  const tones = Array.isArray(content.tone_and_feel) ? content.tone_and_feel : [];
  return <article className={styles.preview}><div className={styles.previewTop}><div><p className="eyebrow">SELECTED FRAME</p><h3>{content.name}</h3></div><span>Complexity {content.complexity_rating}/5</span></div><p>{content.description}</p><p className={styles.pitch}>{content.pitch}</p><div className={styles.tags}>{tones.map((tone, index) => <span key={tone?.id || `tone-${index + 1}`}>{displayFrameValue(tone)}</span>)}</div></article>;
}

function displayFrameValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return String(value);
  return displayFrameValue(value.description ?? value.text ?? value.value ?? value.title ?? value.name);
}

export function FrameDraftForm({ form, update, optionLists = {}, activeSection = '', metadataPersistent = false, selections = {}, onSelectionChange = () => {} }) {
  const availableOptions = optionLists || {};
  const showSection = (section) => !activeSection || activeSection === section;
  const updateGmMessage = (section, value) => update('gm_messages', { ...(form.gm_messages || {}), [section]: value });
  const updateModification = (kind, entries) => update('modifications', { ...(form.modifications || {}), [kind]: entries });
  return <div className={styles.draft}>
    {(!activeSection || activeSection === 'details') && <div className={styles.draftIntro}><p className="eyebrow">HAND-AUTHORED FRAME</p><h3>Give the campaign a playable spine</h3><p>Build character guidance as individual features. The GM can turn each section or feature on and off later.</p></div>}
    {(!activeSection || showSection('details') || metadataPersistent) && <div className={styles.frameGrid}>
      <label>Name<input required value={form.name} onChange={(event) => update('name', event.target.value)} /></label>
      <label>Frame ID<input required pattern="[a-z0-9][a-z0-9-]*" value={form.id} onChange={(event) => update('id', event.target.value)} /></label>
      <label>Complexity<select value={form.complexity_rating} onChange={(event) => update('complexity_rating', event.target.value)}>{[1, 2, 3, 4, 5].map((value) => <option value={value} key={value}>{value} / 5</option>)}</select></label>
      <TextField className={styles.full} label="Description" value={form.description} update={update} field="description" />
    </div>}
    {showSection('pitch') && <SectionFields selectionKey="pitch" selections={selections} onSelectionChange={onSelectionChange} note={<TextField className={`${styles.full} ${styles.gmNote}`} label="GM-only note for Pitch" value={form.gm_messages?.pitch} update={updateGmMessage} field="pitch" />}><TextField label="Pitch" value={form.pitch} update={update} field="pitch" required /></SectionFields>}
    {showSection('tone_and_feel') && <SectionFields selectionKey="tone_and_feel_section" selections={selections} onSelectionChange={onSelectionChange} note={<TextField className={`${styles.full} ${styles.gmNote}`} label="GM-only note for Tone & feel" value={form.gm_messages?.tone_and_feel} update={updateGmMessage} field="tone_and_feel" />}><RepeatableTextList label="Tone & feel" values={form.tone_and_feel} onChange={(value) => update('tone_and_feel', value)} addLabel="tone" placeholder="A tone or feeling" selectionKey="tone_and_feel" selections={selections} onSelectionChange={onSelectionChange} /></SectionFields>}
    {showSection('themes') && <SectionFields selectionKey="themes_section" selections={selections} onSelectionChange={onSelectionChange} note={<TextField className={`${styles.full} ${styles.gmNote}`} label="GM-only note for Themes" value={form.gm_messages?.themes} update={updateGmMessage} field="themes" />}><RepeatableTextList label="Themes" values={form.themes} onChange={(value) => update('themes', value)} addLabel="theme" placeholder="A theme" selectionKey="themes" selections={selections} onSelectionChange={onSelectionChange} /></SectionFields>}
    {showSection('touchstones') && <SectionFields selectionKey="touchstones_section" selections={selections} onSelectionChange={onSelectionChange} note={<TextField className={`${styles.full} ${styles.gmNote}`} label="GM-only note for Touchstones" value={form.gm_messages?.touchstones} update={updateGmMessage} field="touchstones" />}><RepeatableTextList label="Touchstones" values={form.touchstones} onChange={(value) => update('touchstones', value)} addLabel="touchstone" placeholder="A touchstone" selectionKey="touchstones" selections={selections} onSelectionChange={onSelectionChange} /></SectionFields>}
    {showSection('overview') && <SectionFields selectionKey="overview" selections={selections} onSelectionChange={onSelectionChange} note={<TextField className={`${styles.full} ${styles.gmNote}`} label="GM-only note for Overview" value={form.gm_messages?.overview} update={updateGmMessage} field="overview" />}><TextField label="Overview" value={form.overview} update={update} field="overview" required /></SectionFields>}
    {frameModificationKinds.map((kind) => showSection(kind.id) && <SectionFields key={kind.id} selectionKey={kind.id === 'communities' ? 'modifications' : undefined} selections={selections} onSelectionChange={onSelectionChange} note={<TextField className={`${styles.full} ${styles.gmNote}`} label={`GM-only note for ${kind.label}`} value={form.gm_messages?.[kind.id]} update={updateGmMessage} field={kind.id} />}><ModificationList kind={kind} frameName={form.name} entries={form.modifications?.[kind.id] || []} options={availableOptions[kind.id] || []} onChange={(entries) => updateModification(kind.id, entries)} selections={selections} onSelectionChange={onSelectionChange} /></SectionFields>)}
    {showSection('player_principles') && <SectionFields selectionKey="player_principles_section" selections={selections} onSelectionChange={onSelectionChange} note={<TextField className={`${styles.full} ${styles.gmNote}`} label="GM-only note for Player principles" value={form.gm_messages?.player_principles} update={updateGmMessage} field="player_principles" />}><RepeatableTextList label="Player principles" values={form.player_principles} onChange={(value) => update('player_principles', value)} addLabel="principle" titlePrefix="Player principle" placeholder="A principle for players" titledEntries selectionKey="player_principles" selections={selections} onSelectionChange={onSelectionChange} /></SectionFields>}
    {showSection('gm_principles') && <SectionFields selectionKey="gm_principles_section" selections={selections} onSelectionChange={onSelectionChange} note={<TextField className={`${styles.full} ${styles.gmNote}`} label="GM-only note for GM principles" value={form.gm_messages?.gm_principles} update={updateGmMessage} field="gm_principles" />}><RepeatableTextList label="GM principles" values={form.gm_principles} onChange={(value) => update('gm_principles', value)} addLabel="principle" titlePrefix="GM principle" placeholder="A principle for the GM" titledEntries selectionKey="gm_principles" selections={selections} onSelectionChange={onSelectionChange} /></SectionFields>}
    {showSection('distinctions') && <SectionFields selectionKey="distinctions_section" selections={selections} onSelectionChange={onSelectionChange} note={<TextField className={`${styles.full} ${styles.gmNote}`} label="GM-only note for Distinctions" value={form.gm_messages?.distinctions} update={updateGmMessage} field="distinctions" />}><RepeatableTextList label="Distinctions" values={form.distinctions} onChange={(value) => update('distinctions', value)} addLabel="distinction" titlePrefix="Distinction" placeholder="A distinction" titledEntries selectionKey="distinctions" selections={selections} onSelectionChange={onSelectionChange} /></SectionFields>}
    {showSection('inciting_incident') && <SectionFields selectionKey="inciting_incident" selections={selections} onSelectionChange={onSelectionChange} note={<TextField className={`${styles.full} ${styles.gmNote}`} label="GM-only note for The inciting incident" value={form.gm_messages?.inciting_incident} update={updateGmMessage} field="inciting_incident" />}><TextField label="The inciting incident" value={form.inciting_incident} update={update} field="inciting_incident" /></SectionFields>}
    {showSection('campaign_mechanics') && <SectionFields selectionKey="campaign_mechanics_section" selections={selections} onSelectionChange={onSelectionChange} note={<TextField className={`${styles.full} ${styles.gmNote}`} label="GM-only note for Campaign mechanics" value={form.gm_messages?.campaign_mechanics} update={updateGmMessage} field="campaign_mechanics" />}><RepeatableTextList label="Campaign mechanics" values={form.campaign_mechanics} onChange={(value) => update('campaign_mechanics', value)} addLabel="mechanic" titlePrefix="Campaign mechanic" placeholder="A campaign rule or procedure" tableEditor titledEntries selectionKey="campaign_mechanics" selections={selections} onSelectionChange={onSelectionChange} /></SectionFields>}
    {showSection('session_zero_questions') && <SectionFields selectionKey="session_zero_questions_section" selections={selections} onSelectionChange={onSelectionChange} note={<TextField className={`${styles.full} ${styles.gmNote}`} label="GM-only note for Session-zero questions" value={form.gm_messages?.session_zero_questions} update={updateGmMessage} field="session_zero_questions" />}><RepeatableTextList label="Session-zero questions" values={form.session_zero_questions} onChange={(value) => update('session_zero_questions', value)} addLabel="question" placeholder="A question for session zero" selectionKey="session_zero_questions" selections={selections} onSelectionChange={onSelectionChange} /></SectionFields>}
  </div>;
}

function SectionFields({ note, children, selectionKey, selections, onSelectionChange }) {
  return <div className={styles.sectionFields}>
    {selectionKey && <label className={styles.sectionVisibility}><input type="checkbox" checked={selections?.[selectionKey] !== false} onChange={(event) => onSelectionChange(selectionKey, event.target.checked)} /><span>Use this section in play</span></label>}
    {note}{children}
  </div>;
}

function TextField({ label, value, update, field, hint, required = false, className = '' }) {
  const stripNewlines = () => update(field, normalizeNewlineRuns(value));
  return <label className={className}>{label}{hint && <small>{hint}</small>}<span className={styles.textareaControl}><textarea required={required} value={value || ''} onChange={(event) => update(field, event.target.value)} /><button type="button" className={styles.stripNewlines} onClick={stripNewlines} title="Normalize line breaks" aria-label={`Normalize line breaks in ${label}`}>Normalize line breaks</button></span></label>;
}

function normalizeNewlineRuns(value) {
  return String(value || '').replace(/(?:\r\n|\r|\n)+/g, (run) => {
    const newlineCount = run.match(/\r\n|\r|\n/g)?.length || 0;
    return newlineCount > 1 ? '\n' : ' ';
  });
}

export function RepeatableTextList({ label, values, onChange, addLabel = 'item', titlePrefix, placeholder, tableEditor = false, titledEntries = false, selectionKey, selections, onSelectionChange = () => {} }) {
  const items = Array.isArray(values) ? values : [];
  const itemValue = (item) => typeof item === 'object' && item !== null ? item.description ?? item.text ?? item.value ?? item.title ?? '' : item;
  const itemTitle = (item, index) => typeof item === 'object' && item !== null ? item.title ?? `${titlePrefix || label} ${index + 1}` : `${titlePrefix || label} ${index + 1}`;
  const updateItem = (index, value) => onChange(items.map((item, itemIndex) => {
    if (itemIndex !== index) return item;
    return typeof item === 'object' && item !== null ? { ...item, description: value } : titledEntries ? { title: itemTitle(item, index), description: value } : value;
  }));
  const updateItemTitle = (index, value) => onChange(items.map((item, itemIndex) => {
    if (itemIndex !== index) return item;
    return typeof item === 'object' && item !== null ? { ...item, title: value } : { title: value, description: item };
  }));
  const removeItem = (index) => onChange(items.filter((_, itemIndex) => itemIndex !== index));
  const entryId = (item, index) => typeof item === 'object' && item !== null ? item.id || `${label}-${index}` : `${label}-${index}`;
  const updateItemSelection = (item, index, value) => onSelectionChange(selectionKey, { ...(selections?.[selectionKey] || {}), [entryId(item, index)]: value });
  const updateItemTable = (index, table) => onChange(items.map((item, itemIndex) => {
    if (itemIndex !== index) return item;
    return typeof item === 'object' && item !== null ? { ...item, table } : titledEntries ? { title: itemTitle(item, index), description: item, table } : { description: item, table };
  }));
  return <fieldset className={styles.repeatableList}>
    <legend>{label}</legend>
    {items.map((item, index) => <div className={styles.repeatableItem} key={entryId(item, index)}>
      {selectionKey && <label className={styles.entryVisibility}><input type="checkbox" checked={selections?.[selectionKey]?.[entryId(item, index)] !== false} onChange={(event) => updateItemSelection(item, index, event.target.checked)} /><span>Use</span></label>}
      {typeof item === 'object' && item?.origin && <span className={item.origin === 'custom' ? styles.customOrigin : styles.sourceOrigin}>{item.origin === 'custom' ? 'Added by GM' : 'Source content'}</span>}
      <div className={styles.repeatableFields}>
        {titledEntries && <label className={styles.repeatableTitle}>{label} {index + 1} title<input required value={itemTitle(item, index)} onChange={(event) => updateItemTitle(index, event.target.value)} /></label>}
        <TextField className={styles.repeatableField} label={`${label} ${index + 1} description`} value={itemValue(item)} update={(_field, value) => updateItem(index, value)} field="value" hint={placeholder} required={titledEntries || typeof item === 'object'} />
      </div>
      <button type="button" className={styles.removeButton} onClick={() => removeItem(index)} aria-label={`Remove ${label} ${index + 1}`}>Remove</button>
      {tableEditor && <TableEditor table={item?.table} onChange={(table) => updateItemTable(index, table)} label={`${label} ${index + 1} table`} />}
    </div>)}
    <button type="button" className={styles.smallButton} onClick={() => onChange([...items, newRepeatableEntry(titlePrefix || label, items.length + 1, titledEntries)])}>Add {addLabel}</button>
  </fieldset>;
}

function normalizeTable(table) {
  if (!table || typeof table !== 'object') return null;
  const headers = Array.isArray(table.headers) ? table.headers.map((header) => String(header ?? '')) : [];
  const rows = Array.isArray(table.rows) ? table.rows.map((row) => headers.map((_, index) => String(row?.[index] ?? ''))) : [];
  return { ...table, headers, rows };
}

export function TableEditor({ table, onChange, label = 'Table' }) {
  const normalized = normalizeTable(table);
  const setupId = `table-setup-${useId().replace(/:/g, '')}`;
  const [setupOpen, setSetupOpen] = useState(false);
  const [initialRows, setInitialRows] = useState(2);
  const [initialColumns, setInitialColumns] = useState(2);
  const createTable = () => {
    onChange({
      headers: Array.from({ length: initialColumns }, (_, index) => `Column ${index + 1}`),
      rows: Array.from({ length: initialRows }, () => Array.from({ length: initialColumns }, () => '')),
    });
    setSetupOpen(false);
  };
  const updateTable = (nextTable) => onChange(normalizeTable(nextTable));
  const updateHeader = (index, value) => updateTable({ ...normalized, headers: normalized.headers.map((header, headerIndex) => headerIndex === index ? value : header) });
  const updateCell = (rowIndex, columnIndex, value) => updateTable({ ...normalized, rows: normalized.rows.map((row, currentRow) => currentRow === rowIndex ? row.map((cell, currentColumn) => currentColumn === columnIndex ? value : cell) : row) });
  const addRow = () => updateTable({ ...normalized, rows: [...normalized.rows, normalized.headers.map(() => '')] });
  const removeRow = (index) => updateTable({ ...normalized, rows: normalized.rows.filter((_, rowIndex) => rowIndex !== index) });
  const addColumn = () => updateTable({ headers: [...normalized.headers, `Column ${normalized.headers.length + 1}`], rows: normalized.rows.map((row) => [...row, '']) });
  const removeColumn = (index) => updateTable({ headers: normalized.headers.filter((_, columnIndex) => columnIndex !== index), rows: normalized.rows.map((row) => row.filter((_, columnIndex) => columnIndex !== index)) });
  if (!normalized) return <fieldset className={styles.tableEditor}><legend>{label}</legend><button type="button" className={styles.smallButton} aria-expanded={setupOpen} aria-controls={setupId} onClick={() => setSetupOpen((current) => !current)}>Add table</button>{setupOpen && <div id={setupId} className={styles.tableSetup} role="dialog" aria-label={`Set up ${label}`}><label>Rows<input type="number" min="1" max="50" value={initialRows} onChange={(event) => setInitialRows(Math.min(50, Math.max(1, Number(event.target.value) || 1)))} /></label><label>Columns<input type="number" min="1" max="20" value={initialColumns} onChange={(event) => setInitialColumns(Math.min(20, Math.max(1, Number(event.target.value) || 1)))} /></label><div className={styles.tableSetupActions}><button type="button" className={styles.smallButton} onClick={createTable}>Create table</button><button type="button" className={styles.removeButton} onClick={() => setSetupOpen(false)}>Cancel</button></div></div>}</fieldset>;
  return <fieldset className={styles.tableEditor}><legend>{label}</legend><div className={styles.tableActions}><button type="button" className={styles.smallButton} onClick={addRow}>Add row</button><button type="button" className={styles.smallButton} onClick={addColumn}>Add column</button><button type="button" className={styles.removeButton} onClick={() => onChange(undefined)}>Remove table</button></div><div className={styles.tableScroll}><table><thead><tr>{normalized.headers.map((header, index) => <th key={`header-${index}`}><input aria-label={`${label} column ${index + 1}`} value={header} onChange={(event) => updateHeader(index, event.target.value)} /><button type="button" className={styles.removeButton} onClick={() => removeColumn(index)} aria-label={`Remove ${label} column ${index + 1}`}>Remove</button></th>)}</tr></thead><tbody>{normalized.rows.map((row, rowIndex) => <tr key={`row-${rowIndex}`}>{row.map((cell, columnIndex) => <td key={`cell-${rowIndex}-${columnIndex}`}><input aria-label={`${label} row ${rowIndex + 1} column ${columnIndex + 1}`} value={cell} onChange={(event) => updateCell(rowIndex, columnIndex, event.target.value)} /></td>)}<td><button type="button" className={styles.removeButton} onClick={() => removeRow(rowIndex)} aria-label={`Remove ${label} row ${rowIndex + 1}`}>Remove row</button></td></tr>)}</tbody></table></div></fieldset>;
}

function ModificationList({ kind, frameName, entries, options, onChange, selections = {}, onSelectionChange = () => {} }) {
  const [selectedTargetId, setSelectedTargetId] = useState(options[0]?.id || '');
  useEffect(() => {
    if (!options.some((option) => option.id === selectedTargetId)) setSelectedTargetId(options[0]?.id || '');
  }, [options, selectedTargetId]);

  const entriesWithIds = autoFeatureIds(entries, kind.id, frameName, options);
  const updateEntries = (nextEntries) => onChange(autoFeatureIds(preserveFrameEntryMapShape(nextEntries, entries), kind.id, frameName, options));
  const updateEntry = (index, field, value) => updateEntries(entries.map((entry, entryIndex) => entryIndex === index ? { ...entry, [field]: value } : entry));
  const addEntry = () => updateEntries([...entries, { ...newModificationEntry(kind.id, entries.length + 1), target_ids: selectedTargetId ? [selectedTargetId] : [] }]);
  const removeEntry = (index) => updateEntries(entries.filter((_, entryIndex) => entryIndex !== index));
  return <section className={styles.modificationSection}>
    <div className={styles.modificationHeader}><div><h4>{kind.label}</h4><p>Add a feature for a selected {kind.optionLabel}. A feature can be assigned to more than one {kind.optionLabel} after it is created.</p></div><div className={styles.addFeatureControls}><select aria-label={`${kind.optionLabel} to add`} value={selectedTargetId} onChange={(event) => setSelectedTargetId(event.target.value)}><option value="">All {kind.optionPlural}</option>{options.map((option) => <option value={option.id} key={option.id}>{option.name || option.id}</option>)}</select><button type="button" className={styles.smallButton} onClick={addEntry}>Add {kind.optionLabel}</button></div></div>
    {entriesWithIds.map((entry, index) => <article className={styles.modificationEntry} key={entry.id || `${kind.id}-${index}`}>
      <div className={styles.entryVisibility}><label><input type="checkbox" checked={selections?.[kind.id]?.[entry.id] !== false} onChange={(event) => onSelectionChange(kind.id, { ...(selections?.[kind.id] || {}), [entry.id]: event.target.checked })} /> Use feature</label><span className={entry.origin === 'custom' ? styles.customOrigin : styles.sourceOrigin}>{entry.origin === 'custom' ? 'Added by GM' : 'Source content'}</span></div>
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

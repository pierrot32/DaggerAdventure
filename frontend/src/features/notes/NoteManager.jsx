import { useEffect, useMemo, useState } from 'react';
import Button from '../../components/Button/Button';
import styles from './NoteManager.module.css';

const emptyDraft = (sectionId = '') => ({ id: null, title: '', body: '', section_id: sectionId, position: 0 });

export default function NoteManager({
  title = 'Notes',
  eyebrow = 'NOTEBOOK',
  sections = [],
  notes = [],
  loading = false,
  saving = false,
  error = '',
  message = '',
  readOnly = false,
  onSaveNote,
  onDeleteNote,
  onCreateSection,
  onRenameSection,
  onDeleteSection,
  onMoveNote,
  onRetry,
}) {
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [selectedNoteId, setSelectedNoteId] = useState(null);
  const [draft, setDraft] = useState(emptyDraft());
  const [dirty, setDirty] = useState(false);
  const [sectionName, setSectionName] = useState('');
  const [newSectionName, setNewSectionName] = useState('');
  const [blockedSectionId, setBlockedSectionId] = useState(null);

  const orderedSections = useMemo(() => [...sections].sort((a, b) => a.position - b.position), [sections]);
  const orderedNotes = useMemo(() => [...notes].sort((a, b) => a.position - b.position), [notes]);
  const activeSectionId = selectedSectionId && orderedSections.some((section) => section.id === selectedSectionId)
    ? selectedSectionId
    : orderedSections[0]?.id || '';
  const sectionNotes = orderedNotes.filter((note) => note.section_id === activeSectionId);
  const activeSection = orderedSections.find((section) => section.id === activeSectionId);

  useEffect(() => {
    if (activeSectionId !== selectedSectionId) setSelectedSectionId(activeSectionId);
  }, [activeSectionId, selectedSectionId]);

  useEffect(() => {
    if (activeSection) setSectionName(activeSection.name);
  }, [activeSection]);

  useEffect(() => {
    if (!blockedSectionId || orderedSections.some((section) => section.id === blockedSectionId)) return;
    const remainingSection = orderedSections.find((section) => section.id);
    if (!remainingSection) return;
    setBlockedSectionId(null);
    if (dirty && draft.section_id === blockedSectionId) {
      setSelectedSectionId(remainingSection.id);
      setSelectedNoteId(null);
      setDraft((current) => ({ ...current, section_id: remainingSection.id }));
    }
  }, [blockedSectionId, dirty, draft.section_id, orderedSections]);

  useEffect(() => {
    if (dirty) return;
    const selected = orderedNotes.find((note) => note.id === selectedNoteId && note.section_id === activeSectionId) || sectionNotes[0];
    setSelectedNoteId(selected?.id || null);
    setDraft(selected ? { ...selected } : emptyDraft(activeSectionId));
  }, [activeSectionId, dirty, orderedNotes, sectionNotes, selectedNoteId]);

  const chooseNote = (note) => {
    if (dirty && !window.confirm('Discard unsaved note changes?')) return;
    setSelectedNoteId(note.id);
    setDraft({ ...note });
    setDirty(false);
  };

  const startNewNote = () => {
    if (dirty && !window.confirm('Discard unsaved note changes?')) return;
    setSelectedNoteId(null);
    setDraft(emptyDraft(activeSectionId));
    setDirty(false);
  };

  const save = async (event) => {
    event.preventDefault();
    const targetSectionId = draft.section_id || activeSectionId;
    if (!targetSectionId || targetSectionId === blockedSectionId || !orderedSections.some((section) => section.id === targetSectionId)) return;
    const saved = await onSaveNote({ ...draft, section_id: targetSectionId });
    if (saved) {
      setSelectedNoteId(saved.id);
      setSelectedSectionId(saved.section_id);
      setDraft({ ...saved });
      setDirty(false);
    }
  };

  const remove = async () => {
    if (!draft.id || !window.confirm('Delete this note?')) return;
    const deleted = await onDeleteNote(draft.id);
    if (!deleted) return;
    setSelectedNoteId(null);
    setDraft(emptyDraft(activeSectionId));
    setDirty(false);
  };

  const createSection = async (event) => {
    event.preventDefault();
    if (dirty && !window.confirm('Discard unsaved note changes?')) return;
    const created = await onCreateSection(newSectionName);
    if (created) {
      setNewSectionName('');
      setSelectedSectionId(created.id);
      setSelectedNoteId(null);
      setDraft(emptyDraft(created.id));
      setDirty(false);
    }
  };

  const deleteSection = async () => {
    if (!activeSection) return;
    const sectionId = activeSection.id;
    const draftSectionId = draft.section_id || activeSectionId;
    const draftTargetsDeletedSection = dirty && draftSectionId === sectionId;
    if (draftTargetsDeletedSection && !window.confirm('Delete this section and keep the unsaved note draft in another section?')) return;
    const deletion = await onDeleteSection(sectionId);
    if (!deletion || deletion.deleted !== true) return;
    const canonicalSections = Array.isArray(deletion.sections) ? deletion.sections : null;
    const remainingSection = canonicalSections?.find((section) => section?.id && section.id !== sectionId);
    if (!remainingSection) {
      setBlockedSectionId(deletion.deletedSectionId || sectionId);
      return;
    }
    setBlockedSectionId(null);
    if (draftTargetsDeletedSection) {
      setSelectedSectionId(remainingSection?.id || '');
      setSelectedNoteId(null);
      setDraft({ ...draft, section_id: remainingSection?.id || '' });
      setDirty(true);
    }
  };

  const renameSection = async (event) => {
    event.preventDefault();
    if (activeSection) await onRenameSection(activeSection.id, sectionName);
  };

  const move = async (note, sectionId, position) => {
    if (readOnly) return;
    if (dirty && !window.confirm('Discard unsaved note changes?')) return;
    const moved = await onMoveNote(note, sectionId, position);
    if (moved) {
      setSelectedSectionId(sectionId);
      setSelectedNoteId(moved.id);
      setDraft({ ...moved });
      setDirty(false);
    }
  };

  const handleDragStart = (event, note) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', note.id);
  };

  const handleDrop = async (event, targetSectionId, targetPosition) => {
    event.preventDefault();
    const note = orderedNotes.find((item) => item.id === event.dataTransfer.getData('text/plain'));
    if (note) await move(note, targetSectionId, targetPosition);
  };

  return <section className={styles.manager}>
    <div className={styles.heading}><div><p className="eyebrow">{eyebrow}</p><h3>{title}</h3></div>{!readOnly && <Button type="button" variant="text" onClick={startNewNote}>New note</Button>}</div>
    {loading ? <p className="muted">Loading notes...</p> : <div className={styles.layout}>
      <aside className={styles.sidebar} aria-label={`${title} sections`}>
        <div className={styles.sectionList}>{orderedSections.map((section) => <button type="button" key={section.id} className={section.id === activeSectionId ? styles.selectedSection : ''} onClick={() => { if (!dirty || window.confirm('Discard unsaved note changes?')) { setSelectedSectionId(section.id); setDirty(false); } }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, section.id, orderedNotes.filter((note) => note.section_id === section.id).length)}>{section.name}<span>{orderedNotes.filter((note) => note.section_id === section.id).length}</span></button>)}</div>
        {!readOnly && <form className={styles.inlineForm} onSubmit={createSection}><label htmlFor={`${title}-new-section`}>New section</label><div><input id={`${title}-new-section`} maxLength="80" value={newSectionName} onChange={(event) => setNewSectionName(event.target.value)} placeholder="Section name" required /><Button type="submit" variant="text">Add</Button></div></form>}
      </aside>
      <div className={styles.content}>
        {activeSection && <div className={styles.sectionTools}><form onSubmit={renameSection}><label htmlFor={`${title}-section-name`}>Section name</label><div><input id={`${title}-section-name`} maxLength="80" value={sectionName} onChange={(event) => setSectionName(event.target.value)} disabled={readOnly} /><Button type="submit" variant="text" disabled={readOnly || saving}>Rename</Button></div></form>{!readOnly && <Button type="button" variant="text" onClick={deleteSection} disabled={saving}>Delete section</Button>}</div>}
        <div className={styles.noteList} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, activeSectionId, sectionNotes.length)}>
          {sectionNotes.map((note, index) => <article className={`${styles.noteCard} ${note.id === selectedNoteId ? styles.selectedNote : ''}`} key={note.id} draggable={!readOnly} onDragStart={(event) => handleDragStart(event, note)} onClick={() => chooseNote(note)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); chooseNote(note); } }} tabIndex="0" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.stopPropagation(); handleDrop(event, activeSectionId, index); }}><div><strong>{note.title}</strong><span>{new Date(note.updated_at).toLocaleDateString()}</span></div><p>{note.body}</p>{!readOnly && <div className={styles.moveActions}><Button type="button" variant="text" disabled={saving || index === 0} onClick={(event) => { event.stopPropagation(); move(note, activeSectionId, index - 1); }}>Move up</Button><Button type="button" variant="text" disabled={saving || index === sectionNotes.length - 1} onClick={(event) => { event.stopPropagation(); move(note, activeSectionId, index + 1); }}>Move down</Button><select aria-label={`Move ${note.title} to a section`} value={note.section_id} disabled={saving} onClick={(event) => event.stopPropagation()} onChange={(event) => move(note, event.target.value, orderedNotes.filter((item) => item.section_id === event.target.value).length)}>{orderedSections.map((section) => <option value={section.id} key={section.id}>{section.name}</option>)}</select></div>}</article>)}
          {sectionNotes.length === 0 && <p className="muted">No notes in this section yet.</p>}
        </div>
        {readOnly ? <p className={styles.readOnly} role="status">Read-only view for the adventure GM.</p> : <form className={styles.editor} onSubmit={save}><label>Title<input required maxLength="160" value={draft.title} onChange={(event) => { setDraft({ ...draft, title: event.target.value }); setDirty(true); }} /></label><label>Note body<textarea required maxLength="10000" value={draft.body} onChange={(event) => { setDraft({ ...draft, body: event.target.value }); setDirty(true); }} /></label><label>Section<select value={draft.section_id || activeSectionId} onChange={(event) => { setDraft({ ...draft, section_id: event.target.value }); setDirty(true); }}>{orderedSections.map((section) => <option value={section.id} key={section.id}>{section.name}</option>)}</select></label><div className={styles.actions}><Button type="submit" disabled={saving || blockedSectionId === (draft.section_id || activeSectionId)}>{saving ? 'Saving...' : 'Save note'}</Button>{draft.id && <Button type="button" variant="text" onClick={remove} disabled={saving}>Delete note</Button>}</div></form>}
      </div>
    </div>}
    {message && <p className="muted" role="status">{message}</p>}{error && <p className={styles.error} role="alert">{error}</p>}{error && onRetry && <Button type="button" variant="text" onClick={onRetry} disabled={loading || saving}>Retry loading notes</Button>}
  </section>;
}

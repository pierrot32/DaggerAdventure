import { useEffect, useMemo, useRef, useState } from 'react';
import Button from '../../components/Button/Button';
import styles from './NoteManager.module.css';

const emptyDraft = (sectionId = '', position = 0) => ({ id: null, title: '', body: '', section_id: sectionId, position });
const notePosition = (notes, sectionId, selectedNoteId) => {
  const sectionNotes = notes.filter((note) => note.section_id === sectionId);
  const selectedIndex = sectionNotes.findIndex((note) => note.id === selectedNoteId);
  return selectedIndex === -1 ? sectionNotes.length : selectedIndex + 1;
};

export default function NoteManager({ title = 'Notes', eyebrow = 'NOTEBOOK', sections = [], notes = [], loading = false, saving = false, error = '', message = '', readOnly = false, onSaveNote, onDeleteNote, onCreateSection, onRenameSection, onDeleteSection, onMoveNote, onRetry }) {
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [expandedSections, setExpandedSections] = useState({});
  const [selectedNoteId, setSelectedNoteId] = useState(null);
  const [draft, setDraft] = useState(emptyDraft());
  const [dirty, setDirty] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [addingSection, setAddingSection] = useState(false);
  const [editingSectionId, setEditingSectionId] = useState(null);
  const [sectionName, setSectionName] = useState('');
  const [blockedSectionId, setBlockedSectionId] = useState(null);
  const [keyboardDrag, setKeyboardDrag] = useState(null);
  const renameActionRef = useRef('idle');

  const orderedSections = useMemo(() => [...sections].sort((a, b) => a.position - b.position), [sections]);
  const orderedNotes = useMemo(() => [...notes].sort((a, b) => a.position - b.position), [notes]);
  const activeSectionId = selectedSectionId && orderedSections.some((section) => section.id === selectedSectionId) ? selectedSectionId : orderedSections[0]?.id || '';
  const activeSection = orderedSections.find((section) => section.id === activeSectionId);
  const activeNotes = useMemo(() => orderedNotes.filter((note) => note.section_id === activeSectionId), [activeSectionId, orderedNotes]);
  const selectedNote = orderedNotes.find((note) => note.id === selectedNoteId && note.section_id === activeSectionId);

  useEffect(() => {
    if (!activeSectionId) return;
    if (activeSectionId !== selectedSectionId) setSelectedSectionId(activeSectionId);
    setExpandedSections((current) => current[activeSectionId] ? current : { ...current, [activeSectionId]: true });
  }, [activeSectionId, selectedSectionId]);

  useEffect(() => {
    if (!blockedSectionId || orderedSections.some((section) => section.id === blockedSectionId)) return;
    const remainingSection = orderedSections.find((section) => section.id);
    if (!remainingSection) return;
    setBlockedSectionId(null);
    if (dirty && draft.section_id === blockedSectionId) {
      setSelectedSectionId(remainingSection.id);
      setExpandedSections((current) => ({ ...current, [remainingSection.id]: true }));
      setSelectedNoteId(null);
      setDraft((current) => ({ ...current, section_id: remainingSection.id }));
    }
  }, [blockedSectionId, dirty, draft.section_id, orderedSections]);

  useEffect(() => {
    if (dirty || creating) return;
    const nextNote = selectedNote || activeNotes[0];
    setSelectedNoteId(nextNote?.id || null);
    setDraft(nextNote ? { ...nextNote } : emptyDraft(activeSectionId, activeNotes.length));
  }, [activeNotes, activeSectionId, creating, dirty, selectedNote]);

  const confirmDiscard = () => !dirty || window.confirm('Discard unsaved note changes?');
  const toggleSection = (sectionId) => { if (!confirmDiscard()) return; setExpandedSections((current) => ({ ...current, [sectionId]: !current[sectionId] })); setSelectedSectionId(sectionId); setSelectedNoteId(null); setCreating(false); setDirty(false); };
  const chooseNote = (note) => { if (!confirmDiscard()) return false; setSelectedSectionId(note.section_id); setExpandedSections((current) => ({ ...current, [note.section_id]: true })); setSelectedNoteId(note.id); setCreating(false); setDraft({ ...note }); setDirty(false); return true; };
  const startNewNote = () => { if (!confirmDiscard()) return; setSelectedNoteId(null); setCreating(true); setDraft(emptyDraft(activeSectionId, notePosition(orderedNotes, activeSectionId, selectedNoteId))); setDirty(false); };

  const save = async (event) => {
    event.preventDefault();
    const targetSectionId = draft.section_id || activeSectionId;
    if (!targetSectionId || targetSectionId === blockedSectionId || !orderedSections.some((section) => section.id === targetSectionId)) return;
    const position = draft.id ? draft.position : draft.position ?? notePosition(orderedNotes, targetSectionId, selectedNoteId);
    const saved = await onSaveNote({ ...draft, section_id: targetSectionId, position });
    if (saved) { setSelectedSectionId(saved.section_id); setExpandedSections((current) => ({ ...current, [saved.section_id]: true })); setSelectedNoteId(saved.id); setCreating(false); setDraft({ ...saved }); setDirty(false); }
  };

  const remove = async () => {
    if (!draft.id || !window.confirm('Delete this note?')) return;
    const deleted = await onDeleteNote(draft.id);
    if (!deleted) return;
    setSelectedNoteId(null); setCreating(false); setDraft(emptyDraft(activeSectionId, activeNotes.length)); setDirty(false);
  };

  const createSection = async (event) => {
    event.preventDefault();
    if (!confirmDiscard()) return;
    const created = await onCreateSection(newSectionName);
    if (created) { setNewSectionName(''); setAddingSection(false); setSelectedSectionId(created.id); setExpandedSections((current) => ({ ...current, [created.id]: true })); setSelectedNoteId(null); setCreating(true); setDraft(emptyDraft(created.id)); setDirty(false); }
  };

  const startRename = (section) => { if (readOnly || saving || !confirmDiscard()) return; renameActionRef.current = 'editing'; setEditingSectionId(section.id); setSectionName(section.name); };
  const finishRename = async (saveChange) => {
    if (renameActionRef.current === 'finished') return;
    renameActionRef.current = 'finished';
    const section = orderedSections.find((item) => item.id === editingSectionId);
    setEditingSectionId(null);
    if (!saveChange || !section || !sectionName.trim() || sectionName.trim() === section.name) return;
    await onRenameSection(section.id, sectionName.trim());
  };

  const deleteSection = async () => {
    if (!activeSection) return;
    const sectionId = activeSection.id;
    const draftTargetsDeletedSection = dirty && (draft.section_id || activeSectionId) === sectionId;
    if (draftTargetsDeletedSection && !window.confirm('Delete this section and keep the unsaved note draft in another section?')) return;
    const deletion = await onDeleteSection(sectionId);
    if (!deletion || deletion.deleted !== true) return;
    const canonicalSections = Array.isArray(deletion.sections) ? deletion.sections : null;
    const remainingSection = canonicalSections?.find((section) => section?.id && section.id !== sectionId);
    if (!remainingSection) { setBlockedSectionId(deletion.deletedSectionId || sectionId); return; }
    setBlockedSectionId(null); setSelectedSectionId(remainingSection.id); setExpandedSections((current) => ({ ...current, [remainingSection.id]: true })); setSelectedNoteId(null);
    if (draftTargetsDeletedSection) { setCreating(true); setDraft((current) => ({ ...current, section_id: remainingSection.id })); setDirty(true); } else { setCreating(false); setDirty(false); }
  };

  const dropPosition = (note, sectionId, targetNoteId) => {
    const targetNotes = orderedNotes.filter((item) => item.section_id === sectionId);
    const sameSection = note.section_id === sectionId;
    const sourceIndex = sameSection ? targetNotes.findIndex((item) => item.id === note.id) : -1;
    const targetCount = targetNotes.length - Number(sameSection);
    if (targetNoteId === null) return targetCount;
    const targetIndex = targetNotes.findIndex((item) => item.id === targetNoteId);
    if (targetIndex === -1) return null;
    return sameSection && sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
  };
  const move = async (note, sectionId, targetNoteId) => {
    if (readOnly || (dirty && !confirmDiscard())) return;
    const position = dropPosition(note, sectionId, targetNoteId);
    if (position === null) return false;
    const moved = await onMoveNote(note, sectionId, position);
    if (moved) { setSelectedSectionId(sectionId); setExpandedSections((current) => ({ ...current, [sectionId]: true })); setSelectedNoteId(moved.id); setDraft({ ...moved }); setDirty(false); return true; }
    return false;
  };
  const handleDragStart = (event, note) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', note.id); };
  const handleDrop = async (event, targetSectionId, targetNoteId = null) => {
    event.preventDefault();
    const note = orderedNotes.find((item) => item.id === event.dataTransfer.getData('text/plain'));
    if (note) await move(note, targetSectionId, targetNoteId);
  };
  const dropCandidates = (note, sectionId) => orderedNotes.filter((item) => item.section_id === sectionId && item.id !== note.id);
  const candidateIndex = (candidates, targetNoteId) => targetNoteId === null ? candidates.length : candidates.findIndex((item) => item.id === targetNoteId);
  const startKeyboardDrag = (note) => {
    if (readOnly || !chooseNote(note)) return;
    const candidates = dropCandidates(note, note.section_id);
    const sourceIndex = orderedNotes.filter((item) => item.section_id === note.section_id).findIndex((item) => item.id === note.id);
    setKeyboardDrag({ noteId: note.id, targetSectionId: note.section_id, targetNoteId: candidates[sourceIndex]?.id || null });
  };
  const moveKeyboardTarget = (note, direction) => {
    const currentSectionIndex = orderedSections.findIndex((section) => section.id === keyboardDrag.targetSectionId);
    const currentCandidates = dropCandidates(note, keyboardDrag.targetSectionId);
    const currentIndex = candidateIndex(currentCandidates, keyboardDrag.targetNoteId);
    if (direction === 'up' || direction === 'down') {
      const nextIndex = Math.max(0, Math.min(currentCandidates.length, currentIndex + (direction === 'up' ? -1 : 1)));
      setKeyboardDrag((current) => ({ ...current, targetNoteId: currentCandidates[nextIndex]?.id || null }));
      return;
    }
    const nextSectionIndex = currentSectionIndex + (direction === 'left' ? -1 : 1);
    const nextSection = orderedSections[nextSectionIndex];
    if (!nextSection) return;
    const nextCandidates = dropCandidates(note, nextSection.id);
    const nextIndex = Math.min(currentIndex, nextCandidates.length);
    setKeyboardDrag((current) => ({ ...current, targetSectionId: nextSection.id, targetNoteId: nextCandidates[nextIndex]?.id || null }));
  };
  const handleNoteKeyDown = async (event, note) => {
    const isKeyboardDragging = keyboardDrag?.noteId === note.id;
    if (!isKeyboardDragging && event.key === ' ') { event.preventDefault(); startKeyboardDrag(note); return; }
    if (!isKeyboardDragging && event.key === 'Enter') { event.preventDefault(); chooseNote(note); return; }
    if (!isKeyboardDragging) return;
    if (event.key === 'Escape') { event.preventDefault(); setKeyboardDrag(null); return; }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault(); moveKeyboardTarget(note, { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[event.key]);
      return;
    }
    if (event.key === ' ') {
      event.preventDefault();
      const moved = await move(note, keyboardDrag.targetSectionId, keyboardDrag.targetNoteId);
      if (moved) setKeyboardDrag(null);
    }
  };

  const keyboardTargetSection = keyboardDrag && orderedSections.find((section) => section.id === keyboardDrag.targetSectionId);
  const keyboardTargetNote = keyboardDrag && orderedNotes.find((note) => note.id === keyboardDrag.targetNoteId);
  const keyboardStatus = keyboardDrag
    ? `Picked up ${orderedNotes.find((note) => note.id === keyboardDrag.noteId)?.title || 'untitled note'}. ${keyboardTargetSection?.name || 'Section'}: ${keyboardTargetNote ? `before ${keyboardTargetNote.title || 'untitled note'}` : 'at the bottom'}. Use arrow keys to change the target, Space to drop, or Escape to cancel.`
    : 'Focus a note title and press Space to pick it up. Use arrow keys to choose a section or insertion point, then press Space to drop.';
  const keyboardHelpId = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-keyboard-help`;

  return <section className={styles.manager}>
    <div className={styles.heading}><div><p className="eyebrow">{eyebrow}</p><h3>{title}</h3></div>{!readOnly && <Button type="button" variant="text" onClick={startNewNote}>New note</Button>}</div>
    {!readOnly && <p id={keyboardHelpId} className={styles.keyboardHelp} role="status" aria-live="polite">{keyboardStatus}</p>}
    {loading ? <p className="muted">Loading notes...</p> : <div className={styles.layout}>
      <aside className={styles.sidebar} aria-label={`${title} note navigator`}>
        {!readOnly && <div className={styles.sectionCreation}>{addingSection ? <form className={styles.inlineForm} onSubmit={createSection}><label htmlFor={`${title}-new-section`}>New section</label><div><input id={`${title}-new-section`} maxLength="80" value={newSectionName} onChange={(event) => setNewSectionName(event.target.value)} placeholder="Section name" required autoFocus /><Button type="submit" disabled={saving}>Add</Button><Button type="button" variant="text" onClick={() => { setAddingSection(false); setNewSectionName(''); }}>Cancel</Button></div></form> : <Button type="button" variant="text" onClick={() => setAddingSection(true)}>Add section</Button>}</div>}
        <div className={styles.sectionList}>{orderedSections.map((section) => {
          const sectionNotes = orderedNotes.filter((note) => note.section_id === section.id);
          const expanded = Boolean(expandedSections[section.id]);
          return <div className={`${styles.sectionGroup} ${section.id === activeSectionId ? styles.activeGroup : ''}`} key={section.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, section.id)}>
            <div className={styles.sectionHeader}>
              {editingSectionId === section.id ? <input className={styles.renameInput} value={sectionName} maxLength="80" onChange={(event) => setSectionName(event.target.value)} onBlur={() => finishRename(true)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); finishRename(true); } if (event.key === 'Escape') { event.preventDefault(); finishRename(false); } }} aria-label={`Rename ${section.name}`} autoFocus /> : <button type="button" className={styles.sectionButton} onClick={() => toggleSection(section.id)} aria-expanded={expanded}><span>{expanded ? '▾' : '▸'}</span><strong className={styles.sectionTitle} onDoubleClick={(event) => { event.stopPropagation(); startRename(section); }}>{section.name}</strong><span className={styles.count}>{sectionNotes.length}</span></button>}
              {!readOnly && section.id === activeSectionId && <Button type="button" variant="text" onClick={deleteSection} disabled={saving} aria-label={`Delete ${section.name}`}>Delete</Button>}
            </div>
            {expanded && <div className={styles.noteLinks}>{sectionNotes.map((note) => <button type="button" key={note.id} draggable={!readOnly} className={`${note.id === selectedNoteId ? styles.selectedNoteLink : ''} ${keyboardDrag?.targetNoteId === note.id ? styles.keyboardDropTarget : ''}`} aria-describedby={!readOnly ? keyboardHelpId : undefined} aria-pressed={keyboardDrag?.noteId === note.id} onClick={() => chooseNote(note)} onKeyDown={(event) => handleNoteKeyDown(event, note)} onDragStart={(event) => handleDragStart(event, note)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); handleDrop(event, section.id, note.id); }}><span>{note.title || 'Untitled note'}</span></button>)}</div>}
          </div>;
        })}</div>
      </aside>
      <div className={styles.content} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, activeSectionId)}>
        {activeSection && <div className={styles.contentHeading}><div><p className="eyebrow">{activeSection.name}</p><h4>{selectedNote ? selectedNote.title : 'New note'}</h4></div><span className="muted">{activeNotes.length} note{activeNotes.length === 1 ? '' : 's'}</span></div>}
        {readOnly ? <>{selectedNote ? <article className={styles.readOnlyNote}><h4>{selectedNote.title}</h4><p>{selectedNote.body}</p></article> : <p className={styles.readOnly} role="status">No note selected.</p>}<p className={styles.readOnly} role="status">Read-only view for the adventure GM.</p></> : <form className={styles.editor} onSubmit={save}><label>Title<input required maxLength="160" value={draft.title} onChange={(event) => { setDraft({ ...draft, title: event.target.value }); setDirty(true); }} /></label><label>Note body<textarea required maxLength="10000" value={draft.body} onChange={(event) => { setDraft({ ...draft, body: event.target.value }); setDirty(true); }} /></label><div className={styles.actions}><Button type="submit" disabled={saving || blockedSectionId === (draft.section_id || activeSectionId)}>{saving ? 'Saving...' : 'Save note'}</Button>{draft.id && <Button type="button" variant="text" onClick={remove} disabled={saving}>Delete note</Button>}</div></form>}
      </div>
    </div>}
    {message && <p className="muted" role="status">{message}</p>}{error && <p className={styles.error} role="alert">{error}</p>}{error && onRetry && <Button type="button" variant="text" onClick={onRetry} disabled={loading || saving}>Retry loading notes</Button>}
  </section>;
}

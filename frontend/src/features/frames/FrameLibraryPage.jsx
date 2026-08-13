import { useEffect, useState } from 'react';
import Button from '../../components/Button/Button';
import { createLibraryFrame, deleteLibraryFrame, listLibraryFrames, updateLibraryFrame } from './frameApi';
import { getCharacterCreationBook } from '../characters/characterApi';
import { contentToForm, draftToContent, emptyFrame } from './frameDraft';
import { FrameDraftForm, FramePreview } from '../adventures/CreateAdventurePage';
import styles from './FrameLibraryPage.module.css';

const emptyForm = () => contentToForm(emptyFrame());

export default function FrameLibraryPage() {
  const [frames, setFrames] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [book, setBook] = useState(null);
  const [state, setState] = useState({ loading: true, saving: false, error: '', message: '' });

  useEffect(() => {
    Promise.all([listLibraryFrames(), getCharacterCreationBook().catch(() => ({ content: null }))])
      .then(([items, nextBook]) => {
        setFrames(items);
        setBook(nextBook.content);
        setState({ loading: false, saving: false, error: '', message: '' });
      })
      .catch((error) => setState({ loading: false, saving: false, error: error.message, message: '' }));
  }, []);

  const selectFrame = (frame) => {
    setSelectedId(frame.id);
    setForm(contentToForm(frame.content));
    setState((current) => ({ ...current, error: '', message: '' }));
  };

  const startNew = () => {
    setSelectedId('');
    setForm(emptyForm());
    setState((current) => ({ ...current, error: '', message: '' }));
  };

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const save = async (event) => {
    event.preventDefault();
    const content = draftToContent(form);
    const payload = {
      name: content.name,
      description: content.description,
      complexity_rating: content.complexity_rating,
      content,
    };
    setState((current) => ({ ...current, saving: true, error: '', message: '' }));
    try {
      const saved = selectedId
        ? await updateLibraryFrame(selectedId, payload)
        : await createLibraryFrame(payload);
      setFrames((current) => selectedId ? current.map((frame) => frame.id === saved.id ? saved : frame) : [saved, ...current]);
      setSelectedId(saved.id);
      setForm(contentToForm(saved.content));
      setState({ loading: false, saving: false, error: '', message: 'Frame saved.' });
    } catch (error) {
      setState((current) => ({ ...current, saving: false, error: error.message }));
    }
  };

  const remove = async () => {
    if (!selectedId || !window.confirm('Delete this library frame?')) return;
    setState((current) => ({ ...current, saving: true, error: '', message: '' }));
    try {
      await deleteLibraryFrame(selectedId);
      setFrames((current) => current.filter((frame) => frame.id !== selectedId));
      startNew();
      setState({ loading: false, saving: false, error: '', message: 'Frame deleted.' });
    } catch (error) {
      setState((current) => ({ ...current, saving: false, error: error.message }));
    }
  };

  return (
    <section className={styles.page}>
      <div className={styles.heading}>
        <div><p className="eyebrow">GM FRAME LIBRARY</p><h2>Reusable campaign frames</h2><p className="muted">Author the shapes of play you want to bring back to future tables.</p></div>
        <Button type="button" onClick={startNew}>New frame</Button>
      </div>
      {state.error && <p className={styles.error}>{state.error}</p>}
      {state.message && <p className="muted">{state.message}</p>}
      {state.loading ? <p className="muted">Loading frame library...</p> : <div className={styles.layout}>
        <aside className={styles.list}>
          {frames.length === 0 && <p className="muted">No reusable frames yet.</p>}
          {frames.map((frame) => <button type="button" className={`${styles.card} ${selectedId === frame.id ? styles.selected : ''}`} onClick={() => selectFrame(frame)} key={frame.id}><strong>{frame.name}</strong><span>{frame.description || 'No description yet.'}</span><small>Complexity {frame.complexity_rating}/5</small></button>)}
        </aside>
        <div className={styles.editor}>
          <form onSubmit={save}>
            <FrameDraftForm form={form} update={update} optionLists={book} />
            <div className={styles.actions}><Button type="submit" disabled={state.saving}>{state.saving ? 'Saving...' : selectedId ? 'Save changes' : 'Create frame'}</Button>{selectedId && <Button type="button" variant="text" onClick={remove} disabled={state.saving}>Delete frame</Button>}</div>
          </form>
          <FramePreview content={draftToContent(form)} />
        </div>
      </div>}
    </section>
  );
}

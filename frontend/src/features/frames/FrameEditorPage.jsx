import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Button from '../../components/Button/Button';
import { getCharacterCreationBook } from '../characters/characterApi';
import { createLibraryFrame, deleteLibraryFrame, listLibraryFrames, updateLibraryFrame } from './frameApi';
import { contentToForm, draftToContent, emptyFrame, frameEditorSections } from './frameDraft';
import { FrameDraftForm } from '../adventures/CreateAdventurePage';
import sharedStyles from '../adventures/CreateAdventurePage.module.css';
import styles from './FrameEditorPage.module.css';

const emptyForm = () => contentToForm(emptyFrame());

export default function FrameEditorPage({ mode = 'edit' }) {
  const navigate = useNavigate();
  const { frameId } = useParams();
  const isNew = mode === 'new';
  const [form, setForm] = useState(emptyForm);
  const [book, setBook] = useState(null);
  const [activeSection, setActiveSection] = useState('details');
  const [state, setState] = useState({ loading: true, saving: false, error: '', message: '' });

  useEffect(() => {
    setState({ loading: true, saving: false, error: '', message: '' });
    setActiveSection('details');
    Promise.all([
      isNew ? Promise.resolve([]) : listLibraryFrames(),
      getCharacterCreationBook().catch(() => ({ content: null })),
    ])
      .then(([frames, bookResponse]) => {
        const frame = frames.find((item) => item.id === frameId);
        if (!isNew && !frame) {
          setState({ loading: false, saving: false, error: 'That library frame could not be found.', message: '' });
          return;
        }
        setBook(bookResponse.content);
        setForm(frame ? contentToForm(frame.content) : emptyForm());
        setState({ loading: false, saving: false, error: '', message: '' });
      })
      .catch((error) => setState({ loading: false, saving: false, error: error.message, message: '' }));
  }, [frameId, isNew]);

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const save = async (event) => {
    event.preventDefault();
    const content = draftToContent(form, book);
    const payload = {
      name: content.name,
      description: content.description,
      complexity_rating: content.complexity_rating,
      content,
    };
    setState((current) => ({ ...current, saving: true, error: '', message: '' }));
    try {
      const saved = isNew
        ? await createLibraryFrame(payload)
        : await updateLibraryFrame(frameId, payload);
      setForm(contentToForm(saved.content));
      setState({ loading: false, saving: false, error: '', message: 'Frame saved.' });
      if (isNew) navigate(`/frames/${saved.id}/edit`, { replace: true });
    } catch (error) {
      setState((current) => ({ ...current, saving: false, error: error.message }));
    }
  };

  const remove = async () => {
    if (isNew || !window.confirm('Delete this library frame?')) return;
    setState((current) => ({ ...current, saving: true, error: '', message: '' }));
    try {
      await deleteLibraryFrame(frameId);
      navigate('/frames');
    } catch (error) {
      setState((current) => ({ ...current, saving: false, error: error.message }));
    }
  };

  return (
    <section className={styles.page}>
      <div className={styles.topbar}>
        <div><button type="button" className={styles.back} onClick={() => navigate('/frames')}>Back to frame library</button><p className="eyebrow">GM FRAME EDITOR</p><h2>{isNew ? 'New campaign frame' : form.name || 'Edit campaign frame'}</h2></div>
        <span className="muted">Changes stay in this form while you move between sections.</span>
      </div>
      {state.error && <p className={styles.error} role="alert">{state.error}</p>}
      {state.message && <p className={styles.message} role="status">{state.message}</p>}
      {state.loading ? <p className="muted">Loading frame editor...</p> : state.error ? <Button type="button" variant="text" onClick={() => navigate('/frames')}>Return to library</Button> : <div className={styles.layout}>
        <aside className={styles.sidebar} aria-label="Frame sections">
          <p className={styles.sidebarTitle}>Edit section</p>
          {frameEditorSections.map((section) => <button type="button" key={section.id} className={activeSection === section.id ? styles.active : ''} onClick={() => setActiveSection(section.id)} aria-current={activeSection === section.id ? 'page' : undefined}>{section.label}</button>)}
        </aside>
        <main className={styles.content}>
          <form className={`${styles.form} ${sharedStyles.form}`} onSubmit={save}>
            <FrameDraftForm form={form} update={update} optionLists={book} activeSection={activeSection} />
            <div className={styles.actions}>
              <Button type="submit" disabled={state.saving}>{state.saving ? 'Saving...' : isNew ? 'Create frame' : 'Save changes'}</Button>
              {!isNew && <Button type="button" variant="text" onClick={remove} disabled={state.saving}>Delete frame</Button>}
            </div>
          </form>
        </main>
      </div>}
    </section>
  );
}

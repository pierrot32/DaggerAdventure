import { useEffect, useState } from 'react';
import Button from '../../components/Button/Button';
import { exportBooks, listBooks, updateBookContent } from './adminApi';
import styles from './BookContentEditorPage.module.css';

const clone = (value) => JSON.parse(JSON.stringify(value));
const feature = () => ({ name: '', text: '' });

function newClass(id = 'new-class') {
  return {
    id,
    name: 'New class',
    site_description: '',
    domains: [],
    evasion: 10,
    hit_points: 5,
    class_items: [],
    hope_feature: feature(),
    class_features: [],
    background_questions: [],
    subclasses: [],
  };
}

function normalizeClass(item) {
  return {
    ...newClass(item.id),
    ...clone(item),
    domains: Array.isArray(item.domains) ? item.domains : [],
    class_items: Array.isArray(item.class_items) ? item.class_items : [],
    class_features: Array.isArray(item.class_features) ? item.class_features : [],
    background_questions: Array.isArray(item.background_questions) ? item.background_questions : [],
    subclasses: Array.isArray(item.subclasses) ? item.subclasses.map(normalizeSubclass) : [],
    hope_feature: item.hope_feature || feature(),
  };
}

function normalizeSubclass(item) {
  return {
    ...clone(item),
    id: item.id || '',
    name: item.name || '',
    site_description: item.site_description || '',
    spellcast_trait: item.spellcast_trait || '',
    foundation: Array.isArray(item.foundation) ? item.foundation : [],
    specialization: Array.isArray(item.specialization) ? item.specialization : [],
    mastery: Array.isArray(item.mastery) ? item.mastery : [],
  };
}

function FeatureList({ title, items, onChange, onAdd, onRemove }) {
  return (
    <div className={styles.featureList}>
      <div className={styles.sectionHeading}>
        <h4>{title}</h4>
        <button type="button" className={styles.smallButton} onClick={onAdd}>Add feature</button>
      </div>
      {items.map((item, index) => (
        <div className={styles.featureRow} key={`${title}-${index}`}>
          <input aria-label={`${title} feature name ${index + 1}`} value={item.name || ''} placeholder="Feature name" onChange={(event) => onChange(index, 'name', event.target.value)} />
          <textarea aria-label={`${title} feature text ${index + 1}`} value={item.text || ''} placeholder="Feature description" onChange={(event) => onChange(index, 'text', event.target.value)} />
          <button type="button" className={styles.removeButton} onClick={() => onRemove(index)}>Remove</button>
        </div>
      ))}
      {items.length === 0 && <p className="muted">No features added.</p>}
    </div>
  );
}

function SubclassEditor({ subclass, onChange, onRemove }) {
  const update = (field, value) => onChange({ ...subclass, [field]: value });
  const updateFeature = (collection, index, field, value) => update(collection, subclass[collection].map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  const renderFeatureList = (collection, title) => (
    <FeatureList
      title={title}
      items={subclass[collection]}
      onAdd={() => update(collection, [...subclass[collection], feature()])}
      onRemove={(index) => update(collection, subclass[collection].filter((_, itemIndex) => itemIndex !== index))}
      onChange={(index, field, value) => updateFeature(collection, index, field, value)}
    />
  );

  return (
    <div className={styles.subclassEditor}>
      <div className={styles.editorHeading}>
        <h4>{subclass.name || 'Unnamed subclass'}</h4>
        <button type="button" className={styles.removeButton} onClick={onRemove}>Remove subclass</button>
      </div>
      <div className={styles.formGrid}>
        <label>Subclass ID<input value={subclass.id} onChange={(event) => update('id', event.target.value)} /></label>
        <label>Subclass name<input value={subclass.name} onChange={(event) => update('name', event.target.value)} /></label>
        <label className={styles.wide}>Subclass description<textarea value={subclass.site_description || ''} onChange={(event) => update('site_description', event.target.value)} /></label>
        <label>Spellcast trait<input value={subclass.spellcast_trait || ''} onChange={(event) => update('spellcast_trait', event.target.value)} /></label>
      </div>
      {renderFeatureList('foundation', 'Foundation features')}
      {renderFeatureList('specialization', 'Specialization features')}
      {renderFeatureList('mastery', 'Mastery features')}
    </div>
  );
}

export default function BookContentEditorPage() {
  const [books, setBooks] = useState([]);
  const [bookId, setBookId] = useState('');
  const [content, setContent] = useState(null);
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [classForm, setClassForm] = useState(null);
  const [selectedSubclassId, setSelectedSubclassId] = useState('');
  const [connections, setConnections] = useState('');
  const [state, setState] = useState({ loading: true, saving: false, error: '', message: '' });

  const openBook = (book) => {
    if (!book) return;
    const nextContent = clone(book.content);
    const nextClasses = (nextContent.classes || []).map(normalizeClass);
    setBookId(book.id);
    setContent(nextContent);
    setClasses(nextClasses);
    setSelectedClassId(nextClasses[0]?.id || '');
    setConnections(nextContent.character_creation?.connections_prompt || '');
    setState((current) => ({ ...current, error: '', message: '' }));
  };

  useEffect(() => {
    listBooks()
      .then((response) => {
        setBooks(response);
        if (response[0]) openBook(response[0]);
        setState((current) => ({ ...current, loading: false }));
      })
      .catch((error) => setState({ loading: false, saving: false, error: error.message, message: '' }));
  }, []);

  useEffect(() => {
    const selected = classes.find((item) => item.id === selectedClassId);
    setClassForm(selected ? clone(selected) : null);
    setSelectedSubclassId(selected?.subclasses[0]?.id || '');
  }, [classes, selectedClassId]);

  const selectedBook = books.find((book) => book.id === bookId);
  const selectedSubclass = classForm?.subclasses.find((item) => item.id === selectedSubclassId);
  const updateClass = (field, value) => setClassForm((current) => ({ ...current, [field]: value }));
  const updateHope = (field, value) => updateClass('hope_feature', { ...classForm.hope_feature, [field]: value });
  const updateSubclass = (subclass) => {
    updateClass('subclasses', classForm.subclasses.map((item) => item.id === selectedSubclassId ? subclass : item));
    if (subclass.id !== selectedSubclassId) setSelectedSubclassId(subclass.id);
  };

  const addClass = () => {
    const id = `new-class-${classes.length + 1}`;
    setClasses((current) => [...current, newClass(id)]);
    setSelectedClassId(id);
  };

  const removeClass = () => {
    if (!classForm || !window.confirm(`Remove ${classForm.name || classForm.id}?`)) return;
    const remaining = classes.filter((item) => item.id !== selectedClassId);
    setClasses(remaining);
    setSelectedClassId(remaining[0]?.id || '');
  };

  const addSubclass = () => {
    const id = `new-subclass-${(classForm.subclasses?.length || 0) + 1}`;
    updateClass('subclasses', [...classForm.subclasses, normalizeSubclass({ id, name: 'New subclass' })]);
    setSelectedSubclassId(id);
  };

  const removeSubclass = () => {
    if (!selectedSubclass || !window.confirm(`Remove ${selectedSubclass.name || selectedSubclass.id}?`)) return;
    const remaining = classForm.subclasses.filter((item) => item.id !== selectedSubclassId);
    updateClass('subclasses', remaining);
    setSelectedSubclassId(remaining[0]?.id || '');
  };

  const save = async () => {
    if (!content || !classForm?.id || !classForm.name.trim()) {
      setState((current) => ({ ...current, error: 'A class needs an ID and name.', message: '' }));
      return;
    }
    const nextContent = clone(content);
    nextContent.classes = classes.map((item) => item.id === selectedClassId ? classForm : item);
    nextContent.character_creation = { ...(nextContent.character_creation || {}), connections_prompt: connections };
    setState({ loading: false, saving: true, error: '', message: '' });
    try {
      const saved = await updateBookContent(bookId, nextContent);
      setContent(saved.content);
      setBooks((current) => current.map((book) => book.id === saved.id ? saved : book));
      setSelectedClassId(classForm.id);
      setSelectedSubclassId(selectedSubclass?.id || '');
      setClasses(saved.content.classes.map(normalizeClass));
      setState({ loading: false, saving: false, error: '', message: 'Book content saved.' });
    } catch (error) {
      setState({ loading: false, saving: false, error: error.message, message: '' });
    }
  };

  const download = async () => {
    try {
      const exported = await exportBooks();
      const blob = new Blob([JSON.stringify({ books: exported }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'dagger-adventure-books.json';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setState((current) => ({ ...current, error: error.message, message: '' }));
    }
  };

  if (state.loading) return <p className="muted">Loading book content...</p>;
  if (!selectedBook || !content) return <section className={styles.notice}><p className="eyebrow">CONTENT LIBRARY</p><h2>No books imported</h2><p className="muted">Import a book before editing its classes.</p></section>;

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div><p className="eyebrow">ADMINISTRATION / CONTENT</p><h2>Book content studio</h2><p className="muted">Edit stored class and subclass data, then save the complete book.</p></div>
        <Button type="button" variant="text" onClick={download}>Export all books</Button>
      </header>
      <div className={styles.toolbar}>
        <label>Book<select value={bookId} onChange={(event) => openBook(books.find((book) => book.id === event.target.value))}>{books.map((book) => <option value={book.id} key={book.id}>{book.title} - {book.version}</option>)}</select></label>
        <span className={styles.meta}>{selectedBook.source_file}</span>
      </div>
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.sectionHeading}><h3>Classes</h3><button type="button" className={styles.smallButton} onClick={addClass}>Add class</button></div>
          {classes.map((item) => <button type="button" className={`${styles.classButton} ${item.id === selectedClassId ? styles.selected : ''}`} key={item.id} onClick={() => setSelectedClassId(item.id)}><strong>{item.name || 'Unnamed class'}</strong><span>{item.id}</span></button>)}
        </aside>
        {classForm && (
          <div className={styles.editor}>
            <div className={styles.editorHeading}><div><p className="eyebrow">CLASS</p><h3>{classForm.name || 'Unnamed class'}</h3></div><button type="button" className={styles.removeButton} onClick={removeClass}>Remove class</button></div>
            <div className={styles.formGrid}>
              <label>Class ID<input value={classForm.id} onChange={(event) => updateClass('id', event.target.value)} /></label>
              <label>Class name<input value={classForm.name} onChange={(event) => updateClass('name', event.target.value)} /></label>
              <label className={styles.wide}>Class description<textarea value={classForm.site_description || ''} onChange={(event) => updateClass('site_description', event.target.value)} /></label>
              <label>Domains<input value={classForm.domains.join(', ')} onChange={(event) => updateClass('domains', event.target.value.split(',').map((value) => value.trim()).filter(Boolean))} placeholder="codex, grace" /></label>
              <label>Starting evasion<input type="number" value={classForm.evasion} onChange={(event) => updateClass('evasion', Number(event.target.value))} /></label>
              <label>Starting hit points<input type="number" value={classForm.hit_points} onChange={(event) => updateClass('hit_points', Number(event.target.value))} /></label>
              <label className={styles.wide}>Class items<textarea value={classForm.class_items.join('\n')} onChange={(event) => updateClass('class_items', event.target.value.split('\n').filter(Boolean))} placeholder="One item per line" /></label>
            </div>
            <div className={styles.panel}><h3>Hope feature</h3><div className={styles.formGrid}><label>Name<input value={classForm.hope_feature.name || ''} onChange={(event) => updateHope('name', event.target.value)} /></label><label className={styles.wide}>Description<textarea value={classForm.hope_feature.text || ''} onChange={(event) => updateHope('text', event.target.value)} /></label></div></div>
            <FeatureList title="Class features" items={classForm.class_features} onAdd={() => updateClass('class_features', [...classForm.class_features, feature()])} onRemove={(index) => updateClass('class_features', classForm.class_features.filter((_, itemIndex) => itemIndex !== index))} onChange={(index, field, value) => updateClass('class_features', classForm.class_features.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item))} />
            <label className={styles.wide}>Background questions<textarea value={classForm.background_questions.join('\n')} onChange={(event) => updateClass('background_questions', event.target.value.split('\n').filter(Boolean))} placeholder="One question per line" /></label>
            <div className={styles.panel}>
              <div className={styles.sectionHeading}><h3>Subclasses</h3><button type="button" className={styles.smallButton} onClick={addSubclass}>Add subclass</button></div>
              <div className={styles.subclassTabs}>{classForm.subclasses.map((item) => <button type="button" className={item.id === selectedSubclassId ? styles.activeTab : ''} key={item.id} onClick={() => setSelectedSubclassId(item.id)}>{item.name || 'Unnamed subclass'}</button>)}</div>
              {selectedSubclass ? <SubclassEditor subclass={selectedSubclass} onChange={updateSubclass} onRemove={removeSubclass} /> : <p className="muted">Add a subclass to edit its features.</p>}
            </div>
            <label className={styles.wide}>Connections prompt<textarea value={connections} onChange={(event) => setConnections(event.target.value)} /></label>
            {(state.error || state.message) && <p className={state.error ? styles.error : styles.message} role="status">{state.error || state.message}</p>}
            <Button type="button" disabled={state.saving} onClick={save}>{state.saving ? 'Saving book...' : 'Save book content'}</Button>
          </div>
        )}
      </div>
    </section>
  );
}

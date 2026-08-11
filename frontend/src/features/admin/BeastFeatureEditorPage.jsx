import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../components/Button/Button';
import { exportBooks, listBooks, updateBookContent } from './adminApi';
import {
  BEAST_FEATURES_KEY, clone, feature, normalizeBookContent, normalizeFeature,
} from './bookContentEditorUtils';
import styles from './BeastFeatureEditorPage.module.css';

export default function BeastFeatureEditorPage() {
  const [books, setBooks] = useState([]);
  const [bookId, setBookId] = useState('');
  const [content, setContent] = useState(null);
  const [features, setFeatures] = useState([]);
  const [selectedFeatureId, setSelectedFeatureId] = useState('');
  const [featureOriginalId, setFeatureOriginalId] = useState('');
  const [featureForm, setFeatureForm] = useState(null);
  const [state, setState] = useState({ loading: true, saving: false, error: '', message: '' });

  const openBook = (book) => {
    if (!book) return;
    const nextContent = normalizeBookContent(book.content);
    const nextFeatures = sortedFeatures(nextContent[BEAST_FEATURES_KEY]);
    setBookId(book.id);
    setContent(nextContent);
    setFeatures(nextFeatures);
    setSelectedFeatureId(nextFeatures[0]?.id || '');
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
    const selected = features.find((item) => item.id === selectedFeatureId);
    setFeatureOriginalId(selected?.id || '');
    setFeatureForm(selected ? clone(selected) : null);
  }, [features, selectedFeatureId]);

  const selectedBook = books.find((book) => book.id === bookId);
  const updateFeature = (field, value) => setFeatureForm((current) => ({ ...current, [field]: value }));

  const addFeature = () => {
    const id = `new-beast-feature-${features.length + 1}`;
    const nextFeature = feature(id);
    nextFeature.name = 'New beast feature';
    setFeatures((current) => sortedFeatures([...current, nextFeature]));
    setSelectedFeatureId(id);
  };

  const removeFeature = () => {
    if (!featureForm || !window.confirm(`Remove ${featureForm.name || featureForm.id}?`)) return;
    const remaining = features.filter((item) => item.id !== featureOriginalId);
    setFeatures(remaining);
    setSelectedFeatureId(remaining[0]?.id || '');
  };

  const save = async () => {
    if (!content || !featureForm?.id || !featureForm.name.trim()) {
      setState((current) => ({ ...current, error: 'A beast feature needs an ID and name.', message: '' }));
      return;
    }
    const nextContent = clone(content);
    nextContent[BEAST_FEATURES_KEY] = features.map((item) => item.id === featureOriginalId ? featureForm : item);
    setState({ loading: false, saving: true, error: '', message: '' });
    try {
      const saved = await updateBookContent(bookId, nextContent);
      const normalized = normalizeBookContent(saved.content);
      setBooks((current) => current.map((book) => book.id === saved.id ? saved : book));
      setContent(normalized);
      setFeatures(sortedFeatures(normalized[BEAST_FEATURES_KEY]));
      setSelectedFeatureId(featureForm.id);
      setState({ loading: false, saving: false, error: '', message: 'Beast feature saved.' });
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

  if (state.loading) return <p className="muted">Loading beast features...</p>;
  if (!selectedBook || !content) return <section className={styles.notice}><p className="eyebrow">CONTENT LIBRARY</p><h2>No books imported</h2><p className="muted">Import a book before editing beast features.</p></section>;

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div><p className="eyebrow">ADMINISTRATION / CONTENT</p><h2>Beast feature library</h2><p className="muted">Create reusable features once, then assign them to any number of beast forms.</p></div>
        <Button type="button" variant="text" onClick={download}>Export all books</Button>
      </header>
      <div className={styles.toolbar}>
        <label>Book<select value={bookId} onChange={(event) => openBook(books.find((book) => book.id === event.target.value))}>{books.map((book) => <option value={book.id} key={book.id}>{book.title} - {book.version}</option>)}</select></label>
        <div className={styles.links}><Link to="/admin/content/books/edit">Book content studio</Link><span className={styles.meta}>{selectedBook.source_file}</span></div>
      </div>
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.sectionHeading}><h3>Features</h3><button type="button" className={styles.smallButton} onClick={addFeature}>Add feature</button></div>
          {features.map((item) => <button type="button" className={`${styles.featureButton} ${item.id === selectedFeatureId ? styles.selected : ''}`} key={item.id} onClick={() => setSelectedFeatureId(item.id)}><strong>{item.name || 'Unnamed feature'}</strong><span>{item.id}</span></button>)}
          {features.length === 0 && <p className="muted">No shared features added.</p>}
        </aside>
        {featureForm && <div className={styles.editor}>
          <div className={styles.editorHeading}><div><p className="eyebrow">SHARED BEAST FEATURE</p><h3>{featureForm.name || 'Unnamed feature'}</h3></div><button type="button" className={styles.removeButton} onClick={removeFeature}>Remove feature</button></div>
          <div className={styles.formGrid}>
            <label>Feature ID<input value={featureForm.id} onChange={(event) => updateFeature('id', event.target.value)} /></label>
            <label>Feature name<input value={featureForm.name} onChange={(event) => updateFeature('name', event.target.value)} /></label>
            <label className={styles.wide}>Description<textarea value={featureForm.text} onChange={(event) => updateFeature('text', event.target.value)} /></label>
          </div>
          <p className={styles.hint}>Beast forms can select this feature from their shared feature list. Editing it updates every form that uses it.</p>
          {(state.error || state.message) && <p className={state.error ? styles.error : styles.message} role="status">{state.error || state.message}</p>}
          <Button type="button" disabled={state.saving} onClick={save}>{state.saving ? 'Saving feature...' : 'Save beast feature'}</Button>
        </div>}
      </div>
    </section>
  );
}

function sortedFeatures(items) {
  return (Array.isArray(items) ? items : []).map((item) => normalizeFeature(item)).sort((left, right) => left.name.localeCompare(right.name));
}

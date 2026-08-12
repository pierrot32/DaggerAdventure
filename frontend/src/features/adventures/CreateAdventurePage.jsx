import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/Button/Button';
import { listBuiltinFrames, listLibraryFrames } from '../frames/frameApi';
import { contentToForm, draftToContent, emptyFrame } from '../frames/frameDraft';
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
  const [frameState, setFrameState] = useState({ loading: true, error: '' });

  useEffect(() => {
    Promise.all([listBuiltinFrames(), listLibraryFrames()])
      .then(([nextBuiltins, nextLibrary]) => {
        setBuiltins(nextBuiltins);
        setLibrary(nextLibrary);
        setFrameState({ loading: false, error: '' });
      })
      .catch((requestError) => setFrameState({ loading: false, error: requestError.message }));
  }, []);

  const selectedSource = source.type === 'builtin'
    ? builtins.find((frame) => frame.id === source.id)
    : source.type === 'library'
      ? library.find((frame) => frame.id === source.id)?.content
      : draftToContent(frameForm);

  const chooseSource = (type, id = '') => {
    setSource({ type, id });
    if (type === 'blank') setFrameForm(contentToForm(emptyFrame()));
  };

  const updateFrameField = (field, value) => setFrameForm((current) => ({ ...current, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    const frameSource = source.type === 'blank'
      ? { source_type: 'blank', source_id: null, content: draftToContent(frameForm) }
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

        {source.type === 'blank' ? <FrameDraftForm form={frameForm} update={updateFrameField} /> : <FramePreview content={selectedSource} />}
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

export function FrameDraftForm({ form, update }) {
  return <div className={styles.draft}>
    <div className={styles.draftIntro}><p className="eyebrow">HAND-AUTHORED FRAME</p><h3>Give the campaign a playable spine</h3><p>Use blank lines to separate individual guidance entries. The GM can turn each section or entry on and off later.</p></div>
    <div className={styles.frameGrid}>
      <label>Name<input required value={form.name} onChange={(event) => update('name', event.target.value)} /></label>
      <label>Frame ID<input required pattern="[a-z0-9][a-z0-9-]*" value={form.id} onChange={(event) => update('id', event.target.value)} /></label>
      <label>Complexity<select value={form.complexity_rating} onChange={(event) => update('complexity_rating', event.target.value)}>{[1, 2, 3, 4, 5].map((value) => <option value={value} key={value}>{value} / 5</option>)}</select></label>
      <TextField label="Description" value={form.description} update={update} field="description" />
      <TextField label="Pitch" value={form.pitch} update={update} field="pitch" required />
      <TextField label="Overview" value={form.overview} update={update} field="overview" required />
      <TextField label="Tone & feel" value={form.tone_and_feel} update={update} field="tone_and_feel" hint="Comma-separated" />
      <TextField label="Themes" value={form.themes} update={update} field="themes" hint="Comma-separated" />
      <TextField label="Touchstones" value={form.touchstones} update={update} field="touchstones" hint="Comma-separated" />
      <TextField label="The inciting incident" value={form.inciting_incident} update={update} field="inciting_incident" />
      <TextField label="Session-zero questions" value={form.session_zero_questions} update={update} field="session_zero_questions" hint="One question per line" />
      <TextField className={styles.full} label="Community guidance" value={form.communities} update={update} field="communities" hint="Separate entries with a blank line" />
      <TextField className={styles.full} label="Ancestry guidance" value={form.ancestries} update={update} field="ancestries" hint="Separate entries with a blank line" />
      <TextField className={styles.full} label="Class guidance" value={form.classes} update={update} field="classes" hint="Separate entries with a blank line" />
      <TextField className={styles.full} label="Player principles" value={form.player_principles} update={update} field="player_principles" hint="Separate entries with a blank line" />
      <TextField className={styles.full} label="GM principles" value={form.gm_principles} update={update} field="gm_principles" hint="Separate entries with a blank line" />
      <TextField className={styles.full} label="Distinctions" value={form.distinctions} update={update} field="distinctions" hint="Separate entries with a blank line" />
      <TextField className={styles.full} label="Campaign mechanics" value={form.campaign_mechanics} update={update} field="campaign_mechanics" hint="Separate entries with a blank line" />
    </div>
  </div>;
}

function TextField({ label, value, update, field, hint, required = false, className = '' }) {
  return <label className={className}>{label}{hint && <small>{hint}</small>}<textarea required={required} value={value} onChange={(event) => update(field, event.target.value)} /></label>;
}

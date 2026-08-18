import { useEffect, useState } from 'react';
import Button from '../../components/Button/Button';
import { listPromptTemplates, resetPromptTemplate, updatePromptTemplate } from './aiApi';
import styles from './AdminAiPromptsPage.module.css';

const labels = {
  playground: 'Playground',
  character_builder: 'Character builder',
  character_image: 'Character image',
};

export default function AdminAiPromptsPage() {
  const [templates, setTemplates] = useState([]);
  const [state, setState] = useState({ loading: true, saving: '', error: '', message: '' });

  useEffect(() => {
    let active = true;
    listPromptTemplates()
      .then((items) => { if (active) { setTemplates(items); setState({ loading: false, saving: '', error: '', message: '' }); } })
      .catch((error) => { if (active) setState({ loading: false, saving: '', error: error.message, message: '' }); });
    return () => { active = false; };
  }, []);

  const updateDraft = (generationType, template) => setTemplates((current) => current.map((item) => item.generation_type === generationType ? { ...item, template } : item));
  const save = async (item) => {
    setState((current) => ({ ...current, saving: item.generation_type, error: '', message: '' }));
    try {
      const saved = await updatePromptTemplate(item.generation_type, item.template);
      setTemplates((current) => current.map((entry) => entry.generation_type === saved.generation_type ? saved : entry));
      setState({ loading: false, saving: '', error: '', message: `${labels[item.generation_type]} prompt saved.` });
    } catch (error) {
      setState((current) => ({ ...current, saving: '', error: error.message, message: '' }));
    }
  };
  const reset = async (item) => {
    if (!window.confirm(`Reset the ${labels[item.generation_type] || item.generation_type} prompt to its built-in default?`)) return;
    setState((current) => ({ ...current, saving: item.generation_type, error: '', message: '' }));
    try {
      const resetTemplate = await resetPromptTemplate(item.generation_type);
      setTemplates((current) => current.map((entry) => entry.generation_type === resetTemplate.generation_type ? resetTemplate : entry));
      setState({ loading: false, saving: '', error: '', message: `${labels[item.generation_type]} prompt reset.` });
    } catch (error) {
      setState((current) => ({ ...current, saving: '', error: error.message, message: '' }));
    }
  };

  return <section>
    <p className="eyebrow">ADMINISTRATION / AI</p>
    <h2>Prompt templates</h2>
    <p className="muted">Customize the trusted templates used by each generation action. Output validation remains enforced by the server.</p>
    {state.loading && <p className="muted">Loading prompt templates...</p>}
    {state.error && <p className={styles.error} role="alert">{state.error}</p>}
    {!state.loading && <div className={styles.list}>{templates.map((item) => <article className={styles.template} key={item.generation_type}><div className={styles.heading}><div><p className="eyebrow">{item.generation_type}</p><h3>{labels[item.generation_type] || item.generation_type}</h3></div><span className="muted">Updated {new Date(item.updated_at).toLocaleDateString()}</span></div><label htmlFor={`prompt-${item.generation_type}`}>Template<textarea id={`prompt-${item.generation_type}`} maxLength="20000" value={item.template} disabled={state.saving === item.generation_type} onChange={(event) => updateDraft(item.generation_type, event.target.value)} /></label><div className={styles.actions}><span className="muted">{item.template.length}/20000</span><Button type="button" onClick={() => save(item)} disabled={state.saving === item.generation_type || !item.template.trim()}>{state.saving === item.generation_type ? 'Saving...' : 'Save template'}</Button><Button type="button" variant="text" onClick={() => reset(item)} disabled={state.saving === item.generation_type}>Reset</Button></div></article>)}</div>}
    {state.message && <p className="muted" role="status">{state.message}</p>}
  </section>;
}

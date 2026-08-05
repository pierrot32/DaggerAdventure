import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/Button/Button';
import { useAdventureStore } from './adventureStore';
import styles from './CreateAdventurePage.module.css';

// Adventure makers create the private space where future Daggerheart tools live
export default function CreateAdventurePage() {
  const navigate = useNavigate();
  const { create, loading, error } = useAdventureStore();
  const [form, setForm] = useState({ name: '', description: '' });

  const submit = async (event) => {
    event.preventDefault();
    const adventure = await create(form);
    navigate(`/adventures/${adventure.id}`);
  };

  return (
    <section className={styles.panel}>
      <p className="eyebrow">NEW ADVENTURE</p>
      <h2>Create a private table</h2>
      <form onSubmit={submit} className={styles.form}>
        <label>Name<input required maxLength="80" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label>Description<textarea maxLength="2000" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
        {error && <p className={styles.error}>{error}</p>}
        <Button type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create adventure'}</Button>
      </form>
    </section>
  );
}

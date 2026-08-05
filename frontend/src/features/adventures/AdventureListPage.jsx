import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAdventureStore } from './adventureStore';
import styles from './AdventureListPage.module.css';

// Lists only adventures the backend says this account may see
export default function AdventureListPage() {
  const { adventures, loading, error, fetchAdventures } = useAdventureStore();
  useEffect(() => { fetchAdventures(); }, [fetchAdventures]);

  return (
    <section>
      <p className="eyebrow">ADVENTURES</p>
      <h2>Your tables</h2>
      {error && <p className={styles.error}>{error}</p>}
      {loading ? <p className="muted">Loading adventures...</p> : (
        <div className={styles.grid}>
          {adventures.length === 0 && <p className="muted">No adventures are available yet.</p>}
          {adventures.map((adventure) => (
            <Link className={styles.card} to={`/adventures/${adventure.id}`} key={adventure.id}>
              <h3>{adventure.name}</h3>
              <p>{adventure.description || 'No description yet.'}</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

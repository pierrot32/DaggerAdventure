import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../components/Button/Button';
import { listCharacters } from './characterApi';
import styles from './CharactersPage.module.css';

export default function CharactersPage() {
  const [characters, setCharacters] = useState([]);
  const [state, setState] = useState({ loading: true, error: '' });

  useEffect(() => {
    listCharacters()
      .then((items) => {
        setCharacters(items);
        setState({ loading: false, error: '' });
      })
      .catch((error) => setState({ loading: false, error: error.message }));
  }, []);

  return (
    <section>
      <div className={styles.heading}>
        <div>
          <p className="eyebrow">CHARACTER VAULT</p>
          <h2>Your characters</h2>
          <p className="muted">Build a Daggerheart hero from the imported SRD options.</p>
        </div>
        <Link to="/characters/create"><Button>Create character</Button></Link>
      </div>
      {state.error && <p className={styles.error}>{state.error}</p>}
      {state.loading ? <p className="muted">Loading characters...</p> : (
        <div className={styles.grid}>
          {characters.length === 0 && (
            <div className={styles.empty}>
              <h3>Your next story starts here.</h3>
              <p className="muted">Create a character and keep their choices together in your vault.</p>
              <Link to="/characters/create"><Button variant="text">Start character creation</Button></Link>
            </div>
          )}
          {characters.map((character) => (
              <Link className={styles.card} to={`/characters/${character.id}`} key={character.id}>
              <p className="eyebrow">LEVEL {character.level}</p>
              <h3>{character.name}</h3>
              <p>{character.pronouns}</p>
              <p className="muted">{character.class_id} · {character.ancestry_id} · {character.community_id}</p>
              <p className={styles.description}>{character.description}</p>
              </Link>
          ))}
        </div>
      )}
    </section>
  );
}
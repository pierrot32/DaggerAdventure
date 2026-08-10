import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../components/Button/Button';
import { deleteCharacter, listCharacters } from './characterApi';
import styles from './CharactersPage.module.css';

export default function CharactersPage() {
  const [characters, setCharacters] = useState([]);
  const [state, setState] = useState({ loading: true, deletingId: '', error: '' });

  useEffect(() => {
    listCharacters()
      .then((items) => {
        setCharacters(items);
        setState({ loading: false, deletingId: '', error: '' });
      })
      .catch((error) => setState({ loading: false, deletingId: '', error: error.message }));
  }, []);

  const handleDelete = async (event, character) => {
    event.preventDefault();
    event.stopPropagation();
    if (!window.confirm(`Delete ${character.name}? This cannot be undone.`)) return;
    setState((current) => ({ ...current, deletingId: character.id, error: '' }));
    try {
      await deleteCharacter(character.id);
      setCharacters((current) => current.filter((item) => item.id !== character.id));
      setState((current) => ({ ...current, deletingId: '', error: '' }));
    } catch (error) {
      setState((current) => ({ ...current, deletingId: '', error: error.message }));
    }
  };

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
            <article className={styles.card} key={character.id}>
              <Link className={styles.cardLink} to={`/characters/${character.id}`}>
              <p className="eyebrow">LEVEL {character.level}</p>
              <h3>{character.name}</h3>
              <p>{character.pronouns}</p>
              <p className="muted">{character.class_id} · {character.ancestry_id} · {character.community_id}</p>
              <p className={styles.description}>{character.description}</p>
              </Link>
              <div className={styles.cardActions}><button type="button" className={styles.deleteButton} disabled={state.deletingId === character.id} onClick={(event) => handleDelete(event, character)}>{state.deletingId === character.id ? 'Deleting...' : 'Delete character'}</button></div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
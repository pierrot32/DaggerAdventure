import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { getCharacter } from './characterApi';
import styles from './CharacterProfilePage.module.css';

const titleize = (input) => String(input || '')
  .split('-')
  .filter(Boolean)
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ');

const asList = (value) => (Array.isArray(value) ? value : value ? [value] : []);

export default function CharacterProfilePage() {
  const { characterId } = useParams();
  const { user } = useAuth();
  const [character, setCharacter] = useState(null);
  const [state, setState] = useState({ loading: true, error: '' });

  useEffect(() => {
    getCharacter(characterId)
      .then((nextCharacter) => {
        setCharacter(nextCharacter);
        setState({ loading: false, error: '' });
      })
      .catch((error) => setState({ loading: false, error: error.message }));
  }, [characterId]);

  if (state.loading) return <p className="muted">Loading character profile...</p>;
  if (!character) return <p className={styles.error}>{state.error || 'Character not found.'}</p>;

  const connections = asList(character.connections);
  const family = asList(character.family_members);
  const isOwner = character.user_id === user?.id;

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link to={`/characters/${characterId}`} className={styles.back}>Back to character sheet</Link>
          <p className="eyebrow">CHARACTER PROFILE</p>
          <h2>{character.name}</h2>
          <p className="muted">The story, appearance, and relationships behind the sheet.</p>
        </div>
        {isOwner && <Link to={`/characters/${characterId}/edit`} className={styles.editButton}>Edit character</Link>}
      </header>

      <div className={styles.hero}>
        <div className={styles.imageFrame}>
          {character.portrait_url
            ? <img src={character.portrait_url} alt={`${character.name}'s character portrait`} />
            : <span>No image generated or importated</span>}
        </div>
        <div className={styles.identity}>
          <span className="eyebrow">LEVEL {character.level}</span>
          <h3>{titleize(character.class_id)} · {titleize(character.subclass_id)}</h3>
          <p>{character.pronouns || 'Pronouns not recorded'}</p>
          <p className={styles.heritage}>{[character.ancestry_id, character.secondary_ancestry_id, character.community_id].filter(Boolean).map(titleize).join(' · ')}</p>
        </div>
      </div>

      <div className={styles.columns}>
        <div className={styles.mainColumn}>
          <Panel title="Description">
            <p className={styles.prose}>{character.description || 'No description recorded.'}</p>
          </Panel>
          <Panel title="Appearance">
            <div className={styles.appearanceGrid}>
              <Detail label="Size" value={character.size} />
              <Detail label="Height" value={character.height} />
              <Detail label="Weight" value={character.weight} />
              <Detail label="Eyes" value={character.eye_color} />
              <Detail label="Hair" value={character.hair_color} />
              <Detail label="Skin" value={character.skin_color} />
            </div>
            <p className={styles.prose}>{character.look_description || 'No additional look details recorded.'}</p>
          </Panel>
          <Panel title="Background">
            <p className={styles.prose}>{character.background_story || 'No background story recorded.'}</p>
            {character.background_notes && <p className={styles.secondaryProse}>{character.background_notes}</p>}
          </Panel>
        </div>

        <aside className={styles.sideColumn}>
          <Panel title="Connections">
            {connections.length > 0 ? <ul className={styles.list}>{connections.map((connection, index) => <li key={`${connection}-${index}`}>{typeof connection === 'string' ? connection : connection.text || connection.name || JSON.stringify(connection)}</li>)}</ul> : <p className="muted">No connections recorded.</p>}
          </Panel>
          <Panel title="Family and chosen family">
            {family.length > 0 ? <ul className={styles.familyList}>{family.map((member, index) => <li key={member.id || `${member.relation}-${index}`}><strong>{member.name || 'Unnamed'} · {member.relation || 'Other'}</strong><span>{member.details || 'No details recorded.'}</span></li>)}</ul> : <p className="muted">No family members recorded.</p>}
          </Panel>
        </aside>
      </div>
    </section>
  );
}

function Panel({ title, children }) {
  return <section className={styles.panel}><h3>{title}</h3>{children}</section>;
}

function Detail({ label, value }) {
  return <div className={styles.detail}><span>{label}</span><strong>{value || '—'}</strong></div>;
}
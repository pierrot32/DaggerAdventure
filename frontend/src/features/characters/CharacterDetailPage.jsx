import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Button from '../../components/Button/Button';
import { listAdventures } from '../adventures/adventureApi';
import { getCharacter, linkCharacterToAdventure } from './characterApi';
import styles from './CharacterDetailPage.module.css';

const value = (object, key, fallback = '—') => object?.[key] ?? fallback;

export default function CharacterDetailPage() {
  const { characterId } = useParams();
  const [character, setCharacter] = useState(null);
  const [adventures, setAdventures] = useState([]);
  const [selectedAdventure, setSelectedAdventure] = useState('');
  const [state, setState] = useState({ loading: true, saving: false, error: '' });

  useEffect(() => {
    Promise.all([getCharacter(characterId), listAdventures()])
      .then(([nextCharacter, nextAdventures]) => {
        setCharacter(nextCharacter);
        setAdventures(nextAdventures);
        setSelectedAdventure(nextCharacter.adventure_id || '');
        setState({ loading: false, saving: false, error: '' });
      })
      .catch((error) => setState({ loading: false, saving: false, error: error.message }));
  }, [characterId]);

  const updateAdventure = async (event) => {
    const adventureId = event.target.value || null;
    setSelectedAdventure(event.target.value);
    setState((current) => ({ ...current, saving: true, error: '' }));
    try {
      const updated = await linkCharacterToAdventure(characterId, adventureId);
      setCharacter(updated);
      setState({ loading: false, saving: false, error: '' });
    } catch (error) {
      setSelectedAdventure(character.adventure_id || '');
      setState({ loading: false, saving: false, error: error.message });
    }
  };

  if (state.loading) return <p className="muted">Loading character sheet...</p>;
  if (!character) return <p className={styles.error}>{state.error || 'Character not found.'}</p>;
  const stats = character.stats || {};
  const equipment = character.equipment || {};

  return <section>
    <Link to="/characters" className={styles.back}>Back to character vault</Link>
    <header className={styles.header}>
      <div><p className="eyebrow">DAGGERHEART · LEVEL {character.level}</p><h2>{character.name}</h2><p className="muted">{character.pronouns} · {character.class_id} · {character.ancestry_id}</p></div>
      <label className={styles.adventure}>Adventure
        <select value={selectedAdventure} onChange={updateAdventure} disabled={state.saving}>
          <option value="">Not linked</option>
          {adventures.map((adventure) => <option value={adventure.id} key={adventure.id}>{adventure.name}</option>)}
        </select>
      </label>
    </header>
    {state.error && <p className={styles.error}>{state.error}</p>}
    <p className={styles.description}>{character.description}</p>
    <div className={styles.stats}>
      <Stat label="Hope" current={value(stats.hope, 'current')} max={value(stats.hope, 'max')} />
      <Stat label="Hit points" current={value(stats.hit_points, 'current')} max={value(stats.hit_points, 'max')} />
      <Stat label="Stress" current={value(stats.stress, 'current')} max={value(stats.stress, 'max')} />
      <Stat label="Armor" current={value(stats.armor, 'current')} max={value(stats.armor, 'max')} />
    </div>
    <div className={styles.details}>
      <section className={styles.panel}><h3>Combat</h3><dl><div><dt>Proficiency</dt><dd>{value(stats, 'proficiency')}</dd></div><div><dt>Evasion</dt><dd>{value(stats, 'evasion')}</dd></div><div><dt>Major threshold</dt><dd>{value(stats.thresholds, 'major')}</dd></div><div><dt>Severe threshold</dt><dd>{value(stats.thresholds, 'severe')}</dd></div></dl></section>
      <section className={styles.panel}><h3>Traits</h3><dl>{Object.entries(character.traits || {}).map(([trait, modifier]) => <div key={trait}><dt>{trait}</dt><dd>{modifier > 0 ? `+${modifier}` : modifier}</dd></div>)}</dl></section>
      <section className={styles.panel}><h3>Inventory</h3><ul>{[equipment.primary, equipment.secondary, equipment.armor, equipment.potion, ...(equipment.inventory || [])].filter(Boolean).map((item) => <li key={typeof item === 'string' ? item : item.id}>{typeof item === 'string' ? item : item.name || item.id}</li>)}</ul></section>
      <section className={styles.panel}><h3>Experiences</h3><ul>{(character.experiences || []).map((experience) => <li key={experience.name || experience}>{experience.name || experience} <span>+{experience.modifier || 2}</span></li>)}</ul></section>
    </div>
  </section>;
}

function Stat({ label, current, max }) {
  return <div className={styles.stat}><span>{label}</span><strong>{current}<small> / {max}</small></strong></div>;
}
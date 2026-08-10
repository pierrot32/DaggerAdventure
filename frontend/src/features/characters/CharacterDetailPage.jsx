import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { listAdventures } from '../adventures/adventureApi';
import {
  getCharacter, getCharacterCreationBook, linkCharacterToAdventure, updateCharacterStats,
} from './characterApi';
import {
  GOLD_LIMITS, TRAIT_ACTIONS, TRAIT_IDS, deriveSheet, normalizeStats,
} from './characterSheet';
import styles from './CharacterDetailPage.module.css';

const signed = (input) => {
  const number = Number(input) || 0;
  return number > 0 ? `+${number}` : String(number);
};

const titleize = (input) => String(input || '')
  .split('-')
  .filter(Boolean)
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ');

// Clicking the box you already stopped on clears it, otherwise fill up to it.
const nextTrackValue = (current, index) => (index + 1 === current ? index : index + 1);

export default function CharacterDetailPage() {
  const { characterId } = useParams();
  const [character, setCharacter] = useState(null);
  const [book, setBook] = useState(null);
  const [stats, setStats] = useState(null);
  const [adventures, setAdventures] = useState([]);
  const [selectedAdventure, setSelectedAdventure] = useState('');
  const [state, setState] = useState({ loading: true, saving: false, error: '' });

  useEffect(() => {
    Promise.all([
      getCharacter(characterId),
      listAdventures().catch(() => []),
      getCharacterCreationBook().then((response) => response.content).catch(() => null),
    ])
      .then(([nextCharacter, nextAdventures, nextBook]) => {
        setCharacter(nextCharacter);
        setAdventures(nextAdventures);
        setBook(nextBook);
        setSelectedAdventure(nextCharacter.adventure_id || '');
        setStats(normalizeStats(nextCharacter.stats, deriveSheet(nextCharacter, nextBook)));
        setState({ loading: false, saving: false, error: '' });
      })
      .catch((error) => setState({ loading: false, saving: false, error: error.message }));
  }, [characterId]);

  const derived = useMemo(() => deriveSheet(character, book), [character, book]);

  const persist = useCallback(async (nextStats) => {
    const previous = stats;
    setStats(nextStats);
    setState((current) => ({ ...current, saving: true, error: '' }));
    try {
      const updated = await updateCharacterStats(characterId, nextStats);
      setCharacter(updated);
      setState({ loading: false, saving: false, error: '' });
    } catch (error) {
      setStats(previous);
      setState({ loading: false, saving: false, error: error.message });
    }
  }, [characterId, stats]);

  const setTrack = (key, next) => persist({ ...stats, [key]: { ...stats[key], current: next } });
  const setGold = (key, next) => persist({ ...stats, gold: { ...stats.gold, [key]: next } });

  const updateAdventure = async (event) => {
    const adventureId = event.target.value || null;
    setSelectedAdventure(event.target.value);
    setState((current) => ({ ...current, saving: true, error: '' }));
    try {
      setCharacter(await linkCharacterToAdventure(characterId, adventureId));
      setState({ loading: false, saving: false, error: '' });
    } catch (error) {
      setSelectedAdventure(character.adventure_id || '');
      setState({ loading: false, saving: false, error: error.message });
    }
  };

  if (state.loading) return <p className="muted">Loading character sheet...</p>;
  if (!character || !stats) return <p className={styles.error}>{state.error || 'Character not found.'}</p>;

  const { classInfo, subclassInfo, primary, secondary, armor } = derived;
  const equipment = character.equipment || {};
  const heritage = [character.ancestry_id, character.secondary_ancestry_id, character.community_id]
    .filter(Boolean).map(titleize).join(' · ');

  return (
    <section className={styles.sheet}>
      <div className={styles.topBar}>
        <Link to="/characters" className={styles.back}>Back to character vault</Link>
        <div className={styles.topRight}>
          {state.saving && <span className={styles.saving}>Saving...</span>}
          <label className={styles.adventure}>Adventure
            <select value={selectedAdventure} onChange={updateAdventure}>
              <option value="">Not linked</option>
              {adventures.map((adventure) => <option value={adventure.id} key={adventure.id}>{adventure.name}</option>)}
            </select>
          </label>
        </div>
      </div>
      {state.error && <p className={styles.error}>{state.error}</p>}

      <header className={styles.nameplate}>
        <div className={styles.classBlock}>
          <h2>{classInfo?.name?.toUpperCase() || titleize(character.class_id)}</h2>
          <p>{(classInfo?.domains || []).map(titleize).join(' & ') || '—'}</p>
        </div>
        <div className={styles.identity}>
          <Field label="Name" value={character.name} />
          <Field label="Pronouns" value={character.pronouns} />
          <Field label="Heritage" value={heritage} />
          <Field label="Subclass" value={subclassInfo?.name || titleize(character.subclass_id)} />
        </div>
        <div className={styles.level}><span>LEVEL</span><strong>{derived.level}</strong></div>
      </header>

      <div className={styles.columns}>
        <div className={styles.left}>
          <div className={styles.defenses}>
            <Shield label="Evasion" value={derived.evasion} note="Class + armor" />
            <Shield label="Armor" value={derived.armorScore} note="Armor score" />
            <div className={styles.armorSlots}>
              <span>Armor slots</span>
              <Track
                count={derived.armorScore}
                value={stats.armor.current}
                onSelect={(index) => setTrack('armor', nextTrackValue(stats.armor.current, index))}
                label="Armor slots"
              />
            </div>
          </div>

          <Panel title="Damage &amp; Health">
            <p className={styles.hint}>Thresholds include your current level.</p>
            <div className={styles.thresholds}>
              <Threshold name="Minor damage" mark="Mark 1 HP" value="1" />
              <Threshold name="Major damage" mark="Mark 2 HP" value={derived.thresholds.major} />
              <Threshold name="Severe damage" mark="Mark 3 HP" value={derived.thresholds.severe} />
            </div>
            <TrackRow
              label="HP"
              count={derived.hitPointsMax}
              value={stats.hit_points.current}
              onSelect={(index) => setTrack('hit_points', nextTrackValue(stats.hit_points.current, index))}
            />
            <TrackRow
              label="Stress"
              count={derived.stressMax}
              value={stats.stress.current}
              onSelect={(index) => setTrack('stress', nextTrackValue(stats.stress.current, index))}
            />
          </Panel>

          <Panel title="Hope">
            <Track
              className={styles.hope}
              shape="diamond"
              count={derived.hopeMax}
              value={stats.hope.current}
              onSelect={(index) => setTrack('hope', nextTrackValue(stats.hope.current, index))}
              label="Hope"
            />
            <p className={styles.hint}>Spend a Hope to use an experience or help an ally.</p>
            {classInfo?.hope_feature && (
              <p className={styles.feature}><strong>{classInfo.hope_feature.name}.</strong> {classInfo.hope_feature.text}</p>
            )}
          </Panel>

          <Panel title="Experience">
            <ul className={styles.experiences}>
              {(character.experiences || []).map((experience, index) => (
                <li key={experience.name || index}>
                  <span>{experience.name || experience}</span>
                  <b>{signed(experience.modifier ?? 2)}</b>
                </li>
              ))}
              {(character.experiences || []).length === 0 && <li className="muted">No experiences recorded.</li>}
            </ul>
          </Panel>

          <Panel title="Gold">
            <div className={styles.gold}>
              <GoldRow
                label="Handfuls"
                count={GOLD_LIMITS.handfuls}
                value={stats.gold.handfuls}
                onSelect={(index) => setGold('handfuls', nextTrackValue(stats.gold.handfuls, index))}
              />
              <GoldRow
                label="Bags"
                count={GOLD_LIMITS.bags}
                value={stats.gold.bags}
                onSelect={(index) => setGold('bags', nextTrackValue(stats.gold.bags, index))}
              />
              <GoldRow
                label="Chest"
                count={GOLD_LIMITS.chest}
                value={stats.gold.chest}
                onSelect={(index) => setGold('chest', nextTrackValue(stats.gold.chest, index))}
              />
            </div>
          </Panel>

          {classInfo?.class_features?.length > 0 && (
            <Panel title="Class feature">
              {classInfo.class_features.map((feature) => (
                <p className={styles.feature} key={feature.name}><strong>{feature.name}.</strong> {feature.text}</p>
              ))}
            </Panel>
          )}
        </div>

        <div className={styles.right}>
          <Panel title="Traits">
            <div className={styles.traits}>
              {TRAIT_IDS.map((trait) => (
                <div className={styles.trait} key={trait}>
                  <span>{trait.toUpperCase()}</span>
                  <strong>{signed(character.traits?.[trait])}</strong>
                  <small>{TRAIT_ACTIONS[trait].join(' · ')}</small>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Character description">
            <p className={styles.descriptionText}>{character.description || '—'}</p>
            <div className={styles.appearanceGrid}>
              <Field label="Size" value={character.size} />
              <Field label="Height" value={character.height} />
              <Field label="Weight" value={character.weight} />
              <Field label="Eyes" value={character.eye_color} />
              <Field label="Hair" value={character.hair_color} />
              <Field label="Skin" value={character.skin_color} />
            </div>
            <p className={styles.lookDescription}>{character.look_description || 'No additional look details recorded.'}</p>
          </Panel>

          <Panel title="Active weapons">
            <p className={styles.hint}>Proficiency {derived.proficiency}</p>
            <WeaponRow title="Primary" weapon={primary} fallback={equipment.primary} />
            <WeaponRow title="Secondary" weapon={secondary} fallback={equipment.secondary} />
          </Panel>

          <Panel title="Active armor">
            <div className={styles.statLine}>
              <div><span>Name</span><strong>{armor?.name || titleize(equipment.armor) || '—'}</strong></div>
              <div><span>Base thresholds</span><strong>{armor?.thresholds || '—'}</strong></div>
              <div><span>Base score</span><strong>{armor?.armor_score ?? '—'}</strong></div>
            </div>
            {armor?.feature && <p className={styles.feature}>{armor.feature}</p>}
          </Panel>

          <Panel title="Inventory">
            <ul className={styles.inventory}>
              {[equipment.potion, ...(equipment.inventory || [])].filter(Boolean).map((item, index) => (
                <li key={typeof item === 'string' ? `${item}-${index}` : item.id}>
                  {typeof item === 'string' ? titleize(item) : item.name || item.id}
                </li>
              ))}
            </ul>
          </Panel>

          {(character.domain_cards || []).length > 0 && (
            <Panel title="Domain cards">
              <div className={styles.cards}>
                {character.domain_cards.map((card) => (
                  <article key={card.id || card.name}>
                    <span>{card.domain} · {card.type} · recall {card.recall_cost}</span>
                    <strong>{card.name}</strong>
                    <p>{card.text}</p>
                  </article>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>

    </section>
  );
}

function Field({ label, value }) {
  return <div className={styles.field}><span>{label}</span><strong>{value || '—'}</strong></div>;
}

function Shield({ label, value, note }) {
  return <div className={styles.shield}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

function Panel({ title, children }) {
  return <section className={styles.panel}><h3>{title}</h3>{children}</section>;
}

function Threshold({ name, mark, value }) {
  return <div className={styles.threshold}><span>{name}</span><strong>{value}</strong><small>{mark}</small></div>;
}

function TrackRow({ label, count, value, onSelect }) {
  return (
    <div className={styles.trackRow}>
      <span>{label}</span>
      <Track count={count} value={value} onSelect={onSelect} label={label} />
      <small>{value} / {count}</small>
    </div>
  );
}

function GoldRow({ label, count, value, onSelect }) {
  return (
    <div className={styles.goldRow}>
      <span>{label}</span>
      <Track count={count} value={value} onSelect={onSelect} label={label} shape="coin" />
    </div>
  );
}

function Track({ count, value, onSelect, label, shape = 'box', className = '' }) {
  const shapeClass = shape === 'diamond' ? styles.diamond : shape === 'coin' ? styles.coin : styles.box;
  return (
    <div className={`${styles.track} ${className}`}>
      {Array.from({ length: count }, (_, index) => (
        <button
          type="button"
          key={index}
          aria-label={`${label}: set to ${index + 1}`}
          aria-pressed={index < value}
          className={`${shapeClass} ${index < value ? styles.filled : ''}`}
          onClick={() => onSelect(index)}
        />
      ))}
      {count === 0 && <small className="muted">None</small>}
    </div>
  );
}

function WeaponRow({ title, weapon, fallback }) {
  return (
    <div className={styles.weapon}>
      <p className={styles.weaponTitle}>{title}</p>
      <div className={styles.statLine}>
        <div><span>Name</span><strong>{weapon?.name || titleize(fallback) || '—'}</strong></div>
        <div><span>Trait &amp; range</span><strong>{weapon ? `${titleize(weapon.trait)} · ${titleize(weapon.range)}` : '—'}</strong></div>
        <div><span>Damage</span><strong>{weapon?.damage || '—'}</strong></div>
      </div>
      {weapon?.feature && <p className={styles.feature}>{weapon.feature}</p>}
    </div>
  );
}
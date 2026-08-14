import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { listAdventures } from '../adventures/adventureApi';
import {
  advanceCharacter, generateCharacterImage, getCharacter, getCharacterCreationBook, linkCharacterToAdventure, updateCharacter, updateCharacterStats,
} from './characterApi';
import {
  GOLD_LIMITS, TRAIT_ACTIONS, TRAIT_IDS, deriveSheet, normalizeStats, tierForLevel,
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
const familyRelations = [
  'Friend', "Friend's family", 'Father', 'Mother', 'Brother', 'Sister', 'Step-father', 'Step-mother',
  'Step-brother', 'Step-sister', 'Grandfather', 'Grandmother', 'Uncle', 'Aunt', 'Cousin', 'Child',
  'Spouse or partner', 'Other',
];

const advancementOptions = [
  { id: 'traits', title: 'Increase two traits by +1', detail: 'Choose two traits that are not marked in the current tier.' },
  { id: 'hit_points', title: 'Gain one Hit Point slot', detail: 'Permanently increase your maximum Hit Points by 1.' },
  { id: 'stress', title: 'Gain one Stress slot', detail: 'Permanently increase your maximum Stress by 1.' },
  { id: 'experiences', title: 'Increase two Experiences by +1', detail: 'Choose two Experiences already on your sheet.' },
  { id: 'domain_card', title: 'Gain an additional domain card', detail: 'Choose a card from an available level and lower.' },
  { id: 'evasion', title: 'Gain +1 Evasion', detail: 'Permanently increase your Evasion by 1.' },
  { id: 'subclass', minTier: 3, title: 'Take an upgraded subclass card', detail: 'Record the upgraded subclass choice.' },
  { id: 'proficiency', minTier: 3, title: 'Increase your Proficiency by +1', detail: 'Permanently increase Proficiency by 1.' },
  { id: 'multiclass', minTier: 3, title: 'Take a multiclass option', detail: 'Choose an additional class and cross out the other multiclass option.' },
];

const milestoneLevels = new Set([2, 5, 8]);

function domainCardsFromBook(book) {
  return (book?.domains || []).flatMap((domain) => Object.entries(domain)
    .filter(([key, cards]) => /^level_\d+_cards$/.test(key) && Array.isArray(cards))
    .flatMap(([key, cards]) => cards.map((card) => ({ ...card, level: Number(key.match(/\d+/)[0]), domain: domain.name, domainId: domain.id }))));
}

function choiceSummary(choice, character, book) {
  if (choice?.id === 'traits') return `Traits: ${(choice.values || []).map(titleize).join(', ')}`;
  if (choice?.id === 'experiences') return `Experiences: ${(choice.values || []).map((index) => character.experiences?.[index]?.name || `Experience ${Number(index) + 1}`).join(', ')}`;
  if (choice?.id === 'domain_card') {
    const card = domainCardsFromBook(book).find((item) => item.id === choice.value && item.domainId === choice.domain_id);
    return `Domain card: ${card?.name || choice.value || 'selected card'}`;
  }
  if (choice?.id === 'multiclass') return `Multiclass: ${titleize(choice.value)}`;
  return advancementOptions.find((option) => option.id === choice?.id)?.title || choice?.id;
}

const withoutGoldInventory = (inventory) => (Array.isArray(inventory) ? inventory : [])
  .filter((item) => !/gold/i.test(typeof item === 'string' ? item : item?.name || ''));
const editableInventory = (inventory) => withoutGoldInventory(inventory).map((item, index) => typeof item === 'string'
  ? { id: `inventory-${index}`, name: item, quantity: 1 }
  : { id: item.id || `inventory-${index}`, name: item.name || item.id || '', quantity: item.quantity || 1 });

const editableCharacter = (value) => ({
  name: value.name || '', pronouns: value.pronouns || '', description: value.description || '',
  size: value.size || '', height: value.height || '', weight: value.weight || '', eye_color: value.eye_color || '',
  hair_color: value.hair_color || '', skin_color: value.skin_color || '', look_description: value.look_description || '',
  experiences: Array.isArray(value.experiences) ? value.experiences.map((item) => (typeof item === 'string' ? { name: item, modifier: 2 } : { ...item })) : [],
  equipment: {
    ...(value.equipment || {}),
    inventory: editableInventory(value.equipment?.inventory),
  },
  background_story: value.background_story || '', background_notes: value.background_notes || '',
  birth_city: value.birth_city || '',
  family_members: Array.isArray(value.family_members) ? value.family_members.map((member) => ({ ...member })) : [],
  connections: Array.isArray(value.connections) ? value.connections.join('\n') : value.connections || '',
});

export default function CharacterDetailPage({ mode = 'sheet' }) {
  const { characterId } = useParams();
  const [character, setCharacter] = useState(null);
  const [book, setBook] = useState(null);
  const [stats, setStats] = useState(null);
  const [adventures, setAdventures] = useState([]);
  const [selectedAdventure, setSelectedAdventure] = useState('');
  const [editForm, setEditForm] = useState(null);
  const [portraitLoading, setPortraitLoading] = useState(false);
  const [advancementOpen, setAdvancementOpen] = useState(false);
  const [adventureState, setAdventureState] = useState({ loading: true, error: '' });
  const [state, setState] = useState({ loading: true, saving: false, error: '' });

  useEffect(() => {
    Promise.all([
      getCharacter(characterId),
      listAdventures()
        .then((items) => ({ items, error: '' }))
        .catch((error) => ({ items: [], error: error.message })),
      getCharacterCreationBook().then((response) => response.content).catch(() => null),
    ])
      .then(([nextCharacter, adventureResult, nextBook]) => {
        setCharacter(nextCharacter);
        setEditForm(editableCharacter(nextCharacter));
        setAdventures(adventureResult.items);
        setAdventureState({ loading: false, error: adventureResult.error });
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

  const updateEditField = (field, value) => setEditForm((current) => ({ ...current, [field]: value }));
  const updateEquipmentField = (field, value) => setEditForm((current) => ({ ...current, equipment: { ...current.equipment, [field]: value } }));
  const updateExperience = (index, value) => setEditForm((current) => ({
    ...current,
    experiences: current.experiences.map((experience, experienceIndex) => experienceIndex === index ? { ...experience, name: value } : experience),
  }));
  const addExperience = () => setEditForm((current) => ({ ...current, experiences: [...current.experiences, { name: '', modifier: 2 }] }));
  const removeExperience = (index) => setEditForm((current) => ({ ...current, experiences: current.experiences.filter((_, experienceIndex) => experienceIndex !== index) }));
  const updateInventoryItem = (index, field, value) => setEditForm((current) => ({
    ...current,
    equipment: { ...current.equipment, inventory: current.equipment.inventory.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item) },
  }));
  const addInventoryItem = () => setEditForm((current) => ({
    ...current,
    equipment: { ...current.equipment, inventory: [...current.equipment.inventory, { id: `custom-${Date.now()}`, name: '', quantity: 1 }] },
  }));
  const removeInventoryItem = (index) => setEditForm((current) => ({
    ...current,
    equipment: { ...current.equipment, inventory: current.equipment.inventory.filter((_, itemIndex) => itemIndex !== index) },
  }));
  const updateFamilyMember = (index, field, value) => setEditForm((current) => ({
    ...current,
    family_members: current.family_members.map((member, memberIndex) => memberIndex === index ? { ...member, [field]: value } : member),
  }));
  const addFamilyMember = () => setEditForm((current) => ({ ...current, family_members: [...current.family_members, { id: `family-${Date.now()}`, relation: 'Friend', name: '', details: '' }] }));
  const removeFamilyMember = (index) => setEditForm((current) => ({ ...current, family_members: current.family_members.filter((_, memberIndex) => memberIndex !== index) }));
  const saveCharacter = async () => {
    setState((current) => ({ ...current, saving: true, error: '' }));
    try {
      const updated = await updateCharacter(characterId, {
        ...editForm,
        experiences: editForm.experiences.filter((experience) => experience.name.trim()),
        connections: editForm.connections.split('\n').map((connection) => connection.trim()).filter(Boolean),
        equipment: { ...editForm.equipment, inventory: editableInventory(editForm.equipment.inventory) },
      });
      setCharacter(updated);
      setEditForm(editableCharacter(updated));
      setState({ loading: false, saving: false, error: '' });
    } catch (error) {
      setState({ loading: false, saving: false, error: error.message });
    }
  };
  const generatePortrait = async () => {
    setPortraitLoading(true);
    setState((current) => ({ ...current, error: '' }));
    try {
      const updated = await generateCharacterImage(characterId);
      setCharacter(updated);
      setEditForm(editableCharacter(updated));
      setState((current) => ({ ...current, saving: false, error: '' }));
    } catch (error) {
      setState((current) => ({ ...current, error: error.message }));
    } finally {
      setPortraitLoading(false);
    }
  };

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

  if (mode === 'edit') {
    return (
      <section className={styles.sheet}>
        <div className={styles.topBar}>
          <Link to={`/characters/${characterId}`} className={styles.back}>Back to character sheet</Link>
          <Link to={`/characters/${characterId}/profile`} className={styles.back}>View character profile</Link>
        </div>
        <header className={styles.pageHeading}>
          <div><p className="eyebrow">CHARACTER EDITOR</p><h2>Edit {character.name}</h2><p className="muted">Update your character details, story, equipment, and portrait.</p></div>
          <div className={styles.pageHeadingActions}>
            <label className={styles.adventure}>Adventure
              <select value={selectedAdventure} onChange={updateAdventure} disabled={state.saving || adventureState.loading}>
                <option value="">Not linked</option>
                {selectedAdventure && !adventures.some((adventure) => adventure.id === selectedAdventure) && <option value={selectedAdventure}>Current linked adventure</option>}
                {adventures.map((adventure) => <option value={adventure.id} key={adventure.id}>{adventure.name}</option>)}
              </select>
            </label>
            <button type="button" className={styles.editButton} disabled={portraitLoading} onClick={generatePortrait}>{portraitLoading ? 'Generating image...' : 'Generate character image'}</button>
          </div>
        </header>
        {adventureState.error && <p className={styles.error} role="status">Available adventures could not be loaded. The current link is preserved.</p>}
        {state.error && <p className={styles.error}>{state.error}</p>}
        <CharacterEditor form={editForm} updateField={updateEditField} updateEquipmentField={updateEquipmentField} updateExperience={updateExperience} addExperience={addExperience} removeExperience={removeExperience} updateInventoryItem={updateInventoryItem} addInventoryItem={addInventoryItem} removeInventoryItem={removeInventoryItem} updateFamilyMember={updateFamilyMember} addFamilyMember={addFamilyMember} removeFamilyMember={removeFamilyMember} />
        <div className={styles.editActions}>
          <Link to={`/characters/${characterId}`} className={styles.cancelButton}>Cancel</Link>
          <button type="button" className={styles.editButton} disabled={state.saving} onClick={saveCharacter}>{state.saving ? 'Saving...' : 'Save character'}</button>
        </div>
      </section>
    );
  }

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
      <div className={styles.editActions}>
        <Link to={`/characters/${characterId}/profile`} className={styles.cancelButton}>Character profile</Link>
        {character.class_id === 'druid' && <Link to={`/characters/${characterId}/beastforms`} className={styles.cancelButton}>Beast forms</Link>}
        <Link to={`/characters/${characterId}/edit`} className={styles.editButton}>Edit character</Link>
      </div>

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
        <button
          type="button"
          className={styles.level}
          aria-expanded={advancementOpen}
          aria-controls="character-advancement"
          aria-label={`Open level-up options for level ${derived.level}`}
          onClick={() => setAdvancementOpen(true)}
        >
          <span>LEVEL</span><strong>{derived.level}</strong>
        </button>
      </header>

      {advancementOpen && <AdvancementPanel
        character={character}
        book={book}
        onClose={() => setAdvancementOpen(false)}
        onAdvanced={(updated) => {
          setCharacter(updated);
          setStats(normalizeStats(updated.stats, deriveSheet(updated, book)));
          setAdvancementOpen(false);
        }}
      />}

      <div className={styles.columns}>
        <div className={styles.left}>
          <div className={styles.defenses}>
            <Shield label="Evasion" value={derived.evasion} note="Class + level" />
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
                  <b>{signed((experience.modifier ?? 2) + (derived.experienceBonuses[index] || 0))}</b>
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
                  <strong>{signed((Number(character.traits?.[trait]) || 0) + (derived.traitBonuses[trait] || 0))}</strong>
                  <small>{TRAIT_ACTIONS[trait].join(' · ')}</small>
                </div>
              ))}
            </div>
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
              {[equipment.potion, ...withoutGoldInventory(equipment.inventory)].filter(Boolean).map((item, index) => (
                <li key={typeof item === 'string' ? `${item}-${index}` : item.id}>
                  {typeof item === 'string' ? titleize(item) : item.name || item.id}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Background">
            <div className={styles.statLine}>
              <div><span>Birth city</span><strong>{character.birth_city || '—'}</strong></div>
            </div>
            {character.background_story && <p className={styles.feature}>{character.background_story}</p>}
            {character.background_notes && <p className={styles.hint}>{character.background_notes}</p>}
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

function AdvancementPanel({ character, book, onClose, onAdvanced }) {
  const nextLevel = character.level + 1;
  const tier = tierForLevel(nextLevel);
  const [choices, setChoices] = useState([]);
  const [experience, setExperience] = useState('');
  const [showPreviousUpgrades, setShowPreviousUpgrades] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const classDomains = new Set(book?.classes?.find((item) => item.id === character.class_id)?.domains || []);
  const ownedCardKeys = new Set((character.domain_cards || []).map((card) => `${card.domainId || card.domain_id || ''}:${card.id || ''}`));
  const availableCards = domainCardsFromBook(book).filter((card) => classDomains.has(card.domainId))
    .filter((card) => Number(card.level || 1) <= nextLevel)
    .filter((card) => !ownedCardKeys.has(`${card.domainId}:${card.id}`));
  const availableTraits = (() => {
    const marked = new Set();
    (character.advancements || []).forEach((entry) => {
      if (entry.level === 5 || entry.level === 8) marked.clear();
      (entry.choices || []).filter((choice) => choice.id === 'traits').flatMap((choice) => choice.values || []).forEach((trait) => marked.add(trait));
    });
    if (nextLevel === 5 || nextLevel === 8) marked.clear();
    return TRAIT_IDS.filter((trait) => !marked.has(trait));
  })();
  const options = advancementOptions.filter((option) => !option.minTier || option.minTier <= tier);
  const previousTier = tier - 1;
  const previousTierMarked = new Set((character.advancements || [])
    .filter((entry) => tierForLevel(entry.level) === previousTier)
    .flatMap((entry) => entry.choices || [])
    .filter((choice) => (choice.sourceTier || previousTier) === previousTier)
    .map((choice) => choice.id));
  const previousOptions = options.filter((option) => !option.minTier || option.minTier <= previousTier)
    .filter((option) => !previousTierMarked.has(option.id));
  const selected = (id) => choices.find((choice) => choice.id === id);

  useEffect(() => {
    setChoices([]);
    setExperience('');
    setShowPreviousUpgrades(false);
    setError('');
  }, [character.level]);

  const toggleOption = (id, sourceTier = tier) => setChoices((current) => {
    if (current.some((choice) => choice.id === id)) return current.filter((choice) => choice.id !== id);
    if (current.length >= 2) return current;
    return [...current, { id, sourceTier, values: [] }];
  });
  const updateValues = (id, values) => setChoices((current) => current.map((choice) => choice.id === id ? { ...choice, values } : choice));
  const toggleValue = (id, value) => {
    const choice = selected(id);
    const values = choice?.values || [];
    updateValues(id, values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  };
  const ready = choices.length === 2 && choices.every((choice) => (
    (choice.id === 'traits' || choice.id === 'experiences') ? choice.values.length === 2
      : (choice.id === 'domain_card' || choice.id === 'multiclass') ? Boolean(choice.value) : true
  )) && (!milestoneLevels.has(nextLevel) || experience.trim());
  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const updated = await advanceCharacter(character.id, {
        level: nextLevel,
        choices,
        experience: milestoneLevels.has(nextLevel) ? experience.trim() : null,
      });
      onAdvanced(updated);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  };

  const renderOption = (option, sourceTier = tier) => {
    const choice = selected(option.id);
    return <div className={`${styles.advancementOption} ${choice ? styles.selectedAdvancement : ''}`} key={`${sourceTier}-${option.id}`}>
      <label><input type="checkbox" checked={Boolean(choice)} disabled={option.id === 'domain_card' && availableCards.length === 0} onChange={() => toggleOption(option.id, sourceTier)} /><span><strong>{option.title}</strong><small>{option.detail}</small></span></label>
      {choice?.id === 'traits' && <div className={styles.choiceDetails}><span>Available traits</span>{availableTraits.map((trait) => <label key={trait}><input type="checkbox" checked={choice.values.includes(trait)} onChange={() => toggleValue('traits', trait)} />{titleize(trait)}</label>)}</div>}
      {choice?.id === 'experiences' && <div className={styles.choiceDetails}><span>Experiences to improve</span>{(character.experiences || []).map((item, index) => <label key={index}><input type="checkbox" checked={choice.values.includes(index)} onChange={() => toggleValue('experiences', index)} />{item.name || item}</label>)}</div>}
      {choice?.id === 'domain_card' && <div className={styles.choiceDetails}><span>Domain card (current level or lower)</span><select value={choice.value ? `${choice.domain_id}:${choice.value}` : ''} onChange={(event) => {
        const [domainId, cardId] = event.target.value.split(':');
        setChoices((current) => current.map((item) => item.id === 'domain_card' ? { ...item, value: cardId || '', domain_id: domainId || '' } : item));
      }}><option value="">Choose a card</option>{Object.entries(availableCards.reduce((groups, card) => ({ ...groups, [card.domainId]: [...(groups[card.domainId] || []), card] }), {})).map(([domainId, cards]) => <optgroup label={cards[0].domain} key={domainId}>{cards.map((card) => <option value={`${card.domainId}:${card.id}`} key={`${card.domainId}:${card.id}`}>Level {card.level}: {card.name}</option>)}</optgroup>)}</select></div>}
      {choice?.id === 'multiclass' && <div className={styles.choiceDetails}><span>Additional class</span><select value={choice.value || ''} onChange={(event) => setChoices((current) => current.map((item) => item.id === 'multiclass' ? { ...item, value: event.target.value } : item))}><option value="">Choose a class</option>{(book?.classes || []).filter((item) => item.id !== character.class_id).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div>}
    </div>;
  };

  return <section className={styles.advancementPanel} id="character-advancement">
    <div className={styles.advancementHeader}>
      <div><p className="eyebrow">LEVEL {character.level} · TIER {tier}</p><h3>{nextLevel <= 10 ? `Advance to level ${nextLevel}` : 'Character at maximum level'}</h3></div>
      <div className={styles.advancementActions}>
        {nextLevel <= 10 && <span className={styles.choiceCount}>{choices.length}/2 choices</span>}
        <button type="button" className={styles.textButton} onClick={onClose}>Close</button>
      </div>
    </div>
    {nextLevel <= 10 ? <>
      <p className={styles.hint}>Tier {tier} lets you choose from this tier and every option from earlier tiers. One of your two choices must be an unowned domain card from your class.</p>
      {availableCards.length === 0 && <p className={styles.error}>No valid unowned domain card is available for this level. Add an eligible card to the content book before advancing.</p>}
      {milestoneLevels.has(nextLevel) && <label className={styles.milestone}><span>Additional Experience at +2</span><input value={experience} onChange={(event) => setExperience(event.target.value)} placeholder="Name the new Experience" /></label>}
      <div className={styles.advancementOptions}>
        {options.map((option) => renderOption(option))}
      </div>
      {tier >= 3 && <div className={styles.previousUpgrades}>
        <button type="button" className={styles.textButton} onClick={() => setShowPreviousUpgrades((current) => !current)}>
          {showPreviousUpgrades ? 'Hide previous unmarked upgrades' : 'View previous unmarked upgrades'}
        </button>
        {showPreviousUpgrades && <>
          <p className={styles.hint}>Choose an upgrade from Tier {previousTier} that has not been marked there yet.</p>
          {previousOptions.length > 0 ? <div className={styles.advancementOptions}>{previousOptions.map((option) => renderOption(option, previousTier))}</div> : <p className={styles.hint}>All previous-tier upgrades are already marked.</p>}
        </>}
      </div>}
      {error && <p className={styles.error}>{error}</p>}
      <button type="button" className={styles.editButton} disabled={!ready || saving} onClick={submit}>{saving ? 'Saving level...' : `Save level ${nextLevel}`}</button>
    </> : <p className={styles.hint}>All ten levels have been recorded for this character.</p>}
    <div className={styles.advancementHistory}>
      <h4>Advancement history</h4>
      {(character.advancements || []).length === 0 && <p className={styles.hint}>No levels beyond level 1 yet.</p>}
      {(character.advancements || []).map((entry) => <div className={styles.historyEntry} key={entry.level}><strong>Level {entry.level}</strong><span>{entry.experience ? `New Experience: ${entry.experience}` : ''}</span>{(entry.choices || []).map((choice, index) => <small key={`${entry.level}-${index}`}>{choiceSummary(choice, character, book)}</small>)}</div>)}
    </div>
  </section>;
}

function CharacterEditor({ form, updateField, updateEquipmentField, updateExperience, addExperience, removeExperience, updateInventoryItem, addInventoryItem, removeInventoryItem, updateFamilyMember, addFamilyMember, removeFamilyMember }) {
  const input = (label, field, type = 'input', maxLength) => <label className={styles.editField}><span>{label}</span>{type === 'textarea' ? <textarea value={form[field]} onChange={(event) => updateField(field, event.target.value)} /> : <input maxLength={maxLength} value={form[field]} onChange={(event) => updateField(field, event.target.value)} />}</label>;
  return <section className={styles.editor}>
    <h3>Edit character</h3>
    <div className={styles.editorGrid}>
      {input('Name', 'name')}{input('Pronouns', 'pronouns')}{input('Description', 'description', 'textarea')}
      {input('Size', 'size')}{input('Height', 'height')}{input('Weight', 'weight')}{input('Eye color', 'eye_color')}{input('Hair color', 'hair_color')}{input('Skin color', 'skin_color')}{input('Look description', 'look_description', 'textarea')}
    </div>
    <div className={styles.editorSection}>
      <h4>Active equipment</h4>
      <div className={styles.editorGrid}>
        <label className={styles.editField}><span>Primary weapon</span><input value={form.equipment.primary || ''} onChange={(event) => updateEquipmentField('primary', event.target.value)} /></label>
        <label className={styles.editField}><span>Secondary weapon</span><input value={form.equipment.secondary || ''} onChange={(event) => updateEquipmentField('secondary', event.target.value)} /></label>
        <label className={styles.editField}><span>Armor</span><input value={form.equipment.armor || ''} onChange={(event) => updateEquipmentField('armor', event.target.value)} /></label>
      </div>
    </div>
    <div className={styles.editorSection}>
      <h4>Experiences</h4>
      {form.experiences.map((experience, index) => <div className={styles.editorRow} key={index}><input value={experience.name || ''} onChange={(event) => updateExperience(index, event.target.value)} placeholder="Experience" /><button type="button" className={styles.removeButton} onClick={() => removeExperience(index)}>Remove</button></div>)}
      <button type="button" className={styles.textButton} onClick={addExperience}>Add experience</button>
    </div>
    <div className={styles.editorSection}>
      <h4>Inventory</h4>
      {form.equipment.inventory.map((item, index) => <div className={styles.editorRow} key={item.id || index}><input value={item.name} onChange={(event) => updateInventoryItem(index, 'name', event.target.value)} placeholder="Item" /><input className={styles.quantity} type="number" min="1" value={item.quantity} onChange={(event) => updateInventoryItem(index, 'quantity', Number(event.target.value) || 1)} aria-label="Quantity" /><button type="button" className={styles.removeButton} onClick={() => removeInventoryItem(index)}>Remove</button></div>)}
      <button type="button" className={styles.textButton} onClick={addInventoryItem}>Add inventory item</button>
    </div>
    <div className={styles.editorSection}>
      <h4>Background</h4>
      <div className={styles.editorGrid}>{input('Birth city', 'birth_city', 'input', 160)}{input('Background story', 'background_story', 'textarea')}{input('Background notes', 'background_notes', 'textarea')}{input('Connections', 'connections', 'textarea')}</div>
      {form.family_members.map((member, index) => <div className={styles.familyEditRow} key={member.id || index}>
        <select value={member.relation || 'Other'} onChange={(event) => updateFamilyMember(index, 'relation', event.target.value)}>{familyRelations.map((relation) => <option value={relation} key={relation}>{relation}</option>)}</select>
        <input value={member.name || ''} onChange={(event) => updateFamilyMember(index, 'name', event.target.value)} placeholder="Name" />
        <input value={member.details || ''} onChange={(event) => updateFamilyMember(index, 'details', event.target.value)} placeholder="Specific details" />
        <button type="button" className={styles.removeButton} onClick={() => removeFamilyMember(index)}>Remove</button>
      </div>)}
      <button type="button" className={styles.textButton} onClick={addFamilyMember}>Add family member</button>
    </div>
  </section>;
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
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../components/Button/Button';
import { exportBooks, listBooks, updateBookContent } from './adminApi';
import { FrameDraftForm, TableEditor } from '../adventures/CreateAdventurePage';
import { contentToForm, draftToContent, emptyFrame, frameEditorSections } from '../frames/frameDraft';
import {
  BEAST_FEATURES_KEY, DOMAIN_LEVELS, WEAPON_GROUPS, beastForm, beastFormKey, clone, domainCard, domainCardKey,
  feature, flattenBeastForms, flattenDomainCards, flattenWeapons, newAncestry, newClass, newCommunity,
  newDomain, normalizeBookContent, normalizeSubclass, normalizeWeapon,
} from './bookContentEditorUtils';
import styles from './BookContentEditorPage.module.css';


function FeatureList({ title, items, onChange, onAdd, onRemove }) {
  return (
    <div className={styles.featureList}>
      <div className={styles.sectionHeading}>
        <h4>{title}</h4>
        <button type="button" className={styles.smallButton} onClick={onAdd}>Add feature</button>
      </div>
      {items.map((item, index) => (
        <div className={styles.featureRow} key={`${title}-${index}`}>
          <input aria-label={`${title} feature name ${index + 1}`} value={item.name || ''} placeholder="Feature name" onChange={(event) => onChange(index, 'name', event.target.value)} />
          <textarea aria-label={`${title} feature text ${index + 1}`} value={item.text || ''} placeholder="Feature description" onChange={(event) => onChange(index, 'text', event.target.value)} />
          <button type="button" className={styles.removeButton} onClick={() => onRemove(index)}>Remove</button>
          <TableEditor table={item.table} onChange={(table) => onChange(index, 'table', table)} label={`${title} feature ${index + 1} table`} />
        </div>
      ))}
      {items.length === 0 && <p className="muted">No features added.</p>}
    </div>
  );
}

function SubclassEditor({ subclass, onChange, onRemove }) {
  const update = (field, value) => onChange({ ...subclass, [field]: value });
  const updateFeature = (collection, index, field, value) => update(collection, subclass[collection].map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  const renderFeatureList = (collection, title) => (
    <FeatureList
      title={title}
      items={subclass[collection]}
      onAdd={() => update(collection, [...subclass[collection], feature()])}
      onRemove={(index) => update(collection, subclass[collection].filter((_, itemIndex) => itemIndex !== index))}
      onChange={(index, field, value) => updateFeature(collection, index, field, value)}
    />
  );

  return (
    <div className={styles.subclassEditor}>
      <div className={styles.editorHeading}>
        <h4>{subclass.name || 'Unnamed subclass'}</h4>
        <button type="button" className={styles.removeButton} onClick={onRemove}>Remove subclass</button>
      </div>
      <div className={styles.formGrid}>
        <label>Subclass ID<input value={subclass.id} onChange={(event) => update('id', event.target.value)} /></label>
        <label>Subclass name<input value={subclass.name} onChange={(event) => update('name', event.target.value)} /></label>
        <label className={styles.wide}>Subclass description<textarea value={subclass.site_description || ''} onChange={(event) => update('site_description', event.target.value)} /></label>
        <label>Spellcast trait<input value={subclass.spellcast_trait || ''} onChange={(event) => update('spellcast_trait', event.target.value)} /></label>
      </div>
      {renderFeatureList('foundation', 'Foundation features')}
      {renderFeatureList('specialization', 'Specialization features')}
      {renderFeatureList('mastery', 'Mastery features')}
    </div>
  );
}

function BeastFormEditor({ form, features, onChange, onRemove }) {
  const update = (field, value) => onChange({ ...form, [field]: value });
  return (
    <div className={styles.subclassEditor}>
      <div className={styles.editorHeading}>
        <h4>{form.name || 'Unnamed beast form'}</h4>
        <button type="button" className={styles.removeButton} onClick={onRemove}>Remove beast form</button>
      </div>
      <div className={styles.formGrid}>
        <label>Form ID<input value={form.id} onChange={(event) => update('id', event.target.value)} /></label>
        <label>Form name<input value={form.name} onChange={(event) => update('name', event.target.value)} /></label>
        <label>Tier<input type="number" min="1" max="4" value={form.tier} onChange={(event) => update('tier', Number(event.target.value) || 1)} /></label>
        <label>Evasion bonus<input type="number" value={form.evasion_bonus} onChange={(event) => update('evasion_bonus', Number(event.target.value) || 0)} /></label>
        <label>Attack range<input value={form.attack_range} onChange={(event) => update('attack_range', event.target.value)} placeholder="Melee" /></label>
        <label className={styles.wide}>Examples<textarea value={form.examples.join('\n')} onChange={(event) => update('examples', event.target.value.split('\n').map((value) => value.trim()).filter(Boolean))} placeholder="Dire Wolf, Velociraptor, Sabertooth Tiger" /></label>
        <label>Attack trait<input value={form.attack_trait} onChange={(event) => update('attack_trait', event.target.value)} placeholder="Strength" /></label>
        <label>Attack trait bonus<input type="number" value={form.attack_bonus} onChange={(event) => update('attack_bonus', Number(event.target.value) || 0)} /></label>
        <label>Attack damage<input value={form.attack_damage} onChange={(event) => update('attack_damage', event.target.value)} placeholder="d12+8 phy" /></label>
        <label className={styles.wide}>Gain advantage on<input value={form.advantages.join(', ')} onChange={(event) => update('advantages', event.target.value.split(',').map((value) => value.trim()).filter(Boolean))} placeholder="attack, sneak, sprint" /></label>
        <label className={styles.wide}>Carrier<textarea value={form.carrier} onChange={(event) => update('carrier', event.target.value)} /></label>
        <fieldset className={styles.featureChoices}>
          <legend>Shared features</legend>
          {features.map((item) => <label className={styles.featureChoice} key={item.id}><input type="checkbox" checked={form.feature_ids.includes(item.id)} onChange={(event) => update('feature_ids', event.target.checked ? [...form.feature_ids, item.id] : form.feature_ids.filter((id) => id !== item.id))} /><span>{item.name || 'Unnamed feature'}</span></label>)}
        </fieldset>
      </div>
      {features.length === 0 && <p className="muted">No shared beast features exist yet. Add one from the Beast features page.</p>}
    </div>
  );
}

function WeaponEditor({ item, onChange, onRemove }) {
  const field = (label, name, type = 'input') => <label>{label}{type === 'textarea' ? <textarea value={item[name] || ''} onChange={(event) => onChange(name, event.target.value)} /> : <input value={item[name] || ''} onChange={(event) => onChange(name, event.target.value)} />}</label>;
  return (
    <div className={styles.editor}>
      <div className={styles.editorHeading}><div><p className="eyebrow">{item.groupLabel}</p><h3>{item.name || 'Unnamed item'}</h3></div><button type="button" className={styles.removeButton} onClick={onRemove}>Remove item</button></div>
      <div className={styles.formGrid}>
        {field('Item ID', 'id')}
        {field('Name', 'name')}
        <label>Tier<input type="number" min="1" max="4" value={item.tier} onChange={(event) => onChange('tier', Number(event.target.value) || 1)} /></label>
        {field('Trait', 'trait')}
        {field('Range', 'range')}
        {field('Damage', 'damage')}
        {field('Burden', 'burden')}
        {item.group !== 'armor' && <label><span>Magic weapon</span><input type="checkbox" checked={Boolean(item.is_magic)} onChange={(event) => onChange('is_magic', event.target.checked)} /></label>}
        {field('Armor score', 'armor_score')}
        {field('Thresholds', 'thresholds')}
        <label className={styles.wide}>Feature<textarea value={item.feature || ''} onChange={(event) => onChange('feature', event.target.value)} /></label>
      </div>
    </div>
  );
}

function DomainCardEditor({ card, onChange, onRemove }) {
  const field = (label, name, type = 'input') => <label>{label}{type === 'textarea' ? <textarea value={card[name] || ''} onChange={(event) => onChange(name, event.target.value)} /> : <input value={card[name] || ''} onChange={(event) => onChange(name, event.target.value)} />}</label>;
  return (
    <div className={styles.editor}>
      <div className={styles.editorHeading}><div><p className="eyebrow">DOMAIN CARD</p><h3>{card.name || 'Unnamed card'}</h3></div><button type="button" className={styles.removeButton} onClick={onRemove}>Remove card</button></div>
      <div className={styles.formGrid}>
        {field('Card ID', 'id')}
        {field('Name', 'name')}
        <label>Level<select value={card.level} onChange={(event) => onChange('level', Number(event.target.value))}>{DOMAIN_LEVELS.map((level) => <option value={level} key={level}>Level {level}</option>)}</select></label>
        {field('Type', 'type')}
        <label>Recall cost<input type="number" min="0" value={card.recall_cost} onChange={(event) => onChange('recall_cost', Number(event.target.value) || 0)} /></label>
        {field('Text', 'text', 'textarea')}
      </div>
    </div>
  );
}

function AncestryEditor({ ancestry, onChange, onRemove }) {
  const update = (field, value) => onChange({ ...ancestry, [field]: value });
  return (
    <div className={styles.editor}>
      <div className={styles.editorHeading}><div><p className="eyebrow">ANCESTRY</p><h3>{ancestry.name || 'Unnamed ancestry'}</h3></div><button type="button" className={styles.removeButton} onClick={onRemove}>Remove ancestry</button></div>
      <div className={styles.formGrid}>
        <label>Ancestry ID<input value={ancestry.id} onChange={(event) => update('id', event.target.value)} /></label>
        <label>Ancestry name<input value={ancestry.name} onChange={(event) => update('name', event.target.value)} /></label>
        <label className={styles.wide}>Selection rules<textarea value={ancestry.selection_rules} onChange={(event) => update('selection_rules', event.target.value)} /></label>
      </div>
      <FeatureList title="Ancestry features" items={ancestry.features} onAdd={() => update('features', [...ancestry.features, feature()])} onRemove={(index) => update('features', ancestry.features.filter((_, itemIndex) => itemIndex !== index))} onChange={(index, field, value) => update('features', ancestry.features.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item))} />
    </div>
  );
}

function CommunityEditor({ community, onChange, onRemove }) {
  const update = (field, value) => onChange({ ...community, [field]: value });
  return (
    <div className={styles.editor}>
      <div className={styles.editorHeading}><div><p className="eyebrow">COMMUNITY</p><h3>{community.name || 'Unnamed community'}</h3></div><button type="button" className={styles.removeButton} onClick={onRemove}>Remove community</button></div>
      <div className={styles.formGrid}>
        <label>Community ID<input value={community.id} onChange={(event) => update('id', event.target.value)} /></label>
        <label>Community name<input value={community.name} onChange={(event) => update('name', event.target.value)} /></label>
        <label className={styles.wide}>Adjectives<textarea value={community.adjectives.join('\n')} onChange={(event) => update('adjectives', event.target.value.split('\n').map((value) => value.trim()).filter(Boolean))} placeholder="amiable\ncandid\nenterprising" /></label>
      </div>
      <FeatureList title="Community features" items={community.features} onAdd={() => update('features', [...community.features, feature()])} onRemove={(index) => update('features', community.features.filter((_, itemIndex) => itemIndex !== index))} onChange={(index, field, value) => update('features', community.features.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item))} />
    </div>
  );
}

function TierGroups({ items, selectedKey, onSelect, emptyLabel, itemLabel }) {
  return [1, 2, 3, 4].map((tier) => {
    const tierItems = items.filter((item) => Number(item.tier) === tier);
    return (
      <details className={styles.tierGroup} key={tier}>
        <summary>Tier {tier}<span>{tierItems.length}</span></summary>
        <div className={styles.tierItems}>
          {tierItems.map((item) => <button type="button" className={`${styles.classButton} ${item.key === selectedKey ? styles.selected : ''}`} key={item.key} onClick={() => onSelect(item)}><strong>{item.name || `Unnamed ${itemLabel}`}</strong>{item.className && <span>{item.className}</span>}</button>)}
          {tierItems.length === 0 && <p className="muted">{emptyLabel}</p>}
        </div>
      </details>
    );
  });
}

function LevelGroups({ items, selectedKey, onSelect, emptyLabel }) {
  return DOMAIN_LEVELS.map((level) => {
    const levelItems = items.filter((item) => Number(item.level) === level);
    return (
      <details className={styles.tierGroup} key={level}>
        <summary>Level {level}<span>{levelItems.length}</span></summary>
        <div className={styles.tierItems}>
          {levelItems.map((item) => <button type="button" className={`${styles.classButton} ${item.key === selectedKey ? styles.selected : ''}`} key={item.key} onClick={() => onSelect(item)}><strong>{item.name || 'Unnamed card'}</strong><span>{item.type || 'card'}</span></button>)}
          {levelItems.length === 0 && <p className="muted">{emptyLabel}</p>}
        </div>
      </details>
    );
  });
}

export default function BookContentEditorPage() {
  const [books, setBooks] = useState([]);
  const [bookId, setBookId] = useState('');
  const [content, setContent] = useState(null);
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [classForm, setClassForm] = useState(null);
  const [selectedSubclassId, setSelectedSubclassId] = useState('');
  const [selectedAncestryId, setSelectedAncestryId] = useState('');
  const [ancestryForm, setAncestryForm] = useState(null);
  const [selectedCommunityId, setSelectedCommunityId] = useState('');
  const [communityForm, setCommunityForm] = useState(null);
  const [selectedDomainId, setSelectedDomainId] = useState('');
  const [domainForm, setDomainForm] = useState(null);
  const [selectedDomainCardKey, setSelectedDomainCardKey] = useState('');
  const [domainCardOriginalId, setDomainCardOriginalId] = useState('');
  const [domainCardOriginalLevel, setDomainCardOriginalLevel] = useState(1);
  const [domainCardForm, setDomainCardForm] = useState(null);
  const [editorType, setEditorType] = useState('classes');
  const [selectedBeastFormKey, setSelectedBeastFormKey] = useState('');
  const [beastFormOwnerId, setBeastFormOwnerId] = useState('');
  const [beastFormOriginalId, setBeastFormOriginalId] = useState('');
  const [beastFormForm, setBeastFormForm] = useState(null);
  const [selectedWeaponKey, setSelectedWeaponKey] = useState('');
  const [weaponOriginalId, setWeaponOriginalId] = useState('');
  const [weaponOriginalGroup, setWeaponOriginalGroup] = useState('');
  const [weaponForm, setWeaponForm] = useState(null);
  const [selectedFrameId, setSelectedFrameId] = useState('');
  const [frameOriginalId, setFrameOriginalId] = useState('');
  const [frameForm, setFrameForm] = useState(null);
  const [frameActiveSection, setFrameActiveSection] = useState('details');
  const [connections, setConnections] = useState('');
  const [state, setState] = useState({ loading: true, saving: false, error: '', message: '' });

  const openBook = (book) => {
    if (!book) return;
    const nextContent = normalizeBookContent(book.content);
    const nextClasses = nextContent.classes;
    setBookId(book.id);
    setContent(nextContent);
    setClasses(nextClasses);
    setSelectedClassId(nextClasses[0]?.id || '');
    const nextBeastForm = flattenBeastForms(nextClasses)[0];
    const nextWeapon = flattenWeapons(nextContent.equipment)[0];
    const nextAncestry = nextContent.ancestries[0];
    const nextCommunity = nextContent.communities[0];
    const nextDomain = nextContent.domains[0];
    const nextDomainCard = flattenDomainCards(nextContent.domains)[0];
    const nextFrame = nextContent.frames?.[0];
    setSelectedBeastFormKey(nextBeastForm?.key || '');
    setSelectedWeaponKey(nextWeapon?.key || '');
    setSelectedAncestryId(nextAncestry?.id || '');
    setSelectedCommunityId(nextCommunity?.id || '');
    setSelectedDomainId(nextDomain?.id || '');
    setSelectedDomainCardKey(nextDomainCard?.key || '');
    setSelectedFrameId(nextFrame?.id || '');
    setFrameActiveSection('details');
    setEditorType('classes');
    setConnections(nextContent.character_creation?.connections_prompt || '');
    setState((current) => ({ ...current, error: '', message: '' }));
  };

  useEffect(() => {
    listBooks()
      .then((response) => {
        setBooks(response);
        if (response[0]) openBook(response[0]);
        setState((current) => ({ ...current, loading: false }));
      })
      .catch((error) => setState({ loading: false, saving: false, error: error.message, message: '' }));
  }, []);

  useEffect(() => {
    const selected = classes.find((item) => item.id === selectedClassId);
    setClassForm(selected ? clone(selected) : null);
    setSelectedSubclassId(selected?.subclasses[0]?.id || '');
  }, [classes, selectedClassId]);

  useEffect(() => {
    const selected = flattenBeastForms(classes).find((item) => item.key === selectedBeastFormKey);
    setBeastFormOwnerId(selected?.classId || '');
    setBeastFormOriginalId(selected?.id || '');
    setBeastFormForm(selected ? clone(selected) : null);
  }, [classes, selectedBeastFormKey]);

  useEffect(() => {
    const selected = flattenWeapons(content?.equipment).find((item) => item.key === selectedWeaponKey);
    setWeaponOriginalId(selected?.id || '');
    setWeaponOriginalGroup(selected?.group || '');
    setWeaponForm(selected ? clone(selected) : null);
  }, [content, selectedWeaponKey]);

  useEffect(() => {
    const selected = (content?.ancestries || []).find((item) => item.id === selectedAncestryId);
    setAncestryForm(selected ? clone(selected) : null);
  }, [content, selectedAncestryId]);

  useEffect(() => {
    const selected = (content?.communities || []).find((item) => item.id === selectedCommunityId);
    setCommunityForm(selected ? clone(selected) : null);
  }, [content, selectedCommunityId]);

  useEffect(() => {
    const selected = (content?.domains || []).find((item) => item.id === selectedDomainId);
    setDomainForm(selected ? clone(selected) : null);
  }, [content, selectedDomainId]);

  useEffect(() => {
    const selected = (content?.frames || []).find((item) => item.id === selectedFrameId);
    setFrameOriginalId(selected?.id || '');
    setFrameForm(selected ? contentToForm(selected) : null);
    setFrameActiveSection('details');
  }, [content, selectedFrameId]);

  useEffect(() => {
    const selected = flattenDomainCards(content?.domains).find((item) => item.key === selectedDomainCardKey);
    setDomainCardOriginalId(selected?.id || '');
    setDomainCardOriginalLevel(selected?.level || 1);
    setDomainCardForm(selected ? clone(selected) : null);
  }, [content, selectedDomainCardKey]);

  const selectedBook = books.find((book) => book.id === bookId);
  const selectedSubclass = classForm?.subclasses.find((item) => item.id === selectedSubclassId);
  const beastFeatures = (content?.[BEAST_FEATURES_KEY] || []).slice().sort((left, right) => left.name.localeCompare(right.name));
  const beastForms = flattenBeastForms(classes);
  const ancestries = content?.ancestries || [];
  const communities = content?.communities || [];
  const domains = content?.domains || [];
  const frames = content?.frames || [];
  const domainCards = flattenDomainCards(domains).filter((item) => item.domainId === selectedDomainId);
  const weapons = flattenWeapons(content?.equipment);
  const weaponGroups = WEAPON_GROUPS.map((group) => ({
    ...group,
    items: weapons.filter((item) => item.group === group.id),
  }));
  const activeWeaponGroup = weaponGroups.find((group) => group.id === editorType);
  const isWeaponEditor = Boolean(activeWeaponGroup);
  const updateClass = (field, value) => setClassForm((current) => ({ ...current, [field]: value }));
  const updateHope = (field, value) => updateClass('hope_feature', { ...classForm.hope_feature, [field]: value });
  const updateSubclass = (subclass) => {
    updateClass('subclasses', classForm.subclasses.map((item) => item.id === selectedSubclassId ? subclass : item));
    if (subclass.id !== selectedSubclassId) setSelectedSubclassId(subclass.id);
  };

  const addClass = () => {
    const id = `new-class-${classes.length + 1}`;
    setClasses((current) => [...current, newClass(id)]);
    setSelectedClassId(id);
    setEditorType('classes');
  };

  const removeClass = () => {
    if (!classForm || !window.confirm(`Remove ${classForm.name || classForm.id}?`)) return;
    const remaining = classes.filter((item) => item.id !== selectedClassId);
    setClasses(remaining);
    setSelectedClassId(remaining[0]?.id || '');
  };

  const addSubclass = () => {
    const id = `new-subclass-${(classForm.subclasses?.length || 0) + 1}`;
    updateClass('subclasses', [...classForm.subclasses, normalizeSubclass({ id, name: 'New subclass' })]);
    setSelectedSubclassId(id);
  };

  const addBeastForm = () => {
    const owner = classes.find((item) => item.id === beastFormOwnerId) || classes.find((item) => item.id === selectedClassId) || classes[0];
    if (!owner) return;
    const id = `new-beast-form-${owner.beast_forms.length + 1}`;
    const nextForm = beastForm(id);
    setClasses((current) => current.map((item) => item.id === owner.id ? { ...item, beast_forms: [...item.beast_forms, nextForm] } : item));
    setBeastFormOwnerId(owner.id);
    setSelectedBeastFormKey(beastFormKey(owner.id, id));
    setEditorType('beastforms');
  };

  const updateBeastForm = (form) => {
    setBeastFormForm(form);
  };

  const removeBeastForm = () => {
    if (!beastFormForm || !window.confirm(`Remove ${beastFormForm.name || beastFormForm.id}?`)) return;
    const remaining = classes.find((item) => item.id === beastFormOwnerId)?.beast_forms.filter((form) => form.id !== beastFormOriginalId) || [];
    const nextForms = classes.map((item) => item.id === beastFormOwnerId ? { ...item, beast_forms: item.beast_forms.filter((form) => form.id !== beastFormOriginalId) } : item);
    setClasses(nextForms);
    const next = remaining[0];
    setSelectedBeastFormKey(next ? beastFormKey(beastFormOwnerId, next.id) : '');
  };

  const addWeapon = (group) => {
    const id = `new-${group}-${(content.equipment[group] || []).length + 1}`;
    const nextWeapon = normalizeWeapon({ id, name: 'New item', tier: 1 }, group);
    setContent((current) => ({ ...current, equipment: { ...current.equipment, [group]: [...(current.equipment[group] || []), nextWeapon] } }));
    setSelectedWeaponKey(`${group}::${id}`);
    setEditorType(group);
  };

  const openWeaponGroup = (group) => {
    setEditorType(group.id);
    const first = weapons.find((item) => item.group === group.id);
    setSelectedWeaponKey(first?.key || '');
  };

  const updateWeapon = (field, value) => {
    setWeaponForm((current) => ({ ...current, [field]: value }));
  };

  const removeWeapon = () => {
    if (!weaponForm || !window.confirm(`Remove ${weaponForm.name || weaponForm.id}?`)) return;
    setContent((current) => ({ ...current, equipment: { ...current.equipment, [weaponOriginalGroup]: current.equipment[weaponOriginalGroup].filter((item) => item.id !== weaponOriginalId) } }));
    setSelectedWeaponKey('');
  };

  const removeSubclass = () => {
    if (!selectedSubclass || !window.confirm(`Remove ${selectedSubclass.name || selectedSubclass.id}?`)) return;
    const remaining = classForm.subclasses.filter((item) => item.id !== selectedSubclassId);
    updateClass('subclasses', remaining);
    setSelectedSubclassId(remaining[0]?.id || '');
  };

  const addAncestry = () => {
    const id = `new-ancestry-${ancestries.length + 1}`;
    setContent((current) => ({ ...current, ancestries: [...(current.ancestries || []), newAncestry(id)] }));
    setSelectedAncestryId(id);
    setEditorType('ancestries');
  };

  const removeAncestry = () => {
    if (!ancestryForm || !window.confirm(`Remove ${ancestryForm.name || ancestryForm.id}?`)) return;
    const remaining = ancestries.filter((item) => item.id !== selectedAncestryId);
    setContent((current) => ({ ...current, ancestries: current.ancestries.filter((item) => item.id !== selectedAncestryId) }));
    setSelectedAncestryId(remaining[0]?.id || '');
  };

  const addCommunity = () => {
    const id = `new-community-${communities.length + 1}`;
    setContent((current) => ({ ...current, communities: [...(current.communities || []), newCommunity(id)] }));
    setSelectedCommunityId(id);
    setEditorType('communities');
  };

  const removeCommunity = () => {
    if (!communityForm || !window.confirm(`Remove ${communityForm.name || communityForm.id}?`)) return;
    const remaining = communities.filter((item) => item.id !== selectedCommunityId);
    setContent((current) => ({ ...current, communities: current.communities.filter((item) => item.id !== selectedCommunityId) }));
    setSelectedCommunityId(remaining[0]?.id || '');
  };

  const addDomain = () => {
    const id = `new-domain-${domains.length + 1}`;
    const nextDomain = newDomain(id);
    setContent((current) => ({ ...current, domains: [...(current.domains || []), nextDomain] }));
    setSelectedDomainId(id);
    setSelectedDomainCardKey('');
    setEditorType('domains');
  };

  const removeDomain = () => {
    if (!domainForm || !window.confirm(`Remove ${domainForm.name || domainForm.id}?`)) return;
    const remaining = domains.filter((item) => item.id !== selectedDomainId);
    setContent((current) => ({ ...current, domains: current.domains.filter((item) => item.id !== selectedDomainId) }));
    setSelectedDomainId(remaining[0]?.id || '');
    setSelectedDomainCardKey('');
  };

  const addDomainCard = () => {
    const owner = domains.find((item) => item.id === selectedDomainId) || domains[0];
    if (!owner) return;
    const level = 1;
    const key = `level_${level}_cards`;
    const id = `new-${owner.id}-card-${(owner[key] || []).length + 1}`;
    const nextCard = domainCard(id);
    setContent((current) => ({ ...current, domains: current.domains.map((item) => item.id === owner.id ? { ...item, [key]: [...(item[key] || []), nextCard] } : item) }));
    setSelectedDomainId(owner.id);
    setSelectedDomainCardKey(domainCardKey(owner.id, level, id));
    setEditorType('domains');
  };

  const updateDomainCard = (field, value) => setDomainCardForm((current) => ({ ...current, [field]: value }));

  const removeDomainCard = () => {
    if (!domainCardForm || !window.confirm(`Remove ${domainCardForm.name || domainCardForm.id}?`)) return;
    setContent((current) => ({ ...current, domains: current.domains.map((item) => item.id === selectedDomainId ? { ...item, [`level_${domainCardOriginalLevel}_cards`]: (item[`level_${domainCardOriginalLevel}_cards`] || []).filter((card) => card.id !== domainCardOriginalId) } : item) }));
    setSelectedDomainCardKey('');
  };

  const addFrame = () => {
    const id = `new-frame-${frames.length + 1}`;
    const nextFrame = { ...emptyFrame(), id, name: 'New campaign frame' };
    setContent((current) => ({ ...current, frames: [...(current.frames || []), nextFrame] }));
    setSelectedFrameId(id);
    setFrameActiveSection('details');
    setEditorType('frames');
  };

  const removeFrame = () => {
    if (!frameForm || !window.confirm(`Remove ${frameForm.name || frameForm.id}?`)) return;
    const remaining = frames.filter((item) => item.id !== frameOriginalId);
    setContent((current) => ({ ...current, frames: current.frames.filter((item) => item.id !== frameOriginalId) }));
    setSelectedFrameId(remaining[0]?.id || '');
  };

  const save = async () => {
    if (!content) return;
    if (editorType === 'classes' && (!classForm?.id || !classForm.name.trim())) {
      setState((current) => ({ ...current, error: 'A class needs an ID and name.', message: '' }));
      return;
    }
    if (editorType === 'beastforms' && (!beastFormForm?.id || !beastFormForm.name.trim())) {
      setState((current) => ({ ...current, error: 'A beast form needs an ID and name.', message: '' }));
      return;
    }
    if (editorType === 'ancestries' && (!ancestryForm?.id || !ancestryForm.name.trim())) {
      setState((current) => ({ ...current, error: 'An ancestry needs an ID and name.', message: '' }));
      return;
    }
    if (editorType === 'communities' && (!communityForm?.id || !communityForm.name.trim())) {
      setState((current) => ({ ...current, error: 'A community needs an ID and name.', message: '' }));
      return;
    }
    if (editorType === 'domains' && (!domainForm?.id || !domainForm.name.trim())) {
      setState((current) => ({ ...current, error: 'A domain needs an ID and name.', message: '' }));
      return;
    }
    if (editorType === 'domains' && domainCardForm && (!domainCardForm.id || !domainCardForm.name.trim())) {
      setState((current) => ({ ...current, error: 'A domain card needs an ID and name.', message: '' }));
      return;
    }
    if (isWeaponEditor && (!weaponForm?.id || !weaponForm.name.trim())) {
      setState((current) => ({ ...current, error: 'A weapon or armor item needs an ID and name.', message: '' }));
      return;
    }
    if (editorType === 'frames' && (!frameForm?.id || !frameForm.name.trim() || !frameForm.pitch.trim() || !frameForm.overview.trim())) {
      setState((current) => ({ ...current, error: 'A campaign frame needs an ID, name, pitch, and overview.', message: '' }));
      return;
    }
    const nextContent = clone(content);
    if (editorType === 'classes') {
      nextContent.classes = classes.map((item) => item.id === selectedClassId ? classForm : item);
    } else if (editorType === 'beastforms') {
      const persistedBeastForm = clone(beastFormForm);
      delete persistedBeastForm.classId;
      delete persistedBeastForm.className;
      delete persistedBeastForm.key;
      nextContent.classes = classes.map((item) => item.id === beastFormOwnerId ? {
        ...item,
        beast_forms: item.beast_forms.map((form) => form.id === beastFormOriginalId ? persistedBeastForm : form),
      } : item);
    } else if (editorType === 'ancestries') {
      nextContent.ancestries = nextContent.ancestries.map((item) => item.id === selectedAncestryId ? clone(ancestryForm) : item);
    } else if (editorType === 'communities') {
      nextContent.communities = nextContent.communities.map((item) => item.id === selectedCommunityId ? clone(communityForm) : item);
    } else if (isWeaponEditor) {
      const persistedWeapon = clone(weaponForm);
      delete persistedWeapon.group;
      delete persistedWeapon.groupLabel;
      delete persistedWeapon.key;
      nextContent.equipment[weaponOriginalGroup] = nextContent.equipment[weaponOriginalGroup].map((item) => item.id === weaponOriginalId ? persistedWeapon : item);
    } else if (editorType === 'domains') {
      const persistedDomain = clone(domainForm);
      nextContent.domains = nextContent.domains.map((item) => item.id === selectedDomainId ? persistedDomain : item);
      if (domainCardForm) {
        const persistedDomainCard = clone(domainCardForm);
        const targetLevel = Number(persistedDomainCard.level) || domainCardOriginalLevel;
        delete persistedDomainCard.level;
        delete persistedDomainCard.domainId;
        delete persistedDomainCard.domainName;
        delete persistedDomainCard.key;
        nextContent.domains = nextContent.domains.map((item) => {
          if (item.id !== persistedDomain.id) return item;
          const nextDomain = { ...item };
          const originalKey = `level_${domainCardOriginalLevel}_cards`;
          const targetKey = `level_${targetLevel}_cards`;
          nextDomain[originalKey] = (nextDomain[originalKey] || []).filter((card) => card.id !== domainCardOriginalId);
          nextDomain[targetKey] = [...(nextDomain[targetKey] || []), persistedDomainCard];
          return nextDomain;
        });
      }
    } else if (editorType === 'frames') {
      nextContent.frames = nextContent.frames.map((item) => item.id === frameOriginalId
        ? { ...item, ...draftToContent(frameForm, content) }
        : item);
    }
    nextContent.character_creation = { ...(nextContent.character_creation || {}), connections_prompt: connections };
    setState({ loading: false, saving: true, error: '', message: '' });
    try {
      const saved = await updateBookContent(bookId, nextContent);
      setBooks((current) => current.map((book) => book.id === saved.id ? saved : book));
      const normalized = normalizeBookContent(saved.content);
      setContent(normalized);
      setClasses(normalized.classes);
      if (editorType === 'classes') {
        setSelectedClassId(classForm.id);
        setSelectedSubclassId(selectedSubclass?.id || '');
      } else if (editorType === 'beastforms') {
        setSelectedBeastFormKey(beastFormKey(beastFormOwnerId, beastFormForm.id));
      } else if (editorType === 'ancestries') {
        setSelectedAncestryId(ancestryForm.id);
      } else if (editorType === 'communities') {
        setSelectedCommunityId(communityForm.id);
      } else if (isWeaponEditor) {
        setSelectedWeaponKey(`${weaponOriginalGroup}::${weaponForm.id}`);
      } else if (editorType === 'domains') {
        setSelectedDomainId(domainForm.id);
        setSelectedDomainCardKey(domainCardForm ? domainCardKey(domainForm.id, Number(domainCardForm.level) || domainCardOriginalLevel, domainCardForm.id) : '');
      } else if (editorType === 'frames') {
        setSelectedFrameId(frameForm.id);
      }
      setState({ loading: false, saving: false, error: '', message: 'Book content saved.' });
    } catch (error) {
      setState({ loading: false, saving: false, error: error.message, message: '' });
    }
  };

  const download = async () => {
    try {
      const exported = await exportBooks();
      const blob = new Blob([JSON.stringify({ books: exported }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'dagger-adventure-books.json';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setState((current) => ({ ...current, error: error.message, message: '' }));
    }
  };

  if (state.loading) return <p className="muted">Loading book content...</p>;
  if (!selectedBook || !content) return <section className={styles.notice}><p className="eyebrow">CONTENT LIBRARY</p><h2>No books imported</h2><p className="muted">Import a book before editing its content.</p></section>;

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div><p className="eyebrow">ADMINISTRATION / CONTENT</p><h2>Book content studio</h2><p className="muted">Edit stored classes, equipment, domains, frames, and cards, then save the complete book.</p></div>
        <Button type="button" variant="text" onClick={download}>Export all books</Button>
      </header>
      <div className={styles.toolbar}>
        <label>Book<select value={bookId} onChange={(event) => openBook(books.find((book) => book.id === event.target.value))}>{books.map((book) => <option value={book.id} key={book.id}>{book.title} - {book.version}</option>)}</select></label>
        <span className={styles.meta}>{selectedBook.source_file}</span>
      </div>
      <div className={styles.entityTabs}>
        <button type="button" className={editorType === 'classes' ? styles.activeTab : ''} onClick={() => setEditorType('classes')}>Classes</button>
        <button type="button" className={editorType === 'beastforms' ? styles.activeTab : ''} onClick={() => setEditorType('beastforms')}>Beast forms</button>
        <button type="button" className={editorType === 'ancestries' ? styles.activeTab : ''} onClick={() => setEditorType('ancestries')}>Ancestries</button>
        <button type="button" className={editorType === 'communities' ? styles.activeTab : ''} onClick={() => setEditorType('communities')}>Communities</button>
        <button type="button" className={editorType === 'domains' ? styles.activeTab : ''} onClick={() => setEditorType('domains')}>Domains</button>
        <button type="button" className={editorType === 'frames' ? styles.activeTab : ''} onClick={() => setEditorType('frames')}>Frames</button>
        {weaponGroups.map((group) => <button type="button" className={editorType === group.id ? styles.activeTab : ''} onClick={() => openWeaponGroup(group)} key={group.id}>{group.label}</button>)}
        <Link to="/admin/content/books/beast-features" className={styles.featureLink}>Manage shared beast features</Link>
      </div>
      <div className={styles.layout}>
        {editorType === 'classes' && <aside className={styles.sidebar}>
          <div className={styles.sectionHeading}><h3>Classes</h3><button type="button" className={styles.smallButton} onClick={addClass}>Add class</button></div>
          {classes.map((item) => <button type="button" className={`${styles.classButton} ${item.id === selectedClassId ? styles.selected : ''}`} key={item.id} onClick={() => setSelectedClassId(item.id)}><strong>{item.name || 'Unnamed class'}</strong><span>{item.id}</span></button>)}
        </aside>}
        {editorType === 'beastforms' && <aside className={styles.sidebar}>
          <div className={styles.sectionHeading}><h3>Beast forms</h3><button type="button" className={styles.smallButton} onClick={addBeastForm}>Add beast form</button></div>
          <label className={styles.sidebarField}>Class<select value={beastFormOwnerId || selectedClassId} onChange={(event) => { setBeastFormOwnerId(event.target.value); setSelectedClassId(event.target.value); }}>
            {classes.map((item) => <option value={item.id} key={item.id}>{item.name || item.id}</option>)}
          </select></label>
          <TierGroups items={beastForms} selectedKey={selectedBeastFormKey} onSelect={(item) => { setSelectedBeastFormKey(item.key); setSelectedClassId(item.classId); setBeastFormOwnerId(item.classId); }} emptyLabel="No beast forms added." itemLabel="beast form" />
        </aside>}
        {editorType === 'ancestries' && <aside className={styles.sidebar}>
          <div className={styles.sectionHeading}><h3>Ancestries</h3><button type="button" className={styles.smallButton} onClick={addAncestry}>Add ancestry</button></div>
          {ancestries.map((item) => <button type="button" className={`${styles.classButton} ${item.id === selectedAncestryId ? styles.selected : ''}`} key={item.id} onClick={() => setSelectedAncestryId(item.id)}><strong>{item.name || 'Unnamed ancestry'}</strong><span>{item.id}</span></button>)}
        </aside>}
        {editorType === 'communities' && <aside className={styles.sidebar}>
          <div className={styles.sectionHeading}><h3>Communities</h3><button type="button" className={styles.smallButton} onClick={addCommunity}>Add community</button></div>
          {communities.map((item) => <button type="button" className={`${styles.classButton} ${item.id === selectedCommunityId ? styles.selected : ''}`} key={item.id} onClick={() => setSelectedCommunityId(item.id)}><strong>{item.name || 'Unnamed community'}</strong><span>{item.id}</span></button>)}
        </aside>}
        {isWeaponEditor && <aside className={styles.sidebar}>
          <div className={styles.sectionHeading}><h3>{activeWeaponGroup.label}</h3><button type="button" className={styles.smallButton} onClick={() => addWeapon(activeWeaponGroup.id)}>Add {activeWeaponGroup.label.toLowerCase().replace('weapons', 'weapon')}</button></div>
          <TierGroups items={activeWeaponGroup.items} selectedKey={selectedWeaponKey} onSelect={(item) => setSelectedWeaponKey(item.key)} emptyLabel={`No ${activeWeaponGroup.label.toLowerCase()} added.`} itemLabel="item" />
        </aside>}
        {editorType === 'domains' && <aside className={styles.sidebar}>
          <div className={styles.sectionHeading}><h3>Domains</h3><button type="button" className={styles.smallButton} onClick={addDomain}>Add domain</button></div>
          {domains.map((item) => <button type="button" className={`${styles.classButton} ${item.id === selectedDomainId ? styles.selected : ''}`} key={item.id} onClick={() => { setSelectedDomainId(item.id); setSelectedDomainCardKey(''); }}><strong>{item.name || 'Unnamed domain'}</strong><span>{item.id}</span></button>)}
          {domainForm && <>
            <div className={styles.sectionHeading}><h3>Cards</h3><button type="button" className={styles.smallButton} onClick={addDomainCard}>Add card</button></div>
            <LevelGroups items={domainCards} selectedKey={selectedDomainCardKey} onSelect={(item) => setSelectedDomainCardKey(item.key)} emptyLabel="No cards at this level." />
          </>}
        </aside>}
        {editorType === 'frames' && <aside className={styles.sidebar}>
          <div className={styles.sectionHeading}><h3>Campaign frames</h3><button type="button" className={styles.smallButton} onClick={addFrame}>Add frame</button></div>
          {frames.map((item) => <button type="button" className={`${styles.classButton} ${item.id === selectedFrameId ? styles.selected : ''}`} key={item.id} onClick={() => { setSelectedFrameId(item.id); setFrameActiveSection('details'); }}><strong>{item.name || 'Unnamed frame'}</strong><span>{item.id}</span></button>)}
          {frames.length === 0 && <p className="muted">No campaign frames added.</p>}
          {frameForm && <nav className={styles.frameSections} aria-label="Campaign frame sections">
            <h3>Frame sections</h3>
            {frameEditorSections.map((section) => <button type="button" className={frameActiveSection === section.id ? styles.activeSection : ''} key={section.id} onClick={() => setFrameActiveSection(section.id)} aria-current={frameActiveSection === section.id ? 'page' : undefined}>{section.label}</button>)}
          </nav>}
        </aside>}
        {editorType === 'classes' && classForm && (
          <div className={styles.editor}>
            <div className={styles.editorHeading}><div><p className="eyebrow">CLASS</p><h3>{classForm.name || 'Unnamed class'}</h3></div><button type="button" className={styles.removeButton} onClick={removeClass}>Remove class</button></div>
            <div className={styles.formGrid}>
              <label>Class ID<input value={classForm.id} onChange={(event) => updateClass('id', event.target.value)} /></label>
              <label>Class name<input value={classForm.name} onChange={(event) => updateClass('name', event.target.value)} /></label>
              <label className={styles.wide}>Class description<textarea value={classForm.site_description || ''} onChange={(event) => updateClass('site_description', event.target.value)} /></label>
              <label>Domains<input value={classForm.domains.join(', ')} onChange={(event) => updateClass('domains', event.target.value.split(',').map((value) => value.trim()).filter(Boolean))} placeholder="codex, grace" /></label>
              <label>Starting evasion<input type="number" value={classForm.evasion} onChange={(event) => updateClass('evasion', Number(event.target.value))} /></label>
              <label>Starting hit points<input type="number" value={classForm.hit_points} onChange={(event) => updateClass('hit_points', Number(event.target.value))} /></label>
              <label className={styles.wide}>Class items<textarea value={classForm.class_items.join('\n')} onChange={(event) => updateClass('class_items', event.target.value.split('\n').filter(Boolean))} placeholder="One item per line" /></label>
            </div>
            <div className={styles.panel}><h3>Hope feature</h3><div className={styles.formGrid}><label>Name<input value={classForm.hope_feature.name || ''} onChange={(event) => updateHope('name', event.target.value)} /></label><label className={styles.wide}>Description<textarea value={classForm.hope_feature.text || ''} onChange={(event) => updateHope('text', event.target.value)} /></label></div></div>
            <FeatureList title="Class features" items={classForm.class_features} onAdd={() => updateClass('class_features', [...classForm.class_features, feature()])} onRemove={(index) => updateClass('class_features', classForm.class_features.filter((_, itemIndex) => itemIndex !== index))} onChange={(index, field, value) => updateClass('class_features', classForm.class_features.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item))} />
            <label className={styles.wide}>Background questions<textarea value={classForm.background_questions.join('\n')} onChange={(event) => updateClass('background_questions', event.target.value.split('\n').filter(Boolean))} placeholder="One question per line" /></label>
            <div className={styles.panel}>
              <div className={styles.sectionHeading}><h3>Subclasses</h3><button type="button" className={styles.smallButton} onClick={addSubclass}>Add subclass</button></div>
              <div className={styles.subclassTabs}>{classForm.subclasses.map((item) => <button type="button" className={item.id === selectedSubclassId ? styles.activeTab : ''} key={item.id} onClick={() => setSelectedSubclassId(item.id)}>{item.name || 'Unnamed subclass'}</button>)}</div>
              {selectedSubclass ? <SubclassEditor subclass={selectedSubclass} onChange={updateSubclass} onRemove={removeSubclass} /> : <p className="muted">Add a subclass to edit its features.</p>}
            </div>
            <label className={styles.wide}>Connections prompt<textarea value={connections} onChange={(event) => setConnections(event.target.value)} /></label>
            {(state.error || state.message) && <p className={state.error ? styles.error : styles.message} role="status">{state.error || state.message}</p>}
            <Button type="button" disabled={state.saving} onClick={save}>{state.saving ? 'Saving book...' : 'Save book content'}</Button>
          </div>
        )}
        {editorType === 'beastforms' && beastFormForm && (
          <div className={styles.editor}>
            <div className={styles.formGrid}>
              <label>Class<select value={beastFormOwnerId} onChange={(event) => {
                const nextClass = classes.find((item) => item.id === event.target.value);
                if (!nextClass || nextClass.id === beastFormOwnerId) return;
                setClasses((current) => current.map((item) => item.id === beastFormOwnerId ? { ...item, beast_forms: item.beast_forms.filter((form) => form.id !== beastFormOriginalId) } : item.id === nextClass.id ? { ...item, beast_forms: [...item.beast_forms, beastFormForm] } : item));
                setBeastFormOwnerId(nextClass.id);
                setSelectedBeastFormKey(beastFormKey(nextClass.id, beastFormForm.id));
              }}>{classes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
            </div>
            <BeastFormEditor form={beastFormForm} features={beastFeatures} onChange={updateBeastForm} onRemove={removeBeastForm} />
            {(state.error || state.message) && <p className={state.error ? styles.error : styles.message} role="status">{state.error || state.message}</p>}
            <Button type="button" disabled={state.saving} onClick={save}>{state.saving ? 'Saving book...' : 'Save beast form'}</Button>
          </div>
        )}
        {editorType === 'ancestries' && ancestryForm && <AncestryEditor ancestry={ancestryForm} onChange={setAncestryForm} onRemove={removeAncestry} />}
        {editorType === 'communities' && communityForm && <CommunityEditor community={communityForm} onChange={setCommunityForm} onRemove={removeCommunity} />}
        {isWeaponEditor && weaponForm && (
          <WeaponEditor item={weaponForm} onChange={updateWeapon} onRemove={removeWeapon} />
        )}
        {editorType === 'domains' && domainForm && (
          <div className={styles.editor}>
            <div className={styles.editorHeading}><div><p className="eyebrow">DOMAIN</p><h3>{domainForm.name || 'Unnamed domain'}</h3></div><button type="button" className={styles.removeButton} onClick={removeDomain}>Remove domain</button></div>
            <div className={styles.formGrid}>
              <label>Domain ID<input value={domainForm.id} onChange={(event) => setDomainForm((current) => ({ ...current, id: event.target.value }))} /></label>
              <label>Domain name<input value={domainForm.name} onChange={(event) => setDomainForm((current) => ({ ...current, name: event.target.value }))} /></label>
              <label>Classes<input value={domainForm.classes.join(', ')} onChange={(event) => setDomainForm((current) => ({ ...current, classes: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) }))} placeholder="druid, sorcerer" /></label>
              <label className={styles.wide}>Description<textarea value={domainForm.description} onChange={(event) => setDomainForm((current) => ({ ...current, description: event.target.value }))} /></label>
            </div>
            {domainCardForm ? <DomainCardEditor card={domainCardForm} onChange={updateDomainCard} onRemove={removeDomainCard} /> : <p className="muted">Select a level in the sidebar to edit a domain card, or add a new card.</p>}
            {(state.error || state.message) && <p className={state.error ? styles.error : styles.message} role="status">{state.error || state.message}</p>}
            <Button type="button" disabled={state.saving} onClick={save}>{state.saving ? 'Saving book...' : 'Save book content'}</Button>
          </div>
        )}
        {editorType === 'frames' && frameForm && (
          <div className={styles.editor}>
            <div className={styles.editorHeading}><div><p className="eyebrow">CAMPAIGN FRAME</p><h3>{frameForm.name || 'Unnamed frame'}</h3></div><button type="button" className={styles.removeButton} onClick={removeFrame}>Remove frame</button></div>
            <div className={styles.frameForm}>
              <FrameDraftForm form={frameForm} update={(field, value) => setFrameForm((current) => ({ ...current, [field]: value }))} optionLists={content} activeSection={frameActiveSection} />
            </div>
            {(state.error || state.message) && <p className={state.error ? styles.error : styles.message} role="status">{state.error || state.message}</p>}
            <Button type="button" disabled={state.saving} onClick={save}>{state.saving ? 'Saving book...' : 'Save frame'}</Button>
          </div>
        )}
      </div>
    </section>
  );
}

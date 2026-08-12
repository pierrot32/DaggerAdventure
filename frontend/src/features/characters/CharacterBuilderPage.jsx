import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../../components/Button/Button';
import { createCharacter, generateCharacter, getCharacterCreationBook } from './characterApi';
import styles from './CharacterBuilderPage.module.css';

const stepIds = ['identity', 'appearance', 'traits', 'equipment', 'background', 'experiences', 'domain_cards', 'connections'];
const stepDetails = [
  { id: 'identity', title: 'Identity & heritage', description: 'Name your character and choose the class, subclass, ancestry, and community that shape them.' },
  { id: 'appearance', title: 'Character description', description: 'Give the table a clear sense of your character, from physical details to clothing and memorable features.' },
  { id: 'traits', title: 'Traits', description: 'Assign your starting modifiers.' },
  { id: 'equipment', title: 'Starting equipment', description: 'Choose your weapons, armor, and first potion.' },
  { id: 'background', title: 'Background', description: 'Leave a few threads from your past for the table to discover.' },
  { id: 'experiences', title: 'Experiences', description: 'Name two specific skills or pieces of history.' },
  { id: 'domain_cards', title: 'Domain cards', description: 'Choose two level 1 domain cards.' },
  { id: 'connections', title: 'Connections', description: 'Decide who your character trusts, owes, challenges, or remembers.' },
];
const traitIds = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'];
const identityGenerationFields = ['name', 'pronouns', 'class_id', 'subclass_id', 'ancestry_id', 'secondary_ancestry_id', 'community_id'];
const appearanceGenerationFields = ['description', 'size', 'height', 'weight', 'eye_color', 'hair_color', 'skin_color', 'look_description'];
const experienceGenerationFields = ['experience_1', 'experience_2'];
const backgroundGenerationFields = ['background_story', 'family_members', 'background_notes'];
const generationFields = [...identityGenerationFields, ...appearanceGenerationFields, ...experienceGenerationFields, ...backgroundGenerationFields];
const formFieldByGenerationField = {
  name: 'name', pronouns: 'pronouns', description: 'description', size: 'size', height: 'height', weight: 'weight',
  eye_color: 'eyeColor', hair_color: 'hairColor', skin_color: 'skinColor', look_description: 'lookDescription',
  class_id: 'classId', subclass_id: 'subclassId', ancestry_id: 'ancestryId', secondary_ancestry_id: 'secondaryAncestryId', community_id: 'communityId',
  background_story: 'backgroundStory', family_members: 'familyMembers', background_notes: 'backgroundNotes',
};
const fieldLabels = {
  name: 'name', pronouns: 'pronouns', description: 'description', size: 'size', height: 'height', weight: 'weight',
  eye_color: 'eye color', hair_color: 'hair color', skin_color: 'skin color', look_description: 'look description',
  class_id: 'class', subclass_id: 'subclass', ancestry_id: 'ancestry', secondary_ancestry_id: 'second ancestry', community_id: 'community',
  background_story: 'background story', family_members: 'family members', background_notes: 'background notes',
  experience_1: 'experience one', experience_2: 'experience two',
};
const familyRelations = [
  'Friend', "Friend's family", 'Father', 'Mother', 'Brother', 'Sister', 'Step-father', 'Step-mother',
  'Step-brother', 'Step-sister', 'Grandfather', 'Grandmother', 'Uncle', 'Aunt', 'Cousin', 'Child',
  'Spouse or partner', 'Other',
];

const emptyForm = {
  name: '', pronouns: '', description: '', size: '', height: '', weight: '', eyeColor: '', hairColor: '', skinColor: '', lookDescription: '',
  classId: '', subclassId: '', ancestryId: '', firstAncestryId: '', secondaryAncestryId: '', communityId: '',
  traits: Object.fromEntries(traitIds.map((trait) => [trait, ''])),
  primaryWeapon: '', secondaryWeapon: '', armor: '', potion: 'minor-health-potion',
  experiences: ['', ''], backgroundStory: '', backgroundNotes: '', familyMembers: [], background: '', connections: '', domainCards: [],
};
const emptyLocks = Object.fromEntries(generationFields.map((field) => [field, false]));

function proposedTraitsFor(classInfo, subclassInfo, traitProposals) {
  const traits = Object.fromEntries(Object.entries(traitProposals[classInfo?.id] || {}).map(([trait, value]) => [trait, String(value)]));
  traitIds.forEach((trait) => {
    if (!(trait in traits)) traits[trait] = '';
  });
  const spellcastTrait = subclassInfo?.spellcast_trait;
  if (spellcastTrait && traits[spellcastTrait] !== '2') {
    const currentPrimary = traitIds.find((trait) => traits[trait] === '2');
    if (currentPrimary) traits[currentPrimary] = '1';
    traits[spellcastTrait] = '2';
  }
  return traits;
}

function newFamilyMember() {
  return { id: `${Date.now()}-${Math.random()}`, relation: 'Friend', name: '', details: '' };
}

function normalizeFamilyMembers(members) {
  return (Array.isArray(members) ? members : []).map((member) => ({
    id: member.id || `${Date.now()}-${Math.random()}`,
    relation: member.relation || 'Other',
    name: member.name || '',
    details: member.details || '',
  }));
}

export default function CharacterBuilderPage() {
  const navigate = useNavigate();
  const [book, setBook] = useState(null);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [locks, setLocks] = useState(emptyLocks);
  const [state, setState] = useState({ loading: true, saving: false, error: '', success: '' });
  const [aiState, setAiState] = useState({ loading: false, error: '' });

  useEffect(() => {
    getCharacterCreationBook()
      .then((response) => {
        setBook(response.content);
        setState((current) => ({ ...current, loading: false }));
      })
      .catch((error) => setState({ loading: false, saving: false, error: error.message, success: '' }));
  }, []);

  const classes = book?.classes || [];
  const ancestries = book?.ancestries || [];
  const communities = book?.communities || [];
  const traitProposals = book?.character_creation?.trait_proposals || {};
  const selectedClass = classes.find((item) => item.id === form.classId);
  const selectedAncestry = ancestries.find((item) => item.id === form.ancestryId);
  const selectedFirstAncestry = ancestries.find((item) => item.id === form.firstAncestryId);
  const selectedSecondAncestry = ancestries.find((item) => item.id === form.secondaryAncestryId);
  const selectedCommunity = communities.find((item) => item.id === form.communityId);
  const subclasses = selectedClass?.subclasses || [];
  const selectedSubclass = subclasses.find((item) => item.id === form.subclassId);
  const availableCards = useMemo(() => (book?.domains || [])
    .filter((domain) => selectedClass?.domains.includes(domain.id))
    .flatMap((domain) => domain.level_1_cards.map((card) => ({ ...card, domain: domain.name, domainId: domain.id }))), [book, selectedClass]);

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const setClass = (classId) => {
    const nextClass = classes.find((item) => item.id === classId);
    const nextSubclass = nextClass?.subclasses[0];
    setForm((current) => ({
      ...current,
      classId,
      subclassId: nextSubclass?.id || '',
      traits: proposedTraitsFor(nextClass, nextSubclass, traitProposals),
      domainCards: [],
    }));
  };
  const setAncestry = (ancestryId) => setForm((current) => ({
    ...current,
    ancestryId,
    firstAncestryId: ancestryId === 'mixed-ancestry' ? current.firstAncestryId : '',
    secondaryAncestryId: ancestryId === 'mixed-ancestry' ? current.secondaryAncestryId : '',
  }));
  const setFirstAncestry = (firstAncestryId) => setForm((current) => ({
    ...current,
    firstAncestryId,
    secondaryAncestryId: current.secondaryAncestryId === firstAncestryId ? '' : current.secondaryAncestryId,
  }));
  const setSubclass = (subclassId) => setForm((current) => ({
    ...current,
    subclassId,
    traits: proposedTraitsFor(selectedClass, subclasses.find((item) => item.id === subclassId), traitProposals),
  }));
  const toggleCard = (cardId) => setForm((current) => ({
    ...current,
    domainCards: current.domainCards.includes(cardId)
      ? current.domainCards.filter((id) => id !== cardId)
      : current.domainCards.length < 2 ? [...current.domainCards, cardId] : current.domainCards,
  }));
  const updateTrait = (trait, value) => setForm((current) => ({ ...current, traits: { ...current.traits, [trait]: value } }));
  const updateArray = (field, index, value) => setForm((current) => ({ ...current, [field]: current[field].map((item, itemIndex) => itemIndex === index ? value : item) }));
  const updateFamilyMember = (index, field, value) => setForm((current) => ({
    ...current,
    familyMembers: current.familyMembers.map((member, memberIndex) => memberIndex === index ? { ...member, [field]: value } : member),
  }));
  const addFamilyMember = () => setForm((current) => ({ ...current, familyMembers: [...current.familyMembers, newFamilyMember()] }));
  const removeFamilyMember = (index) => setForm((current) => ({ ...current, familyMembers: current.familyMembers.filter((_, memberIndex) => memberIndex !== index) }));

  const generationValues = {
    name: form.name, pronouns: form.pronouns, description: form.description, size: form.size, height: form.height, weight: form.weight,
    eye_color: form.eyeColor, hair_color: form.hairColor, skin_color: form.skinColor, look_description: form.lookDescription,
    class_id: form.classId, subclass_id: form.subclassId, ancestry_id: form.ancestryId,
    secondary_ancestry_id: form.secondaryAncestryId, community_id: form.communityId,
    background_story: form.backgroundStory,
    family_members: form.familyMembers.map(({ relation, name, details }) => ({ relation, name, details })),
    background_notes: form.backgroundNotes,
    experience_1: form.experiences[0],
    experience_2: form.experiences[1],
  };
  const generationOptions = {
    classes: classes.map((item) => ({ id: item.id, name: item.name, subclasses: (item.subclasses || []).map((subclass) => ({ id: subclass.id, name: subclass.name })) })),
    ancestries: ancestries.map((item) => ({ id: item.id, name: item.name })),
    communities: communities.map((item) => ({ id: item.id, name: item.name })),
  };
  const applyGeneratedValues = (values) => setForm((current) => {
    const next = Object.entries(values).reduce((result, [field, value]) => {
      if (field === 'experience_1' || field === 'experience_2') {
        const index = field === 'experience_1' ? 0 : 1;
        return { ...result, experiences: result.experiences.map((experience, experienceIndex) => experienceIndex === index ? value : experience) };
      }
      return { ...result, [formFieldByGenerationField[field]]: value };
    }, current);
    if (values.family_members) next.familyMembers = normalizeFamilyMembers(values.family_members);
    if (values.class_id || values.subclass_id) {
      const nextClass = classes.find((item) => item.id === next.classId);
      const nextSubclass = nextClass?.subclasses.find((item) => item.id === next.subclassId);
      next.traits = proposedTraitsFor(nextClass, nextSubclass, traitProposals);
    }
    if (next.ancestryId !== 'mixed-ancestry') {
      next.firstAncestryId = '';
      next.secondaryAncestryId = '';
    }
    return next;
  });
  const generateFields = async (fields, expandCurrent = false) => {
    const requestedFields = fields.filter((field) => !locks[field]);
    if (requestedFields.length === 0) return;
    setAiState({ loading: true, error: '' });
    try {
      const response = await generateCharacter({ values: generationValues, locked_fields: generationFields.filter((field) => locks[field]), fields: requestedFields, options: generationOptions, expand_current: expandCurrent });
      applyGeneratedValues(response.values);
      setAiState({ loading: false, error: '' });
    } catch (error) {
      setAiState({ loading: false, error: error.message });
    }
  };
  const expandField = (field) => generateFields([field], true);
  const toggleLock = (field) => setLocks((current) => ({ ...current, [field]: !current[field] }));
  const pageGenerationFields = stepIds[step] === 'identity'
    ? identityGenerationFields
    : stepIds[step] === 'appearance' ? appearanceGenerationFields
      : stepIds[step] === 'experiences' ? experienceGenerationFields : backgroundGenerationFields;
  const activeGenerationFields = pageGenerationFields.filter((field) => field !== 'secondary_ancestry_id' || form.ancestryId === 'mixed-ancestry');
  const toggleAllLocks = (fields) => setLocks((current) => {
    const shouldLock = fields.some((field) => !current[field]);
    return { ...current, ...Object.fromEntries(fields.map((field) => [field, shouldLock])) };
  });

  const selectedCards = availableCards.filter((card) => form.domainCards.includes(card.id));
  const canContinue = () => {
    if (stepIds[step] === 'identity') return form.name.trim() && form.pronouns.trim() && form.classId && form.subclassId && form.ancestryId && form.communityId && (form.ancestryId !== 'mixed-ancestry' || (form.firstAncestryId && form.secondaryAncestryId));
    if (stepIds[step] === 'appearance') return [form.description, form.size, form.height, form.weight, form.eyeColor, form.hairColor, form.skinColor, form.lookDescription].every((value) => value.trim());
    if (stepIds[step] === 'traits') return traitIds.every((trait) => form.traits[trait] !== '') && Object.values(form.traits).sort().join(',') === '-1,0,0,1,1,2';
    if (stepIds[step] === 'equipment') return form.primaryWeapon && form.secondaryWeapon && form.armor;
    if (stepIds[step] === 'experiences') return form.experiences.every((experience) => experience.trim());
    if (stepIds[step] === 'domain_cards') return form.domainCards.length === 2;
    return true;
  };

  const submit = async () => {
    setState({ loading: false, saving: true, error: '', success: '' });
    try {
      const createdCharacter = await createCharacter({
        // Trackers count marked boxes, so a new character starts unmarked with 2 Hope.
        stats: {
          hit_points: { current: selectedClass?.hit_points || 0, max: selectedClass?.hit_points || 0 },
          stress: { current: 0, max: 6 },
          hope: { current: 2, max: 6 },
          armor: { current: 0, max: 0 },
          gold: { handfuls: 1, bags: 0, chest: 0 },
        },
        name: form.name.trim(), pronouns: form.pronouns.trim(), description: form.description.trim(),
        size: form.size.trim(), height: form.height.trim(), weight: form.weight.trim(), eye_color: form.eyeColor.trim(),
        hair_color: form.hairColor.trim(), skin_color: form.skinColor.trim(), look_description: form.lookDescription.trim(),
        class_id: form.classId, subclass_id: form.subclassId,
        ancestry_id: form.ancestryId === 'mixed-ancestry' ? form.firstAncestryId : form.ancestryId,
        secondary_ancestry_id: form.ancestryId === 'mixed-ancestry' ? form.secondaryAncestryId || null : null, community_id: form.communityId,
        traits: form.traits, experiences: form.experiences.map((name) => ({ name, modifier: 2 })),
        background_answers: form.backgroundNotes.split('\n').filter(Boolean),
        background_story: form.backgroundStory.trim(),
        background_notes: form.backgroundNotes.trim(),
        family_members: form.familyMembers.map(({ relation, name, details }) => ({ relation, name, details })),
        connections: form.connections.split('\n').filter(Boolean),
        equipment: { primary: form.primaryWeapon, secondary: form.secondaryWeapon, armor: form.armor, potion: form.potion, inventory: book.equipment.starting_inventory.filter((item) => !/gold/i.test(item)) },
        domain_cards: selectedCards,
      });
      navigate(`/characters/${createdCharacter.id}`);
    } catch (error) {
      setState({ loading: false, saving: false, error: error.message, success: '' });
    }
  };

  if (state.loading) return <p className="muted">Loading the Daggerheart character guide...</p>;
  if (!book) return <section className={styles.notice}><p className="eyebrow">CHARACTER GUIDE</p><h2>Import the SRD first</h2><p>{state.error}</p><p className="muted">An administrator must import the book JSON before players can create characters.</p></section>;

  return (
    <section className={styles.builder}>
      <header className={styles.header}>
        <div><p className="eyebrow">DAGGERHEART · LEVEL 1</p><h2>Create your character</h2></div>
        <Link to="/characters" className={styles.back}>Back to vault</Link>
      </header>
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          {stepDetails.map((item, index) => (
            <button type="button" className={index === step ? styles.activeStep : ''} onClick={() => index <= step && setStep(index)} key={item.id}>
              <span>{String(index + 1).padStart(2, '0')}</span>{item.title}
            </button>
          ))}
        </aside>
        <div className={styles.content}>
          <div className={styles.stepTitle}><span>STEP {step + 1} OF {stepIds.length}</span><h3>{stepDetails[step].title}</h3><p>{stepDetails[step].description}</p></div>
          {['identity', 'appearance', 'background', 'experiences'].includes(stepIds[step]) && <GenerationToolbar loading={aiState.loading} locks={locks} fields={activeGenerationFields} onGenerate={() => generateFields(activeGenerationFields)} onToggleAll={() => toggleAllLocks(activeGenerationFields)} />}
          {stepIds[step] === 'identity' && <Identity classes={classes} ancestries={ancestries} communities={communities} selectedClass={selectedClass} selectedAncestry={selectedAncestry} selectedFirstAncestry={selectedFirstAncestry} selectedSecondAncestry={selectedSecondAncestry} selectedCommunity={selectedCommunity} subclasses={subclasses} form={form} setField={setField} setClass={setClass} setAncestry={setAncestry} setFirstAncestry={setFirstAncestry} setSubclass={setSubclass} locks={locks} toggleLock={toggleLock} generate={generateFields} />}
          {stepIds[step] === 'appearance' && <Appearance form={form} setField={setField} locks={locks} toggleLock={toggleLock} generate={generateFields} expand={expandField} />}
          {stepIds[step] === 'traits' && <TraitsStep form={form} updateTrait={updateTrait} selectedClass={selectedClass} selectedSubclass={selectedSubclass} traitProposals={traitProposals} />}
          {stepIds[step] === 'equipment' && <EquipmentStep equipment={book.equipment} form={form} setField={setField} />}
          {stepIds[step] === 'background' && <BackgroundStep form={form} setField={setField} locks={locks} toggleLock={toggleLock} generate={generateFields} expand={expandField} updateFamilyMember={updateFamilyMember} addFamilyMember={addFamilyMember} removeFamilyMember={removeFamilyMember} questions={selectedClass?.background_questions} />}
          {stepIds[step] === 'experiences' && <ExperiencesStep form={form} updateArray={updateArray} locks={locks} toggleLock={toggleLock} generate={generateFields} />}
          {stepIds[step] === 'domain_cards' && <DomainCardsStep cards={availableCards} selected={form.domainCards} toggleCard={toggleCard} />}
          {stepIds[step] === 'connections' && <TextStep label="Connections" value={form.connections} onChange={(value) => setField('connections', value)} placeholder="One connection per line. Who do you trust, owe, challenge, or remember?" />}
          {(state.error || aiState.error) && <p className={styles.error}>{state.error || aiState.error}</p>}
          <div className={styles.actions}>
            <Button type="button" variant="text" disabled={step === 0} onClick={() => setStep((current) => current - 1)}>Previous</Button>
            {step < stepIds.length - 1 ? <Button type="button" disabled={!canContinue()} onClick={() => setStep((current) => current + 1)}>Continue</Button> : <Button type="button" disabled={!canContinue() || state.saving} onClick={submit}>{state.saving ? 'Saving...' : 'Save character'}</Button>}
          </div>
        </div>
      </div>
    </section>
  );
}

function GenerationToolbar({ loading, locks, fields, onGenerate, onToggleAll }) {
  const unlockedCount = fields.filter((field) => !locks[field]).length;
  const allLocked = fields.length > 0 && unlockedCount === 0;
  return <div className={styles.aiToolbar}><div><strong>AI assist</strong><span>{unlockedCount} unlocked field{unlockedCount === 1 ? '' : 's'} will be requested.</span></div><div className={styles.aiActions}><Button type="button" variant="text" onClick={onToggleAll}>{allLocked ? 'Unlock all fields' : 'Lock all fields'}</Button><Button type="button" variant="text" disabled={loading || unlockedCount === 0} onClick={onGenerate}>{loading ? 'Generating...' : 'Generate all unlocked'}</Button></div></div>;
}

function FieldActions({ field, locked, toggleLock, generate, expand, expandDisabled }) {
  return <span className={styles.fieldActions}>
    <button type="button" className={styles.lockButton} onClick={() => toggleLock(field)} aria-label={`${locked ? 'Unlock' : 'Lock'} ${fieldLabels[field]}`}>{locked ? 'Unlock' : 'Lock'}</button>
    <button type="button" className={styles.generateButton} disabled={locked} onClick={() => generate([field])}>Generate</button>
    {expand && <button type="button" className={styles.expandButton} disabled={locked || expandDisabled} onClick={expand}>Generate from current input</button>}
  </span>;
}

function FieldLabel({ field, label, locked, toggleLock, generate, expand, expandDisabled, children, className = '' }) {
  return <label className={className}><span className={styles.fieldHeading}>{label}<FieldActions field={field} locked={locked} toggleLock={toggleLock} generate={generate} expand={expand} expandDisabled={expandDisabled} /></span>{children}</label>;
}

function Identity({ classes, ancestries, communities, selectedClass, selectedAncestry, selectedFirstAncestry, selectedSecondAncestry, selectedCommunity, subclasses, form, setField, setClass, setAncestry, setFirstAncestry, setSubclass, locks, toggleLock, generate }) {
  const firstLineageFeature = selectedFirstAncestry?.features?.[0];
  const secondLineageFeature = selectedSecondAncestry?.features?.[1] || selectedSecondAncestry?.features?.[0];
  return <div className={styles.formGrid}>
    <FieldLabel field="name" label="Character name" locked={locks.name} toggleLock={toggleLock} generate={generate}><input autoFocus value={form.name} onChange={(event) => setField('name', event.target.value)} /></FieldLabel>
    <FieldLabel field="pronouns" label="Pronouns" locked={locks.pronouns} toggleLock={toggleLock} generate={generate}><input value={form.pronouns} onChange={(event) => setField('pronouns', event.target.value)} placeholder="she / her" /></FieldLabel>
    <FieldLabel field="class_id" label="Class" locked={locks.class_id} toggleLock={toggleLock} generate={generate}><select value={form.classId} onChange={(event) => setClass(event.target.value)}><option value="">Choose a class</option>{classes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></FieldLabel>
    <FieldLabel field="subclass_id" label="Subclass" locked={locks.subclass_id} toggleLock={toggleLock} generate={generate}><select value={form.subclassId} onChange={(event) => setSubclass(event.target.value)} disabled={!selectedClass}><option value="">Choose a subclass</option>{subclasses.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></FieldLabel>
    <FieldLabel field="ancestry_id" label="Ancestry" locked={locks.ancestry_id} toggleLock={toggleLock} generate={generate}><select value={form.ancestryId} onChange={(event) => setAncestry(event.target.value)}><option value="">Choose an ancestry</option>{ancestries.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></FieldLabel>
    {form.ancestryId === 'mixed-ancestry' && <>
      <label>First ancestry<select value={form.firstAncestryId} onChange={(event) => setFirstAncestry(event.target.value)}><option value="">Choose a lineage</option>{ancestries.filter((item) => item.id !== 'mixed-ancestry').map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <FieldLabel field="secondary_ancestry_id" label="Second ancestry" locked={locks.secondary_ancestry_id} toggleLock={toggleLock} generate={generate}><select value={form.secondaryAncestryId} onChange={(event) => setField('secondaryAncestryId', event.target.value)}><option value="">Choose a lineage</option>{ancestries.filter((item) => item.id !== 'mixed-ancestry' && item.id !== form.firstAncestryId).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></FieldLabel>
    </>}
    <FieldLabel field="community_id" label="Community" locked={locks.community_id} toggleLock={toggleLock} generate={generate}><select value={form.communityId} onChange={(event) => setField('communityId', event.target.value)}><option value="">Choose a community</option>{communities.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></FieldLabel>
    {selectedClass && <div className={styles.detailPanel}><div><strong>{selectedClass.name}</strong><span>{selectedClass.domains.map((domain) => domain.toUpperCase()).join(' · ')}</span></div><div className={styles.statRow}><span>Evasion <b>{selectedClass.evasion}</b></span><span>Hit Points <b>{selectedClass.hit_points}</b></span><span>Spellcast <b>{subclasses.find((item) => item.id === form.subclassId)?.spellcast_trait || '—'}</b></span></div><p>{selectedClass.class_features.map((feature) => `${feature.name}: ${feature.text}`).join(' ')}</p></div>}
    {selectedAncestry?.id === 'mixed-ancestry' && <div className={styles.detailPanel}><strong>{selectedAncestry.name} lineage</strong><p>{selectedAncestry.selection_rules}</p>{firstLineageFeature && <p><b>{selectedFirstAncestry.name} · {firstLineageFeature.name}.</b> {firstLineageFeature.text}</p>}{secondLineageFeature && <p><b>{selectedSecondAncestry.name} · {secondLineageFeature.name}.</b> {secondLineageFeature.text}</p>}</div>}
    {selectedAncestry && selectedAncestry.id !== 'mixed-ancestry' && <div className={styles.detailPanel}><strong>{selectedAncestry.name} features</strong>{selectedAncestry.features.map((feature, index) => <p key={`${feature.name}-${index}`}><b>{feature.name}.</b> {feature.text}</p>)}</div>}
    {selectedCommunity && <div className={styles.detailPanel}><strong>{selectedCommunity.name} · {selectedCommunity.feature.name}</strong><p>{selectedCommunity.feature.text}</p><p className={styles.adjectives}>{selectedCommunity.adjectives.join(' · ')}</p></div>}
  </div>;
}

function Appearance({ form, setField, locks, toggleLock, generate, expand }) {
  return <div className={styles.formGrid}>
    <FieldLabel field="description" label="Character description" className={styles.full} locked={locks.description} toggleLock={toggleLock} generate={generate} expand={() => expand('description')} expandDisabled={!form.description.trim()}><textarea value={form.description} onChange={(event) => setField('description', event.target.value)} placeholder="What does the table notice first?" /></FieldLabel>
    <FieldLabel field="size" label="Size" locked={locks.size} toggleLock={toggleLock} generate={generate}><input value={form.size} onChange={(event) => setField('size', event.target.value)} placeholder="Small, medium, tall..." /></FieldLabel>
    <FieldLabel field="height" label="Height" locked={locks.height} toggleLock={toggleLock} generate={generate}><input value={form.height} onChange={(event) => setField('height', event.target.value)} placeholder="A clear measurement" /></FieldLabel>
    <FieldLabel field="weight" label="Weight" locked={locks.weight} toggleLock={toggleLock} generate={generate}><input value={form.weight} onChange={(event) => setField('weight', event.target.value)} placeholder="A clear measurement" /></FieldLabel>
    <FieldLabel field="eye_color" label="Eye color" locked={locks.eye_color} toggleLock={toggleLock} generate={generate}><input value={form.eyeColor} onChange={(event) => setField('eyeColor', event.target.value)} /></FieldLabel>
    <FieldLabel field="hair_color" label="Hair color" locked={locks.hair_color} toggleLock={toggleLock} generate={generate}><input value={form.hairColor} onChange={(event) => setField('hairColor', event.target.value)} /></FieldLabel>
    <FieldLabel field="skin_color" label="Skin color" locked={locks.skin_color} toggleLock={toggleLock} generate={generate}><input value={form.skinColor} onChange={(event) => setField('skinColor', event.target.value)} /></FieldLabel>
    <FieldLabel field="look_description" label="Look, clothing & other features" className={styles.full} locked={locks.look_description} toggleLock={toggleLock} generate={generate} expand={() => expand('look_description')} expandDisabled={!form.lookDescription.trim()}><textarea value={form.lookDescription} onChange={(event) => setField('lookDescription', event.target.value)} placeholder="Clothing, posture, scars, jewelry, mannerisms, or anything else people remember." /></FieldLabel>
  </div>;
}

function TraitsStep({ form, updateTrait, selectedClass, selectedSubclass, traitProposals }) {
  const proposed = proposedTraitsFor(selectedClass, selectedSubclass, traitProposals);
  return <div><p className="muted">Suggested values for {selectedClass?.name || 'your class'}{selectedSubclass ? ` · ${selectedSubclass.name}` : ''}. You can change any value while keeping the set +2, +1, +1, +0, +0, -1.</p><div className={styles.traits}>{traitIds.map((trait) => <label key={trait}>{trait}<select value={form.traits[trait]} onChange={(event) => updateTrait(trait, event.target.value)}><option value="">—</option>{['2', '1', '0', '-1'].map((value) => <option value={value} key={value}>{value === '1' ? '+1' : value === '0' ? '+0' : value}{value === proposed[trait] ? ' · suggested' : ''}</option>)}</select></label>)}</div></div>;
}

function EquipmentStep({ equipment, form, setField }) {
  const weaponOption = (item) => `${item.name} · ${item.burden === 'one-handed' ? '1 hand' : '2 hands'} · ${item.damage} · ${item.feature || 'No special feature'}`;
  const select = (label, field, items, formatOption, extraOptions = null) => <label>{label}<select value={form[field]} onChange={(event) => setField(field, event.target.value)}><option value="">Choose {label.toLowerCase()}</option>{extraOptions}{items.map((item) => <option value={item.id} key={item.id}>{formatOption(item)}</option>)}</select></label>;
  const armorOption = (item) => `${item.name} · Thresholds ${item.thresholds} · Armor ${item.armor_score} · ${item.feature || 'No special feature'}`;
  const tierOne = (items) => (Array.isArray(items) ? items : []).filter((item) => Number(item.tier) === 1);
  const startingPotions = (Array.isArray(equipment.potions) ? equipment.potions : []).filter((item) => item.tier === undefined || Number(item.tier) === 1);
  const startingInventory = equipment.starting_inventory.filter((item) => !/gold/i.test(item));
  return <div className={styles.formGrid}>{select('Primary weapon', 'primaryWeapon', tierOne(equipment.primary_weapons), weaponOption)}{select('Secondary weapon', 'secondaryWeapon', tierOne(equipment.secondary_weapons), weaponOption, <option value="none" key="none">No secondary weapon</option>)}{select('Armor', 'armor', tierOne(equipment.armor), armorOption)}<label>First potion<select value={form.potion} onChange={(event) => setField('potion', event.target.value)}>{startingPotions.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.text}</option>)}</select></label><div className={styles.detailPanel}><strong>Always added to inventory</strong><p>{startingInventory.join(' · ')}</p></div></div>;
}

function BackgroundStep({ form, setField, locks, toggleLock, generate, expand, updateFamilyMember, addFamilyMember, removeFamilyMember, questions }) {
  return <div className={styles.formGrid}>
    <FieldLabel field="background_story" label="Background story" className={styles.full} locked={locks.background_story} toggleLock={toggleLock} generate={generate} expand={() => expand('background_story')} expandDisabled={!form.backgroundStory.trim()}>
      <textarea value={form.backgroundStory} onChange={(event) => setField('backgroundStory', event.target.value)} placeholder="The story your character carries into the adventure." />
    </FieldLabel>
    <FieldLabel field="background_notes" label="Background notes" className={styles.full} locked={locks.background_notes} toggleLock={toggleLock} generate={generate} expand={() => expand('background_notes')} expandDisabled={!form.backgroundNotes.trim()}>
      <textarea value={form.backgroundNotes} onChange={(event) => setField('backgroundNotes', event.target.value)} placeholder="Answers, rumors, places, obligations, and other loose threads." />
    </FieldLabel>
    {questions?.length > 0 && <div className={styles.prompts}><strong>Prompts from your class</strong>{questions.map((question) => <p key={question}>{question}</p>)}</div>}
    <div className={styles.familySection}>
      <div className={styles.fieldHeading}><span>Family and chosen family</span><FieldActions field="family_members" locked={locks.family_members} toggleLock={toggleLock} generate={generate} /></div>
      <p className="muted">Add the people who shaped your character, whether by blood, friendship, or circumstance.</p>
      {form.familyMembers.map((member, index) => <div className={styles.familyRow} key={member.id}>
        <select value={member.relation} onChange={(event) => updateFamilyMember(index, 'relation', event.target.value)} aria-label="Family relationship">{familyRelations.map((relation) => <option value={relation} key={relation}>{relation}</option>)}</select>
        <input value={member.name} onChange={(event) => updateFamilyMember(index, 'name', event.target.value)} placeholder="Name" aria-label="Family member name" />
        <input value={member.details} onChange={(event) => updateFamilyMember(index, 'details', event.target.value)} placeholder="What makes them specific?" aria-label="Family member details" />
        <button type="button" className={styles.removeButton} onClick={() => removeFamilyMember(index)}>Remove</button>
      </div>)}
      <Button type="button" variant="text" onClick={addFamilyMember}>Add family member</Button>
    </div>
  </div>;
}

function ExperiencesStep({ form, updateArray, locks, toggleLock, generate }) {
  return <div className={styles.formGrid}>
    <FieldLabel field="experience_1" label="Experience one" locked={locks.experience_1} toggleLock={toggleLock} generate={generate}><input value={form.experiences[0]} onChange={(event) => updateArray('experiences', 0, event.target.value)} placeholder="A specific skill or history" /></FieldLabel>
    <FieldLabel field="experience_2" label="Experience two" locked={locks.experience_2} toggleLock={toggleLock} generate={generate}><input value={form.experiences[1]} onChange={(event) => updateArray('experiences', 1, event.target.value)} placeholder="Another specific skill or history" /></FieldLabel>
    <div className={styles.detailPanel}><strong>Each Experience starts at +2</strong><p>Keep these specific enough to be interesting, but broad enough to apply in more than one situation. They do not grant spells or special abilities.</p></div>
  </div>;
}

function DomainCardsStep({ cards, selected, toggleCard }) { return <div className={styles.cards}><p className="muted">Choose two cards. {selected.length}/2 selected.</p>{cards.map((card) => <button type="button" className={`${styles.cardChoice} ${selected.includes(card.id) ? styles.selected : ''}`} onClick={() => toggleCard(card.id)} key={card.id}><span>{card.domain} · {card.type} · level 1</span><strong>{card.name}</strong><small>Recall {card.recall_cost}</small><p>{card.text}</p></button>)}</div>; }

function TextStep({ label, value, onChange, placeholder, questions = [] }) { return <div className={styles.textStep}>{questions.length > 0 && <div className={styles.prompts}><strong>Prompts from your class</strong>{questions.map((question) => <p key={question}>{question}</p>)}</div>}<label>{label}<textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label><p className="muted">Use a new line for each answer or connection.</p></div>; }
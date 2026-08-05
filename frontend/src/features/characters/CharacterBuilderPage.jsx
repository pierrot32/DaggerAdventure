import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../../components/Button/Button';
import { createCharacter, getCharacterCreationBook } from './characterApi';
import styles from './CharacterBuilderPage.module.css';

const stepIds = ['identity', 'class', 'heritage', 'traits', 'equipment', 'background', 'experiences', 'domain_cards', 'connections'];
const traitIds = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'];

const emptyForm = {
  name: '', pronouns: '', description: '', classId: '', subclassId: '', ancestryId: '', secondaryAncestryId: '', communityId: '',
  traits: Object.fromEntries(traitIds.map((trait) => [trait, ''])),
  primaryWeapon: '', secondaryWeapon: '', armor: '', potion: 'minor-health-potion',
  experiences: ['', ''], background: '', connections: '', domainCards: [],
};

export default function CharacterBuilderPage() {
  const navigate = useNavigate();
  const [book, setBook] = useState(null);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [state, setState] = useState({ loading: true, saving: false, error: '', success: '' });

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
  const selectedClass = classes.find((item) => item.id === form.classId);
  const selectedAncestry = ancestries.find((item) => item.id === form.ancestryId);
  const selectedCommunity = communities.find((item) => item.id === form.communityId);
  const subclasses = selectedClass?.subclasses || [];
  const availableCards = useMemo(() => (book?.domains || [])
    .filter((domain) => selectedClass?.domains.includes(domain.id))
    .flatMap((domain) => domain.level_1_cards.map((card) => ({ ...card, domain: domain.name, domainId: domain.id }))), [book, selectedClass]);

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const setClass = (classId) => {
    const nextClass = classes.find((item) => item.id === classId);
    setForm((current) => ({ ...current, classId, subclassId: nextClass?.subclasses[0]?.id || '', domainCards: [] }));
  };
  const toggleCard = (cardId) => setForm((current) => ({
    ...current,
    domainCards: current.domainCards.includes(cardId)
      ? current.domainCards.filter((id) => id !== cardId)
      : current.domainCards.length < 2 ? [...current.domainCards, cardId] : current.domainCards,
  }));
  const updateTrait = (trait, value) => setForm((current) => ({ ...current, traits: { ...current.traits, [trait]: value } }));
  const updateArray = (field, index, value) => setForm((current) => ({ ...current, [field]: current[field].map((item, itemIndex) => itemIndex === index ? value : item) }));

  const selectedCards = availableCards.filter((card) => form.domainCards.includes(card.id));
  const canContinue = () => {
    if (stepIds[step] === 'identity') return form.name.trim() && form.pronouns.trim() && form.description.trim();
    if (stepIds[step] === 'class') return form.classId && form.subclassId;
    if (stepIds[step] === 'heritage') return form.ancestryId && form.communityId && (form.ancestryId !== 'mixed-ancestry' || form.secondaryAncestryId);
    if (stepIds[step] === 'traits') return traitIds.every((trait) => form.traits[trait] !== '') && Object.values(form.traits).sort().join(',') === '-1,0,0,1,1,2';
    if (stepIds[step] === 'equipment') return form.primaryWeapon && form.secondaryWeapon && form.armor;
    if (stepIds[step] === 'experiences') return form.experiences.every((experience) => experience.trim());
    if (stepIds[step] === 'domain_cards') return form.domainCards.length === 2;
    return true;
  };

  const submit = async () => {
    setState({ loading: false, saving: true, error: '', success: '' });
    try {
      await createCharacter({
        // Trackers count marked boxes, so a new character starts unmarked with 2 Hope.
        stats: {
          hit_points: { current: 0, max: selectedClass?.hit_points || 0 },
          stress: { current: 0, max: 6 },
          hope: { current: 2, max: 6 },
          armor: { current: 0, max: 0 },
          gold: { handfuls: 1, bags: 0, chest: 0 },
        },
        name: form.name.trim(), pronouns: form.pronouns.trim(), description: form.description.trim(),
        class_id: form.classId, subclass_id: form.subclassId, ancestry_id: form.ancestryId,
        secondary_ancestry_id: form.secondaryAncestryId || null, community_id: form.communityId,
        traits: form.traits, experiences: form.experiences.map((name) => ({ name, modifier: 2 })),
        background_answers: form.background.split('\n').filter(Boolean), connections: form.connections.split('\n').filter(Boolean),
        equipment: { primary: form.primaryWeapon, secondary: form.secondaryWeapon, armor: form.armor, potion: form.potion, inventory: book.equipment.starting_inventory },
        domain_cards: selectedCards,
      });
      navigate('/characters');
    } catch (error) {
      setState({ loading: false, saving: false, error: error.message, success: '' });
    }
  };

  if (state.loading) return <p className="muted">Loading the Daggerheart character guide...</p>;
  if (!book) return <section className={styles.notice}><p className="eyebrow">CHARACTER GUIDE</p><h2>Import the SRD first</h2><p>{state.error}</p><p className="muted">An administrator must import the book JSON before players can create characters.</p></section>;

  const currentStep = book.character_creation.steps[step];
  return (
    <section className={styles.builder}>
      <header className={styles.header}>
        <div><p className="eyebrow">DAGGERHEART · LEVEL 1</p><h2>Create your character</h2></div>
        <Link to="/characters" className={styles.back}>Back to vault</Link>
      </header>
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          {book.character_creation.steps.map((item, index) => (
            <button type="button" className={index === step ? styles.activeStep : ''} onClick={() => index <= step && setStep(index)} key={item.id}>
              <span>{String(index + 1).padStart(2, '0')}</span>{item.title}
            </button>
          ))}
        </aside>
        <div className={styles.content}>
          <div className={styles.stepTitle}><span>STEP {step + 1} OF {stepIds.length}</span><h3>{currentStep.title}</h3><p>{currentStep.description}</p></div>
          {stepIds[step] === 'identity' && <Identity form={form} setField={setField} />}
          {stepIds[step] === 'class' && <ClassStep classes={classes} selectedClass={selectedClass} subclasses={subclasses} form={form} setClass={setClass} setField={setField} />}
          {stepIds[step] === 'heritage' && <HeritageStep ancestries={ancestries} communities={communities} selectedAncestry={selectedAncestry} selectedCommunity={selectedCommunity} form={form} setField={setField} />}
          {stepIds[step] === 'traits' && <TraitsStep form={form} updateTrait={updateTrait} />}
          {stepIds[step] === 'equipment' && <EquipmentStep equipment={book.equipment} form={form} setField={setField} />}
          {stepIds[step] === 'background' && <TextStep label="Background notes" value={form.background} onChange={(value) => setField('background', value)} placeholder="Answer a background question, or leave the past open for play." questions={selectedClass?.background_questions} />}
          {stepIds[step] === 'experiences' && <ExperiencesStep form={form} updateArray={updateArray} />}
          {stepIds[step] === 'domain_cards' && <DomainCardsStep cards={availableCards} selected={form.domainCards} toggleCard={toggleCard} />}
          {stepIds[step] === 'connections' && <TextStep label="Connections" value={form.connections} onChange={(value) => setField('connections', value)} placeholder="One connection per line. Who do you trust, owe, challenge, or remember?" />}
          {state.error && <p className={styles.error}>{state.error}</p>}
          <div className={styles.actions}>
            <Button type="button" variant="text" disabled={step === 0} onClick={() => setStep((current) => current - 1)}>Previous</Button>
            {step < stepIds.length - 1 ? <Button type="button" disabled={!canContinue()} onClick={() => setStep((current) => current + 1)}>Continue</Button> : <Button type="button" disabled={!canContinue() || state.saving} onClick={submit}>{state.saving ? 'Saving...' : 'Save character'}</Button>}
          </div>
        </div>
      </div>
    </section>
  );
}

function Identity({ form, setField }) {
  return <div className={styles.formGrid}>
    <label>Character name<input autoFocus value={form.name} onChange={(event) => setField('name', event.target.value)} /></label>
    <label>Pronouns<input value={form.pronouns} onChange={(event) => setField('pronouns', event.target.value)} placeholder="she / her" /></label>
    <label className={styles.full}>Character description<textarea value={form.description} onChange={(event) => setField('description', event.target.value)} placeholder="What does the table notice first?" /></label>
  </div>;
}

function ClassStep({ classes, selectedClass, subclasses, form, setClass, setField }) {
  return <div className={styles.formGrid}>
    <label>Class<select value={form.classId} onChange={(event) => setClass(event.target.value)}><option value="">Choose a class</option>{classes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
    <label>Subclass<select value={form.subclassId} onChange={(event) => setField('subclassId', event.target.value)} disabled={!selectedClass}><option value="">Choose a subclass</option>{subclasses.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
    {selectedClass && <div className={styles.detailPanel}><div><strong>{selectedClass.name}</strong><span>{selectedClass.domains.map((domain) => domain.toUpperCase()).join(' · ')}</span></div><div className={styles.statRow}><span>Evasion <b>{selectedClass.evasion}</b></span><span>Hit Points <b>{selectedClass.hit_points}</b></span><span>Spellcast <b>{subclasses.find((item) => item.id === form.subclassId)?.spellcast_trait || '—'}</b></span></div><p>{selectedClass.class_features.map((feature) => `${feature.name}: ${feature.text}`).join(' ')}</p></div>}
    {subclasses.find((item) => item.id === form.subclassId) && <div className={styles.detailPanel}><strong>{subclasses.find((item) => item.id === form.subclassId).name} foundation</strong><p>{subclasses.find((item) => item.id === form.subclassId).foundation.map((feature) => `${feature.name}: ${feature.text}`).join(' ')}</p></div>}
  </div>;
}

function HeritageStep({ ancestries, communities, selectedAncestry, selectedCommunity, form, setField }) {
  return <div className={styles.formGrid}>
    <label>Ancestry<select value={form.ancestryId} onChange={(event) => setField('ancestryId', event.target.value)}><option value="">Choose an ancestry</option>{ancestries.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
    {form.ancestryId === 'mixed-ancestry' && <label>Second ancestry<select value={form.secondaryAncestryId} onChange={(event) => setField('secondaryAncestryId', event.target.value)}><option value="">Choose a lineage</option>{ancestries.filter((item) => item.id !== 'mixed-ancestry').map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
    <label>Community<select value={form.communityId} onChange={(event) => setField('communityId', event.target.value)}><option value="">Choose a community</option>{communities.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
    {selectedAncestry && <div className={styles.detailPanel}><strong>{selectedAncestry.name} features</strong>{selectedAncestry.features.map((feature, index) => <p key={`${feature.name}-${index}`}><b>{feature.name}.</b> {feature.text}</p>)}</div>}
    {selectedCommunity && <div className={styles.detailPanel}><strong>{selectedCommunity.name} · {selectedCommunity.feature.name}</strong><p>{selectedCommunity.feature.text}</p><p className={styles.adjectives}>{selectedCommunity.adjectives.join(' · ')}</p></div>}
  </div>;
}

function TraitsStep({ form, updateTrait }) {
  return <div><p className="muted">Assign each modifier exactly once: +2, +1, +1, +0, +0, -1.</p><div className={styles.traits}>{traitIds.map((trait) => <label key={trait}>{trait}<select value={form.traits[trait]} onChange={(event) => updateTrait(trait, event.target.value)}><option value="">—</option>{['2', '1', '0', '-1'].map((value) => <option value={value} key={value}>{value === '1' ? '+1' : value === '0' ? '+0' : value}</option>)}</select></label>)}</div></div>;
}

function EquipmentStep({ equipment, form, setField }) {
  const select = (label, field, items) => <label>{label}<select value={form[field]} onChange={(event) => setField(field, event.target.value)}><option value="">Choose {label.toLowerCase()}</option>{items.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.damage || item.thresholds}</option>)}</select></label>;
  return <div className={styles.formGrid}>{select('Primary weapon', 'primaryWeapon', equipment.primary_weapons)}{select('Secondary weapon', 'secondaryWeapon', equipment.secondary_weapons)}{select('Armor', 'armor', equipment.armor)}<label>First potion<select value={form.potion} onChange={(event) => setField('potion', event.target.value)}>{equipment.potions.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.text}</option>)}</select></label><div className={styles.detailPanel}><strong>Always added to inventory</strong><p>{equipment.starting_inventory.join(' · ')}</p></div></div>;
}

function ExperiencesStep({ form, updateArray }) { return <div className={styles.formGrid}><label>Experience one<input value={form.experiences[0]} onChange={(event) => updateArray('experiences', 0, event.target.value)} placeholder="A specific skill or history" /></label><label>Experience two<input value={form.experiences[1]} onChange={(event) => updateArray('experiences', 1, event.target.value)} placeholder="Another specific skill or history" /></label><div className={styles.detailPanel}><strong>Each Experience starts at +2</strong><p>Keep these specific enough to be interesting, but broad enough to apply in more than one situation. They do not grant spells or special abilities.</p></div></div>; }

function DomainCardsStep({ cards, selected, toggleCard }) { return <div className={styles.cards}><p className="muted">Choose two cards. {selected.length}/2 selected.</p>{cards.map((card) => <button type="button" className={`${styles.cardChoice} ${selected.includes(card.id) ? styles.selected : ''}`} onClick={() => toggleCard(card.id)} key={card.id}><span>{card.domain} · {card.type} · level 1</span><strong>{card.name}</strong><small>Recall {card.recall_cost}</small><p>{card.text}</p></button>)}</div>; }

function TextStep({ label, value, onChange, placeholder, questions = [] }) { return <div className={styles.textStep}>{questions.length > 0 && <div className={styles.prompts}><strong>Prompts from your class</strong>{questions.map((question) => <p key={question}>{question}</p>)}</div>}<label>{label}<textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label><p className="muted">Use a new line for each answer or connection.</p></div>; }
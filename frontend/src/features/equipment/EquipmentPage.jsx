import { useEffect, useMemo, useState } from 'react';
import Button from '../../components/Button/Button';
import { WEAPON_GROUPS } from '../admin/bookContentEditorUtils';
import { getCharacterCreationBook } from '../characters/characterApi';
import styles from './EquipmentPage.module.css';

const armorGroup = 'armor';

function loadEquipment(book) {
  const equipment = book?.equipment;
  if (!equipment || typeof equipment !== 'object') return [];
  return WEAPON_GROUPS.flatMap(({ id, label }) => (Array.isArray(equipment[id]) ? equipment[id] : [])
    .map((item) => ({ ...item, group: id, groupLabel: label })));
}

function displayValue(value) {
  return value === undefined || value === null || value === '' ? '-' : value;
}

export default function EquipmentPage() {
  const [book, setBook] = useState(null);
  const [state, setState] = useState({ loading: true, error: '' });
  const [requestId, setRequestId] = useState(0);
  const [selectedTier, setSelectedTier] = useState('all');
  const [selectedGroup, setSelectedGroup] = useState('all');

  useEffect(() => {
    let active = true;
    setState({ loading: true, error: '' });
    getCharacterCreationBook()
      .then((response) => {
        if (!active) return;
        setBook(response?.content || null);
        setState({ loading: false, error: '' });
      })
      .catch((error) => {
        if (!active) return;
        setBook(null);
        setState({ loading: false, error: error.message });
      });
    return () => { active = false; };
  }, [requestId]);

  const equipment = useMemo(() => loadEquipment(book), [book]);
  const tiers = useMemo(() => [...new Set(equipment.map((item) => Number(item.tier)).filter(Number.isFinite))].sort((a, b) => a - b), [equipment]);
  const filteredEquipment = useMemo(() => equipment.filter((item) => (
    (selectedTier === 'all' || Number(item.tier) === Number(selectedTier))
    && (selectedGroup === 'all' || item.group === selectedGroup)
  )), [equipment, selectedGroup, selectedTier]);
  const hasEquipmentCatalog = Boolean(book?.equipment && typeof book.equipment === 'object');

  if (state.loading) return <p className="muted">Loading equipment...</p>;

  if (state.error) {
    return (
      <section className={styles.notice}>
        <p className="eyebrow">EQUIPMENT CATALOG</p>
        <h2>Equipment could not be loaded</h2>
        <p className={styles.error} role="alert">{state.error}</p>
        <Button type="button" onClick={() => setRequestId((current) => current + 1)}>Retry loading equipment</Button>
      </section>
    );
  }

  if (!book || !hasEquipmentCatalog) {
    return (
      <section className={styles.notice}>
        <p className="eyebrow">EQUIPMENT CATALOG</p>
        <h2>No equipment book is available</h2>
        <p className="muted">An administrator needs to import a content book before equipment can be displayed.</p>
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p className="eyebrow">DAGGERHEART EQUIPMENT</p>
          <h2>Equipment catalog</h2>
          <p className="muted">Browse armor and weapons from every tier in the current content book.</p>
        </div>
        <span className={styles.count}>{filteredEquipment.length} {filteredEquipment.length === 1 ? 'entry' : 'entries'}</span>
      </header>

      <div className={styles.toolbar}>
        <label>
          <span>Tier</span>
          <select value={selectedTier} onChange={(event) => setSelectedTier(event.target.value)}>
            <option value="all">All tiers</option>
            {tiers.map((tier) => <option value={tier} key={tier}>Tier {tier}</option>)}
          </select>
        </label>
        <div className={styles.groupFilter} aria-label="Equipment type">
          <span>Type</span>
          <div className={styles.groupButtons}>
            <button type="button" className={selectedGroup === 'all' ? styles.selected : ''} aria-pressed={selectedGroup === 'all'} onClick={() => setSelectedGroup('all')}>All equipment</button>
            {WEAPON_GROUPS.map(({ id, label }) => <button type="button" className={selectedGroup === id ? styles.selected : ''} aria-pressed={selectedGroup === id} onClick={() => setSelectedGroup(id)} key={id}>{label}</button>)}
          </div>
        </div>
      </div>

      {filteredEquipment.length === 0 ? (
        <div className={styles.empty}>
          <h3>No matching equipment</h3>
          <p className="muted">Try another tier or equipment type.</p>
          <Button type="button" variant="text" onClick={() => { setSelectedTier('all'); setSelectedGroup('all'); }}>Clear filters</Button>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Trait</th>
                <th scope="col">Range</th>
                <th scope="col">Damage / thresholds</th>
                <th scope="col">Burden / armor score</th>
                <th scope="col">Feature</th>
              </tr>
            </thead>
            <tbody>
              {filteredEquipment.map((item) => {
                const isArmor = item.group === armorGroup;
                return (
                  <tr key={`${item.group}-${item.id || item.name}`}>
                    <th scope="row" data-label="Name">
                      <strong>{item.name || 'Unnamed equipment'}</strong>
                      <span className={styles.itemMeta}>{item.groupLabel} - Tier {item.tier}</span>
                      {item.is_magic && <span className={styles.magic}>Magic</span>}
                    </th>
                    <td data-label="Trait">{isArmor ? '-' : displayValue(item.trait)}</td>
                    <td data-label="Range">{isArmor ? '-' : displayValue(item.range)}</td>
                    <td data-label="Damage / thresholds">{isArmor ? displayValue(item.thresholds) : displayValue(item.damage)}</td>
                    <td data-label="Burden / armor score">{isArmor ? `Armor ${displayValue(item.armor_score)}` : displayValue(item.burden)}</td>
                    <td data-label="Feature" className={styles.feature}>{displayValue(item.feature)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
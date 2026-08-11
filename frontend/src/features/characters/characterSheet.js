// Daggerheart derived statistics. Everything here is recomputed from the class,
// equipment and level so a sheet stays correct when gear or level changes; only
// the mutable trackers (marked boxes, hope, gold) are persisted on the character.

export const TRAIT_IDS = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'];

export const TRAIT_ACTIONS = {
  agility: ['Sprint', 'Leap', 'Maneuver'],
  strength: ['Lift', 'Smash', 'Grapple'],
  finesse: ['Control', 'Hide', 'Tinker'],
  instinct: ['Perceive', 'Sense', 'Navigate'],
  presence: ['Charm', 'Perform', 'Deceive'],
  knowledge: ['Recall', 'Analyze', 'Comprehend'],
};

export const STRESS_MAX = 6;
export const HOPE_MAX = 6;
const GOLD_MAX = { handfuls: 9, bags: 9, chest: 1 };

// Armor thresholds are stored in the SRD as "major/severe".
export function parseThresholds(value) {
  const [major, severe] = String(value ?? '').split('/').map((part) => Number.parseInt(part, 10));
  return { major: Number.isFinite(major) ? major : 0, severe: Number.isFinite(severe) ? severe : 0 };
}

// Armor features encode their effect in prose, e.g. "Flexible: +1 Evasion".
function evasionModifier(feature) {
  const match = /([+-]\d+)\s*evasion/i.exec(feature || '');
  return match ? Number.parseInt(match[1], 10) : 0;
}

function findEquipment(book, group, id) {
  if (!book?.equipment || !id) return null;
  return book.equipment[group]?.find((item) => item.id === id) || null;
}

export function findClass(book, classId) {
  return book?.classes?.find((item) => item.id === classId) || null;
}

export function deriveSheet(character, book) {
  const level = character?.level || 1;
  const classInfo = findClass(book, character?.class_id);
  const subclassInfo = classInfo?.subclasses?.find((item) => item.id === character?.subclass_id) || null;

  const equipment = character?.equipment || {};
  const primary = findEquipment(book, 'primary_weapons', equipment.primary);
  const secondary = findEquipment(book, 'secondary_weapons', equipment.secondary);
  const armor = findEquipment(book, 'armor', equipment.armor);

  const base = parseThresholds(armor?.thresholds);
  // Both damage thresholds scale with level on top of the armor's base values.
  const thresholds = { major: base.major + level, severe: base.severe + level };

  const evasion = (classInfo?.evasion ?? 0) + evasionModifier(armor?.feature);
  const armorScore = armor?.armor_score ?? 0;
  const hitPointsMax = classInfo?.hit_points ?? 0;

  return {
    level,
    classInfo,
    subclassInfo,
    primary,
    secondary,
    armor,
    thresholds,
    evasion,
    armorScore,
    hitPointsMax,
    stressMax: STRESS_MAX,
    hopeMax: HOPE_MAX,
    proficiency: level >= 5 ? 2 : 1,
  };
}

const clamp = (value, max) => Math.min(Math.max(Number(value) || 0, 0), max);

// Normalizes persisted stats so older characters render with usable trackers.
export function normalizeStats(stats, derived) {
  const source = stats || {};
  const gold = source.gold || {};
  return {
    ...source,
    hit_points: { current: clamp(source.hit_points?.current, derived.hitPointsMax), max: derived.hitPointsMax },
    stress: { current: clamp(source.stress?.current, derived.stressMax), max: derived.stressMax },
    hope: { current: clamp(source.hope?.current, derived.hopeMax), max: derived.hopeMax },
    armor: { current: clamp(source.armor?.current, derived.armorScore), max: derived.armorScore },
    gold: {
      handfuls: clamp(gold.handfuls, GOLD_MAX.handfuls),
      bags: clamp(gold.bags, GOLD_MAX.bags),
      chest: clamp(gold.chest, GOLD_MAX.chest),
    },
    thresholds: derived.thresholds,
    evasion: derived.evasion,
    proficiency: derived.proficiency,
  };
}

export const GOLD_LIMITS = GOLD_MAX;

export function tierForLevel(level) {
  const value = Number(level) || 1;
  if (value >= 8) return 4;
  if (value >= 5) return 3;
  if (value >= 2) return 2;
  return 1;
}

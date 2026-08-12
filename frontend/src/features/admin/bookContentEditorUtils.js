export const BEAST_FEATURES_KEY = 'beast_features';
export const WEAPON_GROUPS = [
  { id: 'primary_weapons', label: 'Primary weapons' },
  { id: 'secondary_weapons', label: 'Secondary weapons' },
  { id: 'armor', label: 'Armor' },
];
export const DOMAIN_LEVELS = Array.from({ length: 10 }, (_, index) => index + 1);

export const clone = (value) => JSON.parse(JSON.stringify(value));

export const feature = (id = '') => ({ id, name: '', text: '' });

export const newDomain = (id = 'new-domain') => ({
  id,
  name: 'New domain',
  description: '',
  classes: [],
  ...Object.fromEntries(DOMAIN_LEVELS.map((level) => [`level_${level}_cards`, []])),
});

export const domainCard = (id = 'new-domain-card') => ({
  id,
  name: 'New domain card',
  type: 'ability',
  recall_cost: 0,
  text: '',
});

export const newAncestry = (id = 'new-ancestry') => ({
  id,
  name: 'New ancestry',
  selection_rules: '',
  features: [],
});

export const newCommunity = (id = 'new-community') => ({
  id,
  name: 'New community',
  adjectives: [],
  feature: feature(),
});

export const beastForm = (id = 'new-beast-form') => ({
  id,
  name: 'New beast form',
  tier: 1,
  examples: [],
  evasion_bonus: 0,
  attack_range: 'melee',
  attack_trait: '',
  attack_bonus: 0,
  attack_damage: '',
  advantages: [],
  carrier: '',
  feature_ids: [],
  features: [],
});

export function newClass(id = 'new-class') {
  return {
    id,
    name: 'New class',
    site_description: '',
    domains: [],
    evasion: 10,
    hit_points: 5,
    class_items: [],
    hope_feature: feature(),
    class_features: [],
    beast_forms: [],
    background_questions: [],
    subclasses: [],
  };
}

export function normalizeFeature(item, fallbackId = '') {
  const normalized = {
    ...feature(item.id || fallbackId),
    ...clone(item),
    id: item.id || fallbackId,
    name: item.name || '',
    text: item.text || '',
  };
  delete normalized.tier;
  return normalized;
}

export function normalizeBeastForm(item) {
  return {
    ...beastForm(item.id),
    ...clone(item),
    id: item.id || '',
    name: item.name || '',
    tier: Number(item.tier) || 1,
    examples: Array.isArray(item.examples) ? item.examples : [],
    advantages: Array.isArray(item.advantages) ? item.advantages : [],
    feature_ids: Array.isArray(item.feature_ids) ? item.feature_ids : [],
    features: Array.isArray(item.features) ? item.features : [],
  };
}

export function normalizeSubclass(item) {
  return {
    ...clone(item),
    id: item.id || '',
    name: item.name || '',
    site_description: item.site_description || '',
    spellcast_trait: item.spellcast_trait || '',
    foundation: Array.isArray(item.foundation) ? item.foundation : [],
    specialization: Array.isArray(item.specialization) ? item.specialization : [],
    mastery: Array.isArray(item.mastery) ? item.mastery : [],
  };
}

export function normalizeClass(item) {
  return {
    ...newClass(item.id),
    ...clone(item),
    domains: Array.isArray(item.domains) ? item.domains : [],
    class_items: Array.isArray(item.class_items) ? item.class_items : [],
    class_features: Array.isArray(item.class_features) ? item.class_features : [],
    beast_forms: Array.isArray(item.beast_forms) ? item.beast_forms.map(normalizeBeastForm) : [],
    background_questions: Array.isArray(item.background_questions) ? item.background_questions : [],
    subclasses: Array.isArray(item.subclasses) ? item.subclasses.map(normalizeSubclass) : [],
    hope_feature: item.hope_feature || feature(),
  };
}

export function normalizeWeapon(item, group) {
  const normalized = {
    ...clone(item),
    id: item.id || `new-${group}-item`,
    name: item.name || '',
    tier: Number(item.tier) || 1,
  };
  if (group !== 'armor') normalized.is_magic = Boolean(item.is_magic);
  return normalized;
}

export function normalizeDomainCard(item) {
  return {
    ...domainCard(item.id),
    ...clone(item),
    id: item.id || '',
    name: item.name || '',
    type: item.type || 'ability',
    recall_cost: Number(item.recall_cost) || 0,
    text: item.text || '',
  };
}

export function normalizeDomain(item) {
  const normalized = {
    ...newDomain(item.id),
    ...clone(item),
    id: item.id || '',
    name: item.name || '',
    description: item.description || '',
    classes: Array.isArray(item.classes) ? item.classes : [],
  };
  DOMAIN_LEVELS.forEach((level) => {
    const key = `level_${level}_cards`;
    normalized[key] = Array.isArray(item[key]) ? item[key].map(normalizeDomainCard) : [];
  });
  return normalized;
}

export function normalizeAncestry(item) {
  return {
    ...newAncestry(item.id),
    ...clone(item),
    id: item.id || '',
    name: item.name || '',
    selection_rules: item.selection_rules || '',
    features: Array.isArray(item.features) ? item.features.map((entry) => normalizeFeature(entry)) : [],
  };
}

export function normalizeCommunity(item) {
  return {
    ...newCommunity(item.id),
    ...clone(item),
    id: item.id || '',
    name: item.name || '',
    adjectives: Array.isArray(item.adjectives) ? item.adjectives : [],
    feature: normalizeFeature(item.feature || feature()),
  };
}

function slugify(value) {
  return String(value || 'feature').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'feature';
}

function migrateLegacyBeastFeatures(content) {
  const library = Array.isArray(content[BEAST_FEATURES_KEY])
    ? content[BEAST_FEATURES_KEY].map((item) => normalizeFeature(item))
    : [];
  const knownIds = new Set(library.map((item) => item.id));
  const classes = content.classes.map((classItem) => ({
    ...classItem,
    beast_forms: classItem.beast_forms.map((form) => {
      const nextForm = { ...form, feature_ids: [...form.feature_ids] };
      form.features.forEach((item, index) => {
        const baseId = item.id || `${form.id}-${slugify(item.name || `feature-${index + 1}`)}`;
        let id = baseId;
        let suffix = 2;
        while (knownIds.has(id) && !library.some((featureItem) => featureItem.id === id && featureItem.name === item.name && featureItem.text === item.text)) {
          id = `${baseId}-${suffix}`;
          suffix += 1;
        }
        if (!knownIds.has(id)) {
          library.push(normalizeFeature(item, id));
          knownIds.add(id);
        }
        if (!nextForm.feature_ids.includes(id)) nextForm.feature_ids.push(id);
      });
      return { ...nextForm, features: [] };
    }),
  }));
  return { ...content, classes, [BEAST_FEATURES_KEY]: library };
}

export function normalizeBookContent(value) {
  const content = clone(value || {});
  content.classes = Array.isArray(content.classes) ? content.classes.map(normalizeClass) : [];
  content.ancestries = Array.isArray(content.ancestries) ? content.ancestries.map(normalizeAncestry) : [];
  content.communities = Array.isArray(content.communities) ? content.communities.map(normalizeCommunity) : [];
  content.domains = Array.isArray(content.domains) ? content.domains.map(normalizeDomain) : [];
  content.equipment = { ...(content.equipment || {}) };
  WEAPON_GROUPS.forEach(({ id }) => {
    content.equipment[id] = Array.isArray(content.equipment[id])
      ? content.equipment[id].map((item) => normalizeWeapon(item, id))
      : [];
  });
  return migrateLegacyBeastFeatures(content);
}

export function beastFormKey(classId, formId) {
  return `${classId}::${formId}`;
}

export function flattenBeastForms(classes) {
  return classes.flatMap((classItem) => classItem.beast_forms.map((form) => ({
    ...form,
    classId: classItem.id,
    className: classItem.name,
    key: beastFormKey(classItem.id, form.id),
  }))).sort((left, right) => Number(left.tier) - Number(right.tier) || left.name.localeCompare(right.name));
}

export function flattenWeapons(equipment) {
  return WEAPON_GROUPS.flatMap(({ id, label }) => (equipment?.[id] || []).map((item) => ({
    ...item,
    group: id,
    groupLabel: label,
    key: `${id}::${item.id}`,
  }))).sort((left, right) => Number(left.tier) - Number(right.tier) || left.name.localeCompare(right.name));
}

export function domainCardKey(domainId, level, cardId) {
  return `${domainId}::${level}::${cardId}`;
}

export function flattenDomainCards(domains) {
  return (domains || []).flatMap((domainItem) => DOMAIN_LEVELS.flatMap((level) => (domainItem[`level_${level}_cards`] || []).map((card) => ({
    ...card,
    level,
    domainId: domainItem.id,
    domainName: domainItem.name,
    key: domainCardKey(domainItem.id, level, card.id),
  })))).sort((left, right) => Number(left.level) - Number(right.level) || left.name.localeCompare(right.name));
}

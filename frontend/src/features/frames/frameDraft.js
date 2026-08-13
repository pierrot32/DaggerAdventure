export const frameSectionLabels = {
  pitch: 'Pitch',
  tone_and_feel: 'TONE & FEEL',
  themes: 'THEMES',
  touchstones: 'TOUCHSTONES',
  overview: 'Overview',
  communities: 'COMMUNITIES',
  ancestries: 'ANCESTRIES',
  classes: 'CLASSES',
  player_principles: 'PLAYER PRINCIPLES',
  gm_principles: 'GM PRINCIPLES',
  distinctions: 'DISTINCTIONS',
  inciting_incident: 'THE INCITING INCIDENT',
  campaign_mechanics: 'CAMPAIGN MECHANICS',
  session_zero_questions: 'SESSION ZERO QUESTIONS',
};

export const frameEditorSections = [
  { id: 'details', label: 'Frame details' },
  { id: 'pitch', label: 'Pitch' },
  { id: 'tone_and_feel', label: 'TONE & FEEL' },
  { id: 'themes', label: 'THEMES' },
  { id: 'touchstones', label: 'TOUCHSTONES' },
  { id: 'overview', label: 'Overview' },
  { id: 'communities', label: 'COMMUNITIES' },
  { id: 'ancestries', label: 'ANCESTRIES' },
  { id: 'classes', label: 'CLASSES' },
  { id: 'player_principles', label: 'PLAYER PRINCIPLES' },
  { id: 'gm_principles', label: 'GM PRINCIPLES' },
  { id: 'distinctions', label: 'DISTINCTIONS' },
  { id: 'inciting_incident', label: 'THE INCITING INCIDENT' },
  { id: 'campaign_mechanics', label: 'CAMPAIGN MECHANICS' },
  { id: 'session_zero_questions', label: 'SESSION ZERO QUESTIONS' },
];

export const frameModificationKinds = [
  { id: 'communities', label: 'Community features', optionLabel: 'community', optionPlural: 'communities' },
  { id: 'ancestries', label: 'Ancestry features', optionLabel: 'ancestry', optionPlural: 'ancestries' },
  { id: 'classes', label: 'Class features', optionLabel: 'class', optionPlural: 'classes' },
];

const modificationMessageKeys = ['communities', 'ancestries', 'classes'];
const frameEntryMapKey = '__dagger_adventure_frame_map_key';
const frameEntryMapShape = '__dagger_adventure_frame_map_shape';
const frameModificationMapShapes = '__dagger_adventure_frame_map_shapes';

const emptyGmMessages = () => ({
  ...Object.fromEntries(Object.keys(frameSectionLabels).map((key) => [key, ''])),
  modifications: '',
  ...Object.fromEntries(modificationMessageKeys.map((key) => [key, ''])),
});

function slugify(value) {
  return String(value || 'feature').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'feature';
}

export const emptyFrame = () => ({
  id: 'custom-frame',
  name: 'Untitled campaign frame',
  description: '',
  complexity_rating: 3,
  pitch: 'A campaign shaped by the choices and tensions at this table.',
  tone_and_feel: [],
  themes: [],
  touchstones: [],
  overview: 'Define the setting, pressures, and boundaries that make this campaign distinct.',
  modifications: { communities: [], ancestries: [], classes: [] },
  gm_messages: emptyGmMessages(),
  player_principles: [],
  gm_principles: [],
  distinctions: [],
  inciting_incident: '',
  campaign_mechanics: [],
  session_zero_questions: [],
});

export function commaList(value) {
  return listValues(value, ',');
}

export function lineList(value) {
  return listValues(value, '\n');
}

function listValues(value, separator) {
  const values = Array.isArray(value)
    ? value.map((item) => entryValue(item))
    : String(value || '').split(separator);
  return values.map((item) => item.trim()).filter(Boolean);
}

function entryValue(entry) {
  if (typeof entry === 'string') return entry;
  if (!entry || typeof entry !== 'object') return String(entry || '');
  return entry.description || entry.text || entry.value || entry.title || '';
}

function isObjectMapEntries(entries) {
  return entries && typeof entries === 'object' && (!Array.isArray(entries)
    || entries[frameEntryMapShape] === 'object'
    || Object.keys(entries).some((key) => entries[key]?.[frameEntryMapKey] !== undefined));
}

function paragraphValues(value) {
  if (Array.isArray(value)) return value.map((item) => entryValue(item)).map((item) => item.trim()).filter(Boolean);
  return String(value || '').split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
}

function normalizeEntries(value, prefix) {
  const entries = Array.isArray(value) ? value : paragraphValues(value);
  return entries.map((entry, index) => {
    if (typeof entry === 'object' && entry !== null && !Array.isArray(entry)) {
      return {
        ...entry,
        id: entry.id || `${prefix}-${index + 1}`,
        title: entry.title || `${prefix} ${index + 1}`,
        description: entryValue(entry),
      };
    }
    return { id: `${prefix}-${index + 1}`, title: `${prefix} ${index + 1}`, description: entryValue(entry) };
  });
}

export function contentToDraft(content) {
  const defaults = emptyFrame();
  const source = content || {};
  const sourceModifications = content?.modifications || {};
  const sourceMessages = content?.gm_messages || {};
  const modificationMapShapes = Object.fromEntries(frameModificationKinds.map(({ id }) => [id, isObjectMapEntries(sourceModifications[id])]));
  return {
    ...defaults,
    ...source,
    tone_and_feel: commaList(source.tone_and_feel),
    themes: commaList(source.themes),
    touchstones: commaList(source.touchstones),
    player_principles: normalizeEntries(source.player_principles, 'Player principle'),
    gm_principles: normalizeEntries(source.gm_principles, 'GM principle'),
    distinctions: normalizeEntries(source.distinctions, 'Distinction'),
    campaign_mechanics: normalizeEntries(source.campaign_mechanics, 'Campaign mechanic'),
    session_zero_questions: lineList(source.session_zero_questions),
    modifications: {
      ...defaults.modifications,
      ...Object.fromEntries(frameModificationKinds.map(({ id }) => [id, normalizeFrameEntries(sourceModifications[id], id)])),
      [frameModificationMapShapes]: modificationMapShapes,
    },
    gm_messages: {
      ...defaults.gm_messages,
      ...sourceMessages,
      ...Object.fromEntries(modificationMessageKeys.map((key) => [key, sourceMessages[key] ?? sourceMessages.modifications ?? ''])),
    },
  };
}

export function entryListToText(entries = []) {
  return entries.map((entry) => `${entry.title}: ${entry.description}`).join('\n\n');
}

function normalizeFrameEntries(entries, kind) {
  const isObjectMap = isObjectMapEntries(entries);
  const sourceEntries = Array.isArray(entries)
    ? entries.map((entry) => ({ entry }))
    : Object.entries(isObjectMap ? entries : {}).map(([mapKey, entry]) => ({ entry, mapKey }));
  const normalized = sourceEntries.map(({ entry, mapKey }, index) => {
    const legacyTargetKey = { communities: 'community_ids', ancestries: 'ancestry_ids', classes: 'class_ids' }[kind];
    const sourceEntry = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {};
    const targetIds = Array.isArray(sourceEntry.target_ids)
      ? sourceEntry.target_ids
      : Array.isArray(sourceEntry[legacyTargetKey]) ? sourceEntry[legacyTargetKey] : [];
    const normalizedEntry = {
      ...sourceEntry,
      id: sourceEntry.id || mapKey || `${kind}-feature-${index + 1}`,
      title: sourceEntry.title || '',
      description: sourceEntry.description || '',
      target_ids: targetIds,
    };
    if (mapKey !== undefined) normalizedEntry[frameEntryMapKey] = mapKey;
    return normalizedEntry;
  });
  if (isObjectMap) normalized[frameEntryMapShape] = 'object';
  return normalized;
}

export function newModificationEntry(_kind, _index = 1) {
  return {
    id: '',
    title: '',
    description: '',
    target_ids: [],
  };
}

export function autoFeatureIds(entries, kind, frameName, options = []) {
  const usedIds = new Set();
  const kindLabel = { communities: 'community', ancestries: 'ancestry', classes: 'class' }[kind] || kind;
  const nextEntries = entries.map((entry, _index) => {
    const targetIds = Array.isArray(entry.target_ids) ? entry.target_ids : [];
    const targetLabel = targetIds.length > 0
      ? targetIds.map((targetId) => {
        const target = options.find((option) => option.id === targetId);
        return slugify(target?.name || targetId);
      }).sort().join('-')
      : `all-${kind}`;
    const baseId = `${slugify(frameName)}-${kindLabel}-${targetLabel}`;
    let id = entry.id || baseId;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);
    const targetOptions = targetIds.map((targetId) => options.find((option) => option.id === targetId));
    const title = entry.title || (targetIds.length > 0 && targetOptions.every(Boolean)
      ? targetOptions.map((option) => option.name || option.id).join(' / ')
      : `${kindLabel} feature`);
    return { ...entry, id, title };
  });
  if (entries[frameEntryMapShape] === 'object' || entries.some((entry) => entry?.[frameEntryMapKey] !== undefined)) nextEntries[frameEntryMapShape] = 'object';
  return nextEntries;
}

export function preserveFrameEntryMapShape(entries, sourceEntries) {
  if (sourceEntries?.[frameEntryMapShape] === 'object') entries[frameEntryMapShape] = 'object';
  return entries;
}

function serializeFrameEntries(entries, kind, frameName, options, mapShapes = {}) {
  const normalized = autoFeatureIds(normalizeFrameEntries(entries, kind), kind, frameName, options);
  const stripMetadata = (entry) => {
    const serialized = { ...entry };
    delete serialized[frameEntryMapKey];
    return serialized;
  };
  if (normalized[frameEntryMapShape] !== 'object' && mapShapes[kind] !== true) return normalized.map(stripMetadata);
  return Object.fromEntries(normalized.map((entry, index) => [
    entry[frameEntryMapKey] || entry.id || `${kind}-feature-${index + 1}`,
    stripMetadata(entry),
  ]));
}

export function textToEntries(value, prefix) {
  const entries = Array.isArray(value) ? value : paragraphValues(value);
  return entries.map((entry, index) => {
    if (typeof entry === 'object' && entry !== null && !Array.isArray(entry)) {
      const description = entryValue(entry).trim();
      return description ? {
        ...entry,
        id: entry.id || `${prefix}-${index + 1}`,
        title: entry.title || `${prefix} ${index + 1}`,
        description,
      } : null;
    }
    const description = entryValue(entry).trim();
    return description ? { id: `${prefix}-${index + 1}`, title: `${prefix} ${index + 1}`, description } : null;
  }).filter(Boolean);
}

export function draftToContent(form, optionLists = {}) {
  const defaults = emptyFrame();
  const id = form.id.trim() || form.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom-frame';
  const availableOptions = optionLists || {};
  const modifications = Object.fromEntries(frameModificationKinds.map(({ id: kind }) => [
    kind,
    serializeFrameEntries(form.modifications?.[kind], kind, form.name, availableOptions[kind] || [], form.modifications?.[frameModificationMapShapes]),
  ]));
  const gmMessages = { ...defaults.gm_messages, ...(form.gm_messages || {}) };
  modificationMessageKeys.forEach((key) => {
    if (form.gm_messages?.[key] === undefined) gmMessages[key] = form.gm_messages?.modifications || '';
  });
  return {
    id,
    name: form.name.trim(),
    description: form.description.trim(),
    complexity_rating: Number(form.complexity_rating),
    pitch: form.pitch.trim(),
    tone_and_feel: commaList(form.tone_and_feel),
    themes: commaList(form.themes),
    touchstones: commaList(form.touchstones),
    overview: form.overview.trim(),
    modifications,
    gm_messages: gmMessages,
    player_principles: textToEntries(form.player_principles, 'Player principle'),
    gm_principles: textToEntries(form.gm_principles, 'GM principle'),
    distinctions: textToEntries(form.distinctions, 'Distinction'),
    inciting_incident: form.inciting_incident.trim(),
    campaign_mechanics: textToEntries(form.campaign_mechanics, 'Campaign mechanic'),
    session_zero_questions: lineList(form.session_zero_questions),
  };
}

export function contentToForm(content) {
  const frame = contentToDraft(content);
  return {
    id: frame.id || '',
    name: frame.name || '',
    description: frame.description || '',
    complexity_rating: frame.complexity_rating || 3,
    pitch: frame.pitch || '',
    tone_and_feel: frame.tone_and_feel || [],
    themes: frame.themes || [],
    touchstones: frame.touchstones || [],
    overview: frame.overview || '',
    modifications: frame.modifications,
    gm_messages: frame.gm_messages,
    player_principles: frame.player_principles || [],
    gm_principles: frame.gm_principles || [],
    distinctions: frame.distinctions || [],
    inciting_incident: frame.inciting_incident || '',
    campaign_mechanics: frame.campaign_mechanics || [],
    session_zero_questions: frame.session_zero_questions || [],
  };
}
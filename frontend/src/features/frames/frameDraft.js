export const frameSectionLabels = {
  pitch: 'Pitch',
  overview: 'Overview',
  inciting_incident: 'The inciting incident',
  tone_and_feel: 'Tone & feel',
  themes: 'Themes',
  touchstones: 'Touchstones',
  modifications: 'Character guidance',
  player_principles: 'Player principles',
  gm_principles: 'GM principles',
  distinctions: 'Distinctions',
  campaign_mechanics: 'Campaign mechanics',
  session_zero_questions: 'Session-zero questions',
};

export const frameModificationKinds = [
  { id: 'communities', label: 'Community features', optionLabel: 'community', optionPlural: 'communities' },
  { id: 'ancestries', label: 'Ancestry features', optionLabel: 'ancestry', optionPlural: 'ancestries' },
  { id: 'classes', label: 'Class features', optionLabel: 'class', optionPlural: 'classes' },
];

const modificationMessageKeys = ['communities', 'ancestries', 'classes'];

const emptyGmMessages = () => ({
  ...Object.fromEntries(Object.keys(frameSectionLabels).map((key) => [key, ''])),
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
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

export function lineList(value) {
  return value.split('\n').map((item) => item.trim()).filter(Boolean);
}

export function contentToDraft(content) {
  const defaults = emptyFrame();
  const sourceModifications = content?.modifications || {};
  const sourceMessages = content?.gm_messages || {};
  return {
    ...defaults,
    ...content,
    modifications: {
      ...defaults.modifications,
      ...Object.fromEntries(frameModificationKinds.map(({ id }) => [id, normalizeFrameEntries(sourceModifications[id], id)])),
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
  return (Array.isArray(entries) ? entries : []).map((entry, index) => {
    const { gm_message: _legacyGmMessage, ...entryWithoutGmMessage } = entry;
    const legacyTargetKey = { communities: 'community_ids', ancestries: 'ancestry_ids', classes: 'class_ids' }[kind];
    const targetIds = Array.isArray(entry.target_ids)
      ? entry.target_ids
      : Array.isArray(entry[legacyTargetKey]) ? entry[legacyTargetKey] : [];
    return {
      ...entryWithoutGmMessage,
      id: entry.id || `${kind}-feature-${index + 1}`,
      title: entry.title || '',
      description: entry.description || '',
      target_ids: targetIds,
    };
  });
}

export function newModificationEntry(kind, index = 1) {
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
  return entries.map((entry, index) => {
    const targetIds = Array.isArray(entry.target_ids) ? entry.target_ids : [];
    const targetLabel = targetIds.length > 0
      ? targetIds.map((targetId) => {
        const target = options.find((option) => option.id === targetId);
        return slugify(target?.name || targetId);
      }).sort().join('-')
      : `all-${kind}`;
    const baseId = `${slugify(frameName)}-${kindLabel}-${targetLabel}`;
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);
    return { ...entry, id };
  });
}

export function textToEntries(value, prefix) {
  return value
    .split(/\n\s*\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((description, index) => ({
      id: `${prefix}-${index + 1}`,
      title: `${prefix} ${index + 1}`,
      description,
    }));
}

export function draftToContent(form, optionLists = {}) {
  const defaults = emptyFrame();
  const id = form.id.trim() || form.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom-frame';
  const availableOptions = optionLists || {};
  const modifications = Object.fromEntries(frameModificationKinds.map(({ id: kind }) => [
    kind,
    autoFeatureIds(normalizeFrameEntries(form.modifications?.[kind], kind), kind, form.name, availableOptions[kind] || []),
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
    tone_and_feel: (frame.tone_and_feel || []).join(', '),
    themes: (frame.themes || []).join(', '),
    touchstones: (frame.touchstones || []).join(', '),
    overview: frame.overview || '',
    modifications: frame.modifications,
    gm_messages: frame.gm_messages,
    player_principles: entryListToText(frame.player_principles),
    gm_principles: entryListToText(frame.gm_principles),
    distinctions: entryListToText(frame.distinctions),
    inciting_incident: frame.inciting_incident || '',
    campaign_mechanics: entryListToText(frame.campaign_mechanics),
    session_zero_questions: (frame.session_zero_questions || []).join('\n'),
  };
}
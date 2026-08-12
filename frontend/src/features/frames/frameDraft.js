export const frameSectionLabels = {
  pitch: 'Pitch',
  overview: 'Overview',
  inciting_incident: 'The inciting incident',
};

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
  return {
    ...emptyFrame(),
    ...content,
    modifications: {
      ...emptyFrame().modifications,
      ...(content?.modifications || {}),
    },
  };
}

export function entryListToText(entries = []) {
  return entries.map((entry) => `${entry.title}: ${entry.description}`).join('\n\n');
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

export function draftToContent(form) {
  const id = form.id.trim() || form.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom-frame';
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
    modifications: {
      communities: textToEntries(form.communities, 'Community guidance'),
      ancestries: textToEntries(form.ancestries, 'Ancestry guidance'),
      classes: textToEntries(form.classes, 'Class guidance'),
    },
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
    communities: entryListToText(frame.modifications?.communities),
    ancestries: entryListToText(frame.modifications?.ancestries),
    classes: entryListToText(frame.modifications?.classes),
    player_principles: entryListToText(frame.player_principles),
    gm_principles: entryListToText(frame.gm_principles),
    distinctions: entryListToText(frame.distinctions),
    inciting_incident: frame.inciting_incident || '',
    campaign_mechanics: entryListToText(frame.campaign_mechanics),
    session_zero_questions: (frame.session_zero_questions || []).join('\n'),
  };
}
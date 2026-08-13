import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const bookPath = path.join(root, 'content', 'srd-9-09-25.json');
const sourceFiles = [
  ['beast-feast', 'BEAST FEAST', 'beast feast.txt', 3],
  ['five-banners-burning', 'FIVE BANNERS BURNING', 'five banner burning.txt', 4],
  ['witherwild', 'THE WITHERWILD', 'Wildernest.txt', 4],
];
const topSections = [
  'THE PITCH',
  'TONE & FEEL',
  'THEMES',
  'TOUCHSTONES',
  'OVERVIEW',
  'COMMUNITIES',
  'ANCESTRIES',
  'CLASSES',
  'PLAYER PRINCIPLES',
  'GM PRINCIPLES',
  'DISTINCTIONS',
  'THE INCITING INCIDENT',
  'CAMPAIGN MECHANICS',
  'SESSION ZERO QUESTIONS',
];

function slug(value) {
  return value
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'entry';
}

function readSections(text) {
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  const sections = {};
  let current = null;
  for (const line of lines) {
    const heading = line.trim();
    if (topSections.includes(heading)) {
      current = heading;
      sections[current] = [];
      continue;
    }
    if (current) sections[current].push(line);
  }
  if (!sections['THE PITCH']?.some((line) => line.trim())) {
    const pitchMarker = lines.findIndex((line) => ['---', '--'].includes(line.trim()));
    const pitchStart = pitchMarker >= 0 ? pitchMarker + 1 : 0;
    const pitchEnd = lines.findIndex((line, index) => (
      index > pitchStart && topSections.includes(line.trim()) && line.trim() !== 'THE PITCH'
    ));
    const pitch = lines.slice(pitchStart, pitchEnd >= 0 ? pitchEnd : lines.length).join('\n').trim();
    if (pitch) sections['THE PITCH'] = [pitch];
  }
  return Object.fromEntries(Object.entries(sections).map(([key, value]) => [key, value.join('\n').trim()]));
}

function listValues(value) {
  return value
    .replaceAll('\n', ' ')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function paragraphs(value) {
  return value
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block && block !== '---');
}

function guidanceEntries(value, prefix) {
  return paragraphs(value).map((block, index) => {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    const possibleTitle = lines[0] || `${prefix} ${index + 1}`;
    const hasTitle = lines.length > 1 && possibleTitle.length <= 90 && !/[.!?:]$/.test(possibleTitle);
    const title = hasTitle ? possibleTitle : `${prefix} ${index + 1}`;
    const description = hasTitle ? lines.slice(1).join('\n') : lines.join('\n');
    return { id: `${slug(prefix)}-${slug(title)}-${index + 1}`, title, description };
  });
}

function questions(value) {
  return value
    .split('\n')
    .map((line) => line.trim().replace(/^[•–-]\s*/, ''))
    .filter((line) => line.endsWith('?'));
}

function buildFrame([id, name, fileName, complexity]) {
  const sourceText = fs.readFileSync(path.join(root, 'content', fileName), 'utf8').replaceAll('\r\n', '\n').trim();
  const sections = readSections(sourceText);
  const tagline = sourceText.split('\n').map((line) => line.trim()).filter(Boolean)[1] || '';
  const modifications = {
    communities: guidanceEntries(sections.COMMUNITIES || '', 'community'),
    ancestries: guidanceEntries(sections.ANCESTRIES || '', 'ancestry'),
    classes: guidanceEntries(sections.CLASSES || '', 'class'),
  };
  const structuredSections = Object.fromEntries(Object.entries(sections).map(([key, content]) => [
    slug(key), { title: key, content },
  ]));
  return {
    id,
    name,
    description: tagline,
    complexity_rating: complexity,
    pitch: sections['THE PITCH'] || '',
    tone_and_feel: listValues(sections['TONE & FEEL'] || ''),
    themes: listValues(sections.THEMES || ''),
    touchstones: listValues(sections.TOUCHSTONES || ''),
    overview: sections.OVERVIEW || '',
    modifications,
    player_principles: guidanceEntries(sections['PLAYER PRINCIPLES'] || '', 'player principle'),
    gm_principles: guidanceEntries(sections['GM PRINCIPLES'] || '', 'GM principle'),
    distinctions: guidanceEntries(sections.DISTINCTIONS || '', 'distinction'),
    inciting_incident: sections['THE INCITING INCIDENT'] || '',
    campaign_mechanics: guidanceEntries(sections['CAMPAIGN MECHANICS'] || '', 'campaign mechanic'),
    session_zero_questions: questions(sections['SESSION ZERO QUESTIONS'] || ''),
    sections: structuredSections,
    source_text: sourceText,
  };
}

const book = JSON.parse(fs.readFileSync(bookPath, 'utf8'));
book.content.frames = sourceFiles.map(buildFrame);
fs.writeFileSync(bookPath, `${JSON.stringify(book, null, 2)}\n`);
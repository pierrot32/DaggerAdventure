CREATE TABLE adventure_note_sections (
    id UUID PRIMARY KEY,
    adventure_id UUID NOT NULL REFERENCES adventures(id) ON DELETE CASCADE,
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE adventure_notes
    ADD COLUMN section_id UUID,
    ADD COLUMN position INTEGER;

INSERT INTO adventure_note_sections (id, adventure_id, creator_id, name, position)
SELECT gen_random_uuid(), a.id, a.creator_id, 'General', 0
FROM adventures a;

UPDATE adventure_notes n
SET section_id = s.id,
    position = ranked.position
FROM (
    SELECT n.id, s.id AS section_id,
           row_number() OVER (PARTITION BY n.adventure_id ORDER BY n.updated_at DESC, n.id) - 1 AS position
    FROM adventure_notes n
    JOIN adventure_note_sections s ON s.adventure_id = n.adventure_id
) ranked
JOIN adventure_note_sections s ON s.id = ranked.section_id
WHERE n.id = ranked.id;

ALTER TABLE adventure_notes
    ALTER COLUMN section_id SET NOT NULL,
    ALTER COLUMN position SET NOT NULL,
    ADD CONSTRAINT adventure_notes_section_fk
        FOREIGN KEY (section_id) REFERENCES adventure_note_sections(id) ON DELETE CASCADE,
    ADD CONSTRAINT adventure_notes_position_check CHECK (position >= 0);

CREATE INDEX adventure_note_sections_adventure_idx
    ON adventure_note_sections (adventure_id, position, id);
CREATE INDEX adventure_notes_section_idx
    ON adventure_notes (section_id, position, id);

CREATE TABLE character_note_sections (
    id UUID PRIMARY KEY,
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE character_notes (
    id UUID PRIMARY KEY,
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    section_id UUID NOT NULL REFERENCES character_note_sections(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT character_notes_position_check CHECK (position >= 0)
);

INSERT INTO character_note_sections (id, character_id, owner_id, name, position)
SELECT gen_random_uuid(), id, user_id, 'General', 0
FROM characters;

CREATE INDEX character_note_sections_character_idx
    ON character_note_sections (character_id, position, id);
CREATE INDEX character_notes_section_idx
    ON character_notes (section_id, position, id);
CREATE INDEX character_notes_character_idx
    ON character_notes (character_id, position, id);

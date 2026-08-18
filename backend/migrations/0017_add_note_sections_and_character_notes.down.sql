DROP TABLE IF EXISTS character_notes;
DROP TABLE IF EXISTS character_note_sections;
ALTER TABLE adventure_notes
    DROP CONSTRAINT IF EXISTS adventure_notes_section_fk,
    DROP CONSTRAINT IF EXISTS adventure_notes_position_check,
    DROP COLUMN IF EXISTS section_id,
    DROP COLUMN IF EXISTS position;
DROP TABLE IF EXISTS adventure_note_sections;

ALTER TABLE characters
    ADD COLUMN background_story TEXT NOT NULL DEFAULT '',
    ADD COLUMN background_notes TEXT NOT NULL DEFAULT '',
    ADD COLUMN family_members JSONB NOT NULL DEFAULT '[]'::jsonb;
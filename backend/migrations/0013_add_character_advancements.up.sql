ALTER TABLE characters
    ADD COLUMN advancements JSONB NOT NULL DEFAULT '[]'::jsonb;
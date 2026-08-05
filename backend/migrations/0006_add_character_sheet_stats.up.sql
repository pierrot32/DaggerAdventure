ALTER TABLE characters
    ADD COLUMN stats JSONB NOT NULL DEFAULT '{}'::jsonb;
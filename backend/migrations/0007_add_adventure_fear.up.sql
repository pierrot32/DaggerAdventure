-- Fear is a table-wide GM resource, so it belongs to the adventure.
ALTER TABLE adventures
    ADD COLUMN fear INTEGER NOT NULL DEFAULT 0,
    ADD CONSTRAINT adventures_fear_range CHECK (fear >= 0 AND fear <= 12);

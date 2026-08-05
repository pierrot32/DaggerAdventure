ALTER TABLE adventures
    DROP CONSTRAINT IF EXISTS adventures_fear_range,
    DROP COLUMN IF EXISTS fear;

DROP INDEX IF EXISTS access_audit_target_idx;
DROP TABLE IF EXISTS access_level_audit_events;

ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'player';

UPDATE users
SET role = CASE access_level
    WHEN 'player_only' THEN 'player'
    WHEN 'adventure_maker' THEN 'gm'
    WHEN 'admin' THEN 'admin'
    ELSE 'player'
END;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_access_level_check;
ALTER TABLE users DROP COLUMN access_level;

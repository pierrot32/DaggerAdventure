ALTER TABLE users ADD COLUMN access_level TEXT NOT NULL DEFAULT 'nothing';

UPDATE users
SET access_level = CASE role
    WHEN 'player' THEN 'player_only'
    WHEN 'gm' THEN 'adventure_maker'
    WHEN 'admin' THEN 'admin'
    ELSE 'nothing'
END;

ALTER TABLE users
    ADD CONSTRAINT users_access_level_check
    CHECK (access_level IN ('nothing', 'player_only', 'adventure_maker', 'admin'));

ALTER TABLE users DROP COLUMN role;

CREATE TABLE access_level_audit_events (
    id UUID PRIMARY KEY,
    actor_id UUID NOT NULL REFERENCES users(id),
    target_user_id UUID NOT NULL REFERENCES users(id),
    previous_access_level TEXT NOT NULL,
    new_access_level TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX access_audit_target_idx
    ON access_level_audit_events (target_user_id, created_at DESC);

CREATE TABLE adventure_story_applies (
    adventure_id UUID NOT NULL REFERENCES adventures(id) ON DELETE CASCADE,
    apply_key TEXT NOT NULL CHECK (
        char_length(apply_key) BETWEEN 1 AND 128
        AND apply_key ~ '^[A-Za-z0-9_-]+$'
    ),
    proposal_hash TEXT NOT NULL CHECK (char_length(proposal_hash) = 64),
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (adventure_id, apply_key)
);
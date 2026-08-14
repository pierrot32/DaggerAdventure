CREATE TABLE adventure_notes (
    id UUID PRIMARY KEY,
    adventure_id UUID NOT NULL REFERENCES adventures(id) ON DELETE CASCADE,
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX adventure_notes_adventure_idx
    ON adventure_notes (adventure_id, updated_at DESC);
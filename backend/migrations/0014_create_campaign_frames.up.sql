CREATE TABLE campaign_frames (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    complexity_rating INTEGER NOT NULL DEFAULT 3 CHECK (complexity_rating BETWEEN 1 AND 5),
    content JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX campaign_frames_owner_idx
    ON campaign_frames (owner_id, updated_at DESC);

CREATE TABLE adventure_frames (
    adventure_id UUID PRIMARY KEY REFERENCES adventures(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL CHECK (source_type IN ('blank', 'builtin', 'library')),
    source_id TEXT,
    content JSONB NOT NULL,
    selections JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT adventure_frames_source_check CHECK (
        (source_type = 'blank' AND source_id IS NULL)
        OR (source_type IN ('builtin', 'library') AND source_id IS NOT NULL)
    )
);
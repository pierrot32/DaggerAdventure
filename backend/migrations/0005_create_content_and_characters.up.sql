CREATE TABLE source_books (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    version TEXT NOT NULL,
    source_file TEXT NOT NULL,
    content JSONB NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE characters (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    adventure_id UUID REFERENCES adventures(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    pronouns TEXT NOT NULL,
    description TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 1,
    class_id TEXT NOT NULL,
    subclass_id TEXT NOT NULL,
    ancestry_id TEXT NOT NULL,
    secondary_ancestry_id TEXT,
    community_id TEXT NOT NULL,
    traits JSONB NOT NULL,
    experiences JSONB NOT NULL,
    background_answers JSONB NOT NULL,
    connections JSONB NOT NULL,
    equipment JSONB NOT NULL,
    domain_cards JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX characters_user_idx ON characters (user_id, updated_at DESC);
CREATE INDEX characters_adventure_idx ON characters (adventure_id, updated_at DESC);
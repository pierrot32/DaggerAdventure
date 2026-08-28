CREATE TABLE adventure_story_goals (
    id UUID PRIMARY KEY,
    adventure_id UUID NOT NULL REFERENCES adventures(id) ON DELETE CASCADE,
    character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
    goal_type TEXT NOT NULL CHECK (goal_type IN ('gm', 'player')),
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
    description TEXT NOT NULL CHECK (char_length(description) <= 5000),
    status TEXT NOT NULL CHECK (status IN ('planned', 'active', 'complete', 'dropped')),
    position INTEGER NOT NULL CHECK (position >= 0 AND position <= 10001),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX adventure_story_goals_order_idx
    ON adventure_story_goals (adventure_id, position, id);

CREATE TABLE adventure_story_milestones (
    id UUID PRIMARY KEY,
    adventure_id UUID NOT NULL REFERENCES adventures(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
    description TEXT NOT NULL CHECK (char_length(description) <= 5000),
    status TEXT NOT NULL CHECK (status IN ('planned', 'active', 'complete', 'dropped')),
    position INTEGER NOT NULL CHECK (position >= 0 AND position <= 10001),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX adventure_story_milestones_order_idx
    ON adventure_story_milestones (adventure_id, position, id);

CREATE TABLE adventure_story_events (
    id UUID PRIMARY KEY,
    milestone_id UUID NOT NULL REFERENCES adventure_story_milestones(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
    description TEXT NOT NULL CHECK (char_length(description) <= 5000),
    status TEXT NOT NULL CHECK (status IN ('planned', 'active', 'complete', 'dropped')),
    position INTEGER NOT NULL CHECK (position >= 0 AND position <= 10001),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX adventure_story_events_order_idx
    ON adventure_story_events (milestone_id, position, id);

INSERT INTO ai_prompt_templates (generation_type, template)
VALUES (
    'story_builder',
    'You create grounded, original tabletop adventure story plans as valid JSON. Use only the supplied campaign and character context; do not reproduce source text or rules.'
)
ON CONFLICT (generation_type) DO NOTHING;
